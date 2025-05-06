package manager

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.uber.org/zap"

	"github.com/kekopoly/backend/internal/game/models"
	"github.com/kekopoly/backend/internal/game/utils"
)

// Storage interface for game persistence
type Storage interface {
	RemoveGames(ids []string) error
}

// GameManager is responsible for managing game sessions
type GameManager struct {
	ctx              context.Context
	mongoClient      *mongo.Client
	redisClient      *redis.Client
	logger           *zap.SugaredLogger
	activeGames      map[string]*GameSession
	activeGamesMutex sync.RWMutex
	dbName           string
	mutex            sync.RWMutex
	games            map[string]*models.Game
	storage          Storage
	wsHub            WebSocketHub
	messageQueue     MessageQueue
}

// WebSocketHub defines the interface for broadcasting messages to clients
type WebSocketHub interface {
	BroadcastToGame(gameID string, message []byte)
}

// MessageQueue defines the interface for the message queue
type MessageQueue interface {
	EnqueuePlayerTokenUpdate(gameID, playerID string, tokenData map[string]interface{}) error
	EnqueueGameStateUpdate(gameID string, gameState map[string]interface{}) error
	EnqueueGameStart(gameID string, hostID string, data map[string]interface{}) error
}

// GameSession represents an active game session
type GameSession struct {
	Game              *models.Game
	ConnectedPlayers  map[string]string // playerID -> sessionID
	PlayerConnections map[string]PlayerConnection
	mutex             sync.RWMutex
}

// PlayerConnection holds a player's connection information
type PlayerConnection struct {
	PlayerID       string
	SessionID      string
	IsConnected    bool
	DisconnectedAt *time.Time
}

// NewGameManager creates a new game manager instance
func NewGameManager(ctx context.Context, mongoClient *mongo.Client, redisClient *redis.Client, logger *zap.SugaredLogger, wsHub WebSocketHub, messageQueue MessageQueue) *GameManager {
	manager := &GameManager{
		ctx:          ctx,
		mongoClient:  mongoClient,
		redisClient:  redisClient,
		logger:       logger,
		activeGames:  make(map[string]*GameSession),
		dbName:       "kekopoly", // This would come from config in a real implementation
		games:        make(map[string]*models.Game),
		wsHub:        wsHub,
		messageQueue: messageQueue,
	}

	// First cleanup lobby games immediately on server start (synchronously)
	// and then load active games to ensure we don't load any lobby games
	manager.cleanupLobbyGamesAndLoadActive()

	// Begin background cleanup task
	go manager.runCleanupTask()

	return manager
}

// SetWebSocketHub sets the WebSocket hub for the game manager
func (gm *GameManager) SetWebSocketHub(hub WebSocketHub) {
	gm.wsHub = hub
	gm.logger.Info("WebSocket hub set for game manager")
}

// SetMessageQueue sets the message queue for the game manager
func (gm *GameManager) SetMessageQueue(queue MessageQueue) {
	gm.messageQueue = queue
	gm.logger.Info("Message queue set for game manager")
}

// cleanupLobbyGamesAndLoadActive ensures lobby games are cleaned up before loading active games
func (gm *GameManager) cleanupLobbyGamesAndLoadActive() {
	gm.logger.Info("Cleaning up lobby games and loading active games")

	// First clean up lobby games
	gm.cleanupLobbyGamesOnRestart()

	// Then load active games after cleanup is complete
	gm.loadActiveGamesFromDB()
}

// cleanupLobbyGamesOnRestart marks all games in LOBBY status as COMPLETED
// This ensures that no lobby games are preserved across server restarts
func (gm *GameManager) cleanupLobbyGamesOnRestart() {
	gm.logger.Info("Cleaning up lobby games on server restart")

	// Check if the MongoDB client is available
	if gm.mongoClient == nil {
		gm.logger.Warn("MongoDB client is nil, skipping cleanup of lobby games.")
		return
	}

	collection := gm.mongoClient.Database(gm.dbName).Collection("games")

	// Find all games in LOBBY state
	lobbyFilter := bson.M{
		"status": models.GameStatusLobby,
	}

	// Update them to COMPLETED
	update := bson.M{
		"$set": bson.M{
			"status":    models.GameStatusCompleted,
			"updatedAt": time.Now(),
		},
	}

	result, err := collection.UpdateMany(gm.ctx, lobbyFilter, update)
	if err != nil {
		gm.logger.Errorf("Failed to clean up lobby games on restart: %v", err)
	} else {
		gm.logger.Infof("Cleaned up %d lobby games on server restart", result.ModifiedCount)
	}
}

// loadActiveGamesFromDB loads active games from the database into memory
func (gm *GameManager) loadActiveGamesFromDB() {
	gm.logger.Info("Loading active games from database")

	// Check if the MongoDB client is available
	if gm.mongoClient == nil {
		gm.logger.Warn("MongoDB client is nil, skipping loading active games from DB.")
		return
	}

	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	filter := bson.M{
		"status": bson.M{
			"$in": []models.GameStatus{
				// Only include ACTIVE and PAUSED games, never LOBBY games
				models.GameStatusActive,
				models.GameStatusPaused,
			},
		},
	}

	cursor, err := collection.Find(gm.ctx, filter)
	if err != nil {
		gm.logger.Errorf("Failed to query active games: %v", err)
		return
	}
	defer cursor.Close(gm.ctx)

	var games []models.Game
	if err := cursor.All(gm.ctx, &games); err != nil {
		gm.logger.Errorf("Failed to decode games: %v", err)
		return
	}

	for _, game := range games {
		gameSession := &GameSession{
			Game:              &game,
			ConnectedPlayers:  make(map[string]string),
			PlayerConnections: make(map[string]PlayerConnection),
		}

		gm.activeGamesMutex.Lock()
		gm.activeGames[game.ID.Hex()] = gameSession
		gm.activeGamesMutex.Unlock()

		gm.logger.Infof("Loaded game %s with status %s", game.ID.Hex(), game.Status)
	}

	gm.logger.Infof("Loaded %d active games", len(games))
}

// runCleanupTask periodically cleans up expired game sessions
func (gm *GameManager) runCleanupTask() {
	ticker := time.NewTicker(3 * time.Minute) // Run every 3 minutes instead of 15
	defer ticker.Stop()

	for {
		select {
		case <-gm.ctx.Done():
			return
		case <-ticker.C:
			gm.cleanupExpiredSessions()
			// Also clean up stale games
			if _, err := gm.CleanupStaleGames(); err != nil {
				gm.logger.Errorf("Error cleaning up stale games: %v", err)
			}
		}
	}
}

// cleanupExpiredSessions removes expired game sessions
func (gm *GameManager) cleanupExpiredSessions() {
	gm.logger.Info("Running cleanup of expired game sessions")

	// Threshold for inactive games (24 hours)
	inactivityThreshold := time.Now().Add(-24 * time.Hour)

	gm.activeGamesMutex.Lock()
	defer gm.activeGamesMutex.Unlock()

	for gameID, session := range gm.activeGames {
		session.mutex.RLock()
		lastActivity := session.Game.LastActivity
		status := session.Game.Status
		session.mutex.RUnlock()

		// If game is in LOBBY or PAUSED status and has been inactive for 24+ hours
		if (status == models.GameStatusLobby || status == models.GameStatusPaused) &&
			lastActivity.Before(inactivityThreshold) {
			gm.logger.Infof("Removing expired game session: %s", gameID)

			// Update game status in database to COMPLETED
			collection := gm.mongoClient.Database(gm.dbName).Collection("games")
			_, err := collection.UpdateOne(
				gm.ctx,
				bson.M{"_id": session.Game.ID},
				bson.M{"$set": bson.M{
					"status":    models.GameStatusCompleted,
					"updatedAt": time.Now(),
				}},
			)

			if err != nil {
				gm.logger.Errorf("Failed to update expired game status: %v", err)
			}

			// Remove from active games
			delete(gm.activeGames, gameID)
		}
	}
}

