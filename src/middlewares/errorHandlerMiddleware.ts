// Global error handler middleware - handles all unhandled errors

import { Request, Response, NextFunction } from 'express';
import { ValidationError as JoiValidationError } from 'joi';
import { logger } from '../utils/logger';
import { AuthenticationError } from '../types/authService';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  RateLimitError
} from '../types/errorHandlerMiddleware';

export function globalErrorHandler() {
  return function (error: any, req: Request, res: Response, next: NextFunction): void {
    // Log the error with full context
    logger.error('Unhandled error in request', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
      tenantId: req.context?.tenantId,
      userId: req.context?.userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Check if response was already sent
    if (res.headersSent) {
      logger.warn('Error occurred after response was sent', {
        correlationId: req.correlationId,
        error: error.message
      });
      return next(error);
    }

    // Classify error and respond appropriately
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let errorMessage = 'An unexpected error occurred';
    let details: any = {};

    // Handle specific error types
    if (error instanceof AuthenticationError) {
      statusCode = error.statusCode;
      errorCode = error.code;
      errorMessage = error.message;
    } else if (error.name === 'ValidationError') {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      errorMessage = error.message;
      details = error.details || {};
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorCode = 'INVALID_ID';
      errorMessage = 'Invalid ID format';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      statusCode = 503;
      errorCode = 'SERVICE_UNAVAILABLE';
      errorMessage = 'External service temporarily unavailable';
    } else if (error.name === 'TimeoutError') {
      statusCode = 504;
      errorCode = 'TIMEOUT';
      errorMessage = 'Request timeout';
    } else if (error.statusCode && error.statusCode >= 400 && error.statusCode < 600) {
      // Handle HTTP errors
      statusCode = error.statusCode;
      errorCode = error.code || 'HTTP_ERROR';
      errorMessage = error.message;
    }

    // In development, include stack trace
    if (process.env.NODE_ENV === 'development') {
      details.stack = error.stack;
    }

    // Send error response
    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        details
      },
      meta: {
        requestId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  };
}

// Async error handler wrapper for routes
export function asyncHandler(fn: Function) {
  return function (req: Request, res: Response, next: NextFunction) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 404 handler for unknown routes
export function notFoundHandler() {
  return function (req: Request, res: Response): void {
    logger.warn('Route not found', {
      method: req.method,
      path: req.path,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
        details: {
          method: req.method,
          path: req.path
        }
      },
      meta: {
        requestId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  };
}