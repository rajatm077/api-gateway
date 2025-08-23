// Validation middleware types

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  type: string;
}

export interface ValidationResponse {
  success: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: ValidationError[];
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface AttachmentData {
  filename: string;
  content: string;
  contentType?: string;
}

export interface MessageContent {
  text?: string;
  subject?: string;
  html?: string;
  attachments?: AttachmentData[];
}

export interface BulkRecipient {
  to: string;
  personalizations?: Record<string, any>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffFactor: number;
}

export interface ChannelConfig {
  channel: 'sms' | 'email' | 'whatsapp' | 'push';
  enabled: boolean;
  config: Record<string, any>;
  webhookUrl?: string;
  retryPolicy?: RetryPolicy;
}

export interface PaginationQuery {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  filter?: Record<string, any>;
}

export interface MessageQuery {
  messageId: string;
  includeEvents: boolean;
}
