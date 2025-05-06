package queue

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/kekopoly/backend/internal/game/manager"
	"github.com/kekopoly/backend/internal/game/models"
	"go.uber.org/zap"
)

// MessageHandler is a function that processes a queue message
type MessageHandler func(msg *QueueMessage) error

// Worker processes messages from a Redis queue
type Worker struct {
	queue        *RedisQueue
	gameManager  *manager.GameManager
	logger       *zap.Logger
	handlers     map[MessageType]MessageHandler
	maxAttempts  int
	shutdownChan chan struct{}
	ctx          context.Context
	cancel       context.CancelFunc
}

// NewWorker creates a new queue worker
func NewWorker(queue *RedisQueue, gameManager *manager.GameManager, logger *zap.Logger) *Worker {
	ctx, cancel := context.WithCancel(context.Background())

	worker := &Worker{
		queue:        queue,
		gameManager:  gameManager,
		logger:       logger,
		handlers:     make(map[MessageType]MessageHandler),
		maxAttempts:  3, // Default max retry attempts
		shutdownChan: make(chan struct{}),
		ctx:          ctx,
		cancel:       cancel,
	}

	// Register default handlers
	worker.registerDefaultHandlers()

	return worker
}

// registerDefaultHandlers sets up the default message handlers
func (w *Worker) registerDefaultHandlers() {
	// Handler for player token updates
	w.RegisterHandler(PlayerTokenUpdate, func(msg *QueueMessage) error {
		w.logger.Info("Processing player token update",
			zap.String("gameId", msg.GameID),
			zap.String("playerId", msg.PlayerID))

		// We don't need to convert gameID to ObjectID here since we're using it as a string
		// for the GetGame method

		// Get the game from the database
		game, err := w.gameManager.GetGame(msg.GameID)
		if err != nil {
			return fmt.Errorf("failed to get game: %w", err)
		}

		// Find the player in the game
		playerUpdated := false
		for i, player := range game.Players {
			if player.ID == msg.PlayerID {
				// Update the player's token
				if token, ok := msg.Data["token"].(string); ok && token != "" {
					game.Players[i].CharacterToken = token
					playerUpdated = true
				} else if characterToken, ok := msg.Data["characterToken"].(string); ok && characterToken != "" {
					game.Players[i].CharacterToken = characterToken
					playerUpdated = true
				} else if emoji, ok := msg.Data["emoji"].(string); ok && emoji != "" {
					game.Players[i].CharacterToken = emoji
					playerUpdated = true
				}

				// The Player struct doesn't have Name, Color, or IsReady fields
				// We only update the CharacterToken field
				// Other fields like Name, Color, and IsReady are stored in the WebSocket hub's playerInfo map
				// and are not part of the Player struct in the database

				break
			}
		}

		if !playerUpdated {
			w.logger.Warn("Player not found in game",
				zap.String("gameId", msg.GameID),
				zap.String("playerId", msg.PlayerID))
			return fmt.Errorf("player not found in game")
		}

		// Update the game in the database
		err = w.gameManager.UpdateGame(game)
		if err != nil {
			return fmt.Errorf("failed to update game: %w", err)
		}

		w.logger.Info("Player token updated successfully",
			zap.String("gameId", msg.GameID),
			zap.String("playerId", msg.PlayerID))

		return nil
	})

	// Handler for game state updates
	w.RegisterHandler(GameStateUpdate, func(msg *QueueMessage) error {
		w.logger.Info("Processing game state update",
			zap.String("gameId", msg.GameID))

		// Get the game from the database
		game, err := w.gameManager.GetGame(msg.GameID)
		if err != nil {
			return fmt.Errorf("failed to get game: %w", err)
		}

		// Update game fields based on the message data
		if status, ok := msg.Data["status"].(string); ok && status != "" {
			game.Status = models.GameStatus(status)
		}

		if currentTurn, ok := msg.Data["currentTurn"].(string); ok && currentTurn != "" {
			game.CurrentTurn = currentTurn
		}

		// Update the game in the database
		err = w.gameManager.UpdateGame(game)
		if err != nil {
			return fmt.Errorf("failed to update game: %w", err)
		}

		w.logger.Info("Game state updated successfully",
			zap.String("gameId", msg.GameID))

		return nil
	})

	// Handler for game start
	w.RegisterHandler(GameStart, func(msg *QueueMessage) error {
		w.logger.Info("Processing game start message from queue",
			zap.String("gameId", msg.GameID),
			zap.String("hostId", msg.PlayerID),
			zap.Any("messageData", msg.Data))

		// Get complete game data including tokens before starting
		game, err := w.gameManager.GetGame(msg.GameID)
		if err != nil {
			w.logger.Error("Error getting game data before starting",
				zap.String("gameId", msg.GameID),
				zap.Error(err))
			return fmt.Errorf("failed to get game data: %w", err)
		}

		// Log game status to verify it's in the right state
		w.logger.Info("Game data before starting",
			zap.String("gameId", msg.GameID),
			zap.String("status", string(game.Status)),
			zap.Int("playerCount", len(game.Players)))

		// Verify the game is in LOBBY status
		if game.Status != models.GameStatusLobby {
			w.logger.Error("Cannot start game that is not in LOBBY status",
				zap.String("gameId", msg.GameID),
				zap.String("currentStatus", string(game.Status)))
			return fmt.Errorf("game is not in LOBBY status, current status: %s", game.Status)
		}

		// Verify there are enough players
		if len(game.Players) < 2 {
			w.logger.Error("Cannot start game with fewer than 2 players",
				zap.String("gameId", msg.GameID),
				zap.Int("playerCount", len(game.Players)))
			return fmt.Errorf("not enough players to start game, need at least 2, got %d", len(game.Players))
		}

		// Verify the requesting player is the host
		if msg.PlayerID != game.HostID {
			w.logger.Error("Only the host can start the game",
				zap.String("gameId", msg.GameID),
				zap.String("requestingPlayerId", msg.PlayerID),
				zap.String("hostId", game.HostID))
			return fmt.Errorf("only the host can start the game")
		}

		// Log detailed player data including tokens
		for i, player := range game.Players {
			w.logger.Info("Player data before game start",
				zap.String("gameId", msg.GameID),
				zap.Int("playerIndex", i),
				zap.String("playerId", player.ID),
				zap.String("characterToken", player.CharacterToken),
				zap.Int("balance", player.Balance))
		}

		// Start the game - this will transition from LOBBY to ACTIVE
		w.logger.Info("Calling StartGame method",
			zap.String("gameId", msg.GameID),
			zap.String("hostId", msg.PlayerID))

		err = w.gameManager.StartGame(msg.GameID, msg.PlayerID)
		if err != nil {
			w.logger.Error("Failed to start game",
				zap.String("gameId", msg.GameID),
				zap.Error(err))
			return fmt.Errorf("failed to start game: %w", err)
		}

		// Get the game data again after starting to verify tokens are preserved
		updatedGame, err := w.gameManager.GetGame(msg.GameID)
		if err != nil {
			w.logger.Error("Error getting game data after starting",
				zap.String("gameId", msg.GameID),
				zap.Error(err))
			// Don't return error here, just log it
		} else {
			w.logger.Info("Game data after starting",
				zap.String("gameId", msg.GameID),
				zap.Int("playerCount", len(updatedGame.Players)))

			for _, player := range updatedGame.Players {
				w.logger.Info("Player token data after game start",
					zap.String("gameId", msg.GameID),
					zap.String("playerId", player.ID),
					zap.String("characterToken", player.CharacterToken))
			}
		}

		w.logger.Info("Game started successfully",
			zap.String("gameId", msg.GameID),
			zap.String("hostId", msg.PlayerID))

		return nil
	})
}

