# Docker Setup Guide

Complete guide for running the API Gateway in Docker containers.

## Docker Build

### Basic Build

```bash
# Build the Docker image
docker build -t api-gateway .

# Run the container
docker run -p 3000:3000 --env-file .env api-gateway
```

### Build Arguments

The Dockerfile supports build-time customization:

```bash
# Build with specific Node.js version
docker build --build-arg NODE_VERSION=18-alpine -t api-gateway .
```

## Docker Compose

### Development Setup

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  api-gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
      - QUERY_SERVICE_URL=http://query-service:3200
    depends_on:
      - redis
      - kafka
    volumes:
      - ./logs:/app/logs

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

volumes:
  redis_data:
```

### Start Services

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api-gateway

# Stop services
docker-compose down
```

## Container Configuration

### Environment Variables in Docker

#### Option 1: Environment File

Create `.env.docker`:
```properties
NODE_ENV=production
PORT=3000
REDIS_URL=redis://redis:6379
KAFKA_BROKERS=kafka:9092
QUERY_SERVICE_URL=http://query-service:3200
```

Run with env file:
```bash
docker run --env-file .env.docker -p 3000:3000 api-gateway
```

#### Option 2: Docker Compose Environment

```yaml
services:
  api-gateway:
    build: .
    environment:
      - NODE_ENV=production
      - PORT=3000
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
```

#### Option 3: Runtime Environment Variables

```bash
docker run \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e REDIS_URL=redis://localhost:6379 \
  -p 3000:3000 \
  api-gateway
```

## Production Docker Setup

### Multi-stage Dockerfile

For production, create an optimized multi-stage build:

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production
RUN addgroup -g 1001 -S nodejs && adduser -S apigateway -u 1001
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder --chown=apigateway:nodejs /app/dist ./dist
USER apigateway
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Production Docker Compose

```yaml
version: '3.8'

services:
  api-gateway:
    build:
      context: .
      target: production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Container Health Checks

### Built-in Health Check

The Dockerfile includes a health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

### Docker Compose Health Check

```yaml
services:
  api-gateway:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

### Kubernetes Health Checks

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: api-gateway
    image: api-gateway:latest
    livenessProbe:
      httpGet:
        path: /health
        port: 3000
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /health/readiness
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 5
```

## Networking

### Container Networking

#### Bridge Network (Default)

```bash
# Create custom bridge network
docker network create api-gateway-network

# Run containers on the network
docker run --network api-gateway-network api-gateway
```

#### Docker Compose Networking

Containers automatically join the same network:

```yaml
services:
  api-gateway:
    # Can reach redis:6379 and kafka:9092
    depends_on:
      - redis
      - kafka
  
  redis:
    # Accessible as 'redis' hostname
  
  kafka:
    # Accessible as 'kafka' hostname
```

### Port Mapping

```bash
# Map container port 3000 to host port 8080
docker run -p 8080:3000 api-gateway

# Map to random host port
docker run -P api-gateway
```

## Volume Management

### Log Persistence

```yaml
services:
  api-gateway:
    volumes:
      - ./logs:/app/logs        # Bind mount
      - api_logs:/app/logs      # Named volume

volumes:
  api_logs:
```

### Configuration Files

```yaml
services:
  api-gateway:
    volumes:
      - ./config:/app/config:ro  # Read-only config
```

## Container Monitoring

### Resource Monitoring

```bash
# Monitor container resources
docker stats api-gateway

# View container logs
docker logs -f api-gateway

# Execute commands in container
docker exec -it api-gateway sh
```

### Log Management

#### Centralized Logging

```yaml
services:
  api-gateway:
    logging:
      driver: "fluentd"
      options:
        fluentd-address: localhost:24224
        tag: api-gateway
```

#### Log Rotation

```yaml
services:
  api-gateway:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Security

### Container Security

1. **Run as non-root user**
2. **Use minimal base images** (Alpine)
3. **Scan for vulnerabilities**
4. **Keep images updated**

### Secrets Management

#### Docker Secrets

```yaml
services:
  api-gateway:
    secrets:
      - jwt_public_key
      - kafka_password

secrets:
  jwt_public_key:
    file: ./secrets/jwt_public_key.pem
  kafka_password:
    external: true
```

#### Environment Variables

Never include secrets in the Dockerfile. Use:
- Environment variables at runtime
- Docker secrets
- External secret management systems

## Troubleshooting

### Common Issues

1. **Container won't start**
   ```bash
   # Check logs
   docker logs api-gateway
   
   # Check if port is available
   netstat -tulpn | grep 3000
   ```

2. **Cannot connect to dependencies**
   ```bash
   # Check network connectivity
   docker exec api-gateway ping redis
   
   # Verify service names in docker-compose
   docker-compose ps
   ```

3. **Permission issues**
   ```bash
   # Check file permissions
   ls -la logs/
   
   # Fix ownership
   sudo chown -R $(id -u):$(id -g) logs/
   ```

4. **Resource constraints**
   ```bash
   # Check container resources
   docker stats
   
   # Increase memory limits
   docker run -m 512m api-gateway
   ```

### Debug Mode

Run container in debug mode:

```bash
# Interactive mode
docker run -it --entrypoint sh api-gateway

# Debug environment variables
docker run --env-file .env api-gateway env
```

## Best Practices

1. **Use multi-stage builds** for smaller production images
2. **Run as non-root user** for security
3. **Use health checks** for container orchestration
4. **Implement graceful shutdown** handling
5. **Use named volumes** for persistent data
6. **Configure resource limits** to prevent resource exhaustion
7. **Use secrets management** for sensitive configuration
8. **Monitor container metrics** and logs
