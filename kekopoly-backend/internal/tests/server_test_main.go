package tests

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
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

// TestServerMain provides a way to run the server for testing purposes
// It's more forgiving than the production server and can run with mock/unavailable services
func TestServerMain() {
	// Initialize context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize logger for testing
	logger, err := zap.NewDevelopment()
	if err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Sync()
	sugar := logger.Sugar()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		sugar.Fatalf("Failed to load configuration: %v", err)
	}

	// Try to connect to MongoDB
	var mongoClient *mongo.Client
	mongoClient, err = mongodb.Connect(ctx, cfg.MongoDB.URI, sugar)
	if err != nil {
		sugar.Warnf("MongoDB connection failed: %v", err)
		sugar.Warn("Continuing without MongoDB for testing purposes...")
		// We'll continue without MongoDB for testing
	} else {
		defer mongoClient.Disconnect(ctx)
		sugar.Info("Connected to MongoDB")
	}

	// Try to connect to Redis
	var redisClient *redis.Client
	redisClient, err = redisdb.Connect(ctx, cfg.Redis.URI, sugar)
	if err != nil {
		sugar.Warnf("Redis connection failed: %v", err)
		sugar.Warn("Continuing without Redis for testing purposes...")
		// We'll continue without Redis for testing
	} else {
		defer redisClient.Close()
		sugar.Info("Connected to Redis")
	}

	// Initialize WebSocket hub first (without game manager)
	hub := websocket.NewHub(ctx, nil, mongoClient, redisClient, sugar, nil)

	// Initialize game manager (with nil message queue for tests)
	gameManager := manager.NewGameManager(ctx, mongoClient, redisClient, sugar, hub, nil)

	// Set the game manager in the hub
	hub.SetGameManager(gameManager)

	// Initialize API server
	server := api.NewServerWithClients(cfg, gameManager, mongoClient, redisClient, sugar)

	// Start the server in a goroutine
	go func() {
		sugar.Infof("Starting server on port %d", cfg.Server.Port)
		if err := server.Start(); err != nil {
			sugar.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Handle graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	sugar.Info("Server started. Press Ctrl+C to exit.")
	<-quit

	sugar.Info("Shutting down server...")

	// Create a deadline for shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		sugar.Errorf("Server forced to shutdown: %v", err)
	}

	sugar.Info("Server exited gracefully")
}

// RunTestServer is a helper function to run the test server
func RunTestServer() {
	fmt.Println("Starting Kekopoly test server...")
	TestServerMain()
}
