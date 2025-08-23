// TypeScript type definitions

// Request extension to add custom properties
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      context?: TenantContext;
      startTime?: number;
    }
  }
}

// Tenant context attached to authenticated requests
export interface TenantContext {
  tenantId: string;
  userId?: string;
  authMethod: 'jwt' | 'apikey';
  permissions: string[];
  rateLimits?: {
    perSecond: number;
    perMinute: number;
    perDay: number;
  };
  enabledChannels: string[];
}

// Message types
export interface OutboundMessage {
  messageId: string;
  tenantId: string;
  conversationId?: string;
  channel: ChannelType;
  to: string | string[];
  content: MessageContent;
  metadata?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
  scheduledAt?: Date;
  correlationId: string;
  timestamp: number;
}

export interface MessageContent {
  text?: string;
  html?: string;
  subject?: string;
  templateId?: string;
  templateParams?: Record<string, any>;
  attachments?: Attachment[];
  media?: MediaContent;
}

export interface Attachment {
  filename: string;
  content?: string; // Base64 encoded
  url?: string;
  contentType: string;
  size?: number;
}

export interface MediaContent {
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  caption?: string;
}

// Channel types
export type ChannelType = 'sms' | 'email' | 'whatsapp';

export interface ChannelConfig {
  id: ChannelType;
  name: string;
  enabled: boolean;
  capabilities: ChannelCapabilities;
  limits: ChannelLimits;
  provider?: string;
}

export interface ChannelCapabilities {
  supportsMedia: boolean;
  supportsTemplates: boolean;
  supportsInbound: boolean;
  supportsBulk: boolean;
  maxMessageLength?: number;
  supportedMediaTypes?: string[];
}

export interface ChannelLimits {
  perSecond: number;
  perMinute?: number;
  perDay?: number;
  maxRecipients?: number;
  maxAttachmentSize?: number;
}

// Webhook types
export interface WebhookEvent {
  eventId: string;
  channel: ChannelType;
  tenantId: string;
  type: 'inbound' | 'status_update';
  messageId?: string;
  status?: MessageStatus;
  timestamp: number;
  rawPayload: any;
  metadata?: {
    from?: string;
    to?: string;
    error?: string;
    [key: string]: any;
  };
}

export type MessageStatus = 
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'read'
  | 'clicked'
  | 'bounced'
  | 'complained';

// Bulk message types
export interface BulkMessageRequest {
  batchId: string;
  tenantId: string;
  recipients: string[] | RecipientSource;
  channels: ChannelType[];
  content: BulkContent;
  options: BulkOptions;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  estimatedCompletion?: Date;
}

export interface RecipientSource {
  type: 'file' | 'segment' | 'query';
  source: string;
  format?: 'csv' | 'json';
  mapping?: Record<string, string>;
}

export interface BulkContent {
  templateId?: string;
  [channel: string]: MessageContent | string | undefined;
}

export interface BulkOptions {
  batchSize: number;
  rateLimit: number;
  scheduledAt?: Date;
  retryFailures: boolean;
  continueOnError: boolean;
}

// Rate limiting types
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
}

// Service health types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    redis: boolean;
    kafka: boolean;
    serviceRegistry?: boolean;
  };
  uptime: number;
  version: string;
}