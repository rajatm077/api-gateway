// Service interface definitions
import { RateLimitResult, HealthStatus, ChannelType } from '.';

// Rate Limiter Service interface
export interface IRateLimiterService {
  checkLimit(tenantId: string, channel?: string): Promise<RateLimitResult>;
  consumeToken(key: string): Promise<void>;
  getRemainingTokens(key: string): Promise<number>;
}

// Kafka Producer Service interface
export interface IKafkaProducerService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publishMessage(topic: string, message: any): Promise<void>;
  publishBatch(topic: string, messages: any[]): Promise<void>;
  publishWithRetry(topic: string, message: any, retries?: number): Promise<void>;
  isConnected(): boolean;
}

// Auth Service interface
export interface IAuthService {
  validateJWT(token: string): Promise<JWTPayload>;
  validateAPIKey(apiKey: string): Promise<TenantInfo>;
  verifyWebhookSignature(channel: string, headers: any, body: any): Promise<boolean>;
}

// Service Registry Client interface
export interface IServiceRegistryClient {
  register(serviceInfo: ServiceInfo): Promise<void>;
  deregister(serviceId: string): Promise<void>;
  heartbeat(): Promise<void>;
  getService(serviceName: string): Promise<ServiceInfo | null>;
  listServices(filter?: ServiceFilter): Promise<ServiceInfo[]>;
  updateHealth(health: HealthStatus): Promise<void>;
}

// Service information
export interface ServiceInfo {
  id: string;
  name: string;
  version: string;
  url: string;
  healthCheckUrl: string;
  metadata?: Record<string, any>;
  registeredAt: Date;
  lastHeartbeat: Date;
}

export interface ServiceFilter {
  name?: string;
  status?: 'active' | 'inactive';
  metadata?: Record<string, any>;
}

// JWT Payload
export interface JWTPayload {
  tenantId: string;
  userId: string;
  email?: string;
  permissions: string[];
  exp: number;
  iat: number;
  iss?: string;
  aud?: string;
}

// Tenant Information
export interface TenantInfo {
  tenantId: string;
  name: string;
  planType: PlanType;
  status: TenantStatus;
  rateLimits: TenantRateLimits;
  enabledChannels: ChannelType[];
  webhookUrls?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export type PlanType = 'free' | 'starter' | 'professional' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'trial' | 'cancelled';

export interface TenantRateLimits {
  perSecond: number;
  perMinute: number;
  perDay: number;
  bulk?: {
    perSecond: number;
    maxBatchSize: number;
  };
}