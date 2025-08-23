// Express app setup and configuration

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { setupRoutes } from './routes';
import { correlationIdMiddleware } from './middlewares/correlationIdMiddleware';
import { globalErrorHandler } from './middlewares/errorHandlerMiddleware';
import { AppDependencies } from './types/routes';
import { logger } from './utils/logger';

export function createApp(dependencies: AppDependencies): Express {
  // 1. Create Express application instance
  const app = express();

  // 2. Setup security middlewares
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginEmbedderPolicy: false
  }));
  
  app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Correlation-ID']
  }));
  
  app.use(compression());
  
  // Body parsing with size limit (10MB)
  app.use(express.json({ 
    limit: '10mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf; // Store raw body for webhook signature verification
    }
  }));
  
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
  }));

  // 3. Setup request correlation ID
  app.use(correlationIdMiddleware);
  
  // 4. Setup request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    req.startTime = start;
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        correlationId: req.correlationId,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    });
    
    next();
  });

  // 5. Trust proxy for rate limiting and IP detection
  app.set('trust proxy', true);
  
  // 6. Setup routes with dependencies
  setupRoutes(app, dependencies);

  // 7. Global error handler (must be last)
  app.use(globalErrorHandler());

  logger.info('Express application configured successfully');
  return app;
}