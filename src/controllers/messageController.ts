// Message controller - handles all message-related endpoints

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { MessagePayload } from '../types/kafkaProducerService';
import { NotFoundError, ValidationError } from '../types/errorHandlerMiddleware';

export function createMessageController(kafkaProducer: KafkaProducerService) {
  
  async function sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract validated data from request
      const { to, channel, content, conversationId, metadata, priority } = req.body;
      const tenantId = req.context!.tenantId;
      const correlationId = req.correlationId!;
      
      // 2. Build message payload
      const messageId = uuidv4();
      const finalConversationId = conversationId || uuidv4();
      
      const payload: MessagePayload = {
        messageId,
        tenantId,
        conversationId: finalConversationId,
        channel,
        content: {
          to: Array.isArray(to) ? to : [to],
          ...content,
          priority: priority || 'normal'
        },
        correlationId,
        timestamp: Date.now(),
        metadata: {
          ...metadata,
          source: 'api-gateway',
          userId: req.context?.userId
        }
      };
      
      // 3. Determine Kafka topic
      const topic = `message.channel.route.${channel}`;
      
      // 4. Publish to Kafka
      await kafkaProducer.publishMessage(topic, payload);
      
      // 5. Return success response (202 Accepted)
      res.status(202).json({
        success: true,
        data: {
          messageId: payload.messageId,
          status: 'queued',
          conversationId: payload.conversationId,
          channel: payload.channel,
          createdAt: new Date(payload.timestamp).toISOString()
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      // 6. Log successful message submission
      logger.info('Message queued successfully', {
        messageId: payload.messageId,
        channel: payload.channel,
        tenantId: payload.tenantId,
        conversationId: payload.conversationId,
        correlationId: req.correlationId,
        recipientCount: Array.isArray(to) ? to.length : 1
      });
      
    } catch (error) {
      // 7. Handle specific errors
      logger.error('Failed to send message', {
        error: (error as Error).message,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId,
        channel: req.body?.channel
      });
      next(error);
    }
  }

  async function sendBulkMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract bulk request data
      const { recipients, channel, content, scheduled, metadata } = req.body;
      const tenantId = req.context!.tenantId;
      
      // 2. Validate bulk limits
      if (recipients.length > 10000) {
        throw new ValidationError('Maximum 10,000 recipients allowed per bulk request');
      }
      
      // 3. Create batch job
      const batchId = uuidv4();
      const now = Date.now();
      const estimatedCompletion = new Date(now + (recipients.length * 100)); // 100ms per message estimate
      
      const batchJob = {
        batchId,
        tenantId,
        totalRecipients: recipients.length,
        channel,
        content,
        status: 'pending',
        createdAt: now,
        estimatedCompletion: estimatedCompletion.toISOString(),
        scheduledAt: scheduled ? new Date(scheduled).toISOString() : null,
        options: {
          priority: 'bulk',
          rateLimit: req.context?.rateLimits?.perSecond || 10
        },
        correlationId: req.correlationId,
        metadata: {
          ...metadata,
          source: 'api-gateway',
          userId: req.context?.userId
        }
      };
      
      // 5. Publish to bulk topic
      const topic = `message.bulk.route.${channel}`;
      const bulkPayload = {
        ...batchJob,
        recipients: recipients.slice(0, 100), // Include sample for immediate processing
        recipientSource: recipients.length > 100 ? 'batch_store' : 'inline'
      };
      
      await kafkaProducer.publishMessage(topic, bulkPayload as any);
      
      // 6. Return batch job response (202 Accepted)
      res.status(202).json({
        success: true,
        data: {
          batchId: batchJob.batchId,
          status: 'processing',
          totalRecipients: batchJob.totalRecipients,
          estimatedCompletion: batchJob.estimatedCompletion,
          trackingUrl: `/api/v1/batches/${batchJob.batchId}`
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      // 7. Log bulk job creation
      logger.info('Bulk message job created', {
        batchId: batchJob.batchId,
        tenantId: batchJob.tenantId,
        channel: batchJob.channel,
        recipientCount: batchJob.totalRecipients,
        correlationId: req.correlationId
      });
      
    } catch (error) {
      logger.error('Failed to create bulk message job', {
        error: (error as Error).message,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      next(error);
    }
  }

  async function getMessageStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract messageId from params
      const { messageId } = req.params;
      const tenantId = req.context!.tenantId;
      
      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
        throw new ValidationError('Invalid message ID format');
      }
      
      // 3. Query message status (mock implementation)
      // In production, this would query the Message Orchestrator's database
      const mockStatus = {
        messageId,
        status: 'delivered',
        channel: 'sms',
        createdAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        updatedAt: new Date(Date.now() - 60000).toISOString(),  // 1 minute ago
        deliveredAt: new Date(Date.now() - 60000).toISOString(),
        tenantId
      };
      
      // 4. Return message status
      res.json({
        success: true,
        data: mockStatus,
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      logger.debug('Message status retrieved', {
        messageId,
        tenantId,
        status: mockStatus.status,
        correlationId: req.correlationId
      });
      
    } catch (error) {
      logger.error('Failed to get message status', {
        error: (error as Error).message,
        messageId: req.params.messageId,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      next(error);
    }
  }

  async function getMessageEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract messageId and validate
      const { messageId } = req.params;
      const tenantId = req.context!.tenantId;
      
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
        throw new ValidationError('Invalid message ID format');
      }
      
      // 2. Query event history (mock implementation)
      const now = Date.now();
      const mockEvents = [
        {
          type: 'queued',
          timestamp: new Date(now - 300000).toISOString(),
          details: { gateway: 'api-gateway' }
        },
        {
          type: 'sent',
          timestamp: new Date(now - 240000).toISOString(),
          details: { provider: 'twilio', messageId: 'SM123456789' }
        },
        {
          type: 'delivered',
          timestamp: new Date(now - 60000).toISOString(),
          details: { provider: 'twilio', deliveryCode: 'delivered' }
        }
      ];
      
      // 3. Return chronological event list
      res.json({
        success: true,
        data: {
          messageId,
          events: mockEvents,
          totalEvents: mockEvents.length
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      logger.debug('Message events retrieved', {
        messageId,
        tenantId,
        eventCount: mockEvents.length,
        correlationId: req.correlationId
      });
      
    } catch (error) {
      logger.error('Failed to get message events', {
        error: (error as Error).message,
        messageId: req.params.messageId,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      next(error);
    }
  }

  return {
    sendMessage,
    sendBulkMessages,
    getMessageStatus,
    getMessageEvents
  };
}