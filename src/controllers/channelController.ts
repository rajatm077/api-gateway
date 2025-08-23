// Channel controller - manages channel configuration and status

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { NotFoundError, ValidationError } from '../types/errorHandlerMiddleware';
import { IQueryServiceClient } from '../types/queryService';

export function createChannelController(kafkaProducer: KafkaProducerService, queryService: IQueryServiceClient) {
  
  async function listChannels(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Get tenant context
      const tenantId = req.context!.tenantId;
      
      // 2. Get available channels with capabilities
      const channels = [
        {
          id: 'sms',
          name: 'SMS',
          status: 'active',
          capabilities: {
            supportsMedia: false,
            maxLength: 160,
            supportsBulk: true,
            supportsInbound: true,
            supportsDeliveryReceipts: true
          },
          limits: {
            perSecond: 50,
            perMinute: 1000,
            perDay: 10000
          },
          pricing: {
            perMessage: 0.0075,
            currency: 'USD'
          }
        },
        {
          id: 'email',
          name: 'Email',
          status: 'active',
          capabilities: {
            supportsMedia: true,
            maxLength: 1000000, // 1MB
            supportsBulk: true,
            supportsInbound: true,
            supportsDeliveryReceipts: true,
            supportsTemplates: true
          },
          limits: {
            perSecond: 100,
            perMinute: 5000,
            perDay: 50000
          },
          pricing: {
            perMessage: 0.001,
            currency: 'USD'
          }
        },
        {
          id: 'whatsapp',
          name: 'WhatsApp Business',
          status: 'active',
          capabilities: {
            supportsMedia: true,
            maxLength: 4096,
            supportsBulk: false,
            supportsInbound: true,
            supportsDeliveryReceipts: true,
            supportsTemplates: true
          },
          limits: {
            perSecond: 20,
            perMinute: 600,
            perDay: 10000
          },
          pricing: {
            perMessage: 0.005,
            currency: 'USD'
          }
        }
      ];
      
      // 3. Filter by tenant's enabled channels (mock - in production check DB)
      const enabledChannels = channels.filter(channel => {
        // Mock tenant channel permissions
        return true; // For now, all channels enabled
      });
      
      // 4. Return channel list
      res.json({
        success: true,
        data: {
          channels: enabledChannels,
          total: enabledChannels.length
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      logger.debug('Channels listed', {
        tenantId,
        channelCount: enabledChannels.length,
        correlationId: req.correlationId
      });
      
    } catch (error) {
      logger.error('Failed to list channels', {
        error: (error as Error).message,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      next(error);
    }
  }

  async function getChannelDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract channel ID from params
      const { channelId } = req.params;
      const tenantId = req.context!.tenantId;
      
      // 2. Validate channel exists
      const validChannels = ['sms', 'email', 'whatsapp'];
      if (!validChannels.includes(channelId)) {
        throw new NotFoundError(`Channel '${channelId}' not found`);
      }
      
      // 3. Get detailed channel information (mock data)
      const channelDetails: Record<string, any> = {
        sms: {
          id: 'sms',
          name: 'SMS',
          description: 'Send SMS messages via Twilio and other providers',
          status: 'active',
          health: {
            status: 'healthy',
            lastCheck: new Date(Date.now() - 30000).toISOString(),
            latency: 45,
            uptime: 99.95
          },
          configuration: {
            isConfigured: true,
            provider: 'twilio',
            requiredFields: ['webhookUrl', 'fromNumber'],
            webhookUrl: `https://api.example.com/webhooks/sms/${tenantId}`,
            fromNumber: '+1234567890'
          },
          capabilities: {
            supportsMedia: false,
            maxLength: 160,
            supportsBulk: true,
            supportsInbound: true,
            supportsDeliveryReceipts: true
          },
          limits: {
            perSecond: 50,
            perMinute: 1000,
            perDay: 10000
          },
          pricing: {
            perMessage: 0.0075,
            currency: 'USD'
          }
        },
        email: {
          id: 'email',
          name: 'Email',
          description: 'Send emails via SendGrid and other providers',
          status: 'active',
          health: {
            status: 'healthy',
            lastCheck: new Date(Date.now() - 15000).toISOString(),
            latency: 120,
            uptime: 99.99
          },
          configuration: {
            isConfigured: true,
            provider: 'sendgrid',
            requiredFields: ['webhookUrl', 'fromEmail'],
            webhookUrl: `https://api.example.com/webhooks/email/${tenantId}`,
            fromEmail: 'noreply@example.com'
          },
          capabilities: {
            supportsMedia: true,
            maxLength: 1000000,
            supportsBulk: true,
            supportsInbound: true,
            supportsDeliveryReceipts: true,
            supportsTemplates: true
          },
          limits: {
            perSecond: 100,
            perMinute: 5000,
            perDay: 50000
          },
          pricing: {
            perMessage: 0.001,
            currency: 'USD'
          }
        },
        whatsapp: {
          id: 'whatsapp',
          name: 'WhatsApp Business',
          description: 'Send WhatsApp messages via Meta Business API',
          status: 'active',
          health: {
            status: 'healthy',
            lastCheck: new Date(Date.now() - 60000).toISOString(),
            latency: 250,
            uptime: 99.85
          },
          configuration: {
            isConfigured: true,
            provider: 'meta',
            requiredFields: ['webhookUrl', 'phoneNumberId'],
            webhookUrl: `https://api.example.com/webhooks/whatsapp/${tenantId}`,
            phoneNumberId: '1234567890123456'
          },
          capabilities: {
            supportsMedia: true,
            maxLength: 4096,
            supportsBulk: false,
            supportsInbound: true,
            supportsDeliveryReceipts: true,
            supportsTemplates: true
          },
          limits: {
            perSecond: 20,
            perMinute: 600,
            perDay: 10000
          },
          pricing: {
            perMessage: 0.005,
            currency: 'USD'
          }
        }
      };
      
      // 4. Return detailed channel info
      res.json({
        success: true,
        data: channelDetails[channelId],
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      logger.debug('Channel details retrieved', {
        channelId,
        tenantId,
        correlationId: req.correlationId
      });
      
    } catch (error) {
      logger.error('Failed to get channel details', {
        error: (error as Error).message,
        channelId: req.params.channelId,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      next(error);
    }
  }

  async function getChannelStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract channel ID
      const { channelId } = req.params;
      const tenantId = req.context!.tenantId;
      
      // Validate channel exists
      const validChannels = ['sms', 'email', 'whatsapp'];
      if (!validChannels.includes(channelId)) {
        throw new NotFoundError(`Channel '${channelId}' not found`);
      }
      
      // 2. Get channel health and tenant status (mock data)
      const mockStatus = {
        channelId,
        status: 'healthy' as const,
        details: {
          uptime: 99.9,
          responseTime: channelId === 'email' ? 120 : channelId === 'whatsapp' ? 250 : 45,
          errorRate: 0.1,
          circuitBreaker: 'closed' as const,
          lastIncident: null,
          throughput: {
            messagesPerMinute: channelId === 'email' ? 4500 : channelId === 'sms' ? 950 : 580,
            peakThroughput: channelId === 'email' ? 5000 : channelId === 'sms' ? 1000 : 600
          }
        },
        tenantStatus: {
          quotaUsed: Math.floor(Math.random() * 5000),
          quotaLimit: channelId === 'email' ? 50000 : 10000,
          quotaResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          recentErrorRate: 0.05
        }
      };
      
      // 3. Return status
      res.json({
        success: true,
        data: mockStatus,
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      logger.debug('Channel status retrieved', {
        channelId,
        tenantId,
        status: mockStatus.status,
        correlationId: req.correlationId
      });
      
    } catch (error) {
      logger.error('Failed to get channel status', {
        error: (error as Error).message,
        channelId: req.params.channelId,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      next(error);
    }
  }

  async function updateChannelConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract channel ID and config updates
      const { channelId } = req.params;
      const tenantId = req.context!.tenantId;
      const configUpdates = req.body;
      
      // Validate channel exists
      const validChannels = ['sms', 'email', 'whatsapp'];
      if (!validChannels.includes(channelId)) {
        throw new NotFoundError(`Channel '${channelId}' not found`);
      }
      
      // 2. Validate configuration fields
      const requiredFields: Record<string, string[]> = {
        sms: ['webhookUrl'],
        email: ['webhookUrl', 'fromEmail'],
        whatsapp: ['webhookUrl', 'phoneNumberId']
      };
      
      const missing = requiredFields[channelId].filter(field => !configUpdates[field]);
      if (missing.length > 0) {
        throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
      }
      
      // 3. Validate specific field formats
      if (configUpdates.webhookUrl && !configUpdates.webhookUrl.startsWith('https://')) {
        throw new ValidationError('Webhook URL must use HTTPS');
      }
      
      if (configUpdates.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configUpdates.fromEmail)) {
        throw new ValidationError('Invalid email format');
      }
      
      // 4. Test configuration if requested
      let testResult: any = null;
      if (configUpdates.testConfig === true) {
        testResult = {
          success: true,
          timestamp: new Date().toISOString(),
          latency: Math.floor(Math.random() * 200) + 50,
          message: 'Configuration test successful'
        };
      }
      
      // 5. Mock configuration update (in production, save to Config Service)
      const updatedConfig = {
        channelId,
        tenantId,
        configuration: {
          ...configUpdates,
          testConfig: undefined, // Remove test flag from stored config
          updatedAt: new Date().toISOString(),
          updatedBy: req.context?.userId || 'system'
        }
      };
      
      // 6. Return updated config
      res.json({
        success: true,
        data: {
          channelId,
          configuration: updatedConfig.configuration,
          testResult
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      logger.info('Channel configuration updated', {
        channelId,
        tenantId,
        testPerformed: !!testResult,
        correlationId: req.correlationId
      });
      
    } catch (error) {
      logger.error('Failed to update channel config', {
        error: (error as Error).message,
        channelId: req.params.channelId,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      next(error);
    }
  }

  async function testChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract channel ID and test parameters
      const { channelId } = req.params;
      const { recipient } = req.body;
      const tenantId = req.context!.tenantId;
      
      // Validate channel exists
      const validChannels = ['sms', 'email', 'whatsapp'];
      if (!validChannels.includes(channelId)) {
        throw new NotFoundError(`Channel '${channelId}' not found`);
      }
      
      // 2. Create test message
      const testId = uuidv4();
      const testContent = {
        sms: {
          text: `Test SMS from API Gateway. Test ID: ${testId.slice(0, 8)}`
        },
        email: {
          subject: 'API Gateway Test Email',
          text: `This is a test email from API Gateway. Test ID: ${testId}`,
          html: `<p>This is a test email from API Gateway.</p><p><strong>Test ID:</strong> ${testId}</p>`
        },
        whatsapp: {
          text: `Test WhatsApp message from API Gateway. Test ID: ${testId.slice(0, 8)}`
        }
      };
      
      // 3. Build test message payload
      const testMessage = {
        messageId: testId,
        tenantId,
        conversationId: testId,
        channel: channelId,
        content: {
          to: [recipient || `test-${channelId}@example.com`],
          ...testContent[channelId as keyof typeof testContent]
        },
        metadata: {
          isTest: true,
          testId,
          source: 'api-gateway-test'
        },
        priority: 'high',
        timestamp: Date.now(),
        correlationId: req.correlationId || testId
      };
      
      // 4. Send test message via Kafka
      const topic = `message.test.route.${channelId}`;
      await kafkaProducer.publishMessage(topic, testMessage);
      
      // 5. Return test initiation response
      const recipientAddress = recipient || `test-${channelId}@example.com`;
      res.json({
        success: true,
        data: {
          testId,
          channel: channelId,
          status: 'initiated',
          message: 'Test message sent, check status in a few seconds',
          statusUrl: `/api/v1/messages/${testId}`,
          recipient: recipientAddress
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
      
      logger.info('Channel test initiated', {
        testId,
        channelId,
        tenantId,
        recipient: recipientAddress,
        correlationId: req.correlationId
      });
      
    } catch (error) {
      logger.error('Failed to test channel', {
        error: (error as Error).message,
        channelId: req.params.channelId,
        tenantId: req.context?.tenantId,
        correlationId: req.correlationId
      });
      next(error);
    }
  }

  return {
    listChannels,
    getChannelDetails,
    getChannelStatus,
    updateChannelConfig,
    testChannel
  };
}