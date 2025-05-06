package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/kekopoly/backend/internal/api"
	"github.com/kekopoly/backend/internal/config"
	"github.com/kekopoly/backend/internal/db/mongodb"
	"github.com/kekopoly/backend/internal/db/redis"
	"github.com/kekopoly/backend/internal/game/manager"
	"github.com/kekopoly/backend/internal/game/websocket"
	"github.com/kekopoly/backend/internal/queue"
	"go.uber.org/zap"
)

func main() {
	// Initialize logger
	logger, err := zap.NewDevelopment()
	if err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()
	sugar := logger.Sugar()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		sugar.Fatalf("Failed to load configuration: %v", err)
	}

	// Setup context with cancellation for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize MongoDB connection with retry capabilities
	mongoClient, err := mongodb.Connect(ctx, cfg.MongoDB.URI, sugar)
	if err != nil {
		sugar.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer func() {
		if err := mongoClient.Disconnect(ctx); err != nil {
			sugar.Errorf("Failed to disconnect from MongoDB: %v", err)
		}
	}()
	sugar.Info("Connected to MongoDB")

	// Initialize Redis connection with retry capabilities
	redisClient, err := redis.Connect(ctx, cfg.Redis.URI, sugar)
	if err != nil {
		sugar.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer func() {
		if err := redisClient.Close(); err != nil {
			sugar.Errorf("Failed to close Redis connection: %v", err)
		}
	}()
	sugar.Info("Connected to Redis")

	// Initialize Redis queue
	redisQueue, err := queue.NewRedisQueue(cfg.Redis.URI, logger)
	if err != nil {
		sugar.Fatalf("Failed to initialize Redis queue: %v", err)
	}
	defer redisQueue.Close()
	sugar.Info("Initialized Redis queue")

	// Initialize WebSocket hub without game manager first
	hub := websocket.NewHub(ctx, nil, mongoClient, redisClient, sugar, redisQueue)
	go hub.Run()
	sugar.Info("WebSocket hub is running")

	// Initialize game manager with the message queue
	gameManager := manager.NewGameManager(ctx, mongoClient, redisClient, sugar, hub, redisQueue)
	sugar.Info("Game manager initialized")

	// Set the game manager in the hub
	hub.SetGameManager(gameManager)
	sugar.Info("Game manager set in WebSocket hub")

	// Initialize queue worker
	worker := queue.NewWorker(redisQueue, gameManager, logger)

	// Run an initial cleanup of stale queues
	sugar.Info("Running initial cleanup of stale queues")

	// First, clear all stale queues (for games that no longer exist)
	clearedCount, err := worker.ClearAllStaleQueues()
	if err != nil {
		sugar.Warnf("Failed to clear stale queues: %v", err)
	} else {
		sugar.Infof("Cleared %d stale queues", clearedCount)
	}

	// Then process any remaining queues
	worker.CleanupStaleQueues()

	// Start the worker
	worker.Start()
	sugar.Info("Queue worker started")

	// Initialize API server with the database clients
	server := api.NewServerWithClients(cfg, gameManager, mongoClient, redisClient, sugar)

	// Start the server in a goroutine
	go func() {
		if err := server.Start(); err != nil {
			sugar.Fatalf("Failed to start the server: %v", err)
		}
	}()
	sugar.Infof("Server started on port %d", cfg.Server.Port)

	// Wait for interrupt signal to gracefully shut down the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	// Stop the queue worker
	worker.Stop()
	sugar.Info("Queue worker stopped")

	sugar.Info("Shutting down server...")
	if err := server.Shutdown(ctx); err != nil {
		sugar.Fatalf("Server forced to shutdown: %v", err)
	}

	sugar.Info("Server exited properly")
}
