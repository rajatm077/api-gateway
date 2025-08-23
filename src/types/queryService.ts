// Query Service types and interfaces

export interface QueryServiceConfig {
  url: string;
  timeout: number;
  retries: number;
}

// Response types for Query Service API
export interface QueryServiceConversation {
  id: string;
  tenantId: string;
  channel: 'sms' | 'email' | 'whatsapp';
  participant: string;
  createdAt: string;
  lastMessageAt: string;
  status: 'active' | 'archived' | 'blocked' | 'closed';
  messageCount: number;
  metadata?: {
    tags?: string[];
    assignedAgent?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    [key: string]: any;
  };
}

export interface QueryServiceMessage {
  id: string;
  conversationId: string;
  tenantId: string;
  direction: 'inbound' | 'outbound';
  channel: 'sms' | 'email' | 'whatsapp';
  from: string;
  to: string;
  content: {
    text?: string;
    type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'template';
    subject?: string;
    html?: string;
    attachments?: Array<{
      filename: string;
      contentType: string;
      size: number;
      url: string;
    }>;
    [key: string]: any;
  };
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'read' | 'received';
  timestamp: string;
  deliveredAt?: string;
  readAt?: string;
  metadata?: {
    source: 'api' | 'webhook' | 'system';
    messageIndex?: number;
    retryCount?: number;
    errorCode?: string;
    errorMessage?: string;
    providerMessageId?: string;
    [key: string]: any;
  };
}

export interface QueryServiceMessageEvent {
  type: 'queued' | 'sent' | 'delivered' | 'failed' | 'read' | 'clicked' | 'bounced' | 'spam';
  timestamp: string;
  details: {
    provider?: string;
    messageId?: string;
    deliveryCode?: string;
    errorCode?: string;
    errorMessage?: string;
    gateway?: string;
    [key: string]: any;
  };
}

// List responses with pagination
export interface QueryServiceConversationListResponse {
  conversations: QueryServiceConversation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    hasPrevious: boolean;
  };
}

export interface QueryServiceMessageListResponse {
  messages: QueryServiceMessage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    hasPrevious: boolean;
  };
}

// Query filters
export interface ConversationListFilters {
  channel?: 'sms' | 'email' | 'whatsapp';
  status?: 'active' | 'archived' | 'blocked' | 'closed';
  startDate?: string;
  endDate?: string;
  assignedAgent?: string;
  tags?: string[];
  page?: number;
  limit?: number;
}

export interface MessageListFilters {
  direction?: 'inbound' | 'outbound';
  channel?: 'sms' | 'email' | 'whatsapp';
  status?: 'queued' | 'sent' | 'delivered' | 'failed' | 'read' | 'received';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

// Error types
export class QueryServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'QueryServiceError';
  }
}

export class QueryServiceTimeoutError extends QueryServiceError {
  constructor(timeout: number) {
    super(`Query Service request timed out after ${timeout}ms`, 408);
    this.name = 'QueryServiceTimeoutError';
  }
}

export class QueryServiceNotFoundError extends QueryServiceError {
  constructor(resource: string, id: string) {
    super(`${resource} with ID ${id} not found`, 404);
    this.name = 'QueryServiceNotFoundError';
  }
}

export class QueryServiceUnavailableError extends QueryServiceError {
  constructor(originalError?: any) {
    super('Query Service is currently unavailable', 503, originalError);
    this.name = 'QueryServiceUnavailableError';
  }
}

// Service interface
export interface IQueryServiceClient {
  getConversation(conversationId: string, tenantId: string): Promise<QueryServiceConversation>;
  getMessage(messageId: string, tenantId: string): Promise<QueryServiceMessage>;
  getMessageEvents(messageId: string, tenantId: string): Promise<QueryServiceMessageEvent[]>;
  listConversations(tenantId: string, filters?: ConversationListFilters): Promise<QueryServiceConversationListResponse>;
  getConversationMessages(conversationId: string, tenantId: string, filters?: MessageListFilters): Promise<QueryServiceMessageListResponse>;
  healthCheck(): Promise<{ status: string; version?: string; uptime?: number }>;
}
