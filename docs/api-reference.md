# API Reference

Complete API documentation for the API Gateway.

## Base URL

- Development: `http://localhost:3000`
- Production: `https://api.yourdomain.com`

## Authentication

Most endpoints require JWT authentication:

```http
Authorization: Bearer <jwt-token>
```

## Endpoints

### Health & Monitoring

#### `GET /health`
Basic health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

#### `GET /health/readiness`
Kubernetes readiness probe - checks critical dependencies.

**Response:**
```json
{
  "status": "ready",
  "checks": {
    "redis": true,
    "kafka": true,
    "queryService": true
  },
  "responseTime": 25,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `GET /health/deep`
Comprehensive health check with detailed dependency information.

### Channel Management

#### `GET /api/v1/channels`
List available messaging channels and their capabilities.

**Headers:**
- `Authorization: Bearer <token>`
- `X-Tenant-ID: <tenant-id>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "sms",
      "name": "SMS",
      "status": "active",
      "capabilities": {
        "supportsMedia": false,
        "maxLength": 160,
        "supportsBulk": true
      },
      "limits": {
        "perSecond": 50,
        "perMinute": 1000
      }
    }
  ]
}
```

#### `GET /api/v1/channels/{channelId}`
Get detailed information about a specific channel.

**Parameters:**
- `channelId` (path): Channel identifier (sms, email, whatsapp)

#### `GET /api/v1/channels/{channelId}/status`
Get real-time status of a messaging channel.

### Message Operations

#### `POST /api/v1/messages`
Send a message through the specified channel.

**Request Body:**
```json
{
  "to": "+1234567890",
  "channel": "sms",
  "content": {
    "text": "Hello, World!",
    "type": "text"
  },
  "conversationId": "optional-conversation-id",
  "priority": "normal"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg_12345",
    "conversationId": "conv_67890",
    "status": "queued"
  }
}
```

#### `POST /api/v1/messages/bulk`
Send multiple messages in a single request.

**Request Body:**
```json
{
  "messages": [
    {
      "to": "+1234567890",
      "channel": "sms",
      "content": {
        "text": "Message 1"
      }
    },
    {
      "to": "+0987654321", 
      "channel": "sms",
      "content": {
        "text": "Message 2"
      }
    }
  ]
}
```

#### `GET /api/v1/messages/{messageId}/status`
Get the current status of a message.

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg_12345",
    "status": "delivered",
    "channel": "sms",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "deliveredAt": "2024-01-01T00:01:00.000Z"
  }
}
```

#### `GET /api/v1/messages/{messageId}/events`
Get the event history for a message.

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg_12345",
    "events": [
      {
        "type": "queued",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "details": { "gateway": "api-gateway" }
      },
      {
        "type": "sent",
        "timestamp": "2024-01-01T00:00:30.000Z",
        "details": { "provider": "twilio" }
      },
      {
        "type": "delivered",
        "timestamp": "2024-01-01T00:01:00.000Z",
        "details": { "deliveryCode": "delivered" }
      }
    ]
  }
}
```

### Conversation Management

#### `GET /api/v1/conversations/{conversationId}/history`
Get the message history for a conversation.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Messages per page (default: 20, max: 100)
- `direction` (optional): Filter by direction (inbound, outbound)
- `channel` (optional): Filter by channel (sms, email, whatsapp)
- `startDate` (optional): Filter messages after this date
- `endDate` (optional): Filter messages before this date

**Response:**
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_12345",
      "channel": "sms",
      "participant": "+1234567890",
      "status": "active",
      "messageCount": 25
    },
    "messages": [
      {
        "id": "msg_123",
        "direction": "outbound",
        "content": {
          "text": "Hello!",
          "type": "text"
        },
        "status": "delivered",
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 25,
      "hasMore": true
    }
  }
}
```

### Webhook Endpoints

#### `POST /webhooks/{channel}/{tenantId}`
Receive webhooks from messaging providers.

**Parameters:**
- `channel` (path): Channel identifier
- `tenantId` (path): Tenant identifier

#### `GET /webhooks/{channel}/{tenantId}/verify`
Webhook verification endpoint for providers that require GET verification.

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "to",
      "issue": "Phone number is required"
    }
  },
  "meta": {
    "requestId": "req_12345",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Error Codes

- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid JWT token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error
- `503` - Service Unavailable (dependencies down)

## Rate Limiting

- Default: 100 requests per minute per tenant
- Bulk operations: Lower limits apply
- Rate limit headers included in responses:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
