# Getting Started

This guide will help you set up and run the API Gateway locally.

## Prerequisites

- Node.js 18+ 
- Redis server
- Apache Kafka
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd api-gateway
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```properties
   # Required configurations
   JWT_PUBLIC_KEY="your-jwt-public-key"
   REDIS_URL=redis://localhost:6379
   KAFKA_BROKERS=localhost:9092
   QUERY_SERVICE_URL=http://localhost:3200
   ```

## Development Setup

### Option 1: Local Development

1. **Start required services**
   ```bash
   # Start Redis
   redis-server
   
   # Start Kafka (requires Zookeeper)
   # Follow Kafka quickstart guide
   ```

2. **Build and start the API Gateway**
   ```bash
   npm run build
   npm run dev  # or npm start for production mode
   ```

### Option 2: Docker Development

1. **Build and run with Docker**
   ```bash
   docker build -t api-gateway .
   docker run -p 3000:3000 --env-file .env api-gateway
   ```

## Verification

1. **Check health endpoint**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Test a simple endpoint**
   ```bash
   curl http://localhost:3000/api/v1/channels
   ```

## Next Steps

- Review [API Reference](./api-reference.md) for available endpoints
- Check [Configuration Guide](./configuration.md) for detailed settings
- See [Architecture Documentation](./architecture.md) to understand the system design
