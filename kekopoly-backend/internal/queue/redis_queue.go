package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
)

// MessageType defines the type of message in the queue
type MessageType string

const (
	// Message types
	PlayerTokenUpdate MessageType = "player_token_update"
	GameStateUpdate   MessageType = "game_state_update"
	GameStart         MessageType = "game_start"
)

// QueueMessage represents a message in the queue
type QueueMessage struct {
	Type      MessageType            `json:"type"`
	GameID    string                 `json:"gameId"`
	PlayerID  string                 `json:"playerId,omitempty"`
	Data      map[string]interface{} `json:"data"`
	Timestamp time.Time              `json:"timestamp"`
	Attempts  int                    `json:"attempts"`
}

// RedisQueue implements a Redis-based message queue
type RedisQueue struct {
	client *redis.Client
	logger *zap.Logger
	ctx    context.Context
}

// NewRedisQueue creates a new Redis queue
func NewRedisQueue(redisAddr string, logger *zap.Logger) (*RedisQueue, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	ctx := context.Background()

	// Test connection
	_, err := client.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &RedisQueue{
		client: client,
		logger: logger,
		ctx:    ctx,
	}, nil
}

// Close closes the Redis connection
func (q *RedisQueue) Close() error {
	return q.client.Close()
}

// EnqueuePlayerTokenUpdate adds a player token update message to the queue
func (q *RedisQueue) EnqueuePlayerTokenUpdate(gameID, playerID string, tokenData map[string]interface{}) error {
	msg := QueueMessage{
		Type:      PlayerTokenUpdate,
		GameID:    gameID,
		PlayerID:  playerID,
		Data:      tokenData,
		Timestamp: time.Now(),
		Attempts:  0,
	}

	return q.enqueueMessage(fmt.Sprintf("game:%s:queue", gameID), msg)
}

// EnqueueGameStateUpdate adds a game state update message to the queue
func (q *RedisQueue) EnqueueGameStateUpdate(gameID string, gameState map[string]interface{}) error {
	msg := QueueMessage{
		Type:      GameStateUpdate,
		GameID:    gameID,
		Data:      gameState,
		Timestamp: time.Now(),
		Attempts:  0,
	}

	return q.enqueueMessage(fmt.Sprintf("game:%s:queue", gameID), msg)
}

// EnqueueGameStart adds a game start message to the queue
func (q *RedisQueue) EnqueueGameStart(gameID string, hostID string, data map[string]interface{}) error {
	msg := QueueMessage{
		Type:      GameStart,
		GameID:    gameID,
		PlayerID:  hostID, // The host who started the game
		Data:      data,
		Timestamp: time.Now(),
		Attempts:  0,
	}

	return q.enqueueMessage(fmt.Sprintf("game:%s:queue", gameID), msg)
}

// enqueueMessage adds a message to the specified queue
func (q *RedisQueue) enqueueMessage(queueName string, msg QueueMessage) error {
	// Serialize the message to JSON
	msgJSON, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Add the message to the queue (using a list in Redis)
	err = q.client.RPush(q.ctx, queueName, msgJSON).Err()
	if err != nil {
		return fmt.Errorf("failed to push message to queue: %w", err)
	}

	q.logger.Info("Message enqueued",
		zap.String("queue", queueName),
		zap.String("type", string(msg.Type)),
		zap.String("gameId", msg.GameID),
		zap.String("playerId", msg.PlayerID))

	return nil
}

// DequeueMessage retrieves and removes a message from the specified queue
func (q *RedisQueue) DequeueMessage(queueName string) (*QueueMessage, error) {
	// Get the message from the queue (using LPOP for non-blocking pop)
	// This is safer than BLPOP which can block indefinitely
	result, err := q.client.LPop(q.ctx, queueName).Result()
	if err != nil {
		if err == redis.Nil {
			// Queue is empty
			return nil, fmt.Errorf("queue is empty")
		}
		return nil, fmt.Errorf("failed to pop message from queue: %w", err)
	}

	// Deserialize the message from JSON
	var msg QueueMessage
	err = json.Unmarshal([]byte(result), &msg)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal message: %w", err)
	}

	q.logger.Info("Message dequeued",
		zap.String("queue", queueName),
		zap.String("type", string(msg.Type)),
		zap.String("gameId", msg.GameID),
		zap.String("playerId", msg.PlayerID))

	return &msg, nil
}