// RegisterHandler registers a handler for a specific message type
func (w *Worker) RegisterHandler(msgType MessageType, handler MessageHandler) {
	w.handlers[msgType] = handler
}

// Start begins processing messages from the queue
func (w *Worker) Start() {
	go w.processMessages()
	go w.runPeriodicCleanup()
}

// Stop stops the worker
func (w *Worker) Stop() {
	w.cancel()
	close(w.shutdownChan)
}

// runPeriodicCleanup periodically cleans up stale queues
func (w *Worker) runPeriodicCleanup() {
	ticker := time.NewTicker(30 * time.Minute) // Run cleanup every 30 minutes
	defer ticker.Stop()

	for {
		select {
		case <-w.shutdownChan:
			w.logger.Info("Cleanup task shutting down")
			return
		case <-ticker.C:
			w.logger.Info("Running periodic queue cleanup")
			w.CleanupStaleQueues()
		}
	}
}

// CleanupStaleQueues cleans up queues for games that no longer exist
func (w *Worker) CleanupStaleQueues() {
	// Get all keys matching the pattern "game:*:queue"
	keys, err := w.queue.client.Keys(w.ctx, "game:*:queue").Result()
	if err != nil {
		w.logger.Error("Failed to get queue keys for cleanup", zap.Error(err))
		return
	}

	if len(keys) == 0 {
		return // No queues found
	}

	w.logger.Info("Checking queues for stale games", zap.Int("queueCount", len(keys)))

	staleQueuesCount := 0
	// Check each queue
	for _, queueName := range keys {
		// Extract game ID from queue name
		parts := strings.Split(queueName, ":")
		if len(parts) != 3 {
			continue
		}
		gameID := parts[1]

		// Check if the game exists
		if !w.gameExists(gameID) {
			staleQueuesCount++
			w.logger.Info("Found stale queue for non-existent game",
				zap.String("queue", queueName),
				zap.String("gameId", gameID))

			// Move all messages to dead letter queue
			w.moveAllMessagesToDeadLetterQueue(queueName, gameID)
		}
	}

	w.logger.Info("Stale queue cleanup complete",
		zap.Int("totalQueues", len(keys)),
		zap.Int("staleQueues", staleQueuesCount))
}

