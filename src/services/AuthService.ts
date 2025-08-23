import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { 
  JWTPayload, 
  TenantInfo, 
  TenantContext, 
  AuthConfig, 
  AuthenticationError 
} from '../types/authService';

export class AuthService {
  private jwtPublicKey: string;
  private jwtAlgorithm: string;
  private apiKeyStore: Map<string, TenantInfo>; // In production, use Redis/DB
  private webhookSecrets: Map<string, string>;
  
  constructor(authConfig: AuthConfig) {
    // 1. Store JWT public key for verification
    this.jwtPublicKey = authConfig.jwtPublicKey.replace(/\\n/g, '\n');
    
    // 2. Set JWT algorithm (RS256 recommended)
    this.jwtAlgorithm = authConfig.jwtAlgorithm || 'RS256';
    
    // 3. Initialize API key store (in production, this would query database)
    this.apiKeyStore = new Map();
    this.loadMockApiKeys(); // Load some test API keys
    
    // 4. Load webhook secrets for each channel
    this.webhookSecrets = new Map([
      ['twilio', authConfig.webhookSecrets?.twilio || ''],
      ['sendgrid', authConfig.webhookSecrets?.sendgrid || ''],
      ['whatsapp', authConfig.webhookSecrets?.whatsapp || '']
    ]);
  }
  
  async validateJWT(token: string): Promise<JWTPayload> {
    try {
      // 1. Remove 'Bearer ' prefix if present
      const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
      
      // 2. Verify token using jsonwebtoken library
      const decoded = jwt.verify(cleanToken, this.jwtPublicKey, {
        algorithms: [this.jwtAlgorithm as jwt.Algorithm]
      }) as any;
      
      // 3. Validate token claims
      if (!decoded.tenantId || !decoded.userId) {
        throw new Error('Missing required claims: tenantId or userId');
      }
      
      // 4. Extract and return payload
      const payload: JWTPayload = {
        tenantId: decoded.tenantId,
        userId: decoded.userId,
        permissions: decoded.permissions || [],
        email: decoded.email,
        exp: decoded.exp
      };
      
      logger.debug('JWT validation successful', {
        tenantId: payload.tenantId,
        userId: payload.userId,
        permissions: payload.permissions
      });
      
      return payload;
      
    } catch (error: any) {
      // 5. Handle verification errors
      if (error.name === 'TokenExpiredError') {
        logger.warn('JWT token expired', { error: error.message });
        throw new AuthenticationError('Token has expired', 'TOKEN_EXPIRED');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid JWT token', { error: error.message });
        throw new AuthenticationError('Invalid token', 'INVALID_TOKEN');
      } else {
        logger.error('JWT validation error', { error: error.message, stack: error.stack });
        throw new AuthenticationError('Authentication failed', 'AUTH_ERROR');
      }
    }
  }
  
