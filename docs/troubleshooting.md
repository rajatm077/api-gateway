# Troubleshooting Guide

Common issues and solutions for the API Gateway.

## Common Issues

### 1. Service Won't Start

#### Symptoms
- Application exits immediately
- "Configuration validation error" messages
- Port binding errors

#### Solutions

**Check Configuration**
```bash
# Validate environment variables
node scripts/validate-query-service.js

# Check if required env vars are set
printenv | grep -E "(JWT_PUBLIC_KEY|REDIS_URL|KAFKA_BROKERS)"
```

**Port Issues**
```bash
# Check if port is already in use
lsof -i :3000
netstat -tulpn | grep 3000

# Use different port
PORT=3001 npm start
```

**Permission Issues**
```bash
# Check file permissions
ls -la logs/
mkdir -p logs
chmod 755 logs
```

### 2. Dependencies Connection Failed

#### Symptoms
- "Redis connection failed"
- "Kafka broker unavailable"
- Health checks failing

#### Solutions

**Redis Connection**
```bash
# Test Redis connectivity
redis-cli ping

# Check Redis URL format
echo $REDIS_URL
# Should be: redis://localhost:6379

# Test with different Redis instance
REDIS_URL=redis://127.0.0.1:6379 npm start
```

**Kafka Connection**
```bash
# Test Kafka broker connectivity
kafka-console-producer.sh --broker-list localhost:9092 --topic test

# Check Kafka brokers format
echo $KAFKA_BROKERS
# Should be: localhost:9092 or host1:9092,host2:9092

# Verify Kafka is running
docker ps | grep kafka
```

**Query Service Connection**
```bash
# Test Query Service endpoint
curl http://localhost:3200/health

# Check Query Service URL
echo $QUERY_SERVICE_URL
# Should be: http://localhost:3200

# Test with different timeout
QUERY_SERVICE_TIMEOUT=10000 npm start
```

### 3. Authentication Issues

#### Symptoms
- "Invalid JWT token" errors
- 401 Unauthorized responses
- JWT verification failures

#### Solutions

**JWT Configuration**
```bash
# Check JWT public key format
echo $JWT_PUBLIC_KEY | head -1
# Should start with: -----BEGIN PUBLIC KEY-----

# Verify JWT algorithm
echo $JWT_ALGORITHM
# Should be: RS256 (or your configured algorithm)

# Test with a valid JWT token
curl -H "Authorization: Bearer <valid-token>" \
     http://localhost:3000/api/v1/channels
```

**Token Issues**
- Ensure token is not expired
- Verify token was signed with matching private key
- Check token contains required claims (tenant, etc.)

### 4. Rate Limiting Issues

#### Symptoms
- 429 Too Many Requests errors
- Legitimate requests being blocked
- Rate limits too restrictive

#### Solutions

**Check Rate Limit Configuration**
```bash
# View current rate limits
echo $RATE_LIMIT_DEFAULT
echo $RATE_LIMIT_WINDOW_MS

# Temporarily increase limits
RATE_LIMIT_DEFAULT=1000 npm start
```

**Debug Rate Limiting**
```bash
# Check Redis for rate limit keys
redis-cli keys "api-gateway:rate:*"

# View rate limit data
redis-cli get "api-gateway:rate:tenant:abc123"
```

### 5. Performance Issues

#### Symptoms
- Slow response times
- High memory usage
- CPU spikes

#### Solutions

**Monitor Resources**
```bash
# Check memory usage
ps aux | grep node

# Monitor in real-time
top -p $(pgrep -f "node.*api-gateway")

# Check disk space
df -h
```

**Database Performance**
```bash
# Redis performance
redis-cli --latency

# Check Redis memory usage
redis-cli info memory
```

**Application Performance**
```bash
# Enable performance logging
LOG_LEVEL=debug npm start

# Monitor request times in logs
tail -f logs/app.log | grep "responseTime"
```

### 6. Docker Issues