// processMessages continuously processes messages from the queue
func (w *Worker) processMessages() {
	for {
		select {
		case <-w.shutdownChan:
			w.logger.Info("Worker shutting down")
			return
		default:
			// Process messages for each active game and games with pending operations
			games, err := w.gameManager.GetActiveGames()
			if err != nil {
				// For errors, log and wait longer
				w.logger.Error("Failed to get active games", zap.Error(err))
				time.Sleep(5 * time.Second)
				continue
			}

			// If no games were found, we'll still check for direct queue access
			if len(games) == 0 {
				w.logger.Debug("No active or lobby games found, checking for direct queue access")
				// We'll check for any game start messages in Redis directly
				w.processDirectQueueMessages()
				time.Sleep(1 * time.Second)
				continue
			}

			for _, game := range games {
				queueName := fmt.Sprintf("game:%s:queue", game.ID.Hex())

				// Check if there are messages in the queue
				length, err := w.queue.GetQueueLength(queueName)
				if err != nil {
					w.logger.Error("Failed to get queue length",
						zap.String("queue", queueName),
						zap.Error(err))
					continue
				}

				if length == 0 {
					continue // No messages in this game's queue
				}

				// Log at debug level to avoid console spam
				w.logger.Debug("Processing messages for game",
					zap.String("gameId", game.ID.Hex()),
					zap.Int64("messageCount", length))

				// Process all messages in the queue
				for i := int64(0); i < length; i++ {
					// Check for shutdown signal
					select {
					case <-w.shutdownChan:
						w.logger.Info("Worker shutting down during message processing")
						return
					default:
						// Continue processing
					}

					// Dequeue a message
					msg, err := w.queue.DequeueMessage(queueName)
					if err != nil {
						// If the queue is empty, just continue to the next queue
						if err.Error() == "queue is empty" {
							w.logger.Debug("Queue is empty, continuing",
								zap.String("queue", queueName))
							break
						}

						w.logger.Error("Failed to dequeue message",
							zap.String("queue", queueName),
							zap.Error(err))
						break
					}

					// Process the message
					err = w.processMessage(queueName, msg)
					if err != nil {
						w.logger.Error("Failed to process message",
							zap.String("queue", queueName),
							zap.String("type", string(msg.Type)),
							zap.String("gameId", msg.GameID),
							zap.String("playerId", msg.PlayerID),
							zap.Error(err))

						// Check if the error is due to game not found
						if strings.Contains(err.Error(), "game not found") ||
							strings.Contains(err.Error(), "failed to get game") {
							w.logger.Warn("Game not found, moving message to dead letter queue",
								zap.String("queue", queueName),
								zap.String("type", string(msg.Type)),
								zap.String("gameId", msg.GameID))

							err = w.queue.MoveToDeadLetterQueue(queueName, msg)
							if err != nil {
								w.logger.Error("Failed to move message to dead letter queue",
									zap.String("queue", queueName),
									zap.Error(err))
							}
						} else if msg.Attempts < w.maxAttempts {
							// For other errors, retry if under max attempts
							w.logger.Info("Retrying message",
								zap.String("queue", queueName),
								zap.String("type", string(msg.Type)),
								zap.Int("attempt", msg.Attempts+1),
								zap.Int("maxAttempts", w.maxAttempts))

							// Wait a bit before retrying
							time.Sleep(time.Duration(msg.Attempts+1) * time.Second)

							err = w.queue.RetryMessage(queueName, msg)
							if err != nil {
								w.logger.Error("Failed to requeue message",
									zap.String("queue", queueName),
									zap.Error(err))
							}
						} else {
							w.logger.Warn("Moving message to dead letter queue after max attempts",
								zap.String("queue", queueName),
								zap.String("type", string(msg.Type)),
								zap.Int("attempts", msg.Attempts),
								zap.Int("maxAttempts", w.maxAttempts))

							err = w.queue.MoveToDeadLetterQueue(queueName, msg)
							if err != nil {
								w.logger.Error("Failed to move message to dead letter queue",
									zap.String("queue", queueName),
									zap.Error(err))
							}
						}
					}
				}
			}

			// Sleep a bit to avoid hammering Redis
			time.Sleep(100 * time.Millisecond)
		}
	}
}

