// Webhook controller - handles incoming webhooks from providers

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { AuthService } from '../services/AuthService';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { ValidationError } from '../types/errorHandlerMiddleware';
import { WebhookEvent } from '../types/webhookController';

export function createWebhookController(authService: AuthService, kafkaProducer: KafkaProducerService) {
  
  async function handleChannelWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Extract channel and tenant from URL params
      const { channel, tenant: tenantId } = req.params;
      
      // Validate parameters
      if (!channel || !tenantId) {
        throw new ValidationError('Channel and tenant parameters are required');
      }
      
      const validChannels = ['sms', 'email', 'whatsapp'];
      if (!validChannels.includes(channel)) {
        throw new ValidationError(`Invalid channel: ${channel}`);
      }
      
      // 2. Verify webhook signature
      try {
        const isValid = await authService.verifyWebhookSignature(
          channel,
          req.headers,
          req.body
        );
        
        if (!isValid) {
          logger.warn('Invalid webhook signature', {
            channel,
            tenantId,
            userAgent: req.headers['user-agent'],
            sourceIp: req.ip
          });
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      } catch (error) {
        logger.error('Webhook signature verification failed', {
          channel,
          tenantId,
          error: (error as Error).message
        });
        // Still process webhook but log the verification failure
      }
      
      // 3. Parse provider-specific payload and transform to standard format
      const webhookEvent = await parseWebhookPayload(channel, tenantId, req.body);
      
      // 4. Publish to Kafka (fire and forget for quick response)
      const topic = `webhook.received.${channel}`;
      kafkaProducer.publishMessage(topic, webhookEvent as any).catch(error => {
        logger.error('Failed to publish webhook event to Kafka', {
          topic,
          eventId: webhookEvent.eventId,
          error: error.message
        });
      });
      
      // 5. Return immediate success - providers expect quick response
      res.status(200).send('OK');
      
      // 6. Log webhook receipt
      logger.info('Webhook received and processed', {
        eventId: webhookEvent.eventId,
        channel,
        tenantId,
        type: webhookEvent.type,
        messageId: webhookEvent.messageId,
        payloadSize: JSON.stringify(req.body).length
      });
      
    } catch (error) {
      // 7. Handle errors carefully - still return 200 to avoid provider retries
      logger.error('Webhook processing error', {
        channel: req.params.channel,
        tenantId: req.params.tenant,
        error: (error as Error).message,
        payloadSize: req.body ? JSON.stringify(req.body).length : 0
      });
      
      // Return 200 to provider to prevent retries
      res.status(200).send('OK');
    }
  }

  async function verifyWebhookEndpoint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Some providers require webhook verification (e.g., WhatsApp)
      
      // 1. Extract verification parameters
      const { channel, tenant: tenantId } = req.params;
      
      if (!channel || !tenantId) {
        throw new ValidationError('Channel and tenant parameters are required');
      }
      
      // 2. Handle based on channel type
      if (channel === 'whatsapp') {
        // WhatsApp verification process
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        
        logger.info('WhatsApp webhook verification request', {
          tenantId,
          mode,
          hasToken: !!token,
          hasChallenge: !!challenge
        });
        
        // 3. Verify the webhook
        if (mode === 'subscribe') {
          // Get expected verification token for this tenant
          const expectedToken = `verify_${tenantId}_${process.env.WEBHOOK_VERIFY_SECRET || 'default_secret'}`;
          
          if (token === expectedToken) {
            logger.info('WhatsApp webhook verification successful', {
              tenantId,
              challenge: challenge?.toString().slice(0, 20) + '...'
            });
            res.send(challenge);
            return;
          } else {
            logger.warn('WhatsApp webhook verification failed - invalid token', {
              tenantId,
              providedToken: token?.toString().slice(0, 10) + '...',
              expectedLength: expectedToken.length
            });
            res.status(403).send('Forbidden - Invalid verification token');
            return;
          }
        }
      } else if (channel === 'email') {
        // SendGrid webhook verification (if needed)
        // Some email providers don't require verification
        logger.info('Email webhook verification (no action required)', {
          tenantId,
          channel
        });
        res.status(200).send('OK');
        return;
      } else if (channel === 'sms') {
        // Twilio webhook verification (if needed)
        logger.info('SMS webhook verification (no action required)', {
          tenantId,
          channel
        });
        res.status(200).send('OK');
        return;
      }
      
      // Unknown verification request
      logger.warn('Unknown webhook verification request', {
        channel,
        tenantId,
        queryParams: req.query
      });
      res.status(400).send('Bad Request - Unknown verification type');
      
    } catch (error) {
      logger.error('Webhook verification error', {
        channel: req.params.channel,
        tenantId: req.params.tenant,
        error: (error as Error).message
      });
      next(error);
    }
  }

  return {
    handleChannelWebhook,
    verifyWebhookEndpoint
  };
}

