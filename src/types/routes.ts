// Route dependency types

import { RateLimiterService } from '../services/RateLimiterService';
import { KafkaProducerService } from '../services/KafkaProducerService';
import { QueryServiceClient } from '../services/QueryServiceClient';
import { AuthService } from '../services/AuthService';
import { RedisService } from '../services/RedisService';
import Redis from 'ioredis';

export interface RouteDependencies {
  authService: AuthService;
  kafkaProducer: KafkaProducerService;
  rateLimiter: RateLimiterService;
  queryService: QueryServiceClient;
}

export interface HealthDependencies {
  redisClient: Redis;
  kafkaProducer: KafkaProducerService;
  queryService: QueryServiceClient;
  serviceRegistryClient?: any;
  authService?: AuthService;
}

export interface AppDependencies {
  authService: AuthService;
  kafkaProducer: KafkaProducerService;
  rateLimiter: RateLimiterService;
  redisClient: Redis;
  queryService: QueryServiceClient;
  serviceRegistryClient?: any;
  config?: any;
}
