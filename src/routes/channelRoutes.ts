// Channel routes - endpoints for channel configuration and management

import { Router, Request, Response, NextFunction } from 'express';
import { createChannelController } from '../controllers/channelController';
import { createAuthMiddleware } from '../middlewares/authMiddleware';
import { createRateLimitMiddleware } from '../middlewares/rateLimitMiddleware';
import { validationMiddleware } from '../middlewares/validationMiddleware';
import { RateLimiterService } from '../services/RateLimiterService';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { AuthService } from '../services/AuthService';
import { RouteDependencies } from '../types/routes';
import Joi from 'joi';

export function createChannelRoutes(dependencies: RouteDependencies): Router {
  const router = Router();
  
  // 1. Create controller and middleware instances
  const channelController = createChannelController(dependencies.kafkaProducer, dependencies.queryService);
  const authMiddleware = createAuthMiddleware(dependencies.authService);
  const rateLimitMiddleware = createRateLimitMiddleware(dependencies.rateLimiter);
  
  // 2. Define validation schemas
  const getChannelSchema = Joi.object({
    channelId: Joi.string().valid('sms', 'email', 'whatsapp').required()
  });

  const updateChannelConfigSchema = Joi.object({
    channelId: Joi.string().valid('sms', 'email', 'whatsapp').required(),
    webhookUrl: Joi.string().uri().pattern(/^https:\/\//).optional(),
    fromEmail: Joi.string().email().when('channelId', {
      is: 'email',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    }),
    fromNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).when('channelId', {
      is: 'sms',
      then: Joi.optional(),
      otherwise: Joi.forbidden()
    }),
    phoneNumberId: Joi.string().when('channelId', {
      is: 'whatsapp',
      then: Joi.optional(),
      otherwise: Joi.forbidden()
    }),
    testConfig: Joi.boolean().optional()
  });

  const testChannelSchema = Joi.object({
    channelId: Joi.string().valid('sms', 'email', 'whatsapp').required(),
    recipient: Joi.alternatives().conditional('channelId', {
      switch: [
        { is: 'sms', then: Joi.string().pattern(/^\+[1-9]\d{1,14}$/) },
        { is: 'email', then: Joi.string().email() },
        { is: 'whatsapp', then: Joi.string().pattern(/^\+[1-9]\d{1,14}$/) }
      ],
      otherwise: Joi.string()
    }).optional()
  });
  
  // 3. Define channel routes
  
  // GET /api/v1/channels
  // List all available channels for tenant
  router.get(
    '/',
    authMiddleware,
    cacheMiddleware(60), // Cache for 60 seconds
    channelController.listChannels
  );
  
  // GET /api/v1/channels/:channelId
  // Get specific channel details
  router.get(
    '/:channelId',
    authMiddleware,
    validationMiddleware(getChannelSchema),
    channelController.getChannelDetails
  );
  
  // GET /api/v1/channels/:channelId/status
  // Get channel health and status
  router.get(
    '/:channelId/status',
    authMiddleware,
    validationMiddleware(getChannelSchema),
    channelController.getChannelStatus
  );
  
  // PATCH /api/v1/channels/:channelId/config
  // Update channel configuration
  router.patch(
    '/:channelId/config',
    authMiddleware,
    rateLimitMiddleware, // Rate limit config updates
    validationMiddleware(updateChannelConfigSchema),
    channelController.updateChannelConfig
  );
  
  // POST /api/v1/channels/:channelId/test
  // Test channel configuration
  router.post(
    '/:channelId/test',
    authMiddleware,
    rateLimitMiddleware,
    validationMiddleware(testChannelSchema),
    channelController.testChannel
  );
  
  // 4. Optional: Channel metrics endpoint
  
  // GET /api/v1/channels/:channelId/metrics
  // Get channel usage metrics
  router.get(
    '/:channelId/metrics',
    authMiddleware,
    validationMiddleware(getChannelSchema),
    async (req, res) => {
      // Mock implementation for channel metrics
      const { channelId } = req.params;
      const tenantId = req.context?.tenantId;
      
      // Generate mock metrics based on channel type
      const baseMetrics = {
        channelId,
        tenantId,
        period: '24h',
        metrics: {
          totalMessages: Math.floor(Math.random() * 10000) + 1000,
          successfulMessages: Math.floor(Math.random() * 9000) + 900,
          failedMessages: Math.floor(Math.random() * 100) + 10,
          averageLatency: Math.floor(Math.random() * 200) + 50,
          deliveryRate: (Math.random() * 10 + 90).toFixed(2) + '%'
        },
        hourlyBreakdown: Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          messages: Math.floor(Math.random() * 500) + 50,
          success: Math.floor(Math.random() * 450) + 45,
          failed: Math.floor(Math.random() * 50) + 5
        }))
      };
      
      res.json({
        success: true,
        data: baseMetrics,
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
  );
  
  return router;
}

// Cache middleware for read endpoints
function cacheMiddleware(seconds: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Set cache control headers
    res.setHeader('Cache-Control', `private, max-age=${seconds}`);
    res.setHeader('Expires', new Date(Date.now() + seconds * 1000).toUTCString());
    
    // 2. Could also implement Redis caching here in the future
    // For now, just set headers and continue
    next();
  };
}