// Webhook routes - endpoints for receiving webhooks from messaging providers

import { Router } from 'express';
import { createWebhookController } from '../controllers/webhookController';
import { createWebhookRateLimitMiddleware } from '../middlewares/rateLimitMiddleware';
import { validationMiddleware } from '../middlewares/validationMiddleware';
import { webhookParamsSchema, webhookVerifySchema } from '../validators/webhookValidators';
import { RateLimiterService } from '../services/RateLimiterService';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { AuthService } from '../services/AuthService';
import { RouteDependencies } from '../types/routes';
import { logger } from '../utils/logger';
import Joi from 'joi';

export function createWebhookRoutes(dependencies: RouteDependencies): Router {
  const router = Router();
  
  // 1. Create controller and middleware instances
  const webhookController = createWebhookController(dependencies.authService, dependencies.kafkaProducer, dependencies.queryService);
  const webhookRateLimitMiddleware = createWebhookRateLimitMiddleware(dependencies.rateLimiter);
  
  // 2. Define validation schemas
  const webhookParamsSchema = Joi.object({
    channel: Joi.string().valid('sms', 'email', 'whatsapp').required(),
    tenant: Joi.string().uuid().required()
  });

  const webhookVerifySchema = Joi.object({
    'hub.mode': Joi.string().valid('subscribe').optional(),
    'hub.verify_token': Joi.string().optional(),
    'hub.challenge': Joi.string().optional()
  });
  
  // Note: Webhook endpoints typically DON'T use standard auth middleware
  // They use provider-specific signature verification
  
  // 3. Main webhook endpoint for all channels
  // POST /webhooks/:channel/:tenant
  router.post(
    '/:channel/:tenant',
    // No auth middleware - webhooks use signature verification
    webhookRateLimitMiddleware, // Special rate limit for webhooks
    validationMiddleware(webhookParamsSchema), // Validate URL params
    webhookController.handleChannelWebhook
  );
  
  // 4. Webhook verification endpoint (for providers that require it)
  // GET /webhooks/:channel/:tenant/verify
  router.get(
    '/:channel/:tenant/verify',
    validationMiddleware(webhookParamsSchema),
    validationMiddleware(webhookVerifySchema), // Validate query params
    webhookController.verifyWebhookEndpoint
  );
  
  // 5. Optional: Webhook test endpoint (for development only)
  if (process.env.NODE_ENV === 'development') {
    router.post(
      '/test/:channel',
      validationMiddleware(Joi.object({
        channel: Joi.string().valid('sms', 'email', 'whatsapp').required()
      })),
      async (req, res) => {
        // Mock webhook test implementation
        const { channel } = req.params;
        const testPayload = req.body;
        
        logger.info('Test webhook received', {
          channel,
          payloadKeys: Object.keys(testPayload),
          timestamp: new Date().toISOString()
        });
        
        // Simulate processing
        setTimeout(() => {
          logger.info('Test webhook processed', { 
            channel,
            processingTime: '100ms'
          });
        }, 100);
        
        res.status(200).json({
          success: true,
          message: 'Test webhook received and processed',
          data: {
            channel,
            receivedAt: new Date().toISOString(),
            payloadSize: JSON.stringify(testPayload).length
          }
        });
      }
    );
  }
  
  // 6. Health check endpoint for webhook service
  router.get('/health', (req, res) => {
    res.status(200).json({
      service: 'webhook-handler',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      supportedChannels: ['sms', 'email', 'whatsapp']
    });
  });
  
  return router;
}