// CreateGame creates a new game
func (gm *GameManager) CreateGame(hostPlayerID, hostWalletAddress, gameName string, maxPlayers int) (string, error) {
	gameID := primitive.NewObjectID()
	now := time.Now()

	// Generate a unique room code
	roomCode, err := utils.GenerateRoomCode()
	if err != nil {
		return "", fmt.Errorf("failed to generate room code: %w", err)
	}

	// Ensure the code is unique by checking the database
	for {
		collection := gm.mongoClient.Database(gm.dbName).Collection("games")
		count, err := collection.CountDocuments(gm.ctx, bson.M{"code": roomCode})
		if err != nil {
			return "", fmt.Errorf("failed to check room code uniqueness: %w", err)
		}

		if count == 0 {
			// Code is unique, we can use it
			break
		}

		// Generate a new code and try again
		roomCode, err = utils.GenerateRoomCode()
		if err != nil {
			return "", fmt.Errorf("failed to generate room code: %w", err)
		}
	}

	// If no game name is provided, use a default name with the room code
	if gameName == "" {
		gameName = "Game " + roomCode
	}

	// Ensure maxPlayers is within a reasonable range (e.g., 2-6)
	if maxPlayers < 2 {
		maxPlayers = 2
	} else if maxPlayers > 6 {
		maxPlayers = 6
	}

	game := &models.Game{
		ID:         gameID,
		Code:       roomCode, // Set the room code
		Name:       gameName,
		Status:     models.GameStatusLobby,
		CreatedAt:  now,
		UpdatedAt:  now,
		Players:    []models.Player{},
		HostID:     hostPlayerID, // Explicitly set the host ID
		MaxPlayers: maxPlayers,   // Set the maximum players
		BoardState: models.BoardState{
			Properties: []models.Property{},
			CardsRemaining: models.CardCount{
				Meme:    16,
				Redpill: 16,
				Eegi:    16,
			},
		},
		LastActivity:     now,
		MarketCondition:  models.MarketConditionNormal,
		SettlementStatus: models.SettlementStatusPending,
	}

	// Create host player
	hostPlayer := models.Player{
		ID:             hostPlayerID,
		WalletAddress:  hostWalletAddress,
		Status:         models.PlayerStatusActive,
		Balance:        1500, // Initial balance, should come from config
		Position:       0,    // Start position
		Cards:          []models.Card{},
		Properties:     []string{},
		InitialDeposit: 0,    // No deposit yet
		NetWorth:       1500, // Same as initial balance
	}

	game.Players = append(game.Players, hostPlayer)
	game.TurnOrder = []string{hostPlayerID}

	// Store in MongoDB
	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	_, err = collection.InsertOne(gm.ctx, game)
	if err != nil {
		return "", fmt.Errorf("failed to store game: %w", err)
	}

	// Create game session
	gameSession := &GameSession{
		Game:              game,
		ConnectedPlayers:  make(map[string]string),
		PlayerConnections: make(map[string]PlayerConnection),
	}

	// Add player connection
	sessionID := uuid.New().String()
	gameSession.ConnectedPlayers[hostPlayerID] = sessionID
	gameSession.PlayerConnections[sessionID] = PlayerConnection{
		PlayerID:    hostPlayerID,
		SessionID:   sessionID,
		IsConnected: true,
	}

	// Store in active games
	gm.activeGamesMutex.Lock()
	gm.activeGames[gameID.Hex()] = gameSession
	gm.activeGamesMutex.Unlock()

	gm.logger.Infof("Created new game %s with code %s and host %s", gameID.Hex(), roomCode, hostPlayerID)

	return gameID.Hex(), nil
}

// GetGame retrieves a game by ID
func (gm *GameManager) GetGame(gameID string) (*models.Game, error) {
	// Normalize gameID to lowercase
	normalizedGameID := strings.ToLower(gameID)
	//gm.logger.Debugf("GetGame: Normalized gameID from %s to %s", gameID, normalizedGameID)

	// Try to get from active games first
	gm.activeGamesMutex.RLock()
	session, exists := gm.activeGames[normalizedGameID]
	gm.activeGamesMutex.RUnlock()

	if exists {
		session.mutex.RLock()
		defer session.mutex.RUnlock()
		return session.Game, nil
	}

	// If not in active games, try to get from database
	objID, err := primitive.ObjectIDFromHex(normalizedGameID)
	if err != nil {
		// Try to find by room code if it's not a valid ObjectID
		if len(normalizedGameID) == 6 {
			gm.logger.Debugf("GetGame: Trying to find game by room code: %s", normalizedGameID)
			return gm.GetGameByRoomCode(normalizedGameID)
		}
		return nil, fmt.Errorf("invalid game ID: %w", err)
	}

	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	var game models.Game
	err = collection.FindOne(gm.ctx, bson.M{"_id": objID}).Decode(&game)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, fmt.Errorf("game not found")
		}
		return nil, fmt.Errorf("failed to get game: %w", err)
	}

	return &game, nil
}

// GetGameByRoomCode retrieves a game by room code
func (gm *GameManager) GetGameByRoomCode(roomCode string) (*models.Game, error) {
	// Normalize room code to uppercase (room codes are stored in uppercase)
	normalizedRoomCode := strings.ToUpper(roomCode)
	gm.logger.Debugf("GetGameByRoomCode: Normalized roomCode from %s to %s", roomCode, normalizedRoomCode)

	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	var game models.Game
	err := collection.FindOne(gm.ctx, bson.M{"code": normalizedRoomCode}).Decode(&game)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, fmt.Errorf("game not found with room code: %s", normalizedRoomCode)
		}
		return nil, fmt.Errorf("failed to get game by room code: %w", err)
	}

	return &game, nil
}

// JoinGame adds a player to a game
func (gm *GameManager) JoinGame(gameID, playerID, walletAddress string) (string, error) {
	// Normalize gameID to lowercase
	normalizedGameID := strings.ToLower(gameID)
	gm.logger.Debugf("JoinGame: Normalized gameID from %s to %s", gameID, normalizedGameID)

	// Get game session
	gm.activeGamesMutex.RLock()
	session, exists := gm.activeGames[normalizedGameID]
	gm.activeGamesMutex.RUnlock()

	if !exists {
		// Try to find by room code if it's not found by ID
		if len(normalizedGameID) == 6 {
			gm.logger.Debugf("JoinGame: Trying to find game by room code: %s", normalizedGameID)
			game, err := gm.GetGameByRoomCode(normalizedGameID)
			if err == nil {
				// Found game by room code, now get the session
				gm.activeGamesMutex.RLock()
				session, exists = gm.activeGames[game.ID.Hex()]
				gm.activeGamesMutex.RUnlock()

				if exists {
					normalizedGameID = game.ID.Hex()
				}
			}
		}

		if !exists {
			return "", fmt.Errorf("game session not found")
		}
	}

	session.mutex.Lock()
	defer session.mutex.Unlock()

	// Check if game is in LOBBY status
	if session.Game.Status != models.GameStatusLobby {
		return "", fmt.Errorf("cannot join game that is not in LOBBY status")
	}

	// Check if player is already in game
	for _, player := range session.Game.Players {
		if player.ID == playerID {
			// Player is already in game, generate new session ID
			sessionID := uuid.New().String()
			session.ConnectedPlayers[playerID] = sessionID
			session.PlayerConnections[sessionID] = PlayerConnection{
				PlayerID:    playerID,
				SessionID:   sessionID,
				IsConnected: true,
			}
			return sessionID, nil
		}
	}

	// Check if game is full
	if len(session.Game.Players) >= session.Game.MaxPlayers { // Use MaxPlayers from game data
		return "", fmt.Errorf("game is full")
	}

	// Create new player
	newPlayer := models.Player{
		ID:             playerID,
		WalletAddress:  walletAddress,
		Status:         models.PlayerStatusActive,
		Balance:        1500, // Initial balance, should come from config
		Position:       0,    // Start position
		Cards:          []models.Card{},
		Properties:     []string{},
		InitialDeposit: 0,    // No deposit yet
		NetWorth:       1500, // Same as initial balance
	}

	// Add player to game
	session.Game.Players = append(session.Game.Players, newPlayer)
	session.Game.TurnOrder = append(session.Game.TurnOrder, playerID)
	session.Game.UpdatedAt = time.Now()
	session.Game.LastActivity = time.Now()

	// Update game in database
	objID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return "", fmt.Errorf("invalid game ID: %w", err)
	}

	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	_, err = collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": objID},
		bson.M{
			"$set": bson.M{
				"players":      session.Game.Players,
				"turnOrder":    session.Game.TurnOrder,
				"updatedAt":    session.Game.UpdatedAt,
				"lastActivity": session.Game.LastActivity,
			},
		},
	)

	if err != nil {
		return "", fmt.Errorf("failed to update game: %w", err)
	}

	// Add player connection
	sessionID := uuid.New().String()
	session.ConnectedPlayers[playerID] = sessionID
	session.PlayerConnections[sessionID] = PlayerConnection{
		PlayerID:    playerID,
		SessionID:   sessionID,
		IsConnected: true,
	}

	gm.logger.Infof("Player %s joined game %s", playerID, gameID)

	return sessionID, nil
}

