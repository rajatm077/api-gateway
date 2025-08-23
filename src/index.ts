// Entry point for API Gateway service
// This file bootstraps the Express application and starts the server

import { Server } from 'http';
import { createApp } from './app';
import { logger } from './utils/logger';
import { config } from './config';
import { redisService } from './services/RedisService';
import { RateLimiterService } from './services/RateLimiterService';
import { KafkaProducerService } from './services/KafkaProducerService';
import { QueryServiceClient } from './services/QueryServiceClient';
import { AuthService } from './services/AuthService';

// Global service instances
let httpServer: Server;
let kafkaProducerService: KafkaProducerService;

async function startServer(): Promise<void> {
  try {
    // 1. Configuration is already loaded and validated by importing config
    logger.info('Configuration loaded and validated successfully');

    // 3. Initialize Redis connection using Redis service
    logger.info('Initializing Redis connection...');
    await redisService.initialize();
    logger.info('Redis service initialized successfully');

    // 4. Initialize Kafka producer service
    logger.info('Initializing Kafka producer service...');
    kafkaProducerService = new KafkaProducerService({
      brokers: config.kafka.brokers,
      clientId: config.kafka.clientId,
      ssl: config.kafka.ssl,
      sasl: config.kafka.sasl
    });

    // Connect producer
    await kafkaProducerService.connect();
    logger.info('Kafka producer service connected successfully');

    // 5. Initialize additional services
    logger.info('Initializing additional services...');
    
    // Create rate limiter service with Redis client
    const rateLimiterService = new RateLimiterService(redisService.getClient(), {
      defaultLimit: config.rateLimit.defaultLimit,
      windowMs: config.rateLimit.windowMs,
      keyPrefix: 'api-gateway:rate:'
    });
    
    // Create auth service with JWT configuration
    const authService = new AuthService({
      jwtPublicKey: config.jwt.publicKey,
      jwtAlgorithm: config.jwt.algorithm,
      webhookSecrets: {
        twilio: process.env.TWILIO_WEBHOOK_SECRET,
        sendgrid: process.env.SENDGRID_WEBHOOK_SECRET,
        whatsapp: process.env.WHATSAPP_WEBHOOK_SECRET
      }
    });

    // Create Query Service client
    const queryServiceClient = new QueryServiceClient(config.queryService);
    logger.info('Query Service client initialized', { url: config.queryService.url });

    // 6. Initialize Service Registry client (optional - for service discovery)
    logger.info('Service registry initialization skipped (optional)');

    // 7. Create Express application
    logger.info('Creating Express application...');
    const app = createApp({
      redisClient: redisService.getClient(),
      kafkaProducer: kafkaProducerService,
      rateLimiter: rateLimiterService,
      authService: authService,
      queryService: queryServiceClient,
      config
    });

    // 7. Start HTTP server
    const port = config.port;
    httpServer = app.listen(port, () => {
      logger.info('API Gateway server started successfully', {
        service: 'api-gateway',
        port,
        environment: config.env,
        timestamp: new Date().toISOString()
      });
    });

    // Handle server errors
    httpServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
      } else {
        logger.error('HTTP server error', { error: error.message, stack: error.stack });
      }
      process.exit(1);
    });

    // 8. Setup graceful shutdown
    setupGracefulShutdown();

  } catch (error: any) {
    logger.error('Failed to start server', { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  }
}

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Close HTTP server
      if (httpServer) {
        logger.info('Closing HTTP server...');
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
        logger.info('HTTP server closed');
      }

      // Close Kafka producer connection
      if (kafkaProducerService && kafkaProducerService.isConnected()) {
        logger.info('Disconnecting Kafka producer...');
        await kafkaProducerService.disconnect();
        logger.info('Kafka producer disconnected');
      }

      // Close Redis connection
      if (redisService.isReady()) {
        logger.info('Disconnecting Redis client...');
        await redisService.disconnect();
        logger.info('Redis client disconnected');
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error: any) {
      logger.error('Error during graceful shutdown', { 
        error: error.message, 
        stack: error.stack 
      });
      process.exit(1);
    }
  };

  // Listen for SIGTERM/SIGINT signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Error handling for unhandled rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString()
  });
  process.exit(1);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Call startServer() and handle any startup errors
startServer().catch((error: any) => {
  logger.error('Critical startup error', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});