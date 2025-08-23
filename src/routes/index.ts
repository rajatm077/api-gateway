// Main router - combines all route modules

import { Express, Router } from 'express';
import { createMessageRoutes } from './messageRoutes';
import { createChannelRoutes } from './channelRoutes';
import { createWebhookRoutes } from './webhookRoutes';
import { createHealthRoutes } from './healthRoutes';
import { globalErrorHandler } from '../middlewares/errorHandlerMiddleware';
import { RateLimiterService } from '../services/RateLimiterService';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { AuthService } from '../services/AuthService';
import { AppDependencies } from '../types/routes';
import Redis from 'ioredis';
import { createHealthController } from '../controllers/healthController';

export function setupRoutes(app: Express, dependencies: AppDependencies): void {
  // 1. Create API version prefix router
  const v1Router = Router();
  
  // 2. Setup route modules with dependencies
  
  // Message routes
  const messageRoutes = createMessageRoutes({
    rateLimiter: dependencies.rateLimiter,
    kafkaProducer: dependencies.kafkaProducer,
    authService: dependencies.authService,
    queryService: dependencies.queryService
  });
  
  // Channel routes
  const channelRoutes = createChannelRoutes({
    rateLimiter: dependencies.rateLimiter,
    kafkaProducer: dependencies.kafkaProducer,
    authService: dependencies.authService,
    queryService: dependencies.queryService
  });
  
  // 3. Mount routes under /api/v1
  v1Router.use('/messages', messageRoutes);
  v1Router.use('/channels', channelRoutes);
  
  // 4. Mount v1 router
  app.use('/api/v1', v1Router);
  
  // 5. Setup webhook routes (not under /api/v1)
  const webhookRoutes = createWebhookRoutes({
    kafkaProducer: dependencies.kafkaProducer,
    authService: dependencies.authService,
    rateLimiter: dependencies.rateLimiter,
    queryService: dependencies.queryService
  });
  app.use('/webhooks', webhookRoutes);
  
    // 7. Health routes  
  const healthRoutes = createHealthRoutes({
    redisClient: dependencies.redisClient,
    kafkaProducer: dependencies.kafkaProducer,
    authService: dependencies.authService,
    serviceRegistryClient: dependencies.serviceRegistryClient,
    queryService: dependencies.queryService
  });
  app.use('/health', healthRoutes);

  // 8. Direct metrics endpoint (Prometheus standard)
  // Create health controller for metrics endpoint
  const healthController = createHealthController({
    redisClient: dependencies.redisClient,
    kafkaProducer: dependencies.kafkaProducer,
    queryService: dependencies.queryService,
    serviceRegistryClient: dependencies.serviceRegistryClient,
    authService: dependencies.authService
  });
  app.get('/metrics', healthController.metrics);
  
  // 9. Root endpoint
  app.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        service: 'API Gateway',
        version: process.env.VERSION || '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          messages: '/api/v1/messages',
          channels: '/api/v1/channels',
          webhooks: '/webhooks/:channel/:tenant',
          health: '/health',
          metrics: '/metrics'
        }
      }
    });
  });
  
  // 10. 404 handler - must be after all routes
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      }
    });
  });
  
  // 11. Global error handler - must be last
  app.use(globalErrorHandler());
}