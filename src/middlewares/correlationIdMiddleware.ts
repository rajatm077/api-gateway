// Correlation ID middleware - tracks requests across services

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function correlationIdMiddleware() {
  return function (req: Request, res: Response, next: NextFunction): void {
    // 1. Check for existing correlation ID in headers
    let correlationId = getCorrelationId(req);
    
    // 2. Generate new ID if not present
    if (!correlationId) {
      correlationId = 'req_' + uuidv4();
    }
    
    // 3. Attach to request object
    req.correlationId = correlationId;
    
    // 4. Add to response headers
    res.setHeader('x-correlation-id', correlationId);
    
    // 5. Add to logging context (if using structured logging)
    // This depends on your logging setup - some loggers support context
    
    // 6. Call next()
    next();
  };
}

// Helper to extract correlation ID from various sources
export function getCorrelationId(req: Request): string | undefined {
  // Check multiple possible headers in order of preference
  return (
    req.headers['x-correlation-id'] as string ||
    req.headers['x-request-id'] as string ||
    req.headers['trace-id'] as string ||
    req.headers['request-id'] as string ||
    undefined
  );
}

// Utility function to get correlation ID from request (for use in other modules)
export function extractCorrelationId(req: Request): string {
  return req.correlationId || getCorrelationId(req) || 'unknown';
}

// Note: Express Request interface extension is defined in types/index.ts