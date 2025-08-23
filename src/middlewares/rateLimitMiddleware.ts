// Rate limiting middleware - enforces request limits per tenant

import { Request, Response, NextFunction } from 'express';
import { RateLimiterService } from '../services/RateLimiterService';
import { RateLimitResult } from '../types/rateLimiterService';
import { 
  RateLimitHeaders, 
  RateLimitErrorResponse, 
  WebhookRateLimitErrorResponse 
} from '../types/rateLimitMiddleware';
import { logger } from '../utils/logger';

export function createRateLimitMiddleware(rateLimiterService: RateLimiterService) {
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract tenant ID from request context
      if (!req.context?.tenantId) {
        logger.warn('Rate limiting skipped - no tenant ID in context', {
          path: req.path,
          method: req.method,
          correlationId: req.correlationId
        });
        return next(); // Skip rate limiting if no tenant context
      }
      
      const tenantId = req.context.tenantId;
      
      // 2. Extract channel from request if applicable
      let channel: string | undefined;
      
      // For message endpoints, extract from body
      if (req.path.includes('/messages') && req.body?.channel) {
        channel = req.body.channel;
      }
      
      // For channel-specific endpoints, extract from params
      if (req.params?.channel) {
        channel = req.params.channel;
      }
      
      // For webhook endpoints, extract from URL
      if (req.path.includes('/webhooks/') && req.params?.channel) {
        channel = req.params.channel;
      }
      
      // 3. Check rate limit
      const rateLimitResult: RateLimitResult = await rateLimiterService.checkLimit(tenantId, channel);
      
      // 4. Set rate limit headers on response
      res.set({
        'X-RateLimit-Limit': rateLimiterService['defaultLimit'].toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': Math.floor(rateLimitResult.resetAt.getTime() / 1000).toString()
      });
      
      // 5. If rate limit exceeded
      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', {
          tenantId,
          channel,
          remaining: rateLimitResult.remaining,
          resetAt: rateLimitResult.resetAt,
          correlationId: req.correlationId,
          path: req.path,
          method: req.method,
          ip: req.ip
        });
        
        // Add Retry-After header
        if (rateLimitResult.retryAfter) {
          res.set('Retry-After', rateLimitResult.retryAfter.toString());
        }
        
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests, please retry after ${rateLimitResult.retryAfter || 'some'} seconds`,
            details: {
              retryAfter: rateLimitResult.retryAfter,
              resetAt: rateLimitResult.resetAt.toISOString(),
              remaining: rateLimitResult.remaining
            }
          },
          meta: {
            requestId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }
      
      // 6. If allowed, log successful rate limit check
      logger.debug('Rate limit check passed', {
        tenantId,
        channel,
        remaining: rateLimitResult.remaining,
        correlationId: req.correlationId
      });
      
      // Call next() to continue
      next();
      
    } catch (error: any) {
      // 7. Handle rate limiter errors
      logger.error('Rate limiter middleware error', {
        error: error.message,
        stack: error.stack,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId,
        path: req.path,
        method: req.method
      });
      
      // Fail open policy - allow request when rate limiter fails
      // This prevents service disruption if Redis is down
      logger.warn('Rate limiting failed, allowing request (fail-open policy)', {
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      
      // Set headers to indicate rate limiter is unavailable
      res.set({
        'X-RateLimit-Status': 'unavailable',
        'X-RateLimit-Limit': 'unknown',
        'X-RateLimit-Remaining': 'unknown'
      });
      
      next();
    }
  };
}

// Optional: Create different rate limiters for different endpoints
export function createBulkRateLimitMiddleware(rateLimiterService: RateLimiterService, bulkMultiplier: number = 10) {
  return async function bulkRateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.context?.tenantId) {
        return next();
      }
      
      const tenantId = req.context.tenantId;
      const channel = req.body?.channel || req.params?.channel;
      
      // For bulk operations, we might want stricter limits
      // This could use a different rate limiter instance or apply a multiplier
      const rateLimitResult: RateLimitResult = await rateLimiterService.checkLimit(tenantId, channel);
      
      // Apply bulk operation penalty - reduce effective remaining count
      const adjustedRemaining = Math.max(0, rateLimitResult.remaining - bulkMultiplier);
      const bulkAllowed = rateLimitResult.allowed && adjustedRemaining >= 0;
      
      res.set({
        'X-RateLimit-Limit': Math.floor(rateLimiterService['defaultLimit'] / bulkMultiplier).toString(),
        'X-RateLimit-Remaining': Math.floor(adjustedRemaining / bulkMultiplier).toString(),
        'X-RateLimit-Reset': Math.floor(rateLimitResult.resetAt.getTime() / 1000).toString(),
        'X-RateLimit-Type': 'bulk'
      });
      
      if (!bulkAllowed) {
        logger.warn('Bulk rate limit exceeded', {
          tenantId,
          channel,
          bulkMultiplier,
          adjustedRemaining,
          correlationId: req.correlationId
        });
        
        if (rateLimitResult.retryAfter) {
          res.set('Retry-After', rateLimitResult.retryAfter.toString());
        }
        
        res.status(429).json({
          success: false,
          error: {
            code: 'BULK_RATE_LIMIT_EXCEEDED',
            message: `Bulk operation rate limit exceeded, please retry after ${rateLimitResult.retryAfter || 'some'} seconds`,
            details: {
              retryAfter: rateLimitResult.retryAfter,
              resetAt: rateLimitResult.resetAt.toISOString(),
              bulkMultiplier,
              type: 'bulk'
            }
          },
          meta: {
            requestId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }
      
      // Consume multiple tokens for bulk operation
      for (let i = 0; i < bulkMultiplier; i++) {
        await rateLimiterService.consumeToken(`rate:tenant:${tenantId}:total`);
        if (channel) {
          await rateLimiterService.consumeToken(`rate:tenant:${tenantId}:channel:${channel}`);
        }
      }
      
      next();
      
    } catch (error: any) {
      logger.error('Bulk rate limiter middleware error', {
        error: error.message,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      
      // Fail open for bulk operations as well
      res.set({
        'X-RateLimit-Status': 'unavailable',
        'X-RateLimit-Type': 'bulk'
      });
      
      next();
    }
  };
}

// Specialized rate limiter for webhook endpoints
export function createWebhookRateLimitMiddleware(rateLimiterService: RateLimiterService) {
  return async function webhookRateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // For webhooks, we rate limit by tenant from URL params
      const tenantId = req.params?.tenant;
      const channel = req.params?.channel;
      
      if (!tenantId) {
        logger.warn('Webhook rate limiting skipped - no tenant in URL', {
          path: req.path,
          correlationId: req.correlationId
        });
        return next();
      }
      
      // Use a more permissive rate limit for webhooks since they're from providers
      const rateLimitResult: RateLimitResult = await rateLimiterService.checkLimit(tenantId, channel);
      
      // Don't set as many headers for webhooks to keep responses minimal
      res.set({
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString()
      });
      
      if (!rateLimitResult.allowed) {
        logger.warn('Webhook rate limit exceeded', {
          tenantId,
          channel,
          provider: req.get('User-Agent'),
          correlationId: req.correlationId
        });
        
        // Return 429 but minimal response for webhooks
        res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter
        });
        return;
      }
      
      next();
      
    } catch (error: any) {
      logger.error('Webhook rate limiter error', {
        error: error.message,
        correlationId: req.correlationId
      });
      
      // Always fail open for webhooks to avoid provider delivery issues
      next();
    }
  };
}