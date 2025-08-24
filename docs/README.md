# API Gateway Documentation

Welcome to the API Gateway documentation. This service acts as the entry point for all messaging operations in the system.

## Table of Contents

- [Getting Started](./getting-started.md)
- [API Reference](./api-reference.md)
- [Architecture](./architecture.md)
- [Configuration](./configuration.md)
- [Docker Setup](./docker.md)
- [Deployment](./deployment.md)
- [Monitoring](./monitoring.md)
- [Troubleshooting](./troubleshooting.md)

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Build and Start**
   ```bash
   npm run build
   npm start
   ```

4. **Verify Health**
   ```bash
   curl http://localhost:3000/health
   ```

## Features

- **Message Routing**: Routes messages through Kafka to appropriate services
- **Query Service Integration**: Retrieves conversation and message data via CQRS pattern
- **Authentication**: JWT-based authentication and webhook verification
- **Rate Limiting**: Configurable rate limiting per tenant/endpoint
- **Health Monitoring**: Comprehensive health checks and metrics
- **Multi-Channel Support**: SMS, Email, WhatsApp messaging

## Architecture Overview

The API Gateway implements a CQRS (Command Query Responsibility Segregation) pattern:

- **Write Operations**: Commands are sent through Kafka for processing
- **Read Operations**: Queries are handled by the dedicated Query Service

For detailed architecture information, see [Architecture Documentation](./architecture.md).

## Support

For issues and questions:
- Check the [Troubleshooting Guide](./troubleshooting.md)
- Review logs in `/logs` directory
- Monitor health endpoints for service status
