// Configuration management - load and validate all environment variables

import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

interface AppConfig {
  // Server config
  port: number;
  env: 'development' | 'production' | 'test';
  serviceName: string;
  
  // Auth config
  jwt: {
    publicKey: string;
    algorithm: string;
    issuer?: string;
  };
  
  // Redis config
  redis: {
    url: string;
    db: number;
    keyPrefix: string;
  };
  
  // Kafka config
  kafka: {
    brokers: string[];
    clientId: string;
    ssl?: boolean;
    sasl?: {
      mechanism: string;
      username: string;
      password: string;
    };
  };
  
  // Query Service config
  queryService: {
    url: string;
    timeout: number;
    retries: number;
  };
  
  // Rate limiting config
  rateLimit: {
    defaultLimit: number;  // requests per second
    windowMs: number;      // time window in milliseconds
    maxBurst: number;      // max burst capacity
  };
  
  // Service Registry config (optional)
  serviceRegistry?: {
    url: string;
    heartbeatInterval: number;
  };
}

// Environment variable validation schema
const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  SERVICE_NAME: Joi.string().default('api-gateway'),
  
  // JWT Configuration
  JWT_PUBLIC_KEY: Joi.string().required(),
  JWT_ALGORITHM: Joi.string().default('RS256'),
  JWT_ISSUER: Joi.string().optional(),
  
  // Redis Configuration
  REDIS_URL: Joi.string().uri().required(),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
  REDIS_KEY_PREFIX: Joi.string().default('api-gateway:'),
  
  // Kafka Configuration
  KAFKA_BROKERS: Joi.string().required(),
  KAFKA_CLIENT_ID: Joi.string().default('api-gateway'),
  KAFKA_SSL: Joi.boolean().default(false),
  KAFKA_SASL_MECHANISM: Joi.string().when('KAFKA_SSL', {
    is: true,
    then: Joi.string().valid('plain', 'scram-sha-256', 'scram-sha-512').required(),
    otherwise: Joi.string().optional()
  }),
  KAFKA_SASL_USERNAME: Joi.string().when('KAFKA_SSL', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional()
  }),
  KAFKA_SASL_PASSWORD: Joi.string().when('KAFKA_SSL', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional()
  }),
  
  // Query Service Configuration
  QUERY_SERVICE_URL: Joi.string().uri().default('http://localhost:3200'),
  QUERY_SERVICE_TIMEOUT: Joi.number().positive().default(5000),
  QUERY_SERVICE_RETRIES: Joi.number().integer().min(0).default(3),
  
  // Rate Limiting Configuration
  RATE_LIMIT_DEFAULT: Joi.number().positive().default(50),
  RATE_LIMIT_WINDOW_MS: Joi.number().positive().default(1000),
  RATE_LIMIT_MAX_BURST: Joi.number().positive().default(100),
  
  // Service Registry Configuration (optional)
  SERVICE_REGISTRY_URL: Joi.string().uri().optional(),
  SERVICE_REGISTRY_HEARTBEAT_INTERVAL: Joi.number().positive().default(30000),
});

function loadConfig(): AppConfig {
  // 1. Load environment variables using dotenv (already done at top)
  
  // 2. Parse and validate each configuration section
  const { error, value: env } = configSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: true
  });

  if (error) {
    throw new Error(`Configuration validation error: ${error.details.map(d => d.message).join(', ')}`);
  }

  // 3. Parse complex values
  const kafkaBrokers = env.KAFKA_BROKERS.split(',').map((broker: string) => broker.trim());
  
  // Handle multiline JWT public key (replace \\n with actual newlines)
  const jwtPublicKey = env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

  // 4. Build configuration object
  const config: AppConfig = {
    port: env.PORT,
    env: env.NODE_ENV,
    serviceName: env.SERVICE_NAME,
    
    jwt: {
      publicKey: jwtPublicKey,
      algorithm: env.JWT_ALGORITHM,
      issuer: env.JWT_ISSUER
    },
    
    redis: {
      url: env.REDIS_URL,
      db: env.REDIS_DB,
      keyPrefix: env.REDIS_KEY_PREFIX
    },
    
    kafka: {
      brokers: kafkaBrokers,
      clientId: env.KAFKA_CLIENT_ID,
      ssl: env.KAFKA_SSL,
      ...(env.KAFKA_SSL && {
        sasl: {
          mechanism: env.KAFKA_SASL_MECHANISM,
          username: env.KAFKA_SASL_USERNAME,
          password: env.KAFKA_SASL_PASSWORD
        }
      })
    },
    
    queryService: {
      url: env.QUERY_SERVICE_URL,
      timeout: env.QUERY_SERVICE_TIMEOUT,
      retries: env.QUERY_SERVICE_RETRIES
    },
    
    rateLimit: {
      defaultLimit: env.RATE_LIMIT_DEFAULT,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxBurst: env.RATE_LIMIT_MAX_BURST
    },
    
    ...(env.SERVICE_REGISTRY_URL && {
      serviceRegistry: {
        url: env.SERVICE_REGISTRY_URL,
        heartbeatInterval: env.SERVICE_REGISTRY_HEARTBEAT_INTERVAL
      }
    })
  };

  // 5. Additional validation
  validateConfig(config);

  // 6. Log configuration (without sensitive values) in development mode
  if (config.env === 'development') {
    console.log('Configuration loaded:', {
      port: config.port,
      env: config.env,
      serviceName: config.serviceName,
      redis: { ...config.redis, url: '[REDACTED]' },
      kafka: { 
        ...config.kafka, 
        brokers: config.kafka.brokers,
        sasl: config.kafka.sasl ? '[REDACTED]' : undefined
      },
      queryService: config.queryService,
      rateLimit: config.rateLimit,
      serviceRegistry: config.serviceRegistry ? { 
        ...config.serviceRegistry, 
        url: config.serviceRegistry.url 
      } : undefined
    });
  }

  return config;
}

function validateConfig(config: AppConfig): void {
  // Validate that all required fields are present
  if (!config.jwt.publicKey) {
    throw new Error('JWT_PUBLIC_KEY is required');
  }

  if (config.kafka.brokers.length === 0) {
    throw new Error('At least one Kafka broker must be specified');
  }

  // Validate port range
  if (config.port < 1 || config.port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }

  // Validate rate limit values
  if (config.rateLimit.defaultLimit <= 0 || 
      config.rateLimit.windowMs <= 0 || 
      config.rateLimit.maxBurst <= 0) {
    throw new Error('Rate limit values must be positive numbers');
  }
}

export const config = loadConfig();
export type { AppConfig };