#### Symptoms
- Container won't start
- Cannot connect to services
- Volume mount issues

#### Solutions

**Container Debugging**
```bash
# Check container logs
docker logs api-gateway

# Run interactive shell
docker run -it --entrypoint sh api-gateway

# Check environment variables
docker exec api-gateway env
```

**Networking Issues**
```bash
# Test service connectivity
docker exec api-gateway ping redis

# Check network configuration
docker network ls
docker network inspect bridge
```

**Volume Issues**
```bash
# Check volume mounts
docker inspect api-gateway | grep -A 10 "Mounts"

# Fix permission issues
sudo chown -R $(id -u):$(id -g) ./logs
```

## Error Codes Reference

### HTTP Status Codes

- **400 Bad Request**: Invalid request format or parameters
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource doesn't exist
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Application error
- **503 Service Unavailable**: Dependencies unavailable

### Application Error Codes

- `VALIDATION_ERROR`: Request validation failed
- `AUTH_ERROR`: Authentication/authorization failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `DEPENDENCY_ERROR`: External service unavailable
- `KAFKA_ERROR`: Kafka connection/publish failed
- `REDIS_ERROR`: Redis connection failed
- `QUERY_SERVICE_ERROR`: Query Service unavailable

## Logging and Debugging

### Enable Debug Logging

```bash
# Debug all modules
DEBUG=* npm start

# Debug specific modules
DEBUG=api-gateway:* npm start

# Application debug logging
LOG_LEVEL=debug npm start
```

### Log Locations

- **Application logs**: `./logs/app.log`
- **Error logs**: `./logs/error.log`
- **Access logs**: `./logs/access.log`

### Log Analysis

```bash
# Search for errors
grep -i error logs/app.log

# Find specific request
grep "correlationId.*abc123" logs/app.log

# Monitor logs in real-time
tail -f logs/app.log | grep ERROR
```

## Health Check Debugging

### Manual Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Readiness check (dependencies)
curl http://localhost:3000/health/readiness

# Deep health check
curl http://localhost:3000/health/deep
```

### Interpreting Health Responses

**Healthy Response**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Unhealthy Response**
```json
{
  "status": "unhealthy",
  "checks": {
    "redis": false,
    "kafka": true,
    "queryService": false
  }
}
```

## Performance Tuning

### Node.js Optimization

```bash
# Increase memory limit
node --max-old-space-size=4096 dist/index.js

# Enable garbage collection logging
node --trace-gc dist/index.js
```

### Database Optimization

**Redis Optimization**
```bash
# Check Redis configuration
redis-cli config get "*"

# Monitor Redis performance
redis-cli monitor
```

### Application Optimization

- **Connection Pooling**: Reuse connections
- **Response Caching**: Cache frequent queries
- **Request Batching**: Batch database operations
- **Async Processing**: Use non-blocking operations

## Getting Help

### Debug Information Collection

When reporting issues, include:

1. **Environment Information**
   ```bash
   node --version
   npm --version
   docker --version
   ```

2. **Configuration**
   ```bash
   # Sanitized environment (remove secrets)
   printenv | grep -v -E "(KEY|SECRET|PASSWORD)"
   ```

3. **Logs**
   ```bash
   # Recent application logs
   tail -n 100 logs/app.log
   
   # Error logs
   grep -i error logs/app.log | tail -20
   ```

4. **Health Status**
   ```bash
   curl http://localhost:3000/health/deep
   ```

### Support Channels

- **Documentation**: Check this documentation first
- **Logs**: Enable debug logging for detailed information
- **Health Checks**: Use health endpoints to diagnose issues
- **Configuration**: Validate configuration with provided scripts

### Emergency Procedures

**Service Recovery**
1. Check health endpoints
2. Restart the service
3. Verify dependencies are healthy
4. Check recent configuration changes
5. Review application logs

**Rollback Procedure**
1. Stop current service
2. Deploy previous working version
3. Verify service health
4. Investigate issue with current version