  async validateAPIKey(apiKey: string): Promise<TenantInfo> {
    try {
      // 1. Hash the API key for comparison (simple hash for demo)
      const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
      
      // 2. Look up key in store/database
      let tenantInfo: TenantInfo | undefined;
      
      // Check both raw and hashed versions for flexibility
      tenantInfo = this.apiKeyStore.get(apiKey) || this.apiKeyStore.get(hashedKey);
      
      // 3. Check if key exists and is active
      if (!tenantInfo) {
        logger.warn('API key not found', { apiKey: apiKey.substring(0, 8) + '...' });
        throw new AuthenticationError('Invalid API key', 'INVALID_API_KEY');
      }
      
      // 6. Check tenant status
      if (tenantInfo.status !== 'active' && tenantInfo.status !== 'trial') {
        logger.warn('Tenant not active', { 
          tenantId: tenantInfo.tenantId, 
          status: tenantInfo.status 
        });
        throw new AuthenticationError('Tenant account suspended', 'TENANT_SUSPENDED');
      }
      
      logger.debug('API key validation successful', {
        tenantId: tenantInfo.tenantId,
        planType: tenantInfo.planType
      });
      
      return tenantInfo;
      
    } catch (error: any) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      // 8. Handle invalid key
      logger.error('API key validation error', { 
        error: error.message,
        apiKey: apiKey.substring(0, 8) + '...'
      });
      throw new AuthenticationError('Authentication failed', 'AUTH_ERROR');
    }
  }
  
  async verifyWebhookSignature(channel: string, headers: any, body: any): Promise<boolean> {
    try {
      const webhookSecret = this.webhookSecrets.get(channel.toLowerCase());
      if (!webhookSecret) {
        logger.warn('No webhook secret configured for channel', { channel });
        return false;
      }
      
      switch (channel.toLowerCase()) {
        case 'twilio':
          return this.verifyTwilioSignature(headers, body, webhookSecret);
        
        case 'sendgrid':
          return this.verifySendGridSignature(headers, body, webhookSecret);
        
        case 'whatsapp':
          return this.verifyWhatsAppSignature(headers, body, webhookSecret);
        
        default:
          logger.warn('Unknown webhook channel', { channel });
          return false;
      }
      
    } catch (error: any) {
      logger.error('Webhook signature verification error', {
        channel,
        error: error.message
      });
      return false;
    }
  }
  
  private verifyTwilioSignature(headers: any, body: any, authToken: string): boolean {
    const signature = headers['x-twilio-signature'];
    if (!signature) return false;
    
    // Twilio uses URL + sorted params for signature
    const url = headers['x-forwarded-proto'] ? 
      `${headers['x-forwarded-proto']}://${headers.host}${headers['x-original-uri'] || ''}` :
      `https://${headers.host}${headers['x-original-uri'] || ''}`;
    
    // Sort and concat params
    const params = Object.keys(body).sort().map(key => `${key}${body[key]}`).join('');
    const data = url + params;
    
    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(data, 'utf8')
      .digest('base64');
    
    return signature === expectedSignature;
  }
  
  private verifySendGridSignature(headers: any, body: string, webhookKey: string): boolean {
    const signature = headers['x-twilio-email-event-webhook-signature'];
    const timestamp = headers['x-twilio-email-event-webhook-timestamp'];
    
    if (!signature || !timestamp) return false;
    
    // Verify timestamp is within 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      return false;
    }
    
    const payload = timestamp + body;
    const expectedSignature = crypto
      .createHmac('sha256', webhookKey)
      .update(payload, 'utf8')
      .digest('base64');
    
    return signature === expectedSignature;
  }
  
  private verifyWhatsAppSignature(headers: any, body: string, appSecret: string): boolean {
    const signature = headers['x-hub-signature-256'];
    if (!signature) return false;
    
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(body, 'utf8')
      .digest('hex');
    
    return signature === expectedSignature;
  }
  
  generateTenantContext(payload: JWTPayload | TenantInfo): TenantContext {
    // 1. Create standardized tenant context
    const isJWT = 'userId' in payload;
    
    return {
      tenantId: payload.tenantId,
      userId: isJWT ? (payload as JWTPayload).userId : undefined,
      authMethod: isJWT ? 'jwt' : 'apikey',
      permissions: isJWT ? (payload as JWTPayload).permissions : ['api:read', 'api:write'],
      rateLimits: isJWT ? null : (payload as TenantInfo).rateLimits,
      enabledChannels: isJWT ? [] : (payload as TenantInfo).enabledChannels,
      planType: isJWT ? 'unknown' : (payload as TenantInfo).planType,
      timestamp: new Date()
    };
  }
  
  private loadMockApiKeys(): void {
    // Load some test API keys for development
    this.apiKeyStore.set('test-api-key-123', {
      tenantId: 'tenant-123',
      name: 'Test Tenant',
      planType: 'pro',
      rateLimits: {
        perSecond: 100,
        perMinute: 5000,
        perDay: 100000
      },
      enabledChannels: ['sms', 'email', 'whatsapp'],
      status: 'active'
    });
    
    this.apiKeyStore.set('demo-key-456', {
      tenantId: 'tenant-456',
      name: 'Demo Tenant',
      planType: 'free',
      rateLimits: {
        perSecond: 10,
        perMinute: 500,
        perDay: 1000
      },
      enabledChannels: ['sms', 'email'],
      status: 'trial'
    });
  }
  
  // Utility methods
  async refreshApiKeys(): Promise<void> {
    // In production, reload from database
    logger.info('API keys refreshed from store');
  }
  
  isChannelEnabled(tenantContext: TenantContext, channel: string): boolean {
    return tenantContext.enabledChannels.includes(channel);
  }
}