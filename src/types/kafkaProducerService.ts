// Kafka producer service types and interfaces

export interface MessagePayload {
  messageId: string;
  tenantId: string;
  conversationId?: string;
  channel: string;
  content: any;
  correlationId: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  ssl?: boolean;
  sasl?: {
    mechanism: string;
    username: string;
    password: string;
  };
}

export interface RetryConfig {
  maxRetries: number;
  initialRetryTime: number;
  backoffFactor: number;
}
