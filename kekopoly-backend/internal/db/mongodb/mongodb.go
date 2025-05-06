package mongodb

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
	"go.uber.org/zap"
)

// CircuitBreaker implements the circuit breaker pattern for MongoDB
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

// CircuitBreakerClient wraps a MongoDB client with circuit breaker functionality
type CircuitBreakerClient struct {
	client  *mongo.Client
	breaker *CircuitBreaker
	logger  *zap.SugaredLogger
}

// NewCircuitBreakerClient creates a new circuit breaker client
func NewCircuitBreakerClient(client *mongo.Client, breaker *CircuitBreaker, logger *zap.SugaredLogger) *CircuitBreakerClient {
	return &CircuitBreakerClient{
		client:  client,
		breaker: breaker,
		logger:  logger,
	}
}

// Database returns a database with circuit breaker protection
func (c *CircuitBreakerClient) Database(name string) *mongo.Database {
	return c.client.Database(name)
}

// Ping pings the MongoDB server with circuit breaker protection
func (c *CircuitBreakerClient) Ping(ctx context.Context, rp *readpref.ReadPref) error {
	if !c.breaker.AllowRequest() {
		c.logger.Warn("Circuit breaker is open, fast-failing MongoDB ping request")
		return errors.New("circuit breaker is open")
	}

	err := c.client.Ping(ctx, rp)
	if err != nil {
		c.breaker.RecordFailure()
		return err
	}

	c.breaker.RecordSuccess()
	return nil
}

// Connect establishes a connection to MongoDB with retry capabilities
// Uses variadic logger parameter for backward compatibility
func Connect(ctx context.Context, uri string, logger ...*zap.SugaredLogger) (*mongo.Client, error) {
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

	// Create connection options with sensible pool settings
	clientOptions := options.Client().
		ApplyURI(uri).
		SetMinPoolSize(5).
		SetMaxPoolSize(100).
		SetMaxConnIdleTime(30 * time.Second).
		SetRetryWrites(true).
		SetRetryReads(true)

	var client *mongo.Client
	var err error

	// Retry configuration
	maxRetries := 5
	initialBackoff := 500 * time.Millisecond
	maxBackoff := 10 * time.Second

	// Exponential backoff with jitter for retries
	for attempt := 0; attempt < maxRetries; attempt++ {
		// Create a context with timeout for the connection
		connCtx, cancel := context.WithTimeout(ctx, 10*time.Second)

		// Attempt connection
		client, err = mongo.Connect(connCtx, clientOptions)
		cancel()

		if err == nil {
			// Test the connection with ping
			pingCtx, pingCancel := context.WithTimeout(ctx, 5*time.Second)
			pingErr := client.Ping(pingCtx, readpref.Primary())
			pingCancel()

			if pingErr == nil {
				// Connection successful
				log.Infow("Successfully connected to MongoDB", "attempt", attempt+1)
				return client, nil
			}

			// Ping failed
			err = pingErr
			_ = client.Disconnect(ctx)
		}

		// Calculate backoff with jitter
		backoff := float64(initialBackoff) * math.Pow(2, float64(attempt))
		if backoff > float64(maxBackoff) {
			backoff = float64(maxBackoff)
		}
		// Add jitter (±20%)
		jitter := 0.8 + 0.4*float64(time.Now().UnixNano()%1000)/1000.0
		backoffWithJitter := time.Duration(backoff * jitter)

		log.Warnw("Failed to connect to MongoDB, retrying",
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
			return nil, fmt.Errorf("context cancelled while connecting to MongoDB: %w", ctx.Err())
		}
	}

	return nil, fmt.Errorf("failed to connect to MongoDB after %d attempts: %w", maxRetries, err)
}

// CreateClient creates a MongoDB client with circuit breaker protection
func CreateClient(ctx context.Context, uri string, logger *zap.SugaredLogger) (*CircuitBreakerClient, error) {
	client, err := Connect(ctx, uri, logger)
	if err != nil {
		return nil, err
	}

	// Create circuit breaker with 5 failures threshold and 10 second reset timeout
	breaker := NewCircuitBreaker(5, 10*time.Second)
	return NewCircuitBreakerClient(client, breaker, logger), nil
}

// GetCollection returns a reference to a MongoDB collection
func GetCollection(client *mongo.Client, dbName, collName string) *mongo.Collection {
	return client.Database(dbName).Collection(collName)
}

// CreateIndexes creates indexes for the collections
func CreateIndexes(ctx context.Context, client *mongo.Client, dbName string) error {
	// This function can be expanded to create indexes for different collections
	// For now, it's a placeholder for future index creation
	return nil
}
