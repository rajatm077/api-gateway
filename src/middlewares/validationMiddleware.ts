// Request validation middleware factory

import { Request, Response, NextFunction } from 'express';
import Joi, { Schema } from 'joi';
import { logger } from '../utils/logger';
import { 
  ValidationError as IValidationError, 
  ValidationResponse, 
  AttachmentData,
  MessageContent,
  BulkRecipient,
  RetryPolicy,
  ChannelConfig,
  PaginationQuery,
  MessageQuery
} from '../types/validationMiddleware';

export function validationMiddleware(schema: Schema) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Determine what to validate based on method
      let dataToValidate: any = {};
      
      // For all methods, include route params
      dataToValidate = { ...req.params };
      
      // For GET/DELETE: include query params
      if (['GET', 'DELETE'].includes(req.method)) {
        dataToValidate = { ...dataToValidate, ...req.query };
      }
      
      // For POST/PUT/PATCH: include body
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        dataToValidate = { ...dataToValidate, ...req.body };
      }
      
      // 3. Validate against schema
      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false, // Get all errors
        allowUnknown: false, // Reject unknown fields
        stripUnknown: true // Remove unknown fields from result
      });
      
      // 4. If validation fails
      if (error) {
        const validationErrors = formatValidationErrors(error);
        
        // 6. Log validation errors for debugging
        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
          errors: validationErrors,
          correlationId: req.correlationId,
          // Don't log sensitive data
          sanitizedData: sanitizeForLogging(dataToValidate)
        });
        
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: validationErrors
          },
          meta: {
            requestId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }
      
      // 5. If validation succeeds
      // Replace request data with sanitized/validated values
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        // Extract body fields from validated data
        const bodyFields = Object.keys(req.body);
        req.body = {};
        bodyFields.forEach(field => {
          if (value[field] !== undefined) {
            req.body[field] = value[field];
          }
        });
      }
      
      if (['GET', 'DELETE'].includes(req.method)) {
        // Extract query fields from validated data
        const queryFields = Object.keys(req.query);
        req.query = {};
        queryFields.forEach(field => {
          if (value[field] !== undefined) {
            req.query[field] = value[field];
          }
        });
      }
      
      // Update params with validated values
      Object.keys(req.params).forEach(field => {
        if (value[field] !== undefined) {
          req.params[field] = value[field];
        }
      });
      
      logger.debug('Request validation successful', {
        path: req.path,
        method: req.method,
        correlationId: req.correlationId
      });
      
      next();
      
    } catch (error: any) {
      logger.error('Validation middleware error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        correlationId: req.correlationId
      });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation service error'
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };
}

// Helper function to create consistent error format
function formatValidationErrors(joiError: Joi.ValidationError): IValidationError[] {
  return joiError.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message.replace(/"/g, ''), // Remove quotes from Joi messages
    value: detail.context?.value,
    type: detail.type
  }));
}

// Helper to sanitize data for logging (remove sensitive fields)
function sanitizeForLogging(data: any): any {
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  const sanitized = { ...data };
  
  Object.keys(sanitized).forEach(key => {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

// Pre-built validation schemas for common use cases
export const commonSchemas = {
  // Message sending validation
  sendMessage: Joi.object({
    to: Joi.alternatives().try(
      Joi.string().required(),
      Joi.array().items(Joi.string()).min(1).max(100)
    ).required(),
    channel: Joi.string().valid('sms', 'email', 'whatsapp', 'push').required(),
    content: Joi.object({
      text: Joi.string().max(1600),
      subject: Joi.string().max(200),
      html: Joi.string().max(50000),
      attachments: Joi.array().items(Joi.object({
        filename: Joi.string().required(),
        content: Joi.string().required(),
        contentType: Joi.string()
      })).max(5)
    }).required(),
    conversationId: Joi.string().uuid().optional(),
    metadata: Joi.object().optional(),
    scheduled: Joi.date().min('now').optional(),
    priority: Joi.string().valid('low', 'normal', 'high').default('normal')
  }),
  
  // Bulk message validation
  bulkMessage: Joi.object({
    recipients: Joi.array().items(
      Joi.object({
        to: Joi.string().required(),
        personalizations: Joi.object().optional()
      })
    ).min(1).max(10000).required(),
    channel: Joi.string().valid('sms', 'email', 'whatsapp').required(),
    content: Joi.object({
      text: Joi.string().max(1600),
      subject: Joi.string().max(200),
      html: Joi.string().max(50000)
    }).required(),
    metadata: Joi.object().optional(),
    scheduled: Joi.date().min('now').optional()
  }),
  
  // Channel configuration
  channelConfig: Joi.object({
    channel: Joi.string().valid('sms', 'email', 'whatsapp', 'push').required(),
    enabled: Joi.boolean().required(),
    config: Joi.object().required(),
    webhookUrl: Joi.string().uri().optional(),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().integer().min(0).max(10).default(3),
      backoffFactor: Joi.number().min(1).max(10).default(2)
    }).optional()
  }),
  
  // Pagination and filtering
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    filter: Joi.object().optional()
  }),
  
  // Message status query
  messageQuery: Joi.object({
    messageId: Joi.string().uuid().required(),
    includeEvents: Joi.boolean().default(false)
  })
};