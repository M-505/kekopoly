package redis

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
)

// CircuitBreaker implements the circuit breaker pattern for Redis
type CircuitBreaker struct {
	mu               sync.RWMutex
	failureThreshold uint
	failureCount     uint
	resetTimeout     time.Duration
	lastFailureTime  time.Time
	state            CircuitState
}

// CircuitState represents the state of the circuit breaker
type CircuitState int

const (
	// CircuitClosed means the circuit is closed and operations are allowed to proceed
	CircuitClosed CircuitState = iota
	// CircuitOpen means the circuit is open and operations will fail fast
	CircuitOpen
	// CircuitHalfOpen means the circuit is allowing a single operation to proceed as a test
	CircuitHalfOpen
)

// NewCircuitBreaker creates a new circuit breaker
func NewCircuitBreaker(failureThreshold uint, resetTimeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		failureThreshold: failureThreshold,
		resetTimeout:     resetTimeout,
		state:            CircuitClosed,
	}
}

// AllowRequest checks if a request should be allowed based on the circuit state
func (cb *CircuitBreaker) AllowRequest() bool {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	if cb.state == CircuitClosed {
		return true
	}

	if cb.state == CircuitOpen {
		if time.Since(cb.lastFailureTime) > cb.resetTimeout {
			// We've waited long enough, transition to half-open
			cb.mu.RUnlock()
			cb.mu.Lock()
			cb.state = CircuitHalfOpen
			cb.mu.Unlock()
			cb.mu.RLock()
			return true
		}
		return false
	}

	// Circuit is half-open, allow exactly one request
	return true
}

// RecordSuccess records a successful operation
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	// Reset everything back to normal
	cb.failureCount = 0
	cb.state = CircuitClosed
}

// RecordFailure records a failed operation
func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if cb.state == CircuitHalfOpen {
		// If we fail during a test request, open the circuit again
		cb.state = CircuitOpen
		cb.lastFailureTime = time.Now()
		return
	}

	// Otherwise, increment failure count
	cb.failureCount++
	cb.lastFailureTime = time.Now()

	if cb.failureCount >= cb.failureThreshold {
		cb.state = CircuitOpen
	}
}

// CircuitBreakerClient wraps a Redis client with circuit breaker functionality
type CircuitBreakerClient struct {
	client  *redis.Client
	breaker *CircuitBreaker
	logger  *zap.SugaredLogger
}

// NewCircuitBreakerClient creates a new circuit breaker client
func NewCircuitBreakerClient(client *redis.Client, breaker *CircuitBreaker, logger *zap.SugaredLogger) *CircuitBreakerClient {
	return &CircuitBreakerClient{
		client:  client,
		breaker: breaker,
		logger:  logger,
	}
}

// Connect establishes a connection to Redis with retry capabilities
func Connect(ctx context.Context, addr string, logger ...*zap.SugaredLogger) (*redis.Client, error) {
	// Use default logger if none provided
	var log *zap.SugaredLogger
	if len(logger) > 0 && logger[0] != nil {
		log = logger[0]
	} else {
		// Create a simple console logger if none provided
		consoleLogger, _ := zap.NewProduction()
		log = consoleLogger.Sugar()
		defer consoleLogger.Sync()
	}

	// Create Redis client with sensible defaults
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     "", // can be configured later from config
		DB:           0,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 5,
		MaxRetries:   3, // Redis client has built-in retries for operations
	})

	// Retry configuration
	maxRetries := 5
	initialBackoff := 500 * time.Millisecond
	maxBackoff := 10 * time.Second

	// Exponential backoff with jitter for retries
	var err error
	for attempt := 0; attempt < maxRetries; attempt++ {
		// Create a context with timeout for the ping
		pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)

		// Ping Redis to check connection
		err = client.Ping(pingCtx).Err()
		cancel()

		if err == nil {
			// Connection successful
			log.Infow("Successfully connected to Redis", "attempt", attempt+1)
			return client, nil
		}

		// Calculate backoff with jitter
		backoff := float64(initialBackoff) * math.Pow(2, float64(attempt))
		if backoff > float64(maxBackoff) {
			backoff = float64(maxBackoff)
		}
		// Add jitter (±20%)
		jitter := 0.8 + 0.4*float64(time.Now().UnixNano()%1000)/1000.0
		backoffWithJitter := time.Duration(backoff * jitter)

		log.Warnw("Failed to connect to Redis, retrying",
			"attempt", attempt+1,
			"maxRetries", maxRetries,
			"backoff", backoffWithJitter,
			"error", err)

		// Wait before retrying
		select {
		case <-time.After(backoffWithJitter):
			// Continue to next attempt
		case <-ctx.Done():
			// Context cancelled
			_ = client.Close()
			return nil, fmt.Errorf("context cancelled while connecting to Redis: %w", ctx.Err())
		}
	}

	// All retries failed
	_ = client.Close()
	return nil, fmt.Errorf("failed to connect to Redis after %d attempts: %w", maxRetries, err)
}

