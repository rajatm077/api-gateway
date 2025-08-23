// Webhook validation schemas

import Joi from 'joi';

// Webhook URL params validation
export const webhookParamsSchema = Joi.object({
  channel: Joi.string()
    .valid('sms', 'email', 'whatsapp')
    .required(),
  
  tenant: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/) // Alphanumeric tenant ID
    .required()
});

// Webhook verification query params (for WhatsApp)
export const webhookVerifySchema = Joi.object({
  'hub.mode': Joi.string()
    .valid('subscribe')
    .required(),
  
  'hub.verify_token': Joi.string()
    .required(),
  
  'hub.challenge': Joi.string()
    .required()
});

// Provider-specific webhook body validators
// These are loose validators since provider formats can change

// Twilio SMS webhook
export const twilioWebhookSchema = Joi.object({
  MessageSid: Joi.string(),
  MessageStatus: Joi.string(),
  From: Joi.string(),
  To: Joi.string(),
  Body: Joi.string().optional(),
  ErrorCode: Joi.string().optional()
}).unknown(true); // Allow additional fields

// SendGrid email webhook
export const sendGridWebhookSchema = Joi.array().items(
  Joi.object({
    event: Joi.string(),
    email: Joi.string().email(),
    sg_message_id: Joi.string(),
    timestamp: Joi.number()
  }).unknown(true)
);

// WhatsApp webhook
export const whatsAppWebhookSchema = Joi.object({
  entry: Joi.array().items(
    Joi.object({
      changes: Joi.array().items(
        Joi.object({
          value: Joi.object({
            messages: Joi.array().optional(),
            statuses: Joi.array().optional()
          }).unknown(true)
        }).unknown(true)
      )
    }).unknown(true)
  )
}).unknown(true);

// Helper to select validator based on channel
export function getWebhookValidator(channel: string): Joi.Schema {
  switch (channel) {
    case 'sms':
      return twilioWebhookSchema;
    case 'email':
      return sendGridWebhookSchema;
    case 'whatsapp':
      return whatsAppWebhookSchema;
    default:
      // Default loose validator
      return Joi.object().unknown(true);
  }
}