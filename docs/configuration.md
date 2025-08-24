# Configuration Guide

Complete configuration reference for the API Gateway.

## Environment Variables

### Required Configuration

#### Server Settings
- `NODE_ENV`: Application environment (`development`, `production`, `test`)
- `PORT`: Server port number (default: 3000)
- `SERVICE_NAME`: Service identifier (default: api-gateway)

#### JWT Authentication
- `JWT_PUBLIC_KEY`: RSA public key for JWT verification (required)
- `JWT_ALGORITHM`: JWT signing algorithm (default: RS256)
- `JWT_ISSUER`: JWT issuer identifier (optional)

#### Redis Configuration
- `REDIS_URL`: Redis connection URL (required)
- `REDIS_DB`: Redis database number (default: 0)
- `REDIS_KEY_PREFIX`: Key prefix for Redis keys (default: api-gateway:)

#### Kafka Configuration
- `KAFKA_BROKERS`: Comma-separated list of Kafka brokers (required)
- `KAFKA_CLIENT_ID`: Kafka client identifier (default: api-gateway)
- `KAFKA_SSL`: Enable SSL for Kafka (default: false)

#### Query Service Configuration
- `QUERY_SERVICE_URL`: Query Service base URL (required)
- `QUERY_SERVICE_TIMEOUT`: Request timeout in milliseconds (default: 5000)
- `QUERY_SERVICE_RETRIES`: Number of retry attempts (default: 3)

### Optional Configuration

#### Kafka SASL (for authenticated connections)
- `KAFKA_SASL_MECHANISM`: SASL mechanism (plain, scram-sha-256, scram-sha-512)
- `KAFKA_SASL_USERNAME`: SASL username
- `KAFKA_SASL_PASSWORD`: SASL password

#### Rate Limiting
- `RATE_LIMIT_DEFAULT`: Default requests per minute (default: 100)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds (default: 60000)
- `RATE_LIMIT_MAX_BURST`: Maximum burst capacity (default: 200)

#### Service Registry (Consul)
- `SERVICE_REGISTRY_URL`: Service registry URL
- `SERVICE_REGISTRY_HEARTBEAT_INTERVAL`: Heartbeat interval in milliseconds

#### Webhook Verification
- `TWILIO_WEBHOOK_SECRET`: Twilio webhook verification secret
- `SENDGRID_WEBHOOK_SECRET`: SendGrid webhook verification secret
- `WHATSAPP_WEBHOOK_SECRET`: WhatsApp webhook verification secret

#### Logging & Monitoring
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `LOG_FORMAT`: Log format (json, text)
- `METRICS_PORT`: Prometheus metrics port
- `HEALTH_CHECK_INTERVAL`: Health check interval in milliseconds

## Configuration Examples

### Development Environment (.env)

```properties
# Development Configuration
NODE_ENV=development
PORT=3000
SERVICE_NAME=api-gateway

# JWT (use test keys in development)
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_ALGORITHM=RS256

# Local services
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
QUERY_SERVICE_URL=http://localhost:3200

# Development rate limits
RATE_LIMIT_DEFAULT=1000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_BURST=2000

# Debug logging
LOG_LEVEL=debug
LOG_FORMAT=text
```

### Production Environment

```properties
# Production Configuration
NODE_ENV=production
PORT=3000
SERVICE_NAME=api-gateway

# JWT (use actual production keys)
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_ALGORITHM=RS256
JWT_ISSUER=your-production-issuer

# Production services
REDIS_URL=redis://prod-redis:6379
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
KAFKA_SSL=true
KAFKA_SASL_MECHANISM=scram-sha-256
KAFKA_SASL_USERNAME=api-gateway-prod
KAFKA_SASL_PASSWORD=secure-password

QUERY_SERVICE_URL=https://query-service.internal
QUERY_SERVICE_TIMEOUT=10000
QUERY_SERVICE_RETRIES=3

# Production rate limits
RATE_LIMIT_DEFAULT=100
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_BURST=200

# Production logging
LOG_LEVEL=warn
LOG_FORMAT=json

# Webhook secrets
TWILIO_WEBHOOK_SECRET=your-twilio-secret
SENDGRID_WEBHOOK_SECRET=your-sendgrid-secret
WHATSAPP_WEBHOOK_SECRET=your-whatsapp-secret
```

### Docker Environment

```properties
# Docker-specific configuration
NODE_ENV=production
PORT=3000

# Docker service names
REDIS_URL=redis://redis:6379
KAFKA_BROKERS=kafka:9092
QUERY_SERVICE_URL=http://query-service:3200

# Container-optimized settings
QUERY_SERVICE_TIMEOUT=15000
RATE_LIMIT_WINDOW_MS=60000
```

## Configuration Validation

The application validates all configuration on startup:

### Validation Rules

1. **Required Fields**: Must be provided
2. **Format Validation**: URLs, ports, numbers validated
3. **Dependency Checks**: Related configurations checked together
4. **Security Validation**: Secrets and keys validated for format

### Validation Errors

If configuration is invalid, the application will:
1. Log detailed error messages
2. Exit with status code 1
3. Provide guidance on fixing the configuration

Example error:
```
Configuration validation error: "JWT_PUBLIC_KEY" is required
```

## Runtime Configuration

### Dynamic Configuration Sources

1. **Environment Variables**: Primary configuration source
2. **Configuration Files**: Secondary source for complex configurations
3. **Service Registry**: Dynamic service URLs and endpoints
4. **Feature Flags**: Runtime behavior modifications

### Configuration Precedence

1. Environment variables (highest priority)
2. Configuration files
3. Default values (lowest priority)

## Security Considerations

### Sensitive Configuration

**Never commit these to version control:**
- JWT private/public keys
- Database passwords
- API secrets and tokens
- Webhook verification secrets

### Best Practices

1. **Use environment variables** for all configuration
2. **Separate configurations** by environment
3. **Use secrets management** for production
4. **Validate configuration** on startup
5. **Document all settings** with examples

### Secrets Management

For production deployments:

1. **Kubernetes Secrets**: Store sensitive values
2. **HashiCorp Vault**: Dynamic secret generation
3. **AWS Secrets Manager**: Cloud-native secret storage
4. **Azure Key Vault**: Azure secret management

Example Kubernetes secret:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: api-gateway-config
type: Opaque
stringData:
  JWT_PUBLIC_KEY: |
    -----BEGIN PUBLIC KEY-----
    ...
    -----END PUBLIC KEY-----
  KAFKA_SASL_PASSWORD: "secure-password"
```

## Configuration Testing

### Validation Script

Use the provided validation script:
```bash
node scripts/validate-config.js
```

### Configuration Tests

Test different configurations:
```bash
# Test development config
NODE_ENV=development node scripts/validate-config.js

# Test production config
NODE_ENV=production node scripts/validate-config.js
```

## Troubleshooting Configuration

### Common Issues

1. **Missing Required Variables**
   - Check .env file exists
   - Verify all required variables are set

2. **Invalid JWT Key Format**
   - Ensure proper PEM format with newlines
   - Verify key starts/ends with correct markers

3. **Connection Failures**
   - Check service URLs are reachable
   - Verify network connectivity
   - Check firewall rules

4. **Rate Limiting Issues**
   - Verify numeric values for rate limits
   - Check window duration settings

### Debug Configuration

Enable debug logging:
```bash
DEBUG=config:* npm start
```

This will show detailed configuration loading and validation steps.
