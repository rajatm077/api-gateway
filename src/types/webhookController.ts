// Webhook controller types

export interface WebhookEvent {
  eventId: string;
  channel: string;
  tenantId: string;
  type: 'inbound' | 'status_update' | 'unknown';
  messageId: string;
  status: string;
  timestamp: number;
  rawPayload: any;
  metadata: Record<string, any>;
}