// StartGame starts a game
func (gm *GameManager) StartGame(gameID string, requestingPlayerID string) error {
	// Normalize gameID to lowercase
	normalizedGameID := strings.ToLower(gameID)
	gm.logger.Debugf("StartGame: Normalized gameID from %s to %s", gameID, normalizedGameID)

	// Get game session
	gm.activeGamesMutex.RLock()
	session, exists := gm.activeGames[normalizedGameID]
	gm.activeGamesMutex.RUnlock()

	if !exists {
		// Try to find by room code if it's not found by ID
		if len(normalizedGameID) == 6 {
			gm.logger.Debugf("StartGame: Trying to find game by room code: %s", normalizedGameID)
			game, err := gm.GetGameByRoomCode(normalizedGameID)
			if err == nil {
				// Found game by room code, now get the session
				gm.activeGamesMutex.RLock()
				session, exists = gm.activeGames[game.ID.Hex()]
				gm.activeGamesMutex.RUnlock()

				if exists {
					normalizedGameID = game.ID.Hex()
				}
			}
		}

		if !exists {
			return fmt.Errorf("game session not found")
		}
	}

	session.mutex.Lock()
	defer session.mutex.Unlock()

	// Check if game is in LOBBY status
	if session.Game.Status != models.GameStatusLobby {
		return fmt.Errorf("game is not in LOBBY status")
	}

	// Check if there are enough players
	if len(session.Game.Players) < 2 { // Minimum players should come from config
		return fmt.Errorf("not enough players to start the game")
	}

	// Verify that the requesting player is the host
	if requestingPlayerID != session.Game.HostID {
		gm.logger.Warnf("Player %s attempted to start game %s but is not the host. Host is %s",
			requestingPlayerID, gameID, session.Game.HostID)
		return fmt.Errorf("only the host can start the game")
	}

	// First, enqueue the game start operation in the message queue
	// This ensures that even if there's a connection issue during the transition,
	// the game start operation will be processed
	if gm.messageQueue != nil {
		// Create game state data for the queue
		gameStartData := map[string]interface{}{
			"gameId":    normalizedGameID,
			"hostId":    requestingPlayerID,
			"players":   session.Game.Players,
			"timestamp": time.Now().Format(time.RFC3339),
		}

		// Enqueue the game start operation
		err := gm.messageQueue.EnqueueGameStart(normalizedGameID, requestingPlayerID, gameStartData)
		if err != nil {
			gm.logger.Errorf("Failed to enqueue game start operation: %v", err)
			// Continue with the normal flow even if queue fails
		} else {
			gm.logger.Infof("Game start operation enqueued for game %s", normalizedGameID)
		}
	}

	// Set game status to ACTIVE
	// Randomize turn order before starting
	if len(session.Game.TurnOrder) > 1 {
		// Use a more modern approach for random shuffling
		r := rand.New(rand.NewSource(time.Now().UnixNano()))
		r.Shuffle(len(session.Game.TurnOrder), func(i, j int) {
			session.Game.TurnOrder[i], session.Game.TurnOrder[j] = session.Game.TurnOrder[j], session.Game.TurnOrder[i]
		})
	}
	session.Game.Status = models.GameStatusActive
	session.Game.CurrentTurn = session.Game.TurnOrder[0]
	session.Game.UpdatedAt = time.Now()
	session.Game.LastActivity = time.Now()

	// Update game in database - use UpdateGame to ensure all fields are preserved
	if updateErr := gm.UpdateGame(session.Game); updateErr != nil {
		return fmt.Errorf("failed to update game: %w", updateErr)
	}

	gm.logger.Infof("Game %s started with %d players", gameID, len(session.Game.Players))

	// Broadcast game_started event to all clients in the game
	if gm.wsHub != nil {
		// Create game state to include in the broadcast
		gameState := map[string]interface{}{
			"type":        "game_started",
			"gameId":      gameID,
			"status":      string(session.Game.Status),
			"currentTurn": session.Game.CurrentTurn,
			"players":     session.Game.Players,
			"turnOrder":   session.Game.TurnOrder,
			"timestamp":   time.Now().Format(time.RFC3339),
		}

		// Also enqueue the game state update in the message queue for resilience
		if gm.messageQueue != nil {
			err := gm.messageQueue.EnqueueGameStateUpdate(gameID, gameState)
			if err != nil {
				gm.logger.Errorf("Failed to enqueue game state update: %v", err)
			} else {
				gm.logger.Infof("Game state update enqueued for game %s", gameID)
			}
		}

		// Marshal to JSON
		msgBytes, jsonErr := json.Marshal(gameState)
		if jsonErr != nil {
			gm.logger.Errorf("Failed to marshal game_started message: %v", jsonErr)
		} else {
			// Broadcast to all clients in the game
			gm.wsHub.BroadcastToGame(gameID, msgBytes)
			gm.logger.Infof("Broadcasted game_started event to all clients in game %s", gameID)
		}

		// Immediately broadcast the first turn
		turnMsg := map[string]interface{}{
			"type":        "game_turn",
			"currentTurn": session.Game.CurrentTurn,
			"turnOrder":   session.Game.TurnOrder,
			"gameId":      gameID,
			"timestamp":   time.Now().Format(time.RFC3339),
		}
		if turnBytes, err := json.Marshal(turnMsg); err == nil {
			gm.wsHub.BroadcastToGame(gameID, turnBytes)
			gm.logger.Infof("Broadcasted game_turn event to all clients in game %s", gameID)
		} else {
			gm.logger.Errorf("Failed to marshal game_turn message: %v", err)
		}
	} else {
		gm.logger.Warnf("WebSocket hub is nil, cannot broadcast game_started event")
	}

	return nil
}

