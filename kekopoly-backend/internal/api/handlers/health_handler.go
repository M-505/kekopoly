package handlers

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/readpref"
	"go.uber.org/zap"
)

// HealthHandler handles health check requests
type HealthHandler struct {
	mongoClient *mongo.Client
	redisClient *redis.Client
	logger      *zap.SugaredLogger
}

// HealthStatus represents the health status of a component
type HealthStatus struct {
	Status       string `json:"status"`
	ResponseTime int64  `json:"responseTimeMs"`
	Error        string `json:"error,omitempty"`
}

// SystemHealth represents the health of the entire system
type SystemHealth struct {
	Status      string                  `json:"status"`
	Timestamp   string                  `json:"timestamp"`
	Version     string                  `json:"version"`
	Environment string                  `json:"environment"`
	Components  map[string]HealthStatus `json:"components"`
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(mongoClient *mongo.Client, redisClient *redis.Client, logger *zap.SugaredLogger) *HealthHandler {
	return &HealthHandler{
		mongoClient: mongoClient,
		redisClient: redisClient,
		logger:      logger,
	}
}

// Check performs a health check of all system components
func (h *HealthHandler) Check(c echo.Context) error {
	systemHealth := SystemHealth{
		Status:      "healthy",
		Timestamp:   time.Now().Format(time.RFC3339),
		Version:     "1.0.0",      // This should come from a version constant
		Environment: "production", // This should come from configuration
		Components:  make(map[string]HealthStatus),
	}

	// Use WaitGroup to check components in parallel
	var wg sync.WaitGroup

	// Add mutual exclusion for concurrent map writes
	var mu sync.Mutex

	// Check MongoDB
	wg.Add(1)
	go func() {
		defer wg.Done()
		status := h.checkMongoDB()
		mu.Lock()
		systemHealth.Components["mongodb"] = status
		if status.Status != "healthy" {
			systemHealth.Status = "degraded"
		}
		mu.Unlock()
	}()

	// Check Redis
	wg.Add(1)
	go func() {
		defer wg.Done()
		status := h.checkRedis()
		mu.Lock()
		systemHealth.Components["redis"] = status
		if status.Status != "healthy" {
			systemHealth.Status = "degraded"
		}
		mu.Unlock()
	}()

	// Check API server
	wg.Add(1)
	go func() {
		defer wg.Done()
		status := h.checkAPIServer()
		mu.Lock()
		systemHealth.Components["api"] = status
		mu.Unlock()
	}()

	// Wait for all checks to complete
	wg.Wait()

	// Set appropriate HTTP status code based on system health
	statusCode := http.StatusOK
	if systemHealth.Status != "healthy" {
		statusCode = http.StatusServiceUnavailable
	}

	return c.JSON(statusCode, systemHealth)
}

// checkMongoDB checks the health of the MongoDB connection
func (h *HealthHandler) checkMongoDB() HealthStatus {
	start := time.Now()

	// Create a context with timeout for the ping
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err := h.mongoClient.Ping(ctx, readpref.Primary())

	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		h.logger.Errorw("MongoDB health check failed", "error", err)
		return HealthStatus{
			Status:       "unhealthy",
			ResponseTime: elapsed,
			Error:        err.Error(),
		}
	}

	return HealthStatus{
		Status:       "healthy",
		ResponseTime: elapsed,
	}
}

// checkRedis checks the health of the Redis connection
func (h *HealthHandler) checkRedis() HealthStatus {
	start := time.Now()

	// Create a context with timeout for the ping
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := h.redisClient.Ping(ctx).Result()

	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		h.logger.Errorw("Redis health check failed", "error", err)
		return HealthStatus{
			Status:       "unhealthy",
			ResponseTime: elapsed,
			Error:        err.Error(),
		}
	}

	return HealthStatus{
		Status:       "healthy",
		ResponseTime: elapsed,
	}
}

// checkAPIServer checks the health of the API server itself
func (h *HealthHandler) checkAPIServer() HealthStatus {
	start := time.Now()

	// For the API server itself, we just check if it's responding
	// In a more complex implementation, we might check CPU, memory, etc.

	elapsed := time.Since(start).Milliseconds()

	return HealthStatus{
		Status:       "healthy",
		ResponseTime: elapsed,
	}
}

// DetailedCheck performs a more detailed health check with component-specific metrics
func (h *HealthHandler) DetailedCheck(c echo.Context) error {
	// Basic health check
	systemHealth := SystemHealth{
		Status:      "healthy",
		Timestamp:   time.Now().Format(time.RFC3339),
		Version:     "1.0.0",
		Environment: "production",
		Components:  make(map[string]HealthStatus),
	}

	// MongoDB detailed check
	mongoStatus := h.checkMongoDBDetailed()
	systemHealth.Components["mongodb"] = mongoStatus
	if mongoStatus.Status != "healthy" {
		systemHealth.Status = "degraded"
	}

	// Redis detailed check
	redisStatus := h.checkRedisDetailed()
	systemHealth.Components["redis"] = redisStatus
	if redisStatus.Status != "healthy" {
		systemHealth.Status = "degraded"
	}

	// API server detailed check
	systemHealth.Components["api"] = h.checkAPIServerDetailed()

	// Set appropriate HTTP status code
	statusCode := http.StatusOK
	if systemHealth.Status != "healthy" {
		statusCode = http.StatusServiceUnavailable
	}

	return c.JSON(statusCode, systemHealth)
}

// checkMongoDBDetailed performs a detailed MongoDB health check
func (h *HealthHandler) checkMongoDBDetailed() HealthStatus {
	start := time.Now()

	// Create a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Basic ping
	err := h.mongoClient.Ping(ctx, readpref.Primary())

	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		h.logger.Errorw("MongoDB detailed health check failed", "error", err)
		return HealthStatus{
			Status:       "unhealthy",
			ResponseTime: elapsed,
			Error:        err.Error(),
		}
	}

	// In a more comprehensive implementation, we might check:
	// - Connection pool statistics
	// - Replication lag
	// - Write concern status
	// - Read preference

	return HealthStatus{
		Status:       "healthy",
		ResponseTime: elapsed,
	}
}

// checkRedisDetailed performs a detailed Redis health check
func (h *HealthHandler) checkRedisDetailed() HealthStatus {
	start := time.Now()

	// Create a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Basic ping
	_, err := h.redisClient.Ping(ctx).Result()

	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		h.logger.Errorw("Redis detailed health check failed", "error", err)
		return HealthStatus{
			Status:       "unhealthy",
			ResponseTime: elapsed,
			Error:        err.Error(),
		}
	}

	// In a more comprehensive implementation, we might check:
	// - Memory usage
	// - Client connection count
	// - Command statistics
	// - Replication status

	return HealthStatus{
		Status:       "healthy",
		ResponseTime: elapsed,
	}
}

// checkAPIServerDetailed performs a detailed API server health check
func (h *HealthHandler) checkAPIServerDetailed() HealthStatus {
	start := time.Now()

	// For the API server itself, we check system metrics
	// In a real implementation, we would gather actual metrics

	elapsed := time.Since(start).Milliseconds()

	return HealthStatus{
		Status:       "healthy",
		ResponseTime: elapsed,
	}
}
