// Message validation schemas using Joi

import Joi from 'joi';

// Send message validation schema
export const sendMessageSchema = Joi.object({
  // Required fields
  to: Joi.alternatives().try(
    Joi.string()
      .when('channel', {
        is: 'sms',
        then: Joi.string()
          .pattern(/^\+[1-9]\d{1,14}$/) // E.164 format
          .required()
          .messages({
            'string.pattern.base': 'Phone number must be in E.164 format (+1234567890)'
          }),
        otherwise: Joi.string()
      }),
    Joi.array()
      .items(Joi.string())
      .min(1)
      .max(100) // Max 100 recipients for single send
  ).required()
    .messages({
      'any.required': 'Recipient (to) is required'
    }),
  
  channel: Joi.string()
    .valid('sms', 'email', 'whatsapp')
    .required()
    .messages({
      'any.only': 'Channel must be one of: sms, email, whatsapp'
    }),
  
  content: Joi.object({
    // Content structure varies by channel
    text: Joi.string()
      .max(10000)
      .when('$channel', {
        is: 'sms',
        then: Joi.string().max(1600).required() // SMS limit
      }),
    
    // Email-specific fields
    subject: Joi.when('$channel', {
      is: 'email',
      then: Joi.string().max(200).required()
    }),
    
    html: Joi.when('$channel', {
      is: 'email',
      then: Joi.string().max(100000)
    }),
    
    // WhatsApp template
    templateId: Joi.when('$channel', {
      is: 'whatsapp',
      then: Joi.string()
    }),
    
    templateParams: Joi.object()
  }).required(),
  
  // Optional fields
  conversationId: Joi.string()
    .uuid()
    .optional(),
  
  metadata: Joi.object()
    .max(20) // Max 20 metadata fields
    .pattern(
      Joi.string().max(50), // Key max length
      Joi.any() // Value can be any type
    )
    .optional(),
  
  priority: Joi.string()
    .valid('low', 'normal', 'high')
    .default('normal'),
  
  scheduledAt: Joi.date()
    .iso()
    .min('now')
    .max(Joi.ref('$maxScheduleDate')) // Max 30 days in future
    .optional()
});

// Bulk message validation schema
export const bulkMessageSchema = Joi.object({
  // Recipient source
  recipients: Joi.alternatives().try(
    // Direct list of recipients
    Joi.array()
      .items(Joi.string())
      .min(1)
      .max(10000), // Max 10k for direct list
    
    // File reference
    Joi.object({
      type: Joi.string().valid('file', 'segment'),
      source: Joi.string().required(), // S3 URL or file path
      format: Joi.string().valid('csv', 'json')
    })
  ).required(),
  
  channels: Joi.array()
    .items(Joi.string().valid('sms', 'email', 'whatsapp'))
    .min(1)
    .max(3)
    .required(),
  
  content: Joi.object({
    // Template-based content
    templateId: Joi.string(),
    
    // Channel-specific content
    sms: Joi.object({
      text: Joi.string().max(1600)
    }),
    
    email: Joi.object({
      subject: Joi.string().max(200),
      html: Joi.string().max(100000),
      text: Joi.string().max(10000)
    }),
    
    whatsapp: Joi.object({
      templateId: Joi.string(),
      templateParams: Joi.object()
    })
  }).required(),
  
  options: Joi.object({
    batchSize: Joi.number()
      .min(100)
      .max(1000)
      .default(500),
    
    rateLimit: Joi.number()
      .min(1)
      .max(50)
      .default(10), // Default 10/s for bulk
    
    scheduledAt: Joi.date()
      .iso()
      .min('now'),
    
    retryFailures: Joi.boolean()
      .default(true),
    
    continueOnError: Joi.boolean()
      .default(true)
  }).optional(),
  
  metadata: Joi.object()
    .optional()
});

// Get message validation (for params)
export const getMessageSchema = Joi.object({
  messageId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid message ID format'
    })
});

// Helper function to validate phone numbers
export function validatePhoneNumber(phone: string): boolean {
  // E.164 format validation
  // +[country code][subscriber number]
  // Min 7 digits, max 15 digits total
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

// Helper function to validate email
export function validateEmail(email: string): boolean {
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}