// PlayerDisconnected handles a player disconnection
// This is called by the hub when a websocket connection is closed
func (gm *GameManager) PlayerDisconnected(gameID, sessionID string) { // Reverted signature to use sessionID
	gm.logger.Debugf("[PlayerDisconnected] Called for game %s, session %s", gameID, sessionID)
	now := time.Now()

	gm.activeGamesMutex.RLock() // Use RLock first
	session, ok := gm.activeGames[gameID]
	gm.activeGamesMutex.RUnlock() // Release RLock

	if !ok {
		gm.logger.Warnf("[PlayerDisconnected] Game session %s not found for disconnected session %s", gameID, sessionID)
		// Optionally try loading from DB, but if session isn't in memory, it's unlikely useful here.
		return
	}

	session.mutex.Lock()
	defer session.mutex.Unlock()
	gm.logger.Debugf("[PlayerDisconnected] Acquired lock for game %s session", gameID)

	// Find the player ID associated with the disconnected sessionID
	connection, exists := session.PlayerConnections[sessionID]
	if !exists {
		gm.logger.Warnf("[PlayerDisconnected] Connection info for session %s not found in game %s", sessionID, gameID)
		return // Cannot proceed without knowing which player disconnected
	}
	playerID := connection.PlayerID
	gm.logger.Debugf("[PlayerDisconnected] Session %s corresponds to player %s in game %s", sessionID, playerID, gameID)

	// Mark the specific connection as inactive
	connection.IsConnected = false
	connection.DisconnectedAt = &now
	session.PlayerConnections[sessionID] = connection // Update the connection status in the map
	// Note: We don't delete the entry from PlayerConnections immediately,
	// allowing potential reconnection logic to use DisconnectedAt.
	// We *do* remove the playerID -> sessionID mapping IF this was the last active connection for the player
	// (More complex reconnection logic might handle multiple sessions per player differently)
	delete(session.ConnectedPlayers, playerID) // Remove mapping for this player
	gm.logger.Debugf("[PlayerDisconnected] Removed player %s (Session: %s) from ConnectedPlayers map for game %s", playerID, sessionID, gameID)

	// Find the player in the game's player list
	playerFound := false
	isHost := false
	activePlayersRemaining := 0

	for i := range session.Game.Players {
		// Count active players first (before potentially changing the status of the disconnected player)
		if session.Game.Players[i].Status == models.PlayerStatusActive && session.Game.Players[i].ID != playerID {
			activePlayersRemaining++
		}

		if session.Game.Players[i].ID == playerID {
			gm.logger.Debugf("[PlayerDisconnected] Found player %s in game %s players list. Current status: %s", playerID, gameID, session.Game.Players[i].Status)
			playerFound = true
			// Check if the disconnecting player was the host
			if session.Game.HostID == playerID {
				isHost = true
				gm.logger.Debugf("[PlayerDisconnected] Player %s was the host of game %s", playerID, gameID)
			}
			// Update player status in the game data
			if session.Game.Players[i].Status == models.PlayerStatusActive {
				session.Game.Players[i].Status = models.PlayerStatusDisconnected // Use DISCONNECTED status
				session.Game.Players[i].DisconnectedAt = &now                    // Set DisconnectedAt timestamp
				gm.logger.Debugf("[PlayerDisconnected] Updated player %s status to %s in game %s game data", playerID, models.PlayerStatusDisconnected, gameID)
			} else {
				gm.logger.Debugf("[PlayerDisconnected] Player %s game status was already %s, not changing", playerID, session.Game.Players[i].Status)
			}
			// Don't break; continue loop to ensure activePlayersRemaining count is accurate
		}
	}

	if !playerFound {
		gm.logger.Warnf("[PlayerDisconnected] Player %s (from session %s) not found in game session %s player list after all", playerID, sessionID, gameID)
		return // Exit if player somehow not found in the list
	}
	gm.logger.Debugf("[PlayerDisconnected] Active players remaining in game %s (excluding %s): %d", gameID, playerID, activePlayersRemaining)

	// Update the main game LastActivity timestamp
	session.Game.LastActivity = now

	newHostID := ""
	previousHostID := session.Game.HostID // Store the current host ID before potential change

	// Handle host disconnection
	if isHost {
		gm.logger.Debugf("[PlayerDisconnected] Host %s disconnected from game %s. Looking for a new host.", playerID, gameID)
		if activePlayersRemaining > 0 {
			// Find a new host among remaining active players who are still connected
			for _, p := range session.Game.Players {
				if p.Status == models.PlayerStatusActive { // Ensure they are marked active in game state
					// Check if this player has an active connection
					if sid, connected := session.ConnectedPlayers[p.ID]; connected {
						if conn, exists := session.PlayerConnections[sid]; exists && conn.IsConnected {
							newHostID = p.ID
							gm.logger.Debugf("[PlayerDisconnected] Found new host candidate %s (status: %s, connected: true) for game %s", p.ID, p.Status, gameID)
							break
						}
					}
					gm.logger.Debugf("[PlayerDisconnected] Player %s is active but not currently connected via WebSocket, cannot be host.", p.ID)
				}
			}

			if newHostID != "" {
				gm.logger.Infof("[PlayerDisconnected] Transferring host from %s to %s in game %s", playerID, newHostID, gameID)
				session.Game.HostID = newHostID
			} else {
				gm.logger.Warnf("[PlayerDisconnected] No suitable connected player found to transfer host to in game %s.", gameID)
				// Mark game as ABANDONED if host leaves and no other active+connected player is found
				gm.logger.Infof("[PlayerDisconnected] Host disconnected and no suitable new host. Marking game %s as ABANDONED.", gameID)
				session.Game.Status = models.GameStatusAbandoned
			}
		} else {
			gm.logger.Infof("[PlayerDisconnected] Host %s disconnected and no active players remain in game %s. Marking game as ABANDONED.", playerID, gameID)
			session.Game.Status = models.GameStatusAbandoned
		}
	}

	// Update game in database
	objID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		gm.logger.Errorf("[PlayerDisconnected] Invalid game ID format %s: %v", gameID, err)
		return
	}

	updateFields := bson.M{
		"players":      session.Game.Players, // Includes player with updated status and DisconnectedAt
		"updatedAt":    now,
		"lastActivity": session.Game.LastActivity, // Use the updated LastActivity timestamp
	}
	// Update hostId field only if it actually changed or game became abandoned due to host leaving
	if newHostID != "" || (isHost && session.Game.Status == models.GameStatusAbandoned) {
		updateFields["hostId"] = session.Game.HostID
		gm.logger.Debugf("[PlayerDisconnected] Preparing to update hostId to '%s' in DB for game %s", session.Game.HostID, gameID)
	}
	// Update status field only if it changed (i.e., became ABANDONED)
	if session.Game.Status == models.GameStatusAbandoned {
		updateFields["status"] = session.Game.Status
		gm.logger.Debugf("[PlayerDisconnected] Preparing to update status to '%s' in DB for game %s", session.Game.Status, gameID)
	}

	gm.logger.Debugf("[PlayerDisconnected] Attempting to update game %s in MongoDB with fields: %+v", gameID, updateFields)
	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	_, err = collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": objID},
		bson.M{"$set": updateFields},
	)
	if err != nil {
		gm.logger.Errorf("[PlayerDisconnected] Failed to update game %s in database: %v", gameID, err)
		// Continue even if DB update fails, to broadcast state
	}
	gm.logger.Debugf("[PlayerDisconnected] Successfully updated game %s in MongoDB.", gameID)

	// Broadcast updated player list and potential host change to remaining clients in the game
	// Prepare the message payload
	broadcastPlayers := make([]models.Player, 0)
	for _, p := range session.Game.Players {
		// Include players who are active or the one who just disconnected (now marked as DISCONNECTED)
		if p.Status == models.PlayerStatusActive || p.ID == playerID {
			broadcastPlayers = append(broadcastPlayers, p)
		}
	}

	updateMsg := map[string]interface{}{
		"type":         "active_players", // Keep type as active_players, frontend handles status
		"gameId":       gameID,
		"players":      broadcastPlayers,    // Send updated list including the player with DISCONNECTED status
		"hostId":       session.Game.HostID, // Send current host ID
		"previousHost": previousHostID,      // Indicate previous host if changed
		"leftPlayerId": playerID,            // Explicitly state who left
		"gameStatus":   session.Game.Status, // Send the current game status (might be ABANDONED)
	}

	msgBytes, _ := json.Marshal(updateMsg)
	gm.logger.Debugf("[PlayerDisconnected] Broadcasting player update to game %s: %s", gameID, string(msgBytes))
	if gm.wsHub != nil {
		gm.wsHub.BroadcastToGame(gameID, msgBytes)
	} else {
		gm.logger.Warnf("[PlayerDisconnected] wsHub is nil, cannot broadcast player update for game %s", gameID)
	}

	// Removed broadcastLobbyUpdate calls - rely on frontend polling for now

	gm.logger.Debugf("[PlayerDisconnected] Finished processing disconnection for player %s (Session: %s) in game %s", playerID, sessionID, gameID)

	// Optionally start a timeout goroutine for forfeiture if player doesn't reconnect
	// go gm.handleDisconnectionTimeout(gameID, playerID, sessionID) // Disabled for now
}

// handleDisconnectionTimeout handles the timeout for disconnected players
func (gm *GameManager) handleDisconnectionTimeout(gameID, playerID, sessionID string) {
	// Wait for 45 seconds (grace period for reconnection)
	time.Sleep(45 * time.Second)

	// Check if player is still disconnected
	gm.activeGamesMutex.RLock()
	session, exists := gm.activeGames[gameID]
	gm.activeGamesMutex.RUnlock()

	if !exists {
		gm.logger.Warnf("Timeout for non-existent game: %s", gameID)
		return
	}

	session.mutex.Lock()
	defer session.mutex.Unlock()

	connection, exists := session.PlayerConnections[sessionID]
	if !exists || connection.PlayerID != playerID || connection.IsConnected {
		// Session no longer exists, or player has reconnected
		return
	}

	// Player is still disconnected, mark as forfeited
	playerIndex := -1
	for i, player := range session.Game.Players {
		if player.ID == playerID {
			playerIndex = i
			break
		}
	}

	if playerIndex != -1 {
		// Update player status
		player := session.Game.Players[playerIndex]
		player.Status = models.PlayerStatusForfeited
		session.Game.Players[playerIndex] = player

		// Handle player forfeiture (redistribute assets, etc.)
		gm.handlePlayerForfeiture(session.Game, playerID)

		// Update game in database
		objID, err := primitive.ObjectIDFromHex(gameID)
		if err != nil {
			gm.logger.Errorf("Invalid game ID: %v", err)
			return
		}

		collection := gm.mongoClient.Database(gm.dbName).Collection("games")
		_, err = collection.UpdateOne(
			gm.ctx,
			bson.M{"_id": objID},
			bson.M{
				"$set": bson.M{
					"players":      session.Game.Players,
					"turnOrder":    session.Game.TurnOrder, // In case turn order changed
					"updatedAt":    time.Now(),
					"lastActivity": time.Now(),
				},
			},
		)

		if err != nil {
			gm.logger.Errorf("Failed to update game for forfeiture: %v", err)
		}

		gm.logger.Infof("Player %s forfeited game %s due to disconnection timeout", playerID, gameID)
	}
}

