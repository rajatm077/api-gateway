// Configuration type definitions

export interface AppConfig {
  // Server configuration
  server: {
    port: number;
    env: 'development' | 'staging' | 'production';
    name: string;
    version: string;
    shutdownTimeout: number; // ms
  };
  
  // Authentication configuration
  auth: {
    jwt: {
      publicKey: string;
      algorithm: string;
      issuer?: string;
      audience?: string;
      expiresIn?: string;
    };
    apiKey: {
      header: string;
      enabled: boolean;
    };
  };
  
  // Redis configuration
  redis: {
    url: string;
    db: number;
    keyPrefix: string;
    maxRetriesPerRequest: number;
    enableReadyCheck: boolean;
    connectionName: string;
  };
  
  // Kafka configuration
  kafka: {
    brokers: string[];
    clientId: string;
    groupId?: string;
    ssl?: {
      rejectUnauthorized: boolean;
      ca?: string;
      cert?: string;
      key?: string;
    };
    sasl?: {
      mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
      username: string;
      password: string;
    };
    retry: {
      initialRetryTime: number;
      retries: number;
      multiplier: number;
    };
  };
  
  // Rate limiting configuration
  rateLimit: {
    default: {
      perSecond: number;
      perMinute: number;
      perDay: number;
    };
    bulk: {
      perSecond: number;
      perMinute: number;
    };
    webhook: {
      perSecond: number;
    };
    windowMs: number;
    maxBurst: number;
    keyPrefix: string;
  };
  
  // Service Registry configuration
  serviceRegistry?: {
    url: string;
    serviceName: string;
    serviceUrl: string;
    heartbeatInterval: number;
    healthCheckPath: string;
  };
  
  // Logging configuration
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    format: 'json' | 'simple';
    prettyPrint: boolean;
    silent: boolean;
  };
  
  // Metrics configuration
  metrics: {
    enabled: boolean;
    path: string;
    requireAuth: boolean;
    username?: string;
    password?: string;
  };
  
  // CORS configuration
  cors: {
    enabled: boolean;
    origins: string[];
    methods: string[];
    allowedHeaders: string[];
    credentials: boolean;
  };
  
  // Request limits
  limits: {
    bodySize: string; // e.g., '10mb'
    parameterLimit: number;
    requestTimeout: number; // ms
  };
}