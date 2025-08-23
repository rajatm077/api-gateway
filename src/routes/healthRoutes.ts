// Health routes - monitoring and health check endpoints

import { Router, Request, Response, NextFunction } from 'express';
import { createHealthController } from '../controllers/healthController';
import { createAuthMiddleware } from '../middlewares/authMiddleware';
import { HealthDependencies } from '../types/routes';
import Redis from 'ioredis';

export function createHealthRoutes(dependencies: HealthDependencies): Router {
  const router = Router();
  
  // 1. Create controller instance
  const healthController = createHealthController(dependencies);
  
  // Note: Health endpoints typically don't require authentication
  // They need to be accessible for monitoring systems
  
  // 2. Basic health endpoints
  
  // GET /health
  // Basic health check
  router.get(
    '/',
    healthController.healthCheck
  );
  
  // GET /health/live
  // Kubernetes liveness probe
  router.get(
    '/live',
    healthController.livenessProbe
  );
  
  // GET /health/ready
  // Kubernetes readiness probe
  router.get(
    '/ready',
    // Pass dependencies for checking connections
    (req, res, next) => {
      req.app.locals = {
        redis: dependencies.redisClient,
        kafka: dependencies.kafkaProducer
      };
      next();
    },
    healthController.readinessProbe
  );
  
  // 3. Metrics endpoint
  
  // GET /health/metrics
  // Prometheus metrics endpoint
  router.get(
    '/metrics',
    // Could add basic auth for metrics if needed
    metricsAuthMiddleware, // Optional
    healthController.metrics
  );
  
  // 4. Detailed health check (authenticated)
  
  // GET /health/detailed
  if (dependencies.authService) {
    router.get(
      '/detailed',
      createAuthMiddleware(dependencies.authService), // Require auth for detailed info
      healthController.deepHealthCheck
    );
  }
  
  // 5. Component-specific health checks
  
  // GET /health/redis
  router.get(
    '/redis',
    async (req, res) => {
      try {
        const start = Date.now();
        const result = await dependencies.redisClient.ping();
        const responseTime = Date.now() - start;
        
        res.json({
          service: 'redis',
          status: result === 'PONG' ? 'healthy' : 'unhealthy',
          responseTime,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(503).json({
          service: 'redis',
          status: 'unhealthy',
          error: (error as Error).message,
          timestamp: new Date().toISOString()
        });
      }
    }
  );
  
  // GET /health/kafka
  router.get(
    '/kafka',
    async (req, res) => {
      try {
        const start = Date.now();
        const isHealthy = await dependencies.kafkaProducer.isHealthy();
        const responseTime = Date.now() - start;
        
        res.json({
          service: 'kafka',
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime,
          isConnected: dependencies.kafkaProducer.isConnected(),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(503).json({
          service: 'kafka',
          status: 'unhealthy',
          error: (error as Error).message,
          timestamp: new Date().toISOString()
        });
      }
    }
  );
  
  return router;
}

// Optional basic auth for metrics
function metricsAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Check if metrics auth is enabled in config
  if (!process.env.METRICS_REQUIRE_AUTH || process.env.METRICS_REQUIRE_AUTH !== 'true') {
    return next();
  }
  
  // 2. Check basic auth header
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Metrics"');
    return res.status(401).send('Authentication required for metrics');
  }
  
  try {
    // 3. Validate credentials
    const credentials = Buffer.from(auth.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    // 4. Check against configured metrics credentials
    const expectedUsername = process.env.METRICS_USERNAME || 'metrics';
    const expectedPassword = process.env.METRICS_PASSWORD || 'password';
    
    if (username === expectedUsername && password === expectedPassword) {
      return next();
    }
  } catch (error) {
    // Invalid base64 or other parsing error
  }
  
  // 5. Return 401 if invalid
  res.setHeader('WWW-Authenticate', 'Basic realm="Metrics"');
  res.status(401).send('Invalid credentials');
}