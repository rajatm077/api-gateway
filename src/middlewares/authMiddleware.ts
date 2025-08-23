// Authentication middleware - validates JWT tokens and API keys

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AuthService } from '../services/AuthService';
import { AuthenticationError, TenantContext } from '../types/authService';

// Note: Express Request interface extensions are defined in types/index.ts

export function createAuthMiddleware(authService: AuthService) {
  return async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Check for Authorization header
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string;
      
      let tenantContext: TenantContext;
      
      // 2. Determine auth type
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // JWT Authentication
        try {
          const token = authHeader.slice(7); // Remove 'Bearer ' prefix
          const jwtPayload = await authService.validateJWT(token);
          tenantContext = authService.generateTenantContext(jwtPayload);
          
          logger.debug('JWT authentication successful', {
            tenantId: tenantContext.tenantId,
            userId: tenantContext.userId,
            correlationId: req.correlationId
          });
          
        } catch (error: any) {
          logger.warn('JWT authentication failed', {
            error: error.message,
            correlationId: req.correlationId,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
          
          res.status(401).json({
            success: false,
            error: {
              code: error.code || 'INVALID_TOKEN',
              message: error.message || 'Invalid authentication token',
              details: {
                authMethod: 'jwt'
              }
            },
            meta: {
              requestId: req.correlationId,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }
        
      } else if (apiKey) {
        // API Key Authentication
        try {
          const tenantInfo = await authService.validateAPIKey(apiKey);
          tenantContext = authService.generateTenantContext(tenantInfo);
          
          logger.debug('API key authentication successful', {
            tenantId: tenantContext.tenantId,
            planType: tenantContext.planType,
            correlationId: req.correlationId
          });
          
        } catch (error: any) {
          logger.warn('API key authentication failed', {
            error: error.message,
            apiKey: apiKey.substring(0, 8) + '...',
            correlationId: req.correlationId,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
          
          res.status(401).json({
            success: false,
            error: {
              code: error.code || 'INVALID_API_KEY',
              message: error.message || 'Invalid API key',
              details: {
                authMethod: 'apikey'
              }
            },
            meta: {
              requestId: req.correlationId,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }
        
      } else {
        // No authentication provided
        logger.warn('No authentication provided', {
          path: req.path,
          method: req.method,
          correlationId: req.correlationId,
          ip: req.ip
        });
        
        res.status(401).json({
          success: false,
          error: {
            code: 'NO_AUTH',
            message: 'Authentication required',
            details: {
              acceptedMethods: ['Bearer token', 'API key']
            }
          },
          meta: {
            requestId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }
      
      // 4. Set request context
      req.context = tenantContext;
      
      // Add security headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      });
      
      // 5. Call next() to continue
      next();
      
    } catch (error: any) {
      // 6. Error handling for unexpected errors
      logger.error('Authentication middleware error', {
        error: error.message,
        stack: error.stack,
        correlationId: req.correlationId,
        path: req.path,
        method: req.method
      });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication service error',
          details: {}
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };
}

// Optional: Create separate middleware for optional auth
export function createOptionalAuthMiddleware(authService: AuthService) {
  return async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string;
      
      // If no auth provided, continue without context
      if (!authHeader && !apiKey) {
        req.context = undefined;
        return next();
      }
      
      let tenantContext: TenantContext | undefined;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.slice(7);
          const jwtPayload = await authService.validateJWT(token);
          tenantContext = authService.generateTenantContext(jwtPayload);
        } catch (error: any) {
          logger.debug('Optional JWT auth failed, continuing without auth', {
            error: error.message,
            correlationId: req.correlationId
          });
        }
      } else if (apiKey) {
        try {
          const tenantInfo = await authService.validateAPIKey(apiKey);
          tenantContext = authService.generateTenantContext(tenantInfo);
        } catch (error: any) {
          logger.debug('Optional API key auth failed, continuing without auth', {
            error: error.message,
            correlationId: req.correlationId
          });
        }
      }
      
      req.context = tenantContext;
      next();
      
    } catch (error: any) {
      logger.error('Optional auth middleware error', {
        error: error.message,
        correlationId: req.correlationId
      });
      
      // For optional auth, continue without context on error
      req.context = undefined;
      next();
    }
  };
}

// Utility middleware to check specific permissions
export function requirePermission(permission: string) {
  return function permissionMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.context) {
      res.status(401).json({
        success: false,
        error: {
          code: 'NO_AUTH',
          message: 'Authentication required'
        }
      });
      return;
    }
    
    if (!req.context.permissions.includes(permission)) {
      logger.warn('Permission denied', {
        tenantId: req.context.tenantId,
        userId: req.context.userId,
        requiredPermission: permission,
        userPermissions: req.context.permissions,
        correlationId: req.correlationId
      });
      
      res.status(403).json({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: `Permission required: ${permission}`,
          details: {
            requiredPermission: permission
          }
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      return;
    }
    
    next();
  };
}

// Utility middleware to check channel access
export function requireChannelAccess(channel: string) {
  return function channelAccessMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.context) {
      res.status(401).json({
        success: false,
        error: {
          code: 'NO_AUTH',
          message: 'Authentication required'
        }
      });
      return;
    }
    
    if (!req.context.enabledChannels.includes(channel)) {
      logger.warn('Channel access denied', {
        tenantId: req.context.tenantId,
        requestedChannel: channel,
        enabledChannels: req.context.enabledChannels,
        correlationId: req.correlationId
      });
      
      res.status(403).json({
        success: false,
        error: {
          code: 'CHANNEL_ACCESS_DENIED',
          message: `Access denied for channel: ${channel}`,
          details: {
            requestedChannel: channel,
            enabledChannels: req.context.enabledChannels
          }
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      return;
    }
    
    next();
  };
}