// processMessage processes a single message from the queue
func (w *Worker) processMessage(queueName string, msg *QueueMessage) error {
	// Log the message being processed
	w.logger.Info("Processing message from queue",
		zap.String("queue", queueName),
		zap.String("type", string(msg.Type)),
		zap.String("gameId", msg.GameID),
		zap.String("playerId", msg.PlayerID),
		zap.Int("attempts", msg.Attempts))

	// Find the appropriate handler for this message type
	handler, ok := w.handlers[msg.Type]
	if !ok {
		w.logger.Error("No handler registered for message type",
			zap.String("type", string(msg.Type)),
			zap.String("gameId", msg.GameID))
		return fmt.Errorf("no handler registered for message type: %s", msg.Type)
	}

	// Call the handler
	err := handler(msg)
	if err != nil {
		w.logger.Error("Error processing message",
			zap.String("queue", queueName),
			zap.String("type", string(msg.Type)),
			zap.String("gameId", msg.GameID),
			zap.Error(err))
		return err
	}

	w.logger.Info("Successfully processed message",
		zap.String("queue", queueName),
		zap.String("type", string(msg.Type)),
		zap.String("gameId", msg.GameID))
	return nil
}

// gameExists checks if a game exists in the database
func (w *Worker) gameExists(gameID string) bool {
	// Try to get the game from the database
	_, err := w.gameManager.GetGame(gameID)
	return err == nil
}