// handlePlayerForfeiture handles the forfeiture of a player
func (gm *GameManager) handlePlayerForfeiture(game *models.Game, playerID string) {
	// Find player's properties
	var playerProps []string
	for _, player := range game.Players {
		if player.ID == playerID {
			playerProps = player.Properties
			break
		}
	}

	// Reset properties to unowned
	for i, prop := range game.BoardState.Properties {
		for _, playerProp := range playerProps {
			if prop.ID == playerProp {
				prop.OwnerID = ""
				game.BoardState.Properties[i] = prop
			}
		}
	}

	// Remove player from turn order if they're in it
	newTurnOrder := make([]string, 0, len(game.TurnOrder))
	for _, id := range game.TurnOrder {
		if id != playerID {
			newTurnOrder = append(newTurnOrder, id)
		}
	}
	game.TurnOrder = newTurnOrder

	// If it was this player's turn, move to next player
	if game.CurrentTurn == playerID && len(newTurnOrder) > 0 {
		// Find the next player in turn order
		nextIndex := 0
		for i, id := range game.TurnOrder {
			if id == playerID {
				nextIndex = (i + 1) % len(game.TurnOrder)
				break
			}
		}
		game.CurrentTurn = game.TurnOrder[nextIndex]
	}

	// Check if game should end (e.g., only one player left)
	if len(newTurnOrder) <= 1 {
		// Set the last player as winner
		if len(newTurnOrder) == 1 {
			game.WinnerID = newTurnOrder[0]
		}
		game.Status = models.GameStatusCompleted
	}
}

// PlayerReconnected handles a player reconnection
func (gm *GameManager) PlayerReconnected(gameID, playerID, sessionID string) error {
	gm.activeGamesMutex.RLock()
	session, exists := gm.activeGames[gameID]
	gm.activeGamesMutex.RUnlock()

	if !exists {
		return fmt.Errorf("game session not found")
	}

	session.mutex.Lock()
	defer session.mutex.Unlock()

	// Check if player is in the game
	playerIndex := -1
	for i, player := range session.Game.Players {
		if player.ID == playerID {
			playerIndex = i
			break
		}
	}

	if playerIndex == -1 {
		return fmt.Errorf("player not found in game")
	}

	// Check if player status is DISCONNECTED
	if session.Game.Players[playerIndex].Status != models.PlayerStatusDisconnected {
		return fmt.Errorf("player is not in DISCONNECTED status")
	}

	// Update player status
	player := session.Game.Players[playerIndex]
	player.Status = models.PlayerStatusActive
	player.DisconnectedAt = nil
	session.Game.Players[playerIndex] = player

	// Create new player connection
	newSessionID := uuid.New().String()
	session.ConnectedPlayers[playerID] = newSessionID
	session.PlayerConnections[newSessionID] = PlayerConnection{
		PlayerID:    playerID,
		SessionID:   newSessionID,
		IsConnected: true,
	}

	// Update game in database
	objID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	_, err = collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": objID},
		bson.M{
			"$set": bson.M{
				"players":      session.Game.Players,
				"updatedAt":    time.Now(),
				"lastActivity": time.Now(),
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to update game: %w", err)
	}

	gm.logger.Infof("Player %s reconnected to game %s", playerID, gameID)

	return nil
}

// ProcessGameAction processes a game action
func (gm *GameManager) ProcessGameAction(action models.GameAction) error {
	gameID := action.GameID
	playerID := action.PlayerID

	gm.activeGamesMutex.RLock()
	session, exists := gm.activeGames[gameID]
	gm.activeGamesMutex.RUnlock()

	if !exists {
		return fmt.Errorf("game session not found")
	}

	session.mutex.Lock()
	defer session.mutex.Unlock()

	// Validate game status
	if session.Game.Status != models.GameStatusActive {
		return fmt.Errorf("game is not active")
	}

	// Check if it's player's turn (except for certain actions)
	if session.Game.CurrentTurn != playerID && !isNonTurnAction(action.Type) {
		return fmt.Errorf("not player's turn")
	}

	// Find player in game
	playerIndex := -1
	for i, player := range session.Game.Players {
		if player.ID == playerID {
			playerIndex = i
			break
		}
	}

	if playerIndex == -1 {
		return fmt.Errorf("player not found in game")
	}

	// Check if player is active
	if session.Game.Players[playerIndex].Status != models.PlayerStatusActive {
		return fmt.Errorf("player is not active")
	}

	// Process action based on type
	switch action.Type {
	case models.ActionTypeRollDice:
		return gm.processRollDiceAction(session.Game, playerID, action.Payload)
	case models.ActionTypeBuyProperty:
		return gm.processBuyPropertyAction(session.Game, playerID, action.Payload)
	case models.ActionTypePayRent:
		return gm.processPayRentAction(session.Game, playerID, action.Payload)
	case models.ActionTypeDrawCard:
		return gm.processDrawCardAction(session.Game, playerID, action.Payload)
	case models.ActionTypeUseCard:
		return gm.processUseCardAction(session.Game, playerID, action.Payload)
	case models.ActionTypeMortgageProperty:
		return gm.processMortgagePropertyAction(session.Game, playerID, action.Payload)
	case models.ActionTypeUnmortgageProperty:
		return gm.processUnmortgagePropertyAction(session.Game, playerID, action.Payload)
	case models.ActionTypeBuildEngagement:
		return gm.processBuildEngagementAction(session.Game, playerID, action.Payload)
	case models.ActionTypeBuildCheckmark:
		return gm.processBuildCheckmarkAction(session.Game, playerID, action.Payload)
	case models.ActionTypeEndTurn:
		return gm.processEndTurnAction(session.Game, playerID, action.Payload)
	case models.ActionTypeTrade:
		return gm.processTradeAction(session.Game, playerID, action.Payload)
	case models.ActionTypeSpecial:
		return gm.processSpecialAction(session.Game, playerID, action.Payload)
	default:
		return fmt.Errorf("unknown action type: %s", action.Type)
	}
}

// Helper function to check if an action can be performed outside of player's turn
func isNonTurnAction(actionType models.ActionType) bool {
	switch actionType {
	case models.ActionTypeTrade:
		return true
	default:
		return false
	}
}

// Placeholder for action processing methods
func (gm *GameManager) processRollDiceAction(game *models.Game, playerID string, payload interface{}) error {
	gm.logger.Infof("Player %s rolling dice in game %s", playerID, game.ID.Hex())

	// Generate random dice values (1-6 for each die)
	dice1 := 1 + (time.Now().UnixNano() % 6)
	time.Sleep(1 * time.Millisecond)
	dice2 := 1 + (time.Now().UnixNano() % 6)
	totalMove := int(dice1 + dice2)

	// Find the player
	playerIndex := -1
	for i, player := range game.Players {
		if player.ID == playerID {
			playerIndex = i
			break
		}
	}
	if playerIndex == -1 {
		return fmt.Errorf("player not found in game")
	}
	player := &game.Players[playerIndex]

	// Jail logic
	if player.InJail {
		if dice1 == dice2 {
			// Rolled doubles, get out of jail
			player.InJail = false
			player.JailTurns = 0
			gm.logger.Infof("Player %s rolled doubles and is released from jail!", playerID)
			// Move forward by dice roll from jail (position 25)
			player.Position = (25 + totalMove) % 40
			// Broadcast release notification
			if gm.wsHub != nil {
				msg := map[string]interface{}{
					"type":     "jail_event",
					"playerId": playerID,
					"event":    "released",
					"dice":     []int{int(dice1), int(dice2)},
				}
				if msgBytes, err := json.Marshal(msg); err == nil {
					gm.wsHub.BroadcastToGame(game.ID.Hex(), msgBytes)
				}
			}
			gm.logger.Infof("Player %s moved from jail (25) to %d", playerID, player.Position)
		} else {
			// Not doubles, decrement jail turns
			player.JailTurns--
			if player.JailTurns <= 0 {
				player.InJail = false
				player.JailTurns = 0
				// Release and move forward
				player.Position = (25 + totalMove) % 40
				gm.logger.Infof("Player %s served jail time and is released, moved from jail (25) to %d", playerID, player.Position)
				if gm.wsHub != nil {
					msg := map[string]interface{}{
						"type":     "jail_event",
						"playerId": playerID,
						"event":    "released_time",
						"dice":     []int{int(dice1), int(dice2)},
					}
					if msgBytes, err := json.Marshal(msg); err == nil {
						gm.wsHub.BroadcastToGame(game.ID.Hex(), msgBytes)
					}
				}
			} else {
				// Still in jail, do not move
				gm.logger.Infof("Player %s is still in jail, %d turns left", playerID, player.JailTurns)
				if gm.wsHub != nil {
					msg := map[string]interface{}{
						"type":      "jail_event",
						"playerId":  playerID,
						"event":     "stay",
						"jailTurns": player.JailTurns,
						"dice":      []int{int(dice1), int(dice2)},
					}
					if msgBytes, err := json.Marshal(msg); err == nil {
						gm.wsHub.BroadcastToGame(game.ID.Hex(), msgBytes)
					}
				}
			}
		}
	} else {
		// Not in jail, normal move
		oldPosition := player.Position
		newPosition := (oldPosition + totalMove) % 40
		// Check for 'Go to Jail' (position 30)
		if newPosition == 30 {
			player.Position = 25 // Jail position
			player.InJail = true
			player.JailTurns = 3
			gm.logger.Infof("Player %s landed on Go to Jail! Sent to jail (25) for 3 turns.", playerID)
			if gm.wsHub != nil {
				msg := map[string]interface{}{
					"type":      "jail_event",
					"playerId":  playerID,
					"event":     "jailed",
					"jailTurns": 3,
				}
				if msgBytes, err := json.Marshal(msg); err == nil {
					gm.wsHub.BroadcastToGame(game.ID.Hex(), msgBytes)
				}
			}
		} else {
			// Normal move
			player.Position = newPosition
		}
	}

	// Update the lastActivity time
	game.LastActivity = time.Now()
	game.UpdatedAt = time.Now()

	// Update game in database
	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	_, err := collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": game.ID},
		bson.M{
			"$set": bson.M{
				"players":      game.Players,
				"updatedAt":    game.UpdatedAt,
				"lastActivity": game.LastActivity,
			},
		},
	)
	if err != nil {
		return fmt.Errorf("failed to update game after rolling dice: %w", err)
	}

	gm.logger.Infof("Player %s rolled %d and %d, now at position %d", playerID, dice1, dice2, player.Position)

	// Store the dice values in Redis for the WebSocket hub to use
	if gm.redisClient != nil {
		diceKey := fmt.Sprintf("game:%s:player:%s:lastdice", game.ID.Hex(), playerID)
		diceValues := fmt.Sprintf("%d,%d", dice1, dice2)

		// Set the dice values with a short expiration (30 seconds should be enough)
		err := gm.redisClient.Set(gm.ctx, diceKey, diceValues, 30*time.Second).Err()
		if err != nil {
			gm.logger.Warnf("Failed to store dice values in Redis: %v", err)
		} else {
			gm.logger.Infof("Stored dice values in Redis for player %s: %s", playerID, diceValues)
		}
	}

	// --- TURN MANAGEMENT AND BROADCAST ---
	if gm.wsHub != nil {
		rolledDoubles := dice1 == dice2
		var nextPlayerID string
		if player.InJail {
			nextPlayerID = playerID // Still in jail, same player's turn
		} else if rolledDoubles {
			nextPlayerID = playerID // Player gets another turn
		} else {
			// Find next player in turn order
			nextIndex := 0
			for i, id := range game.TurnOrder {
				if id == playerID {
					nextIndex = (i + 1) % len(game.TurnOrder)
					break
				}
			}
			game.CurrentTurn = game.TurnOrder[nextIndex]
			nextPlayerID = game.CurrentTurn
			// Also update DB for currentTurn
			collection := gm.mongoClient.Database(gm.dbName).Collection("games")
			_, _ = collection.UpdateOne(
				gm.ctx,
				bson.M{"_id": game.ID},
				bson.M{"$set": bson.M{"currentTurn": game.CurrentTurn, "updatedAt": time.Now()}},
			)
		}
		// Find the next player (or current if doubles) for name
		var playerName string = "Player_" + nextPlayerID[:4]
		for _, p := range game.Players {
			if p.ID == nextPlayerID {
				playerName = "Player_" + p.ID[:4]
				break
			}
		}
		turnMsg := map[string]interface{}{
			"type":          "turn_changed",
			"currentTurn":   nextPlayerID,
			"playerName":    playerName,
			"rolledDoubles": rolledDoubles,
		}
		if msgBytes, err := json.Marshal(turnMsg); err == nil {
			gm.wsHub.BroadcastToGame(game.ID.Hex(), msgBytes)
		}
	}
	// --- END TURN MANAGEMENT ---

	return nil
}

