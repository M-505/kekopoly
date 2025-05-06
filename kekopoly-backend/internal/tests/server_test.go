package tests

import (
	"context"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/kekopoly/backend/internal/api"
	"github.com/kekopoly/backend/internal/config"
	"github.com/kekopoly/backend/internal/db/mongodb"
	redisdb "github.com/kekopoly/backend/internal/db/redis"
	"github.com/kekopoly/backend/internal/game/manager"
	"github.com/kekopoly/backend/internal/game/websocket"
	"go.mongodb.org/mongo-driver/mongo"
	"go.uber.org/zap"
)

// TestServerInitialization tests that all server components can be initialized correctly
func TestServerInitialization(t *testing.T) {
	// Initialize test context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Initialize logger for testing
	logger, err := zap.NewDevelopment()
	if err != nil {
		t.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Sync()
	sugar := logger.Sugar()

	// Load configuration with default values
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Failed to load configuration: %v", err)
	}
	if cfg == nil {
		t.Fatal("Configuration should not be nil")
	}
	if cfg.Server.Port != 8080 {
		t.Errorf("Default server port should be 8080, got %d", cfg.Server.Port)
	}

	// Try to connect to MongoDB (will be skipped if MongoDB is not available)
	var mongoClient *mongo.Client
	mongoClient, err = mongodb.Connect(ctx, cfg.MongoDB.URI, sugar)
	if err != nil {
		t.Logf("MongoDB connection skipped (not available): %v", err)
		// We'll continue the test without MongoDB
	} else {
		defer func() {
			if mongoClient != nil {
				mongoClient.Disconnect(ctx)
			}
		}()
		t.Logf("Successfully connected to MongoDB")
	}

	// Try to connect to Redis (will be skipped if Redis is not available)
	var redisClient *redis.Client
	redisClient, err = redisdb.Connect(ctx, cfg.Redis.URI, sugar)
	if err != nil {
		t.Logf("Redis connection skipped (not available): %v", err)
		// We'll continue the test without Redis
	} else {
		defer func() {
			if redisClient != nil {
				redisClient.Close()
			}
		}()
		t.Logf("Successfully connected to Redis")
	}

	// Initialize WebSocket hub first (without game manager)
	hub := websocket.NewHub(ctx, nil, mongoClient, redisClient, sugar, nil)

	// Initialize game manager (with nil message queue for tests)
	gameManager := manager.NewGameManager(ctx, mongoClient, redisClient, sugar, hub, nil)

	// Set the game manager in the hub
	hub.SetGameManager(gameManager)
	if gameManager == nil {
		t.Fatal("Game manager should be initialized")
	}

	// Initialize server
	server := api.NewServerWithClients(cfg, gameManager, mongoClient, redisClient, sugar)
	if server == nil {
		t.Fatal("Server should be initialized")
	}

	// Test cleanup - we won't actually start the server in this test
	t.Log("Server components initialized successfully")
}
