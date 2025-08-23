// Channel validation schemas

import Joi from 'joi';

// Get channel params validation
export const getChannelSchema = Joi.object({
  channelId: Joi.string()
    .valid('sms', 'email', 'whatsapp')
    .required()
});

// Update channel config validation
export const updateChannelConfigSchema = Joi.object({
  // Webhook configuration
  webhookUrl: Joi.string()
    .uri({ scheme: ['https'] }) // HTTPS only for security
    .optional(),
  
  webhookSecret: Joi.string()
    .min(32) // Minimum secret length
    .optional(),
  
  // Rate limits (tenant-specific overrides)
  rateLimits: Joi.object({
    perSecond: Joi.number().min(1).max(100),
    perMinute: Joi.number().min(1).max(5000),
    perDay: Joi.number().min(1).max(100000)
  }).optional(),
  
  // Channel-specific settings
  settings: Joi.object({
    // SMS settings
    senderId: Joi.when('$channel', {
      is: 'sms',
      then: Joi.string().max(11)
    }),
    
    // Email settings
    fromEmail: Joi.when('$channel', {
      is: 'email',
      then: Joi.string().email()
    }),
    
    fromName: Joi.when('$channel', {
      is: 'email',
      then: Joi.string().max(50)
    }),
    
    replyTo: Joi.when('$channel', {
      is: 'email',
      then: Joi.string().email()
    }),
    
    // WhatsApp settings
    businessId: Joi.when('$channel', {
      is: 'whatsapp',
      then: Joi.string()
    })
  }).optional(),
  
  // Test configuration flag
  testConfig: Joi.boolean()
    .optional()
});

// Test channel validation
export const testChannelSchema = Joi.object({
  // Test recipient (optional, uses default if not provided)
  recipient: Joi.string()
    .when('$channel', {
      is: 'sms',
      then: Joi.string().pattern(/^\+[1-9]\d{1,14}$/),
      otherwise: Joi.string()
    })
    .optional(),
  
  // Custom test message (optional)
  message: Joi.string()
    .max(1000)
    .optional(),
  
  // Test type
  testType: Joi.string()
    .valid('send', 'webhook', 'both')
    .default('send')
});