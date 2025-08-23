// Message controller - handles all message-related endpoints

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { MessagePayload } from '../types/kafkaProducerService';
import { NotFoundError, ValidationError } from '../types/errorHandlerMiddleware';
import { 
  ConversationHistoryResponse,
  ConversationMessage,
  ConversationInfo,
  MessageContent,
  ConversationPagination,
  ConversationFilters
} from '../types/messageController';
import { MessageRouteEvent, BulkMessageRouteEvent } from '../types/kafkaEvents';
import { IQueryServiceClient, MessageListFilters } from '../types/queryService';

export function createMessageController(kafkaProducer: KafkaProducerService, queryService: IQueryServiceClient) {
  
  async function sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract validated data from request
      const { to, channel, content, conversationId, metadata, priority } = req.body;
      const tenantId = req.context!.tenantId;
      const correlationId = req.correlationId!;
      
      // 2. Build message payload using Kafka event types
      const messageId = uuidv4();
      const finalConversationId = conversationId || uuidv4();
      
      const kafkaEvent: Omit<MessageRouteEvent, 'eventId' | 'source' | 'version'> = {
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
      
      // Add required Kafka event fields
      const fullKafkaEvent: MessageRouteEvent = {
        ...kafkaEvent,
        eventId: uuidv4(),
        source: 'api-gateway',
        version: '1.0'
      };
      
      // 3. Determine Kafka topic
      const topic = `message.channel.route.${channel}`;
      
      // 4. Publish to Kafka
      await kafkaProducer.publishMessage(topic, fullKafkaEvent);
      
      // 5. Return success response (202 Accepted)
      res.status(202).json({
        success: true,
        data: {
          messageId: fullKafkaEvent.messageId,
          status: 'queued',
          conversationId: fullKafkaEvent.conversationId,
          channel: fullKafkaEvent.channel,
          createdAt: new Date(fullKafkaEvent.timestamp).toISOString()
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      // 6. Log successful message submission
      logger.info('Message queued successfully', {
        messageId: fullKafkaEvent.messageId,
        channel: fullKafkaEvent.channel,
        tenantId: fullKafkaEvent.tenantId,
        conversationId: fullKafkaEvent.conversationId,
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

      // 2. Query message status from Query Service
      const messageStatus = await queryService.getMessage(messageId, tenantId);
      
      if (!messageStatus) {
        throw new NotFoundError(`Message ${messageId} not found`);
      }

      // 3. Return message status
      res.json({
        success: true,
        data: messageStatus,
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });

      logger.debug('Message status retrieved', {
        messageId,
        tenantId,
        status: messageStatus.status,
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

      // 2. Query event history from Query Service
      const events = await queryService.getMessageEvents(messageId, tenantId);

      // 3. Return chronological event list
      res.json({
        success: true,
        data: {
          messageId,
          events,
          totalEvents: events.length
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });

      logger.debug('Message events retrieved', {
        messageId,
        tenantId,
        eventCount: events.length,
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

  async function getConversationHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract conversation ID and query parameters
      const { conversationId } = req.params;
      const tenantId = req.context!.tenantId;
      const correlationId = req.correlationId!;
      
      // Extract pagination and filtering parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const channel = req.query.channel as 'sms' | 'email' | 'whatsapp';
      const direction = req.query.direction as 'inbound' | 'outbound';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      logger.info('Retrieving conversation history', {
        conversationId,
        tenantId,
        page,
        limit,
        channel,
        direction,
        correlationId
      });
      
      // 2. Validate conversation ID format
      if (!conversationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        throw new ValidationError('Invalid conversation ID format');
      }

      // 3. Get conversation details from Query Service
      const conversation = await queryService.getConversation(conversationId, tenantId);
      
      // 4. Build filters for message query
      const messageFilters: MessageListFilters = {
        direction,
        channel,
        startDate,
        endDate,
        page,
        limit
      };

      // 5. Get conversation messages from Query Service
      const messagesResponse = await queryService.getConversationMessages(conversationId, tenantId, messageFilters);

      // 6. Transform the Query Service response to match our API format
      const response: ConversationHistoryResponse = {
        success: true,
        data: {
          conversation: {
            id: conversation.id,
            channel: conversation.channel,
            participant: conversation.participant,
            createdAt: conversation.createdAt,
            lastMessageAt: conversation.lastMessageAt,
            status: conversation.status,
            messageCount: conversation.messageCount,
            metadata: conversation.metadata
          },
          messages: messagesResponse.messages.map(msg => ({
            id: msg.id,
            conversationId: msg.conversationId,
            direction: msg.direction,
            channel: msg.channel,
            from: msg.from,
            to: msg.to,
            content: msg.content,
            status: msg.status,
            timestamp: msg.timestamp,
            metadata: msg.metadata
          })),
          pagination: {
            page: messagesResponse.pagination.page,
            limit: messagesResponse.pagination.limit,
            offset: (messagesResponse.pagination.page - 1) * messagesResponse.pagination.limit,
            total: messagesResponse.pagination.total,
            totalPages: messagesResponse.pagination.totalPages,
            hasMore: messagesResponse.pagination.hasMore,
            hasPrevious: messagesResponse.pagination.page > 1
          },
          filters: {
            channel,
            direction,
            startDate,
            endDate
          }
        },
        meta: {
          requestId: correlationId,
          timestamp: new Date().toISOString(),
          queryTime: '25ms'
        }
      };
      
      res.json(response);
      
      logger.debug('Conversation history retrieved', {
        conversationId,
        tenantId,
        messageCount: messagesResponse.messages.length,
        correlationId
      });

    } catch (error) {
      logger.error('Failed to get conversation history', {
        error: (error as Error).message,
        conversationId: req.params.conversationId,
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
    getMessageEvents,
    getConversationHistory
  };
}