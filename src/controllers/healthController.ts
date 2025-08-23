// Health controller - health checks and monitoring endpoints

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { 
  HealthCheckResponse, 
  LivenessProbeResponse, 
  ReadinessProbeResponse,
  DependencyStatus,
  DeepHealthCheckResponse
} from '../types/healthController';

export function createHealthController(redis: Redis, kafkaProducer: KafkaProducerService) {
  
  async function healthCheck(req: Request, res: Response): Promise<void> {
    // Basic health check - just returns OK if service is running
    // No dependency checks
    
    const response: HealthCheckResponse = {
      success: true,
      data: {
        status: 'healthy',
        service: 'api-gateway',
        version: process.env.VERSION || '1.0.0',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version
      }
    };
    
    res.json(response);
  }

  async function livenessProbe(req: Request, res: Response): Promise<void> {
    // Kubernetes liveness probe
    // Checks if the process is alive and responding
    // Should be very lightweight
    
    try {
      // Simple check - if we can respond, we're alive
      const response: LivenessProbeResponse = { 
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime())
      };
      
      res.status(200).json(response);
      
      // Note: If this doesn't respond, K8s will restart the pod
    } catch (error) {
      // This should rarely happen, but if it does, we're not alive
      const errorResponse: LivenessProbeResponse = { 
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        error: (error as Error).message 
      };
      
      res.status(500).json(errorResponse);
    }
  }

  async function readinessProbe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Kubernetes readiness probe
      // Checks if service is ready to handle traffic
      // Should check critical dependencies
      
      const checks = {
        redis: false,
        kafka: false,
        serviceRegistry: true // Assume true since it's optional
      };
      
      const startTime = Date.now();
      
      // 1. Check Redis connection
      try {
        const pingResult = await redis.ping();
        checks.redis = pingResult === 'PONG';
        logger.debug('Redis readiness check', { 
          status: checks.redis,
          response: pingResult 
        });
      } catch (error) {
        logger.warn('Redis readiness check failed', { 
          error: (error as Error).message 
        });
        checks.redis = false;
      }
      
      // 2. Check Kafka producer
      try {
        // Check if producer is connected by attempting to get metadata
        // This is a lightweight check compared to actually sending a message
        const isConnected = await kafkaProducer.isHealthy();
        checks.kafka = isConnected;
        logger.debug('Kafka readiness check', { 
          status: checks.kafka 
        });
      } catch (error) {
        logger.warn('Kafka readiness check failed', { 
          error: (error as Error).message 
        });
        checks.kafka = false;
      }
      
      // 3. Service Registry check (optional)
      // For now, assume it's healthy since it's not critical
      // In production, you might ping an actual service registry
      
      // 4. Determine overall readiness
      // Redis and Kafka are critical dependencies
      const isReady = checks.redis && checks.kafka;
      const responseTime = Date.now() - startTime;
      
      // 5. Return appropriate status
      const responseData: ReadinessProbeResponse = {
        status: isReady ? 'ready' : 'not ready',
        checks,
        responseTime,
        timestamp: new Date().toISOString()
      };
      
      if (isReady) {
        res.status(200).json(responseData);
        logger.debug('Readiness probe successful', { 
          responseTime,
          checks 
        });
      } else {
        res.status(503).json(responseData);
        logger.warn('Readiness probe failed', { 
          responseTime,
          checks,
          failedServices: Object.entries(checks)
            .filter(([, status]) => !status)
            .map(([service]) => service)
        });
      }
      
    } catch (error) {
      // If probe itself fails, service is not ready
      logger.error('Readiness probe error', { 
        error: (error as Error).message 
      });
      
      const errorResponse: ReadinessProbeResponse = {
        status: 'error',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      };
      
      res.status(503).json(errorResponse);
    }
  }

  async function metrics(req: Request, res: Response): Promise<void> {
    try {
      // Prometheus metrics endpoint
      // Returns basic metrics in Prometheus format
      
      const now = Date.now();
      const uptime = Math.floor(process.uptime());
      const memoryUsage = process.memoryUsage();
      
      // Generate basic Prometheus metrics
      const prometheusMetrics = `
# HELP api_gateway_uptime_seconds Total uptime of the API Gateway in seconds
# TYPE api_gateway_uptime_seconds gauge
api_gateway_uptime_seconds ${uptime}

# HELP api_gateway_memory_usage_bytes Memory usage in bytes
# TYPE api_gateway_memory_usage_bytes gauge
api_gateway_memory_usage_bytes{type="rss"} ${memoryUsage.rss}
api_gateway_memory_usage_bytes{type="heapUsed"} ${memoryUsage.heapUsed}
api_gateway_memory_usage_bytes{type="heapTotal"} ${memoryUsage.heapTotal}
api_gateway_memory_usage_bytes{type="external"} ${memoryUsage.external}

# HELP api_gateway_process_start_time_seconds Start time of the process since unix epoch in seconds
# TYPE api_gateway_process_start_time_seconds gauge
api_gateway_process_start_time_seconds ${Math.floor((now - uptime * 1000) / 1000)}

# HELP api_gateway_info Information about the API Gateway
# TYPE api_gateway_info gauge
api_gateway_info{version="${process.env.VERSION || '1.0.0'}",node_version="${process.version}",environment="${process.env.NODE_ENV || 'development'}"} 1
`.trim();
      
      // Set Prometheus content type
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusMetrics);
      
      logger.debug('Metrics endpoint accessed', { 
        uptime,
        memoryUsageRss: memoryUsage.rss,
        memoryUsageHeap: memoryUsage.heapUsed
      });
      
    } catch (error) {
      logger.error('Failed to collect metrics', { 
        error: (error as Error).message 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to collect metrics',
        timestamp: new Date().toISOString()
      });
    }
  }

  async function deepHealthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Comprehensive health check for monitoring
      // More detailed than readiness probe
      
      const startTime = Date.now();
      const results: any = {
        service: 'api-gateway',
        version: process.env.VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        dependencies: {},
        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          platform: process.platform,
          nodeVersion: process.version
        }
      };
      
      // Check Redis with detailed info
      try {
        const redisStart = Date.now();
        const pingResult = await redis.ping();
        const redisInfo = await redis.info('server');
        
        results.dependencies.redis = {
          status: pingResult === 'PONG' ? 'healthy' : 'unhealthy',
          responseTime: Date.now() - redisStart,
          version: redisInfo.split('\r\n').find(line => line.startsWith('redis_version:'))?.split(':')[1],
          ping: pingResult
        };
      } catch (error) {
        results.dependencies.redis = {
          status: 'unhealthy',
          error: (error as Error).message
        };
      }
      
      // Check Kafka with detailed info
      try {
        const kafkaStart = Date.now();
        const isHealthy = await kafkaProducer.isHealthy();
        
        results.dependencies.kafka = {
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime: Date.now() - kafkaStart,
          isConnected: isHealthy
        };
      } catch (error) {
        results.dependencies.kafka = {
          status: 'unhealthy',
          error: (error as Error).message
        };
      }
      
      // Overall health assessment
      const allHealthy = Object.values(results.dependencies)
        .every((dep: any) => dep.status === 'healthy');
      
      results.status = allHealthy ? 'healthy' : 'unhealthy';
      results.totalResponseTime = Date.now() - startTime;
      
      // Return appropriate status code
      const statusCode = allHealthy ? 200 : 503;
      res.status(statusCode).json({
        success: allHealthy,
        data: results
      });
      
      logger.info('Deep health check completed', {
        status: results.status,
        totalResponseTime: results.totalResponseTime,
        dependencyCount: Object.keys(results.dependencies).length
      });
      
    } catch (error) {
      logger.error('Deep health check failed', { 
        error: (error as Error).message 
      });
      
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  }

  return {
    healthCheck,
    livenessProbe,
    readinessProbe,
    metrics,
    deepHealthCheck
  };
}