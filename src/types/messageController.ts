// Message controller conversation types

export interface ConversationMetadata {
  tags?: string[];
  assignedAgent?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  [key: string]: any;
}

export interface ConversationInfo {
  id: string;
  channel: 'sms' | 'email' | 'whatsapp';
  participant: string;
  createdAt: string;
  lastMessageAt: string;
  status: 'active' | 'archived' | 'blocked' | 'closed';
  messageCount: number;
  metadata?: ConversationMetadata;
}

export interface MessageContent {
  text?: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'template';
  subject?: string;
  html?: string;
  attachments?: MessageAttachment[];
  [key: string]: any;
}

export interface MessageAttachment {
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export interface MessageMetadata {
  source: 'api' | 'webhook' | 'system';
  messageIndex?: number;
  retryCount?: number;
  errorCode?: string;
  errorMessage?: string;
  [key: string]: any;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  channel: 'sms' | 'email' | 'whatsapp';
  from: string;
  to: string;
  content: MessageContent;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'read' | 'received';
  timestamp: string;
  deliveredAt?: string;
  readAt?: string;
  metadata?: MessageMetadata;
}

export interface ConversationPagination {
  page: number;
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  hasPrevious: boolean;
}

export interface ConversationFilters {
  channel?: 'sms' | 'email' | 'whatsapp' | null;
  direction?: 'inbound' | 'outbound' | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ConversationHistoryData {
  conversation: ConversationInfo;
  messages: ConversationMessage[];
  pagination: ConversationPagination;
  filters: ConversationFilters;
}

export interface ConversationHistoryResponse {
  success: boolean;
  data: ConversationHistoryData;
  meta: {
    requestId: string;
    timestamp: string;
    queryTime: string;
  };
}