// PeekMessage retrieves but does not remove a message from the specified queue
func (q *RedisQueue) PeekMessage(queueName string) (*QueueMessage, error) {
	// Get the message from the queue without removing it
	result, err := q.client.LRange(q.ctx, queueName, 0, 0).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to peek message from queue: %w", err)
	}

	if len(result) == 0 {
		return nil, nil // No messages in the queue
	}

	// Deserialize the message from JSON
	var msg QueueMessage
	err = json.Unmarshal([]byte(result[0]), &msg)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal message: %w", err)
	}

	return &msg, nil
}

// MoveToDeadLetterQueue moves a failed message to a dead letter queue
func (q *RedisQueue) MoveToDeadLetterQueue(queueName string, msg *QueueMessage) error {
	// Increment the attempts counter
	msg.Attempts++

	// Serialize the message to JSON
	msgJSON, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Add the message to the dead letter queue
	deadLetterQueue := fmt.Sprintf("%s:dead", queueName)
	err = q.client.RPush(q.ctx, deadLetterQueue, msgJSON).Err()
	if err != nil {
		return fmt.Errorf("failed to push message to dead letter queue: %w", err)
	}

	q.logger.Warn("Message moved to dead letter queue",
		zap.String("queue", queueName),
		zap.String("deadLetterQueue", deadLetterQueue),
		zap.String("type", string(msg.Type)),
		zap.String("gameId", msg.GameID),
		zap.String("playerId", msg.PlayerID),
		zap.Int("attempts", msg.Attempts))

	return nil
}

// RetryMessage puts a message back into the queue for retry
func (q *RedisQueue) RetryMessage(queueName string, msg *QueueMessage) error {
	// Increment the attempts counter
	msg.Attempts++

	// Serialize the message to JSON
	msgJSON, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Add the message back to the queue
	err = q.client.RPush(q.ctx, queueName, msgJSON).Err()
	if err != nil {
		return fmt.Errorf("failed to push message to queue for retry: %w", err)
	}

	q.logger.Info("Message requeued for retry",
		zap.String("queue", queueName),
		zap.String("type", string(msg.Type)),
		zap.String("gameId", msg.GameID),
		zap.String("playerId", msg.PlayerID),
		zap.Int("attempts", msg.Attempts))

	return nil
}

// GetQueueLength returns the number of messages in the specified queue
func (q *RedisQueue) GetQueueLength(queueName string) (int64, error) {
	return q.client.LLen(q.ctx, queueName).Result()
}

// ClearQueue removes all messages from the specified queue
func (q *RedisQueue) ClearQueue(queueName string) error {
	return q.client.Del(q.ctx, queueName).Err()
}

// ClearAllQueues removes all game queues from Redis
func (q *RedisQueue) ClearAllQueues() (int64, error) {
	// Get all keys matching the pattern "game:*:queue"
	keys, err := q.client.Keys(q.ctx, "game:*:queue").Result()
	if err != nil {
		return 0, fmt.Errorf("failed to get queue keys: %w", err)
	}

	if len(keys) == 0 {
		return 0, nil // No queues found
	}

	// Delete all queues
	count, err := q.client.Del(q.ctx, keys...).Result()
	if err != nil {
		return 0, fmt.Errorf("failed to delete queues: %w", err)
	}

	q.logger.Info("Cleared all game queues", zap.Int64("count", count))
	return count, nil
}

// ClearDeadLetterQueues removes all dead letter queues from Redis
func (q *RedisQueue) ClearDeadLetterQueues() (int64, error) {
	// Get all keys matching the pattern "game:*:queue:dead"
	keys, err := q.client.Keys(q.ctx, "game:*:queue:dead").Result()
	if err != nil {
		return 0, fmt.Errorf("failed to get dead letter queue keys: %w", err)
	}

	if len(keys) == 0 {
		return 0, nil // No queues found
	}

	// Delete all dead letter queues
	count, err := q.client.Del(q.ctx, keys...).Result()
	if err != nil {
		return 0, fmt.Errorf("failed to delete dead letter queues: %w", err)
	}

	q.logger.Info("Cleared all dead letter queues", zap.Int64("count", count))
	return count, nil
}
