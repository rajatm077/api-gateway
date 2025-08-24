# Architecture Overview

The API Gateway implements a microservices architecture with CQRS (Command Query Responsibility Segregation) pattern.

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Webhooks      │    │   Monitoring    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │      API Gateway          │
                    │  ┌─────────────────────┐  │
                    │  │   Auth Middleware   │  │
                    │  │  Rate Limiting      │  │
                    │  │  Request Routing    │  │
                    │  └─────────────────────┘  │
                    └─────┬─────────────┬───────┘
                          │             │
                ┌─────────┴───────┐    ┌┴──────────────┐
                │  Write Path     │    │  Read Path    │
                │   (Commands)    │    │  (Queries)    │
                └─────────┬───────┘    └┬──────────────┘
                          │             │
                    ┌─────┴──────┐     ┌┴─────────────┐
                    │   Kafka    │     │ Query Service│
                    │  Message   │     │   (CQRS)     │
                    │   Queue    │     └──────────────┘
                    └────────────┘
```

## Core Components

### 1. API Gateway (This Service)

**Responsibilities:**
- Request authentication and authorization
- Rate limiting and throttling
- Request routing and load balancing
- Response aggregation and formatting
- Error handling and logging
- Health monitoring

**Key Features:**
- **Multi-channel support**: SMS, Email, WhatsApp
- **CQRS implementation**: Separate read/write paths
- **Microservice communication**: Kafka for commands, HTTP for queries
- **Observability**: Comprehensive logging and metrics

### 2. Write Path (Command Side)

**Flow:**
1. Client sends command (POST/PUT/DELETE)
2. API Gateway validates and authenticates request
3. Command is published to Kafka topic
4. Downstream services consume and process commands
5. Response sent back to client

**Commands:**
- Send message
- Send bulk messages
- Update channel configuration
- Create/update conversation

### 3. Read Path (Query Side)

**Flow:**
1. Client sends query (GET request)
2. API Gateway validates and authenticates request
3. Query is forwarded to Query Service
4. Query Service returns data from read database
5. Response sent back to client

**Queries:**
- Get message status/events
- Get conversation history
- List channels and capabilities
- Get channel status

## Service Dependencies

### External Dependencies

1. **Redis**
   - Purpose: Caching, rate limiting, session storage
   - Criticality: High
   - Fallback: In-memory cache (limited functionality)

2. **Apache Kafka**
   - Purpose: Message queue for commands and events
   - Criticality: High
   - Fallback: None (write operations fail)

3. **Query Service**
   - Purpose: Read operations for conversations and messages
   - Criticality: High
   - Fallback: Cached responses (limited freshness)

### Optional Dependencies

1. **Service Registry (Consul)**
   - Purpose: Service discovery
   - Criticality: Low
   - Fallback: Static configuration

## Data Flow

### Message Sending Flow

```
Client Request
      ↓
[Auth Middleware]
      ↓
[Rate Limiting]
      ↓
[Validation]
      ↓
[Message Controller]
      ↓
[Kafka Producer] → Topic: message-commands
      ↓
Response to Client
```

### Message Query Flow

```
Client Request
      ↓
[Auth Middleware]
      ↓
[Rate Limiting]
      ↓
[Message Controller]
      ↓
[Query Service Client] → HTTP GET
      ↓
[Query Service] → Read Database
      ↓
Response to Client
```

## Security Architecture

### Authentication & Authorization

1. **JWT Token Validation**
   - RSA256 signature verification
   - Token expiration checking
   - Tenant extraction and validation

2. **Webhook Verification**
   - Provider-specific signature verification
   - Timestamp validation to prevent replay attacks

3. **Rate Limiting**
   - Per-tenant rate limits
   - Per-endpoint specific limits
   - Burst capacity management

### Security Layers

```
Internet
    ↓
[Load Balancer / CDN]
    ↓
[API Gateway]
├── JWT Validation
├── Rate Limiting  
├── Input Validation
└── HTTPS Enforcement
    ↓
Internal Services
```

## Error Handling Strategy

### Error Categories

1. **Client Errors (4xx)**
   - Validation errors
   - Authentication failures
   - Rate limit exceeded
   - Resource not found

2. **Server Errors (5xx)**
   - Database connection failures
   - Kafka unavailability
   - Query Service downtime
   - Internal processing errors

### Error Propagation

```
Error Occurs
    ↓
[Error Handler Middleware]
├── Log Error Details
├── Classify Error Type
├── Generate Error Response
└── Add Correlation ID
    ↓
Structured Error Response
```

## Scalability Considerations

### Horizontal Scaling

- **Stateless Design**: No server-side session state
- **Load Balancing**: Multiple API Gateway instances
- **Database Scaling**: Read replicas for Query Service

### Performance Optimizations

- **Connection Pooling**: Redis and HTTP connections
- **Response Caching**: Cacheable query responses
- **Async Processing**: Non-blocking I/O operations
- **Circuit Breakers**: Prevent cascade failures

## Monitoring & Observability

### Health Checks

1. **Liveness Probe**: Basic application health
2. **Readiness Probe**: Dependency health checks
3. **Deep Health Check**: Comprehensive diagnostic information

### Metrics

- Request rates and response times
- Error rates by endpoint and status code
- Dependency health and response times
- Resource utilization (CPU, memory)

### Logging

- Structured JSON logging
- Correlation IDs for request tracing
- Error details with stack traces
- Performance metrics

## Configuration Management

### Environment-based Configuration

- Development: Local services, debug logging
- Staging: Production-like environment, detailed logging
- Production: External services, minimal logging

### Runtime Configuration

- Feature flags for gradual rollouts
- Dynamic rate limit adjustments
- Circuit breaker thresholds