// processDirectQueueMessages checks for game start messages directly in Redis
// This is a fallback mechanism when no active games are found in memory
func (w *Worker) processDirectQueueMessages() {
	// Get all keys matching the pattern "game:*:queue"
	keys, err := w.queue.client.Keys(w.ctx, "game:*:queue").Result()
	if err != nil {
		w.logger.Error("Failed to get queue keys", zap.Error(err))
		return
	}

	if len(keys) == 0 {
		return // No queues found
	}

	w.logger.Info("Found queue keys for direct processing", zap.Int("count", len(keys)))

	// Process each queue
	for _, queueName := range keys {
		// Extract game ID from queue name
		parts := strings.Split(queueName, ":")
		if len(parts) != 3 {
			w.logger.Warn("Invalid queue name format", zap.String("queue", queueName))
			continue
		}
		gameID := parts[1]

		// Check if the game exists before processing its messages
		if !w.gameExists(gameID) {
			w.logger.Warn("Game no longer exists, moving all messages to dead letter queue",
				zap.String("queue", queueName),
				zap.String("gameId", gameID))

			// Move all messages to dead letter queue
			w.moveAllMessagesToDeadLetterQueue(queueName, gameID)
			continue
		}

		// Ensure the game is loaded into memory by explicitly getting it
		// This is critical for games in LOBBY status that might not be in the activeGames map
		game, err := w.gameManager.GetGame(gameID)
		if err != nil {
			w.logger.Error("Failed to load game into memory for queue processing",
				zap.String("gameId", gameID),
				zap.Error(err))
			continue
		}

		// Log the game status to help with debugging
		w.logger.Info("Processing queue for game",
			zap.String("gameId", gameID),
			zap.String("status", string(game.Status)),
			zap.String("queue", queueName))

		// Check if there are messages in the queue
		length, err := w.queue.GetQueueLength(queueName)
		if err != nil {
			w.logger.Error("Failed to get queue length",
				zap.String("queue", queueName),
				zap.Error(err))
			continue
		}

		if length == 0 {
			continue // No messages in this queue
		}

		w.logger.Info("Processing messages directly from queue",
			zap.String("queue", queueName),
			zap.String("gameId", gameID),
			zap.Int64("messageCount", length))

		// Process all messages in the queue
		for i := int64(0); i < length; i++ {
			// Dequeue a message
			msg, err := w.queue.DequeueMessage(queueName)
			if err != nil {
				// If the queue is empty, just continue to the next queue
				if err.Error() == "queue is empty" {
					w.logger.Debug("Queue is empty, continuing",
						zap.String("queue", queueName))
					break
				}

				w.logger.Error("Failed to dequeue message",
					zap.String("queue", queueName),
					zap.Error(err))
				break
			}

			// Process the message
			err = w.processMessage(queueName, msg)
			if err != nil {
				w.logger.Error("Failed to process message directly",
					zap.String("queue", queueName),
					zap.String("type", string(msg.Type)),
					zap.String("gameId", msg.GameID),
					zap.Error(err))

				// Check if the error is due to game not found
				if strings.Contains(err.Error(), "game not found") ||
					strings.Contains(err.Error(), "failed to get game") {
					w.logger.Warn("Game not found, moving message to dead letter queue",
						zap.String("queue", queueName),
						zap.String("type", string(msg.Type)),
						zap.String("gameId", msg.GameID))

					err = w.queue.MoveToDeadLetterQueue(queueName, msg)
					if err != nil {
						w.logger.Error("Failed to move message to dead letter queue",
							zap.String("queue", queueName),
							zap.Error(err))
					}
				} else if msg.Attempts < w.maxAttempts {
					// For other errors, retry if under max attempts
					w.logger.Info("Retrying message",
						zap.String("queue", queueName),
						zap.String("type", string(msg.Type)),
						zap.Int("attempt", msg.Attempts+1),
						zap.Int("maxAttempts", w.maxAttempts))

					// Wait a bit before retrying
					time.Sleep(time.Duration(msg.Attempts+1) * time.Second)

					err = w.queue.RetryMessage(queueName, msg)
					if err != nil {
						w.logger.Error("Failed to requeue message",
							zap.String("queue", queueName),
							zap.Error(err))
					}
				} else {
					w.logger.Warn("Moving message to dead letter queue after max attempts",
						zap.String("queue", queueName),
						zap.String("type", string(msg.Type)),
						zap.Int("attempts", msg.Attempts),
						zap.Int("maxAttempts", w.maxAttempts))

					err = w.queue.MoveToDeadLetterQueue(queueName, msg)
					if err != nil {
						w.logger.Error("Failed to move message to dead letter queue",
							zap.String("queue", queueName),
							zap.Error(err))
					}
				}
			}
		}
	}
}

