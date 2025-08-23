// Kafka Event Types - Shared across services
// These types define the structure of all events published to Kafka by the API Gateway

// =============================================================================
// COMMON TYPES
// =============================================================================

export interface BaseKafkaEvent {
  eventId: string;
  tenantId: string;
  correlationId: string;
  timestamp: number;
  source: 'api-gateway';
  version: '1.0';
}

export interface EventMetadata {
  [key: string]: any;
}

// =============================================================================
// MESSAGE ROUTING EVENTS
// =============================================================================

// Topic: message.channel.route.{channel} (sms, email, whatsapp)
export interface MessageRouteEvent extends BaseKafkaEvent {
  messageId: string;
  conversationId: string;
  channel: 'sms' | 'email' | 'whatsapp';
  content: MessageContent;
  metadata: MessageMetadata;
}

export interface MessageContent {
  to: string[];
  text?: string;
  subject?: string;
  html?: string;
  template_id?: string;
  template_data?: Record<string, any>;
  priority: 'low' | 'normal' | 'high';
}

export interface MessageMetadata extends EventMetadata {
  source: 'api-gateway';
  userId?: string;
  originalRequest?: {
    endpoint: string;
    method: string;
    userAgent?: string;
    ip?: string;
  };
}

// =============================================================================
// BULK MESSAGE EVENTS
// =============================================================================

// Topic: message.bulk.route.{channel} (sms, email, whatsapp)
export interface BulkMessageRouteEvent extends BaseKafkaEvent {
  batchId: string;
  channel: 'sms' | 'email' | 'whatsapp';
  totalRecipients: number;
  content: MessageContent;
  recipients: string[]; // Sample recipients or all if small batch
  recipientSource: 'inline' | 'batch_store';
  estimatedCompletion: string;
  options: BulkMessageOptions;
  metadata: BulkMessageMetadata;
}

export interface BulkMessageOptions {
  batchSize: number;
  priority: 'low' | 'normal' | 'high';
  scheduled?: string;
  retryPolicy?: {
    maxRetries: number;
    backoffFactor: number;
  };
}

export interface BulkMessageMetadata extends EventMetadata {
  source: 'api-gateway';
  userId?: string;
  requestSize: number;
  processingStarted: string;
}

// =============================================================================
// CHANNEL TEST EVENTS
// =============================================================================

// Topic: message.test.route.{channel} (sms, email, whatsapp)
export interface ChannelTestEvent extends BaseKafkaEvent {
  testId: string;
  messageId: string;
  conversationId: string;
  channel: 'sms' | 'email' | 'whatsapp';
  content: MessageContent;
  metadata: ChannelTestMetadata;
}

export interface ChannelTestMetadata extends EventMetadata {
  isTest: true;
  testId: string;
  source: 'api-gateway-test';
  testType: 'send' | 'webhook' | 'both';
  initiatedBy?: string;
}

// =============================================================================
// WEBHOOK EVENTS
// =============================================================================

// Topic: webhook.received.{channel} (sms, email, whatsapp)
export interface WebhookReceivedEvent extends BaseKafkaEvent {
  eventId: string;
  channel: 'sms' | 'email' | 'whatsapp';
  type: 'inbound' | 'status_update' | 'unknown';
  messageId: string;
  status: string;
  rawPayload: any;
  metadata: WebhookEventMetadata;
}

// Channel-specific webhook metadata
export interface WebhookEventMetadata extends EventMetadata {
  provider: 'twilio' | 'sendgrid' | 'meta' | 'unknown';
  webhookId?: string;
  signatureVerified: boolean;
  processingTime?: number;
}

// SMS-specific webhook metadata (Twilio)
export interface SmsWebhookMetadata extends WebhookEventMetadata {
  provider: 'twilio';
  from: string;
  to: string;
  body?: string;
  numSegments?: number;
  price?: string;
  priceUnit?: string;
  apiVersion?: string;
  errorCode?: string;
  errorMessage?: string;
}

// Email-specific webhook metadata (SendGrid)
export interface EmailWebhookMetadata extends WebhookEventMetadata {
  provider: 'sendgrid';
  email: string;
  subject?: string;
  category?: string[];
  reason?: string;
  bounce_classification?: string;
  url?: string; // for click events
  useragent?: string;
}

