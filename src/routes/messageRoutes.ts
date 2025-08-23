// Message routes - defines all message-related endpoints

import { Router } from 'express';
import { createMessageController } from '../controllers/messageController';
import { createAuthMiddleware } from '../middlewares/authMiddleware';
import { createRateLimitMiddleware, createBulkRateLimitMiddleware } from '../middlewares/rateLimitMiddleware';
import { validationMiddleware } from '../middlewares/validationMiddleware';
import { RateLimiterService } from '../services/RateLimiterService';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { AuthService } from '../services/AuthService';
import { RouteDependencies } from '../types/routes';
import Joi from 'joi';

export function createMessageRoutes(dependencies: RouteDependencies): Router {
  const router = Router();
  
  // 1. Create controller with dependencies
  const messageController = createMessageController(dependencies.kafkaProducer, dependencies.queryService);
  
  // 2. Create middleware instances
  const authMiddleware = createAuthMiddleware(dependencies.authService);
  const rateLimitMiddleware = createRateLimitMiddleware(dependencies.rateLimiter);
  const bulkRateLimitMiddleware = createBulkRateLimitMiddleware(dependencies.rateLimiter);
  
  // 3. Define validation schemas
  const sendMessageSchema = Joi.object({
    to: Joi.alternatives().try(
      Joi.string().required(),
      Joi.array().items(Joi.string()).min(1).max(100).required()
    ).required(),
    channel: Joi.string().valid('sms', 'email', 'whatsapp').required(),
    content: Joi.object({
      text: Joi.string().when('...channel', {
        is: 'sms',
        then: Joi.string().max(1600).required(),
        otherwise: Joi.string().max(10000)
      }),
      subject: Joi.string().when('...channel', {
        is: 'email',
        then: Joi.string().max(200).required(),
        otherwise: Joi.forbidden()
      }),
      html: Joi.string().when('...channel', {
        is: 'email',
        then: Joi.string().max(100000),
        otherwise: Joi.forbidden()
      }),
      template_id: Joi.string().when('...channel', {
        is: Joi.valid('email', 'whatsapp'),
        then: Joi.string(),
        otherwise: Joi.forbidden()
      }),
      template_data: Joi.object().when('template_id', {
        is: Joi.exist(),
        then: Joi.object(),
        otherwise: Joi.forbidden()
      })
    }).required(),
    conversationId: Joi.string().uuid().optional(),
    priority: Joi.string().valid('low', 'normal', 'high').default('normal'),
    metadata: Joi.object().optional()
  });

  const bulkMessageSchema = Joi.object({
    recipients: Joi.array().items(Joi.string()).min(1).max(10000).required(),
    channel: Joi.string().valid('sms', 'email', 'whatsapp').required(),
    content: Joi.object({
      text: Joi.string().when('...channel', {
        is: 'sms',
        then: Joi.string().max(1600).required(),
        otherwise: Joi.string().max(10000)
      }),
      subject: Joi.string().when('...channel', {
        is: 'email',
        then: Joi.string().max(200).required(),
        otherwise: Joi.forbidden()
      }),
      html: Joi.string().when('...channel', {
        is: 'email',
        then: Joi.string().max(100000),
        otherwise: Joi.forbidden()
      }),
      template_id: Joi.string().optional(),
      template_data: Joi.object().when('template_id', {
        is: Joi.exist(),
        then: Joi.object(),
        otherwise: Joi.forbidden()
      })
    }).required(),
    scheduled: Joi.date().iso().min('now').optional(),
    metadata: Joi.object().optional()
  });

  const getMessageSchema = Joi.object({
    messageId: Joi.string().uuid().required()
  });

  // 4. Define routes with middleware chain
  
  // POST /api/v1/messages/send
  // Send single or multi-recipient message
  router.post(
    '/send',
    authMiddleware,
    rateLimitMiddleware, // Uses default rate limiting logic
    validationMiddleware(sendMessageSchema),
    messageController.sendMessage
  );
  
  // POST /api/v1/messages/bulk
  // Send bulk messages (file or list)
  router.post(
    '/bulk',
    authMiddleware,
    bulkRateLimitMiddleware, // Special bulk rate limiting
    validationMiddleware(bulkMessageSchema),
    messageController.sendBulkMessages
  );
  
  // GET /api/v1/messages/:messageId
  // Get message details and status
  router.get(
    '/:messageId',
    authMiddleware,
    rateLimitMiddleware,
    validationMiddleware(getMessageSchema),
    messageController.getMessageStatus
  );
  
  // GET /api/v1/messages/:messageId/events
  // Get message event history
  router.get(
    '/:messageId/events',
    authMiddleware,
    rateLimitMiddleware,
    validationMiddleware(getMessageSchema),
    messageController.getMessageEvents
  );
  
  // 5. Batch operations endpoints
  
  // GET /api/v1/messages/batches/:batchId
  // Get bulk batch status
  router.get(
    '/batches/:batchId',
    authMiddleware,
    rateLimitMiddleware,
    validationMiddleware(Joi.object({
      batchId: Joi.string().uuid().required()
    })),
    async (req, res) => {
      // Mock implementation for batch status
      const { batchId } = req.params;
      res.json({
        success: true,
        data: {
          batchId,
          status: 'processing',
          totalRecipients: 1000,
          processed: 750,
          successful: 720,
          failed: 30,
          createdAt: new Date(Date.now() - 300000).toISOString(),
          estimatedCompletion: new Date(Date.now() + 60000).toISOString()
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
  );
  
  // POST /api/v1/messages/batches/:batchId/cancel
  // Cancel ongoing batch
  router.post(
    '/batches/:batchId/cancel',
    authMiddleware,
    rateLimitMiddleware,
    validationMiddleware(Joi.object({
      batchId: Joi.string().uuid().required()
    })),
    async (req, res) => {
      // Mock implementation for batch cancellation
      const { batchId } = req.params;
      res.json({
        success: true,
        data: {
          batchId,
          status: 'cancelled',
          message: 'Batch cancellation requested'
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
  );

  // Add a route for fetching conversation history
  router.get(
    '/conversations/:conversationId',
    authMiddleware,
    rateLimitMiddleware,
    validationMiddleware(Joi.object({
      conversationId: Joi.string().uuid().required(),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      channel: Joi.string().valid('sms', 'email', 'whatsapp').optional(),
      direction: Joi.string().valid('inbound', 'outbound').optional(),
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
    })),
    messageController.getConversationHistory
  );


  return router;
}