func (gm *GameManager) processBuyPropertyAction(game *models.Game, playerID string, payload interface{}) error {
	gm.logger.Infof("Player %s attempting to buy property in game %s", playerID, game.ID.Hex())

	// Extract property ID from payload
	payloadMap, ok := payload.(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payload format")
	}

	propertyIDRaw, exists := payloadMap["propertyId"]
	if !exists {
		return fmt.Errorf("property ID not provided in payload")
	}

	propertyID, ok := propertyIDRaw.(string)
	if !ok {
		return fmt.Errorf("property ID must be a string")
	}

	// Find the player
	playerIndex := -1
	for i, player := range game.Players {
		if player.ID == playerID {
			playerIndex = i
			break
		}
	}

	if playerIndex == -1 {
		return fmt.Errorf("player not found in game")
	}

	player := &game.Players[playerIndex]

	// Find the property
	propertyIndex := -1
	for i, prop := range game.BoardState.Properties {
		if prop.ID == propertyID {
			propertyIndex = i
			break
		}
	}

	if propertyIndex == -1 {
		return fmt.Errorf("property not found in game")
	}

	property := &game.BoardState.Properties[propertyIndex]

	// Check if property is already owned
	if property.OwnerID != "" {
		return fmt.Errorf("property is already owned by player %s", property.OwnerID)
	}

	// Check if player has enough money
	if player.Balance < property.Price {
		return fmt.Errorf("insufficient funds to purchase property")
	}

	// Check if player position matches property position
	if player.Position != property.Position {
		return fmt.Errorf("player not on the property's position")
	}

	// Purchase the property
	player.Balance -= property.Price
	property.OwnerID = player.ID
	player.Properties = append(player.Properties, property.ID)

	// Update player net worth
	player.NetWorth = player.Balance // In a real implementation, this would include property values

	// Update the lastActivity time
	game.LastActivity = time.Now()
	game.UpdatedAt = time.Now()

	// Create a transaction record
	// In a real implementation, this would be stored in the database

	// Update game in database
	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	_, err := collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": game.ID},
		bson.M{
			"$set": bson.M{
				"players":      game.Players,
				"boardState":   game.BoardState,
				"updatedAt":    game.UpdatedAt,
				"lastActivity": game.LastActivity,
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to update game after buying property: %w", err)
	}

	gm.logger.Infof("Player %s successfully purchased property %s for $%d",
		playerID, property.Name, property.Price)

	return nil
}

func (gm *GameManager) processPayRentAction(game *models.Game, playerID string, payload interface{}) error {
	gm.logger.Infof("Player %s paying rent in game %s", playerID, game.ID.Hex())

	// Extract property ID from payload
	payloadMap, ok := payload.(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payload format")
	}

	propertyIDRaw, exists := payloadMap["propertyId"]
	if !exists {
		return fmt.Errorf("property ID not provided in payload")
	}

	propertyID, ok := propertyIDRaw.(string)
	if !ok {
		return fmt.Errorf("property ID must be a string")
	}

	// Find the player (payer)
	payerIndex := -1
	for i, player := range game.Players {
		if player.ID == playerID {
			payerIndex = i
			break
		}
	}

	if payerIndex == -1 {
		return fmt.Errorf("payer not found in game")
	}

	payer := &game.Players[payerIndex]

	// Find the property
	propertyIndex := -1
	for i, prop := range game.BoardState.Properties {
		if prop.ID == propertyID {
			propertyIndex = i
			break
		}
	}

	if propertyIndex == -1 {
		return fmt.Errorf("property not found in game")
	}

	property := &game.BoardState.Properties[propertyIndex]

	// Check if property is owned by someone else
	if property.OwnerID == "" {
		return fmt.Errorf("property is not owned by anyone")
	}

	if property.OwnerID == playerID {
		return fmt.Errorf("player cannot pay rent to themselves")
	}

	// Find the owner (payee)
	payeeIndex := -1
	for i, player := range game.Players {
		if player.ID == property.OwnerID {
			payeeIndex = i
			break
		}
	}

	if payeeIndex == -1 {
		return fmt.Errorf("property owner not found in game")
	}

	payee := &game.Players[payeeIndex]

	// Calculate rent amount
	rentAmount := property.RentCurrent
	if rentAmount == 0 {
		rentAmount = property.RentBase
	}

	// Apply market conditions
	switch game.MarketCondition {
	case models.MarketConditionBull:
		rentAmount = int(float64(rentAmount) * 1.5) // 50% increase in bull market
	case models.MarketConditionCrash:
		rentAmount = int(float64(rentAmount) * 0.7) // 30% decrease in crash
	}

	// Check if payer has enough money
	if payer.Balance < rentAmount {
		// In a real implementation, this would handle bankruptcy logic
		return fmt.Errorf("insufficient funds to pay rent")
	}

	// Transfer the rent
	payer.Balance -= rentAmount
	payee.Balance += rentAmount

	// Update net worth for both players
	payer.NetWorth = payer.Balance // Simplified, should include property values
	payee.NetWorth = payee.Balance // Simplified, should include property values

	// Update the lastActivity time
	game.LastActivity = time.Now()
	game.UpdatedAt = time.Now()

	// Create a transaction record
	// In a real implementation, this would be stored in the database

	// Update game in database
	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	_, err := collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": game.ID},
		bson.M{
			"$set": bson.M{
				"players":      game.Players,
				"updatedAt":    game.UpdatedAt,
				"lastActivity": game.LastActivity,
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to update game after paying rent: %w", err)
	}

	gm.logger.Infof("Player %s paid rent of $%d to player %s for property %s",
		playerID, rentAmount, payee.ID, property.Name)

	return nil
}

func (gm *GameManager) processDrawCardAction(game *models.Game, playerID string, payload interface{}) error {
	// This would implement the logic to draw a card
	return nil
}

func (gm *GameManager) processUseCardAction(game *models.Game, playerID string, payload interface{}) error {
	// This would implement the logic to use a card
	return nil
}

func (gm *GameManager) processMortgagePropertyAction(game *models.Game, playerID string, payload interface{}) error {
	// This would implement the logic to mortgage a property
	return nil
}

func (gm *GameManager) processUnmortgagePropertyAction(game *models.Game, playerID string, payload interface{}) error {
	// This would implement the logic to unmortgage a property
	return nil
}

func (gm *GameManager) processBuildEngagementAction(game *models.Game, playerID string, payload interface{}) error {
	// This would implement the logic to build an engagement
	return nil
}

func (gm *GameManager) processBuildCheckmarkAction(game *models.Game, playerID string, payload interface{}) error {
	// This would implement the logic to build a blue checkmark
	return nil
}

func (gm *GameManager) processEndTurnAction(game *models.Game, playerID string, payload interface{}) error {
	gm.logger.Infof("Player %s ending turn in game %s", playerID, game.ID.Hex())

	// Verify it's actually this player's turn
	if game.CurrentTurn != playerID {
		return fmt.Errorf("not player's turn")
	}

	// Find next player in turn order
	nextIndex := 0
	for i, id := range game.TurnOrder {
		if id == playerID {
			nextIndex = (i + 1) % len(game.TurnOrder)
			break
		}
	}

	// Set next player's turn
	game.CurrentTurn = game.TurnOrder[nextIndex]

	// Update the market condition counter if applicable
	if game.MarketCondition != models.MarketConditionNormal {
		game.MarketConditionRemainingTurns--
		if game.MarketConditionRemainingTurns <= 0 {
			// Reset market to normal
			game.MarketCondition = models.MarketConditionNormal
			gm.logger.Infof("Market condition reset to NORMAL")
		}
	}

	// Check if any players with shadowban should have it removed
	for i := range game.Players {
		player := &game.Players[i]
		if player.Shadowbanned && player.ShadowbanRemainingTurns <= 0 {
			player.Shadowbanned = false
		}
	}

	// Update the lastActivity time
	game.LastActivity = time.Now()
	game.UpdatedAt = time.Now()

	// Update game in database
	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	_, err := collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": game.ID},
		bson.M{
			"$set": bson.M{
				"currentTurn":                   game.CurrentTurn,
				"marketCondition":               game.MarketCondition,
				"marketConditionRemainingTurns": game.MarketConditionRemainingTurns,
				"players":                       game.Players,
				"updatedAt":                     game.UpdatedAt,
				"lastActivity":                  game.LastActivity,
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to update game after ending turn: %w", err)
	}

	gm.logger.Infof("Turn ended for player %s, next player is %s",
		playerID, game.CurrentTurn)

	return nil
}

func (gm *GameManager) processTradeAction(game *models.Game, playerID string, payload interface{}) error {
	// This would implement the logic to process a trade
	return nil
}

func (gm *GameManager) processSpecialAction(game *models.Game, playerID string, payload interface{}) error {
	// This would implement the logic for special actions
	return nil
}

// ListAvailableGames returns all available games that are in LOBBY, ACTIVE, or ABANDONED status
func (gm *GameManager) ListAvailableGames() ([]*models.Game, error) {
	var games []*models.Game

	// Get games from active games in memory first
	gm.activeGamesMutex.RLock()
	for _, session := range gm.activeGames {
		session.mutex.RLock()
		// Include games in LOBBY, ACTIVE, or ABANDONED status
		if session.Game.Status == models.GameStatusLobby ||
			session.Game.Status == models.GameStatusActive ||
			session.Game.Status == models.GameStatusAbandoned {
			// Create a copy to avoid race conditions
			gameCopy := *session.Game
			games = append(games, &gameCopy)
		}
		session.mutex.RUnlock()
	}
	gm.activeGamesMutex.RUnlock()

	// Then check the database for any games not in memory
	if gm.mongoClient != nil {
		collection := gm.mongoClient.Database(gm.dbName).Collection("games")

		// Find games in LOBBY, ACTIVE, or ABANDONED status
		filter := bson.M{
			"status": bson.M{
				"$in": []models.GameStatus{
					models.GameStatusLobby,
					models.GameStatusActive,
					models.GameStatusAbandoned,
				},
			},
		}

		cursor, err := collection.Find(gm.ctx, filter)
		if err != nil {
			return games, fmt.Errorf("failed to query games from database: %w", err)
		}
		defer cursor.Close(gm.ctx)

		var dbGames []models.Game
		if err := cursor.All(gm.ctx, &dbGames); err != nil {
			return games, fmt.Errorf("failed to decode games from database: %w", err)
		}

		// Check if games are already in memory
		for i := range dbGames {
			found := false
			gameID := dbGames[i].ID.Hex()

			for _, memGame := range games {
				if memGame.ID.Hex() == gameID {
					found = true
					break
				}
			}

			// If not in memory, add it
			if !found {
				games = append(games, &dbGames[i])
			}
		}
	}

	gm.logger.Infof("Found %d available games", len(games))
	return games, nil
}

// CleanupStaleGames removes stale or duplicate game records
func (gm *GameManager) CleanupStaleGames() ([]string, error) {
	gm.activeGamesMutex.Lock()
	defer gm.activeGamesMutex.Unlock()

	removedGames := []string{}

	// Get current time
	now := time.Now()

	// Track unique game IDs to identify duplicates
	uniqueGameIDs := make(map[string]bool)

	// Define timeout thresholds
	inactivityThreshold := now.Add(-24 * time.Hour)
	noJoinThreshold := now.Add(-15 * time.Minute)  // 15 minutes threshold for no joins
	noStartThreshold := now.Add(-30 * time.Minute) // 30 minutes threshold for not starting
	// We don't need this variable since we're using the connection status directly
	// hostInactiveThreshold := now.Add(-5 * time.Minute)

	// First pass - find duplicates and old games
	gamesToRemove := []string{}
	for gameID, gameSession := range gm.activeGames {
		gameSession.mutex.RLock()
		lastActivity := gameSession.Game.LastActivity
		status := gameSession.Game.Status
		createdAt := gameSession.Game.CreatedAt
		playerCount := len(gameSession.Game.Players)
		gameSession.mutex.RUnlock()

		shouldRemove := false
		removalReason := ""

		// Check if game is inactive for 24+ hours
		if lastActivity.Before(inactivityThreshold) {
			shouldRemove = true
			removalReason = "inactive for 24+ hours"
		} else if status == models.GameStatusLobby && playerCount <= 1 && createdAt.Before(noJoinThreshold) {
			// Check if game is in LOBBY and has only 1 player (host) after 15 minutes
			shouldRemove = true
			removalReason = "no players joined within 15 minutes"
		} else if status == models.GameStatusLobby && createdAt.Before(noStartThreshold) {
			// Check if game is in LOBBY after 30 minutes (not started)
			shouldRemove = true
			removalReason = "game not started within 30 minutes"
		} else {
			// Check for inactive host and transfer host status if needed
			gameSession.mutex.Lock()

			// Find the host player
			var hostPlayerID string
			if len(gameSession.Game.TurnOrder) > 0 {
				hostPlayerID = gameSession.Game.TurnOrder[0] // First player in turn order is the host
			}

			// Check if host is inactive
			if hostPlayerID != "" {
				hostSessionID, hostExists := gameSession.ConnectedPlayers[hostPlayerID]
				hostIsActive := false

				if hostExists {
					hostConnection, exists := gameSession.PlayerConnections[hostSessionID]
					if exists && hostConnection.IsConnected {
						// Host is still connected
						hostIsActive = true
					}
				}

				// If host is inactive, find a new host
				if !hostIsActive && len(gameSession.Game.Players) > 1 {
					// Find the first active player to be the new host
					newHostID := ""
					for _, player := range gameSession.Game.Players {
						if player.ID != hostPlayerID && player.Status == models.PlayerStatusActive {
							playerSessionID, exists := gameSession.ConnectedPlayers[player.ID]
							if exists {
								playerConn, exists := gameSession.PlayerConnections[playerSessionID]
								if exists && playerConn.IsConnected {
									newHostID = player.ID
									break
								}
							}
						}
					}

					// If we found a new host, update the turn order
					if newHostID != "" {
						gm.logger.Infof("Transferring host status from %s to %s in game %s",
							hostPlayerID, newHostID, gameID)

						// Move the new host to the front of the turn order
						newTurnOrder := []string{newHostID}
						for _, pid := range gameSession.Game.TurnOrder {
							if pid != newHostID {
								newTurnOrder = append(newTurnOrder, pid)
							}
						}
						gameSession.Game.TurnOrder = newTurnOrder

						// Update the game in the database
						collection := gm.mongoClient.Database(gm.dbName).Collection("games")
						_, err := collection.UpdateOne(
							gm.ctx,
							bson.M{"_id": gameSession.Game.ID},
							bson.M{"$set": bson.M{
								"turnOrder":    gameSession.Game.TurnOrder,
								"updatedAt":    time.Now(),
								"lastActivity": time.Now(),
							}},
						)

						if err != nil {
							gm.logger.Errorf("Failed to update host transfer: %v", err)
						}
					} else if status == models.GameStatusLobby {
						// If no active players and game is in lobby, remove it
						shouldRemove = true
						removalReason = "host inactive and no active players in lobby"
					}
				}
			}

			gameSession.mutex.Unlock()
		}

		if shouldRemove {
			gamesToRemove = append(gamesToRemove, gameID)
			removedGames = append(removedGames, gameID)

			// Update game status in database to COMPLETED
			if gm.mongoClient != nil {
				collection := gm.mongoClient.Database(gm.dbName).Collection("games")
				_, err := collection.UpdateOne(
					gm.ctx,
					bson.M{"_id": gameSession.Game.ID},
					bson.M{"$set": bson.M{
						"status":    models.GameStatusCompleted,
						"updatedAt": time.Now(),
					}},
				)

				if err != nil {
					gm.logger.Errorf("Failed to update stale game status: %v", err)
				} else {
					gm.logger.Infof("Removed game %s: %s", gameID, removalReason)
				}
			}

			continue
		}

		// Check for duplicates (store first occurrence, mark others for removal)
		lowercaseID := strings.ToLower(gameID)
		if uniqueGameIDs[lowercaseID] {
			gamesToRemove = append(gamesToRemove, gameID)
			removedGames = append(removedGames, gameID)
			gm.logger.Infof("Removed game %s: duplicate ID", gameID)
		} else {
			uniqueGameIDs[lowercaseID] = true
		}
	}

	// Second pass - remove the identified games
	for _, gameID := range gamesToRemove {
		delete(gm.activeGames, gameID)
	}

	gm.logger.Infof("Cleaned up %d stale/duplicate games", len(removedGames))

	// If the storage implementation is available, remove the games from there too
	if gm.storage != nil && len(removedGames) > 0 {
		if err := gm.storage.RemoveGames(removedGames); err != nil {
			gm.logger.Errorf("Failed to remove games from storage: %v", err)
		}
	}

	return removedGames, nil
}

// RemoveGameSession removes a game session from the active games map
// This is typically called when a game ends or should be cleaned up
func (gm *GameManager) RemoveGameSession(gameID string) {
	gm.activeGamesMutex.Lock()
	defer gm.activeGamesMutex.Unlock()

	if _, exists := gm.activeGames[gameID]; exists {
		delete(gm.activeGames, gameID)
		gm.logger.Infof("Removed game session %s from active games map", gameID)
	} else {
		gm.logger.Warnf("Attempted to remove non-existent game session %s from active games map", gameID)
	}

	// TODO: Optionally, add logic here to also mark the game as finished/archived in the database if needed
	// For now, just removes from the active sessions list
}

// PlayerConnected is called by the hub when a player's WebSocket connects successfully.
// It updates the GameSession state to track the connection.
func (gm *GameManager) PlayerConnected(gameID, playerID, sessionID string) {
	gm.logger.Debugf("[PlayerConnected] Called for game %s, player %s, session %s", gameID, playerID, sessionID)

	gm.activeGamesMutex.RLock()
	session, ok := gm.activeGames[gameID]
	gm.activeGamesMutex.RUnlock()

	if !ok {
		gm.logger.Warnf("[PlayerConnected] Game session %s not found in memory for player %s, session %s. Loading from DB.", gameID, playerID, sessionID)
		// Attempt to load from DB if not in memory (e.g., after a server restart where game was active)
		var err error
		gameData, err := gm.GetGame(gameID)
		if err != nil {
			gm.logger.Errorf("[PlayerConnected] Failed to load game data %s from DB: %v", gameID, err)
			return
		}
		if gameData == nil {
			gm.logger.Errorf("[PlayerConnected] Game data %s not found in DB for player %s session %s", gameID, playerID, sessionID)
			return
		}

		// Create and store the session in memory
		session = &GameSession{
			Game:              gameData,
			ConnectedPlayers:  make(map[string]string),
			PlayerConnections: make(map[string]PlayerConnection),
		}
		gm.activeGamesMutex.Lock()
		gm.activeGames[gameID] = session
		gm.activeGamesMutex.Unlock()
		gm.logger.Debugf("[PlayerConnected] Loaded game session %s from DB and added to memory", gameID)
	}

	session.mutex.Lock()
	defer session.mutex.Unlock()
	gm.logger.Debugf("[PlayerConnected] Acquired lock for game %s session", gameID)

	// --- Update connection tracking ---
	// Store sessionID -> connection info
	session.PlayerConnections[sessionID] = PlayerConnection{
		PlayerID:    playerID,
		SessionID:   sessionID,
		IsConnected: true,
	}
	// Store playerID -> sessionID (reverse lookup)
	session.ConnectedPlayers[playerID] = sessionID

	gm.logger.Debugf("[PlayerConnected] Updated connection maps for game %s: Player %s linked to Session %s", gameID, playerID, sessionID)

	// --- Update player status in game data ---
	playerFound := false
	for i := range session.Game.Players {
		if session.Game.Players[i].ID == playerID {
			if session.Game.Players[i].Status != models.PlayerStatusActive {
				gm.logger.Infof("[PlayerConnected] Updating player %s status from %s to ACTIVE in game %s", playerID, session.Game.Players[i].Status, gameID)
				session.Game.Players[i].Status = models.PlayerStatusActive
				// Optionally save this change immediately or let it be saved on next action
				// For now, let's assume it gets saved later to avoid excessive DB writes.
			} else {
				gm.logger.Debugf("[PlayerConnected] Player %s already ACTIVE in game %s", playerID, gameID)
			}
			playerFound = true
			break
		}
	}

	if !playerFound {
		gm.logger.Warnf("[PlayerConnected] Player %s not found in game %s player list after connection", playerID, gameID)
		// This might happen if the player connected via WS before their JoinGame API call completed fully.
		// Depending on requirements, might need to handle this case more robustly.
	}

	gm.logger.Debugf("[PlayerConnected] Finished processing for game %s, player %s, session %s", gameID, playerID, sessionID)
}

// UpdateGame updates a game in the database and in memory
func (gm *GameManager) UpdateGame(game *models.Game) error {
	if game == nil {
		return fmt.Errorf("game is nil")
	}

	// Update game in database
	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	game.UpdatedAt = time.Now()
	game.LastActivity = time.Now()

	_, err := collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": game.ID},
		bson.M{
			"$set": game,
		},
	)

	if err != nil {
		return fmt.Errorf("failed to update game in database: %w", err)
	}

	// Update game in memory if it exists in active games
	gm.activeGamesMutex.RLock()
	session, exists := gm.activeGames[game.ID.Hex()]
	gm.activeGamesMutex.RUnlock()

	if exists {
		session.mutex.Lock()
		session.Game = game
		session.mutex.Unlock()
		gm.logger.Infof("Updated game %s in memory", game.ID.Hex())
	}

	return nil
}