// Helper function to parse different provider webhook payloads
async function parseWebhookPayload(channel: string, tenantId: string, payload: any): Promise<WebhookEvent> {
  const eventId = uuidv4();
  const timestamp = Date.now();
  
  switch (channel) {
    case 'sms':
      // Twilio SMS webhook format
      return {
        eventId,
        channel,
        tenantId,
        type: payload.Body ? 'inbound' : 'status_update',
        messageId: payload.MessageSid || payload.SmsSid,
        status: mapTwilioStatus(payload.MessageStatus || payload.SmsStatus),
        timestamp,
        rawPayload: payload,
        metadata: {
          from: payload.From,
          to: payload.To,
          body: payload.Body,
          numSegments: payload.NumSegments,
          price: payload.Price,
          priceUnit: payload.PriceUnit,
          apiVersion: payload.ApiVersion
        }
      };
      
    case 'email':
      // SendGrid webhook format
      const events = Array.isArray(payload) ? payload : [payload];
      const event = events[0] || payload;
      
      return {
        eventId,
        channel,
        tenantId,
        type: event.event === 'inbound' ? 'inbound' : 'status_update',
        messageId: event.sg_message_id || event['smtp-id'],
        status: mapSendGridStatus(event.event),
        timestamp: event.timestamp ? new Date(event.timestamp * 1000).getTime() : timestamp,
        rawPayload: payload,
        metadata: {
          email: event.email,
          subject: event.subject,
          category: event.category,
          reason: event.reason,
          bounce_classification: event.bounce_classification,
          url: event.url // for click events
        }
      };
      
    case 'whatsapp':
      // Meta WhatsApp webhook format
      const entry = payload.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      
      // Handle inbound messages
      if (value?.messages?.length > 0) {
        const message = value.messages[0];
        return {
          eventId,
          channel,
          tenantId,
          type: 'inbound',
          messageId: message.id,
          status: 'received',
          timestamp: parseInt(message.timestamp) * 1000,
          rawPayload: payload,
          metadata: {
            from: message.from,
            to: value.metadata?.phone_number_id,
            messageType: message.type,
            text: message.text?.body,
            context: message.context
          }
        };
      }
      
      // Handle status updates
      if (value?.statuses?.length > 0) {
        const status = value.statuses[0];
        return {
          eventId,
          channel,
          tenantId,
          type: 'status_update',
          messageId: status.id,
          status: mapWhatsAppStatus(status.status),
          timestamp: parseInt(status.timestamp) * 1000,
          rawPayload: payload,
          metadata: {
            recipient_id: status.recipient_id,
            conversation: status.conversation,
            pricing: status.pricing,
            errors: status.errors
          }
        };
      }
      
      // Fallback for unknown WhatsApp webhook
      return {
        eventId,
        channel,
        tenantId,
        type: 'unknown',
        messageId: `unknown_${eventId}`,
        status: 'unknown',
        timestamp,
        rawPayload: payload,
        metadata: { entry }
      };
      
    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }
}

// Status mapping functions
function mapTwilioStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'queued': 'queued',
    'sent': 'sent',
    'delivered': 'delivered',
    'undelivered': 'failed',
    'failed': 'failed',
    'received': 'received'
  };
  return statusMap[status] || status;
}

function mapSendGridStatus(event: string): string {
  const statusMap: Record<string, string> = {
    'processed': 'sent',
    'delivered': 'delivered',
    'open': 'opened',
    'click': 'clicked',
    'bounce': 'failed',
    'dropped': 'failed',
    'deferred': 'pending',
    'blocked': 'failed'
  };
  return statusMap[event] || event;
}

function mapWhatsAppStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'sent': 'sent',
    'delivered': 'delivered',
    'read': 'read',
    'failed': 'failed'
  };
  return statusMap[status] || status;
}