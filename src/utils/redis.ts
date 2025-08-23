// Redis client utility - Easy access to the singleton Redis client

import { redisService } from '../services/RedisService';
import Redis from 'ioredis';

/**
 * Get the Redis client instance
 * This is a convenience function to access the singleton Redis client
 */
export function getRedisClient(): Redis {
  return redisService.getClient();
}

/**
 * Check if Redis is ready for operations
 */
export function isRedisReady(): boolean {
  return redisService.isReady();
}

/**
 * Get Redis health status
 */
export async function getRedisHealth() {
  return await redisService.healthCheck();
}

// Re-export the service for advanced usage
export { redisService };