// WhatsApp-specific webhook metadata (Meta)
export interface WhatsAppWebhookMetadata extends WebhookEventMetadata {
  provider: 'meta';
  from?: string;
  to?: string;
  messageType?: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location';
  text?: string;
  context?: {
    forwarded?: boolean;
    frequently_forwarded?: boolean;
    from?: string;
    id?: string;
    referred_product?: any;
  };
  recipient_id?: string;
  conversation?: {
    id: string;
    origin: {
      type: string;
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
}

// =============================================================================
// CONVERSATION EVENTS
// =============================================================================

// Topic: conversation.events
export interface ConversationEvent extends BaseKafkaEvent {
  conversationId: string;
  eventType: 'created' | 'updated' | 'closed' | 'archived' | 'message_added';
  channel: 'sms' | 'email' | 'whatsapp';
  participant: string;
  data: ConversationEventData;
  metadata: ConversationEventMetadata;
}

export interface ConversationEventData {
  conversationId: string;
  status?: 'active' | 'archived' | 'blocked' | 'closed';
  lastMessageAt?: string;
  messageCount?: number;
  tags?: string[];
  assignedAgent?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  customFields?: Record<string, any>;
}

export interface ConversationEventMetadata extends EventMetadata {
  triggeredBy: 'message' | 'api' | 'webhook' | 'system';
  previousStatus?: string;
  changeReason?: string;
}

// =============================================================================
// STATUS UPDATE EVENTS
// =============================================================================

// Topic: message.status.updates
export interface MessageStatusEvent extends BaseKafkaEvent {
  messageId: string;
  conversationId?: string;
  channel: 'sms' | 'email' | 'whatsapp';
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'read' | 'clicked' | 'bounced' | 'spam';
  previousStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  providerMessageId?: string;
  metadata: MessageStatusMetadata;
}

export interface MessageStatusMetadata extends EventMetadata {
  deliveredAt?: string;
  readAt?: string;
  failureReason?: string;
  retryCount?: number;
  providerResponse?: any;
  cost?: {
    amount: number;
    currency: string;
    unit: string;
  };
}

// =============================================================================
// ERROR EVENTS
// =============================================================================

// Topic: gateway.errors
export interface GatewayErrorEvent extends BaseKafkaEvent {
  errorId: string;
  errorType: 'validation' | 'authentication' | 'rate_limit' | 'service_unavailable' | 'internal';
  errorCode: string;
  errorMessage: string;
  context: ErrorContext;
  metadata: ErrorEventMetadata;
}

export interface ErrorContext {
  endpoint?: string;
  method?: string;
  statusCode?: number;
  requestSize?: number;
  userId?: string;
  messageId?: string;
  conversationId?: string;
  channel?: string;
}

export interface ErrorEventMetadata extends EventMetadata {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'user_error' | 'system_error' | 'integration_error';
  recoverable: boolean;
  retryable: boolean;
  stackTrace?: string;
}

// =============================================================================
// METRICS EVENTS
// =============================================================================

// Topic: gateway.metrics
export interface GatewayMetricsEvent extends BaseKafkaEvent {
  metricType: 'request' | 'message' | 'webhook' | 'error' | 'performance';
  metrics: MetricsData;
  metadata: MetricsEventMetadata;
}

export interface MetricsData {
  // Request metrics
  requestCount?: number;
  responseTime?: number;
  statusCode?: number;
  endpoint?: string;
  method?: string;
  
  // Message metrics
  messageCount?: number;
  channel?: string;
  recipientCount?: number;
  
  // Performance metrics
  kafkaPublishTime?: number;
  redisResponseTime?: number;
  authenticationTime?: number;
  validationTime?: number;
  
  // Custom metrics
  [key: string]: any;
}

export interface MetricsEventMetadata extends EventMetadata {
  aggregationWindow: '1m' | '5m' | '15m' | '1h';
  datacenter?: string;
  region?: string;
  instanceId?: string;
}

// =============================================================================
// UNION TYPES FOR TYPE SAFETY
// =============================================================================

export type KafkaEvent = 
  | MessageRouteEvent
  | BulkMessageRouteEvent
  | ChannelTestEvent
  | WebhookReceivedEvent
  | ConversationEvent
  | MessageStatusEvent
  | GatewayErrorEvent
  | GatewayMetricsEvent;

// Event types by topic for routing
export interface TopicEventMap {
  'message.channel.route.sms': MessageRouteEvent;
  'message.channel.route.email': MessageRouteEvent;
  'message.channel.route.whatsapp': MessageRouteEvent;
  'message.bulk.route.sms': BulkMessageRouteEvent;
  'message.bulk.route.email': BulkMessageRouteEvent;
  'message.bulk.route.whatsapp': BulkMessageRouteEvent;
  'message.test.route.sms': ChannelTestEvent;
  'message.test.route.email': ChannelTestEvent;
  'message.test.route.whatsapp': ChannelTestEvent;
  'webhook.received.sms': WebhookReceivedEvent;
  'webhook.received.email': WebhookReceivedEvent;
  'webhook.received.whatsapp': WebhookReceivedEvent;
  'conversation.events': ConversationEvent;
  'message.status.updates': MessageStatusEvent;
  'gateway.errors': GatewayErrorEvent;
  'gateway.metrics': GatewayMetricsEvent;
}

// Helper type to get event type by topic
export type EventByTopic<T extends keyof TopicEventMap> = TopicEventMap[T];

// =============================================================================
// UTILITY TYPES
// =============================================================================

export interface KafkaMessageWrapper<T extends KafkaEvent = KafkaEvent> {
  topic: keyof TopicEventMap;
  partition?: number;
  key?: string;
  value: T;
  headers?: Record<string, string>;
  timestamp?: number;
}

export interface KafkaBatchMessage<T extends KafkaEvent = KafkaEvent> {
  topic: keyof TopicEventMap;
  messages: Array<{
    partition?: number;
    key?: string;
    value: T;
    headers?: Record<string, string>;
    timestamp?: number;
  }>;
}

// =============================================================================
// EVENT BUILDERS (Helper functions for creating events)
// =============================================================================

export interface EventBuilder {
  createMessageRouteEvent(data: Omit<MessageRouteEvent, keyof BaseKafkaEvent>): MessageRouteEvent;
  createBulkMessageRouteEvent(data: Omit<BulkMessageRouteEvent, keyof BaseKafkaEvent>): BulkMessageRouteEvent;
  createChannelTestEvent(data: Omit<ChannelTestEvent, keyof BaseKafkaEvent>): ChannelTestEvent;
  createWebhookReceivedEvent(data: Omit<WebhookReceivedEvent, keyof BaseKafkaEvent>): WebhookReceivedEvent;
  createConversationEvent(data: Omit<ConversationEvent, keyof BaseKafkaEvent>): ConversationEvent;
  createMessageStatusEvent(data: Omit<MessageStatusEvent, keyof BaseKafkaEvent>): MessageStatusEvent;
  createGatewayErrorEvent(data: Omit<GatewayErrorEvent, keyof BaseKafkaEvent>): GatewayErrorEvent;
  createGatewayMetricsEvent(data: Omit<GatewayMetricsEvent, keyof BaseKafkaEvent>): GatewayMetricsEvent;
}

// =============================================================================
// VALIDATION SCHEMAS (for runtime validation)
// =============================================================================

export interface EventValidationSchema {
  validateMessageRouteEvent(event: any): event is MessageRouteEvent;
  validateBulkMessageRouteEvent(event: any): event is BulkMessageRouteEvent;
  validateChannelTestEvent(event: any): event is ChannelTestEvent;
  validateWebhookReceivedEvent(event: any): event is WebhookReceivedEvent;
  validateConversationEvent(event: any): event is ConversationEvent;
  validateMessageStatusEvent(event: any): event is MessageStatusEvent;
  validateGatewayErrorEvent(event: any): event is GatewayErrorEvent;
  validateGatewayMetricsEvent(event: any): event is GatewayMetricsEvent;
}
