// Redis service - Singleton pattern for Redis client management

import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { config } from '../config';

export class RedisService {
  private static instance: RedisService;
  private client: Redis | null = null;
  private isConnected: boolean = false;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of RedisService
   */
  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Initialize Redis connection
   */
  public async initialize(): Promise<void> {
    if (this.client && this.isConnected) {
      logger.warn('Redis client already initialized and connected');
      return;
    }

    try {
      logger.info('Initializing Redis connection...');
      
      this.client = new Redis(config.redis.url, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectionName: 'api-gateway',
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        enableReadyCheck: true,
        connectTimeout: 10000,
        commandTimeout: 5000
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Test connection with ping
      await this.client.connect();
      const pingResult = await this.client.ping();
      
      if (pingResult !== 'PONG') {
        throw new Error('Redis ping test failed');
      }

      this.isConnected = true;
      logger.info('Redis connection established successfully', {
        url: this.maskRedisUrl(config.redis.url),
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix
      });

    } catch (error: any) {
      this.isConnected = false;
      logger.error('Failed to initialize Redis connection', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get the Redis client instance
   */
  public getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }
    if (!this.isConnected) {
      throw new Error('Redis client not connected. Ensure connection is established.');
    }
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  public isReady(): boolean {
    return this.isConnected && this.client !== null && this.client.status === 'ready';
  }

  /**
   * Gracefully disconnect Redis client
   */
  public async disconnect(): Promise<void> {
    if (!this.client) {
      logger.warn('Redis client not initialized, nothing to disconnect');
      return;
    }

    try {
      logger.info('Disconnecting Redis client...');
      await this.client.quit();
      this.isConnected = false;
      this.client = null;
      logger.info('Redis client disconnected successfully');
    } catch (error: any) {
      logger.error('Error disconnecting Redis client', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Health check for Redis connection
   */
  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      if (!this.client || !this.isConnected) {
        return {
          status: 'unhealthy',
          details: { error: 'Redis client not connected' }
        };
      }

      const start = Date.now();
      const pingResult = await this.client.ping();
      const latency = Date.now() - start;

      if (pingResult === 'PONG') {
        return {
          status: 'healthy',
          details: {
            latency: `${latency}ms`,
            status: this.client.status,
            db: config.redis.db
          }
        };
      } else {
        return {
          status: 'unhealthy',
          details: { error: 'Ping test failed', response: pingResult }
        };
      }
    } catch (error: any) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      logger.info('Redis client ready for commands');
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis connection error', {
        error: error.message,
        stack: error.stack,
        code: (error as any).code
      });
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });

    this.client.on('reconnecting', (delay: number) => {
      this.isConnected = false;
      logger.warn('Redis reconnecting...', { delay: `${delay}ms` });
    });

    this.client.on('end', () => {
      this.isConnected = false;
      logger.info('Redis connection ended');
    });
  }

  /**
   * Mask sensitive information in Redis URL for logging
   */
  private maskRedisUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '***';
      }
      return urlObj.toString();
    } catch {
      return '[INVALID_URL]';
    }
  }
}

// Export singleton instance
export const redisService = RedisService.getInstance();