// moveAllMessagesToDeadLetterQueue moves all messages from a queue to its dead letter queue
func (w *Worker) moveAllMessagesToDeadLetterQueue(queueName, gameID string) {
	// Get queue length
	length, err := w.queue.GetQueueLength(queueName)
	if err != nil {
		w.logger.Error("Failed to get queue length for cleanup",
			zap.String("queue", queueName),
			zap.Error(err))
		return
	}

	if length == 0 {
		return // No messages to move
	}

	w.logger.Info("Moving all messages to dead letter queue",
		zap.String("queue", queueName),
		zap.String("gameId", gameID),
		zap.Int64("messageCount", length))

	// Move all messages to dead letter queue
	for i := int64(0); i < length; i++ {
		msg, err := w.queue.DequeueMessage(queueName)
		if err != nil {
			if err.Error() == "queue is empty" {
				break // No more messages
			}

			w.logger.Error("Failed to dequeue message during cleanup",
				zap.String("queue", queueName),
				zap.Error(err))
			continue
		}

		// Move to dead letter queue
		err = w.queue.MoveToDeadLetterQueue(queueName, msg)
		if err != nil {
			w.logger.Error("Failed to move message to dead letter queue during cleanup",
				zap.String("queue", queueName),
				zap.Error(err))
		}
	}
}

// SetMaxAttempts sets the maximum number of retry attempts
func (w *Worker) SetMaxAttempts(maxAttempts int) {
	w.maxAttempts = maxAttempts
}

// ClearAllStaleQueues clears all queues for games that no longer exist
func (w *Worker) ClearAllStaleQueues() (int, error) {
	// Get all keys matching the pattern "game:*:queue"
	keys, err := w.queue.client.Keys(w.ctx, "game:*:queue").Result()
	if err != nil {
		return 0, fmt.Errorf("failed to get queue keys: %w", err)
	}

	if len(keys) == 0 {
		return 0, nil // No queues found
	}

	w.logger.Info("Checking for stale queues", zap.Int("totalQueues", len(keys)))

	staleQueues := []string{}
	// Check each queue
	for _, queueName := range keys {
		// Extract game ID from queue name
		parts := strings.Split(queueName, ":")
		if len(parts) != 3 {
			continue
		}
		gameID := parts[1]

		// Check if the game exists
		if !w.gameExists(gameID) {
			staleQueues = append(staleQueues, queueName)
			w.logger.Info("Found stale queue for deletion",
				zap.String("queue", queueName),
				zap.String("gameId", gameID))
		}
	}

	if len(staleQueues) == 0 {
		w.logger.Info("No stale queues found")
		return 0, nil
	}

	// Delete all stale queues
	_, err = w.queue.client.Del(w.ctx, staleQueues...).Result()
	if err != nil {
		return 0, fmt.Errorf("failed to delete stale queues: %w", err)
	}

	w.logger.Info("Cleared stale queues", zap.Int("count", len(staleQueues)))
	return len(staleQueues), nil
}
