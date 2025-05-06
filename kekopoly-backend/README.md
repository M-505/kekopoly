# Kekopoly Backend

A production-ready backend for the Kekopoly game, implementing core game mechanics, resilience patterns, and monitoring capabilities.

## Features

### Complete Game Logic
- Dice rolling mechanism with proper randomization
- Property purchasing system with balance checks
- Rent payment system with market condition modifiers
- Turn management with proper state transitions

### Resilience Mechanisms
- **Circuit Breaker Pattern**: Prevents cascading failures in database operations
- **Retry with Backoff**: Exponential backoff with jitter for database connections
- **Connection Pooling**: Optimized database connection management
- **Graceful Error Handling**: Structured error responses and recovery

### Health Monitoring
- `/health`: Basic health check endpoint for load balancers
- `/health/detailed`: Comprehensive component-level health checks
- MongoDB and Redis status verification
- Response time measurements for all components

### Metrics and Monitoring
- Structured logging with correlation IDs for request tracing
- Request metrics collection (counts, durations, error rates)
- Game action tracking
- Connection statistics

## System Requirements

- Go 1.20 or higher
- MongoDB 5.0+
- Redis 6.0+
- Docker (for containerized deployment)

## Configuration

Configuration is managed through `config/config.yaml`. Key parameters include:

```yaml
server:
  host: "0.0.0.0"
  port: 8080

mongodb:
  uri: "mongodb://localhost:27017"
  
redis:
  uri: "localhost:6379"

jwt:
  secret: "your-secret-key"
  expiryHours: 24
```

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```
   go mod download
   ```
3. Run the server:
   ```
   go run main.go
   ```

## Docker Deployment

Build and run using Docker:

```bash
# Build the image
docker build -t kekopoly-backend:latest .

# Run the container
docker run -p 8080:8080 \
  -e MONGODB_URI="mongodb://mongo:27017" \
  -e REDIS_URI="redis:6379" \
  kekopoly-backend:latest
```

## Production Deployment Recommendations

1. **Database Security**:
   - Use authentication for MongoDB and Redis
   - Set up proper network security groups and firewalls
   - Encrypt all data in transit using TLS

2. **Scaling**:
   - The application can be horizontally scaled behind a load balancer
   - Use Redis for distributed session management
   - Consider using MongoDB replicas for high availability

3. **Monitoring**:
   - Configure a monitoring solution to collect and visualize metrics
   - Set up alerts for service degradation or failures
   - Use distributed tracing for request flows across services

4. **High Availability**:
   - Deploy multiple instances across availability zones
   - Implement proper health checks for auto-healing
   - Use a service mesh for advanced traffic management

## API Documentation

The API provides RESTful endpoints for:

- User authentication and management
- Game creation, joining and state management
- Game actions (dice rolling, property purchases, etc.)
- WebSocket connections for real-time updates

### Health Check Endpoints

- `GET /health`: Quick health status suitable for load balancer checks
- `GET /health/detailed`: Comprehensive health check of all components

### Metrics Endpoint

- `GET /metrics`: Returns key operational metrics for monitoring

## Circuit Breaker Configuration

The circuit breakers for database connections are configured with:

- Failure threshold: 5 consecutive failures
- Reset timeout: 10 seconds
- Half-open state: Allows a single test request before fully reopening

## Troubleshooting

Common issues and solutions:

1. **Database Connection Failures**:
   - Verify network connectivity
   - Check authentication credentials
   - Ensure proper firewall rules

2. **Performance Issues**:
   - Monitor connection pool utilization
   - Check for slow database queries
   - Review logging levels in production

3. **High Memory Usage**:
   - Adjust connection pool sizes
   - Check for resource leaks in long-running connections
   - Monitor goroutine counts