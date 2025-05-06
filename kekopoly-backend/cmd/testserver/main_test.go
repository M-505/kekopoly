package main

import (
	"context"
	"testing"
	"time"

	"github.com/kekopoly/backend/internal/api"
	"github.com/kekopoly/backend/internal/config"
	"github.com/kekopoly/backend/internal/db/mongodb"
	redisdb "github.com/kekopoly/backend/internal/db/redis"
	"github.com/kekopoly/backend/internal/game/manager"
	"github.com/kekopoly/backend/internal/game/websocket"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

// This is a simple test to verify the test server can be set up
func TestSetupTestServer(t *testing.T) {
	// Create a test context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Initialize configuration
	cfg, err := config.Load()
	assert.NoError(t, err, "Setting up config should not fail")
	assert.NotNil(t, cfg, "Config should not be nil")

	// Initialize logger
	logger, err := zap.NewDevelopment()
	assert.NoError(t, err, "Setting up logger should not fail")
	assert.NotNil(t, logger, "Logger should not be nil")
	sugar := logger.Sugar()

	// Initialize MongoDB client (allow failure in tests)
	mongoClient, err := mongodb.Connect(ctx, cfg.MongoDB.URI, sugar)
	if err != nil {
		t.Logf("MongoDB setup failed (this is acceptable in test env): %v", err)
	}

	// Initialize Redis client (allow failure in tests)
	redisClient, err := redisdb.Connect(ctx, cfg.Redis.URI, sugar)
	if err != nil {
		t.Logf("Redis setup failed (this is acceptable in test env): %v", err)
	}

	// Initialize WebSocket hub first (without game manager)
	hub := websocket.NewHub(ctx, nil, mongoClient, redisClient, sugar, nil)

	// Initialize game manager (with nil message queue for tests)
	gameManager := manager.NewGameManager(ctx, mongoClient, redisClient, sugar, hub, nil)

	// Set the game manager in the hub
	hub.SetGameManager(gameManager)
	assert.NotNil(t, gameManager, "Game manager should not be nil")

	// Initialize API server
	server := api.NewServerWithClients(cfg, gameManager, mongoClient, redisClient, sugar)
	assert.NotNil(t, server, "Server should not be nil")
}

func TestMockWebSocketConnection(t *testing.T) {
	// Create a mock game session
	gameID := "test-game-123"
	playerID := "player-123"

	// Test that we can create a valid message
	message := createGameMessage(gameID, playerID, "roll_dice", nil)
	assert.Equal(t, gameID, message["gameId"], "Game ID should match")
	assert.Equal(t, playerID, message["playerId"], "Player ID should match")
	assert.Equal(t, "roll_dice", message["type"], "Message type should match")

	// Test with additional data
	data := map[string]interface{}{
		"position": 5,
		"balance":  1500,
	}
	messageWithData := createGameMessage(gameID, playerID, "player_moved", data)
	assert.Equal(t, 5, messageWithData["position"], "Position should be included in message")
	assert.Equal(t, 1500, messageWithData["balance"], "Balance should be included in message")
}

// Helper function to create a game message (simulating what the WebSocket client would send)
func createGameMessage(gameID, playerID, messageType string, data map[string]interface{}) map[string]interface{} {
	message := map[string]interface{}{
		"gameId":   gameID,
		"playerId": playerID,
		"type":     messageType,
	}

	// Add any additional data to the message
	if data != nil {
		for key, value := range data {
			message[key] = value
		}
	}

	return message
}
