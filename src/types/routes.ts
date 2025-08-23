// Route dependency types

import { RateLimiterService } from '../services/RateLimiterService';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { AuthService } from '../services/AuthService';
import { RedisService } from '../services/RedisService';
import Redis from 'ioredis';

export interface RouteDependencies {
  authService: AuthService;
  kafkaProducer: KafkaProducerService;
  rateLimiter: RateLimiterService;
}

export interface HealthDependencies {
  redisClient: Redis;
  kafkaProducer: KafkaProducerService;
  serviceRegistryClient?: any;
  authService?: AuthService;
}

export interface AppDependencies {
  authService: AuthService;
  kafkaProducer: KafkaProducerService;
  rateLimiter: RateLimiterService;
  redisClient: Redis;
  serviceRegistryClient?: any;
  config?: any;
}