// CreateClient creates a Redis client with circuit breaker protection
func CreateClient(ctx context.Context, addr string, logger *zap.SugaredLogger) (*CircuitBreakerClient, error) {
	client, err := Connect(ctx, addr, logger)
	if err != nil {
		return nil, err
	}

	// Create circuit breaker with 5 failures threshold and 10 second reset timeout
	breaker := NewCircuitBreaker(5, 10*time.Second)
	return NewCircuitBreakerClient(client, breaker, logger), nil
}

// ExecuteWithCircuitBreaker executes a Redis command with circuit breaker protection
func (c *CircuitBreakerClient) ExecuteWithCircuitBreaker(operation func() error) error {
	if !c.breaker.AllowRequest() {
		c.logger.Warn("Circuit breaker is open, fast-failing Redis request")
		return errors.New("circuit breaker is open")
	}

	err := operation()
	if err != nil {
		c.breaker.RecordFailure()
		return err
	}

	c.breaker.RecordSuccess()
	return nil
}

// SetWithTTL sets a key with a value and TTL using the circuit breaker
func (c *CircuitBreakerClient) SetWithTTL(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	return c.ExecuteWithCircuitBreaker(func() error {
		return c.client.Set(ctx, key, value, ttl).Err()
	})
}

// Get retrieves a value by key using the circuit breaker
func (c *CircuitBreakerClient) Get(ctx context.Context, key string) (string, error) {
	var result string
	err := c.ExecuteWithCircuitBreaker(func() error {
		var err error
		result, err = c.client.Get(ctx, key).Result()
		return err
	})
	return result, err
}

// SetWithTTL sets a key with a value and TTL
func SetWithTTL(ctx context.Context, client *redis.Client, key string, value interface{}, ttl time.Duration) error {
	return client.Set(ctx, key, value, ttl).Err()
}

// Get retrieves a value by key
func Get(ctx context.Context, client *redis.Client, key string) (string, error) {
	return client.Get(ctx, key).Result()
}

// Delete removes a key from Redis
func Delete(ctx context.Context, client *redis.Client, key string) error {
	return client.Del(ctx, key).Err()
}

// HashSet sets fields in a Redis hash
func HashSet(ctx context.Context, client *redis.Client, key string, fields map[string]interface{}) error {
	return client.HSet(ctx, key, fields).Err()
}

// HashGet gets a field from a Redis hash
func HashGet(ctx context.Context, client *redis.Client, key, field string) (string, error) {
	return client.HGet(ctx, key, field).Result()
}

// HashGetAll gets all fields from a Redis hash
func HashGetAll(ctx context.Context, client *redis.Client, key string) (map[string]string, error) {
	return client.HGetAll(ctx, key).Result()
}

// Publish sends a message to a Redis channel
func Publish(ctx context.Context, client *redis.Client, channel string, message interface{}) error {
	return client.Publish(ctx, channel, message).Err()
}

// Subscribe creates a Redis subscription to a channel
func Subscribe(ctx context.Context, client *redis.Client, channel string) *redis.PubSub {
	return client.Subscribe(ctx, channel)
}
