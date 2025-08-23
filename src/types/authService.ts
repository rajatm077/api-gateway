// Authentication service types and interfaces

export interface JWTPayload {
  tenantId: string;
  userId: string;
  permissions: string[];
  email?: string;
  exp: number;
}

export interface TenantInfo {
  tenantId: string;
  name: string;
  planType: 'free' | 'starter' | 'pro' | 'enterprise';
  rateLimits: {
    perSecond: number;
    perMinute: number;
    perDay: number;
  };
  enabledChannels: string[];
  status: 'active' | 'suspended' | 'trial';
}

export interface TenantContext {
  tenantId: string;
  userId?: string;
  authMethod: 'jwt' | 'apikey';
  permissions: string[];
  rateLimits: any;
  enabledChannels: string[];
  planType: string;
  timestamp: Date;
}

export interface AuthConfig {
  jwtPublicKey: string;
  jwtAlgorithm?: string;
  webhookSecrets?: {
    twilio?: string;
    sendgrid?: string;
    whatsapp?: string;
  };
}

export class AuthenticationError extends Error {
  public statusCode = 401;
  public code: string;
  
  constructor(message: string, code: string) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
  }
}
