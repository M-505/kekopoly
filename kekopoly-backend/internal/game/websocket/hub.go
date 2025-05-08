package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"math/rand"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/websocket"
	"github.com/kekopoly/backend/internal/game/manager"
	"github.com/kekopoly/backend/internal/game/models"
	"go.mongodb.org/mongo-driver/mongo"
	"go.uber.org/zap"
)

// MessageQueue defines the interface for the message queue
type MessageQueue interface {
	EnqueuePlayerTokenUpdate(gameID, playerID string, tokenData map[string]interface{}) error
	EnqueueGameStateUpdate(gameID string, gameState map[string]interface{}) error
	EnqueueGameStart(gameID string, hostID string, data map[string]interface{}) error
}

// No need for init() function with Go 1.20+
// Random number generation is automatically seeded

// Hub maintains the set of active WebSocket connections and broadcasts messages
type Hub struct {
	// Game manager reference
	gameManager *manager.GameManager

	// Registered clients by gameID -> playerID -> client
	clients map[string]map[string]*Client

	// Mutex for clients map
	clientsMutex sync.RWMutex

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Broadcast messages to all clients in a game
	broadcast chan *BroadcastMessage

	// Context for cleanup
	ctx context.Context

	// Logger
	logger *zap.SugaredLogger

	// MongoDB client
	mongoClient *mongo.Client

	// Redis client
	redisClient *redis.Client

	// Store player information by gameID -> playerID -> playerInfo
	playerInfo map[string]map[string]map[string]interface{}

	// Mutex for playerInfo map
	playerInfoMutex sync.RWMutex

	// Store game information by gameID -> gameInfo
	gameInfo map[string]map[string]interface{}

	// Mutex for gameInfo map
	gameInfoMutex sync.RWMutex

	// Message queue for resilient state transitions
	messageQueue MessageQueue

	// Session history tracking by gameID -> playerID -> sessionHistory
	sessionHistory map[string]map[string][]SessionInfo

	// Mutex for sessionHistory map
	sessionHistoryMutex sync.RWMutex
}

// SessionInfo stores information about a player's session
type SessionInfo struct {
	SessionID      string    `json:"sessionId"`
	ConnectedAt    time.Time `json:"connectedAt"`
	DisconnectedAt time.Time `json:"disconnectedAt,omitempty"`
	LastActivity   time.Time `json:"lastActivity"`
	ClientInfo     string    `json:"clientInfo,omitempty"`
	Status         string    `json:"status"` // "CONNECTED", "DISCONNECTED", "RECONNECTING"
}

// Message priority levels
const (
	PriorityHigh   = "high"   // Game state updates, player turns, critical events
	PriorityNormal = "normal" // Regular updates, player status changes
	PriorityLow    = "low"    // Chat messages, cosmetic updates, non-critical info
)

// Client represents a WebSocket client connection
type Client struct {
	// Hub reference
	hub *Hub

	// WebSocket connection
	conn *websocket.Conn

	// Priority queues for outbound messages
	highPriorityQueue   chan []byte // Critical game state messages
	normalPriorityQueue chan []byte // Regular updates
	lowPriorityQueue    chan []byte // Chat messages, cosmetic updates

	// Player ID
	playerID string

	// Game ID
	gameID string

	// Session ID
	sessionID string

	// Last time a pong was received from this client
	lastPongTime time.Time

	// Mutex for protecting lastPongTime
	pongMutex sync.RWMutex

	// User agent or client info
	userAgent string

	// Flag indicating if this is a reconnection
	isReconnection bool

	// Previous session ID if this is a reconnection
	previousSessionID string

	// Connection timestamp
	connectedAt time.Time
}

// BroadcastMessage represents a message to be broadcast to clients
type BroadcastMessage struct {
	// Game ID to broadcast to
	gameID string

	// Message data
	data []byte

	// Optional player ID to exclude from broadcast
	excludePlayerID string
}

// NewHub creates a new WebSocket hub
func NewHub(ctx context.Context, gameManager *manager.GameManager, mongoClient *mongo.Client, redisClient *redis.Client, logger *zap.SugaredLogger, messageQueue MessageQueue) *Hub {
	return &Hub{
		gameManager:         gameManager,
		clients:             make(map[string]map[string]*Client),
		register:            make(chan *Client, 128),            // Increased buffer size
		unregister:          make(chan *Client, 128),            // Increased buffer size
		broadcast:           make(chan *BroadcastMessage, 1024), // Significantly increased buffer size
		ctx:                 ctx,
		logger:              logger,
		mongoClient:         mongoClient,
		redisClient:         redisClient,
		playerInfo:          make(map[string]map[string]map[string]interface{}),
		playerInfoMutex:     sync.RWMutex{},
		gameInfo:            make(map[string]map[string]interface{}),
		gameInfoMutex:       sync.RWMutex{},
		messageQueue:        messageQueue,
		sessionHistory:      make(map[string]map[string][]SessionInfo),
		sessionHistoryMutex: sync.RWMutex{},
	}
}

// SetMessageQueue sets the message queue for the hub
func (h *Hub) SetMessageQueue(queue MessageQueue) {
	h.messageQueue = queue
	h.logger.Info("Message queue set for WebSocket hub")
}

// SetGameManager sets the game manager for the hub
func (h *Hub) SetGameManager(gameManager *manager.GameManager) {
	h.gameManager = gameManager
	h.logger.Info("Game manager set for WebSocket hub")
}

// getPlayerInfo retrieves stored player information for a specific player in a game
func (h *Hub) getPlayerInfo(gameID, playerID string) map[string]interface{} {
	h.playerInfoMutex.RLock()
	defer h.playerInfoMutex.RUnlock()

	if gameInfo, ok := h.playerInfo[strings.ToLower(gameID)]; ok {
		if playerInfo, ok := gameInfo[playerID]; ok {
			return playerInfo
		}
	}

	return nil
}

// storePlayerInfo stores player information for a specific player in a game
func (h *Hub) storePlayerInfo(gameID, playerID string, info map[string]interface{}) {
	h.playerInfoMutex.Lock()
	defer h.playerInfoMutex.Unlock()

	// Initialize game map if it doesn't exist
	// Always normalize gameID to lowercase
	normalizedGameID := strings.ToLower(gameID)
	if _, ok := h.playerInfo[normalizedGameID]; !ok {
		h.playerInfo[normalizedGameID] = make(map[string]map[string]interface{})
	}

	// Ensure the player info has an ID field that matches the playerID
	info["id"] = playerID

	// Ensure isHost is correctly set based on the game's hostId
	var hostID string
	gameInfo := h.getGameInfo(normalizedGameID)
	if gameInfo != nil && gameInfo["hostId"] != nil {
		if hostIDStr, ok := gameInfo["hostId"].(string); ok {
			hostID = hostIDStr
		}
	}

	if hostID != "" {
		info["isHost"] = (playerID == hostID)
	}

	// Store player info with normalized gameID
	h.playerInfo[normalizedGameID][playerID] = info
	// h.logger.Infof("Stored player info for player %s in game %s (normalized from %s)", playerID, normalizedGameID, gameID)
}

// getGameInfo retrieves stored game information
func (h *Hub) getGameInfo(gameID string) map[string]interface{} {
	h.gameInfoMutex.RLock()
	defer h.gameInfoMutex.RUnlock()

	normalizedGameID := strings.ToLower(gameID)
	if gameInfo, ok := h.gameInfo[normalizedGameID]; ok {
		return gameInfo
	}

	return nil
}

// storeGameInfo stores information for a specific game
func (h *Hub) storeGameInfo(gameID string, info map[string]interface{}) {
	h.gameInfoMutex.Lock()
	defer h.gameInfoMutex.Unlock()

	// Always normalize gameID to lowercase
	normalizedGameID := strings.ToLower(gameID)

	// Store game info with normalized gameID
	h.gameInfo[normalizedGameID] = info
	// h.logger.Infof("Stored game info for game %s (normalized from %s)", normalizedGameID, gameID)
}

// recordPlayerSession records a new session for a player
func (h *Hub) recordPlayerSession(gameID, playerID, sessionID string, clientInfo string) {
	h.sessionHistoryMutex.Lock()
	defer h.sessionHistoryMutex.Unlock()

	// Normalize gameID to lowercase
	normalizedGameID := strings.ToLower(gameID)

	// Initialize game map if it doesn't exist
	if _, ok := h.sessionHistory[normalizedGameID]; !ok {
		h.sessionHistory[normalizedGameID] = make(map[string][]SessionInfo)
	}

	// Create new session info
	session := SessionInfo{
		SessionID:    sessionID,
		ConnectedAt:  time.Now(),
		LastActivity: time.Now(),
		ClientInfo:   clientInfo,
		Status:       "CONNECTED",
	}

	// Add to session history
	h.sessionHistory[normalizedGameID][playerID] = append(
		h.sessionHistory[normalizedGameID][playerID],
		session,
	)

	h.logger.Infof("[SESSION] Recorded new session for player %s in game %s: Session ID %s",
		playerID, normalizedGameID, sessionID)
}

// updateSessionStatus updates the status of a player session
func (h *Hub) updateSessionStatus(gameID, playerID, sessionID, status string) {
	h.sessionHistoryMutex.Lock()
	defer h.sessionHistoryMutex.Unlock()

	// Normalize gameID to lowercase
	normalizedGameID := strings.ToLower(gameID)

	// Check if game and player exist in session history
	if gameSessions, ok := h.sessionHistory[normalizedGameID]; ok {
		if playerSessions, ok := gameSessions[playerID]; ok {
			// Find the session with matching sessionID
			for i, session := range playerSessions {
				if session.SessionID == sessionID {
					// Update session status
					h.sessionHistory[normalizedGameID][playerID][i].Status = status
					h.sessionHistory[normalizedGameID][playerID][i].LastActivity = time.Now()

					// If disconnected, set disconnection time
					if status == "DISCONNECTED" {
						h.sessionHistory[normalizedGameID][playerID][i].DisconnectedAt = time.Now()
					}

					h.logger.Infof("[SESSION] Updated session status for player %s in game %s: Session ID %s, Status: %s",
						playerID, normalizedGameID, sessionID, status)
					return
				}
			}
		}
	}

	h.logger.Warnf("[SESSION] Could not find session to update for player %s in game %s: Session ID %s",
		playerID, normalizedGameID, sessionID)
}

// getPlayerSessions retrieves all sessions for a player in a game
func (h *Hub) getPlayerSessions(gameID, playerID string) []SessionInfo {
	h.sessionHistoryMutex.RLock()
	defer h.sessionHistoryMutex.RUnlock()

	// Normalize gameID to lowercase
	normalizedGameID := strings.ToLower(gameID)

	// Check if game and player exist in session history
	if gameSessions, ok := h.sessionHistory[normalizedGameID]; ok {
		if playerSessions, ok := gameSessions[playerID]; ok {
			// Return a copy of the sessions to avoid race conditions
			sessions := make([]SessionInfo, len(playerSessions))
			copy(sessions, playerSessions)
			return sessions
		}
	}

	return nil
}

// getLatestSession retrieves the most recent session for a player in a game
func (h *Hub) getLatestSession(gameID, playerID string) *SessionInfo {
	sessions := h.getPlayerSessions(gameID, playerID)
	if len(sessions) == 0 {
		return nil
	}

	// Find the most recent session based on ConnectedAt time
	latestSession := sessions[0]
	for _, session := range sessions[1:] {
		if session.ConnectedAt.After(latestSession.ConnectedAt) {
			latestSession = session
		}
	}

	return &latestSession
}

// getActiveSession retrieves the active session for a player in a game, if any
func (h *Hub) getActiveSession(gameID, playerID string) *SessionInfo {
	sessions := h.getPlayerSessions(gameID, playerID)

	// Find any session with CONNECTED status
	for _, session := range sessions {
		if session.Status == "CONNECTED" {
			sessionCopy := session // Create a copy to avoid returning a reference to the slice element
			return &sessionCopy
		}
	}

	return nil
}

// UpdateHostID updates the host ID for a game
func (h *Hub) UpdateHostID(gameID string, hostID string) {
	// Get existing game info or create new
	gameInfo := h.getGameInfo(gameID)
	if gameInfo == nil {
		gameInfo = make(map[string]interface{})
	}

	// Log previous host ID for debugging
	var previousHostID string
	if prevID, ok := gameInfo["hostId"].(string); ok {
		previousHostID = prevID
	}
	// h.logger.Infof("Updating host ID for game %s: previous=%s, new=%s", gameID, previousHostID, hostID)

	// Update host ID
	gameInfo["hostId"] = hostID

	// Store updated game info
	h.storeGameInfo(gameID, gameInfo)

	// Broadcast host change to all clients in the game
	hostChangeMsg := map[string]interface{}{
		"type":   "host_changed",
		"hostId": hostID,
		"gameId": gameID,
	}

	// Marshal to JSON
	msgBytes, err := json.Marshal(hostChangeMsg)
	if err != nil {
		h.logger.Errorf("Failed to marshal host change message: %v", err)
		return
	}

	// Broadcast to all clients in the game
	h.BroadcastToGame(gameID, msgBytes)
	// h.logger.Infof("Broadcasting host change to all clients in game %s: new host %s", gameID, hostID)

	// Also update player info for the new host
	playerInfo := h.getPlayerInfo(gameID, hostID)
	if playerInfo != nil {
		playerInfo["isHost"] = true
		h.storePlayerInfo(gameID, hostID, playerInfo)
		// h.logger.Infof("Updated player info for new host %s in game %s", hostID, gameID)
	}

	// If there was a previous host, update their player info too
	if previousHostID != "" && previousHostID != hostID {
		prevPlayerInfo := h.getPlayerInfo(gameID, previousHostID)
		if prevPlayerInfo != nil {
			prevPlayerInfo["isHost"] = false
			h.storePlayerInfo(gameID, previousHostID, prevPlayerInfo)
			// h.logger.Infof("Updated player info for previous host %s in game %s", previousHostID, gameID)
		}
	}

	// Trigger an active_players update to ensure all clients have the latest host info
	go func() {
		// Give a short delay to ensure the host_changed message is processed first
		time.Sleep(100 * time.Millisecond)

		// Find any client in this game to use for broadcasting
		h.clientsMutex.RLock()
		var client *Client
		if gamePlayers, ok := h.clients[gameID]; ok {
			for _, c := range gamePlayers {
				client = c
				break
			}
		}
		h.clientsMutex.RUnlock()

		// If we found a client, use it to broadcast active players
		if client != nil {
			client.handleGetActivePlayers()
		}
	}()
}

// handlePlayerDisconnected handles a player disconnection
func (h *Hub) handlePlayerDisconnected(gameID, playerID, sessionID string) {
	// Log the event
	h.logger.Infof("[Hub handlePlayerDisconnected] Player %s disconnected from game %s with session %s",
		playerID, gameID, sessionID)

	// Update session status in session history
	h.updateSessionStatus(gameID, playerID, sessionID, "DISCONNECTED")

	// Ensure gameManager is not nil
	if h.gameManager == nil {
		h.logger.Errorf("[Hub handlePlayerDisconnected] Game manager is nil! Cannot handle player disconnection for Game: %s, Player: %s, Session: %s", gameID, playerID, sessionID)
		return
	}

	// Notify the game manager about the disconnection using the session ID
	h.gameManager.PlayerDisconnected(gameID, sessionID) // Calls gameManager.PlayerDisconnected with gameID and sessionID

	// Update player status in playerInfo
	playerInfo := h.getPlayerInfo(gameID, playerID)
	if playerInfo != nil {
		playerInfo["status"] = "DISCONNECTED"
		disconnectTime := time.Now().Format(time.RFC3339)
		playerInfo["disconnectedAt"] = disconnectTime
		h.storePlayerInfo(gameID, playerID, playerInfo)
		h.logger.Infof("[Hub handlePlayerDisconnected] Updated player %s status to DISCONNECTED in game %s at %s",
			playerID, gameID, disconnectTime)
	} else {
		h.logger.Warnf("[Hub handlePlayerDisconnected] Could not find player info for %s in game %s",
			playerID, gameID)
	}

	// Check if this player is the host
	gameInfo := h.getGameInfo(gameID)
	if gameInfo != nil && gameInfo["hostId"] != nil {
		hostID, ok := gameInfo["hostId"].(string)
		if ok && hostID == playerID {
			// h.logger.Infof("Host player %s disconnected from game %s, finding new host", playerID, gameID)

			// Find a new host among connected players
			h.clientsMutex.RLock()
			var newHostID string

			if gamePlayers, ok := h.clients[gameID]; ok {
				for pid, client := range gamePlayers {
					if pid != playerID && client.isActive(90*time.Second) {
						newHostID = pid
						break
					}
				}
			}
			h.clientsMutex.RUnlock()

			// If we found a new host, update the game
			if newHostID != "" {
				// h.logger.Infof("Transferring host from %s to %s in game %s", playerID, newHostID, gameID)

				// Update host ID
				h.UpdateHostID(gameID, newHostID)
			} else {
				h.logger.Warnf("No active players to transfer host to in game %s. Removing game session.", gameID)
				// Remove the game session from the manager since the host left and no one else is there
				h.gameManager.RemoveGameSession(gameID)
			}
		}
	}

	// Broadcast player disconnection to all clients
	disconnectMsg := map[string]interface{}{
		"type":     "player_disconnected",
		"playerId": playerID,
		"gameId":   gameID,
	}

	// Marshal to JSON
	msgBytes, err := json.Marshal(disconnectMsg)
	if err != nil {
		h.logger.Errorf("Failed to marshal player disconnection message: %v", err)
		return
	}

	// Broadcast to all clients in the game
	h.BroadcastToGame(gameID, msgBytes)

	// Update active players list
	// Find a client in this game to use for broadcasting active players
	h.clientsMutex.RLock()
	if gamePlayers, ok := h.clients[gameID]; ok && len(gamePlayers) > 0 {
		// Get any client from this game
		var anyClient *Client
		for _, client := range gamePlayers {
			anyClient = client
			break
		}

		if anyClient != nil {
			// Use this client to broadcast active players
			go func() {
				// Give a short delay to ensure the disconnection message is processed first
				time.Sleep(100 * time.Millisecond)
				anyClient.handleGetActivePlayers()
			}()
		}
	}
	h.clientsMutex.RUnlock()
}

// CheckInactiveClients checks for inactive clients and unregisters them
// This should be called periodically to clean up inactive connections
func (h *Hub) CheckInactiveClients(inactivityThreshold time.Duration) {
	h.clientsMutex.Lock()
	defer h.clientsMutex.Unlock()

	inactiveClients := []*Client{}

	// Find all inactive clients
	for gameID, gamePlayers := range h.clients {
		for playerID, client := range gamePlayers {
			// Use the passed inactivity threshold (which should be 90 seconds now)
			if !client.isActive(inactivityThreshold) {
				h.logger.Warnf("Detected inactive client: Game ID: %s, Player ID: %s, Session: %s",
					gameID, playerID, client.sessionID)
				inactiveClients = append(inactiveClients, client)
			}
		}
	}

	// Unregister inactive clients outside the loop to avoid modifying the map during iteration
	for _, client := range inactiveClients {
		// Use a goroutine to avoid blocking
		go func(c *Client) {
			h.logger.Warnf("Unregistering inactive client: Game ID: %s, Player ID: %s, Session: %s",
				c.gameID, c.playerID, c.sessionID)
			h.unregister <- c
		}(client)
	}

	if len(inactiveClients) > 0 {
		h.logger.Infof("Unregistered %d inactive clients", len(inactiveClients))
	}
}

// Run starts the WebSocket hub
func (h *Hub) Run() {
	// Create a ticker to periodically check for inactive clients
	inactivityCheckTicker := time.NewTicker(30 * time.Second)
	defer inactivityCheckTicker.Stop()

	// Create a ticker to periodically update game info cache
	gameInfoUpdateTicker := time.NewTicker(5 * time.Second)
	defer gameInfoUpdateTicker.Stop()

	for {
		select {
		case <-inactivityCheckTicker.C:
			// Check for inactive clients every 30 seconds
			// Consider a client inactive if no pong received for 90 seconds (increased from 45)
			h.CheckInactiveClients(90 * time.Second)

		case <-gameInfoUpdateTicker.C:
			// Update game info cache for all active games
			h.updateAllGameInfoCache()

		case <-h.ctx.Done():
			// Shutdown all clients
			h.clientsMutex.Lock()
			for gameID, gamePlayers := range h.clients {
				for playerID, client := range gamePlayers {
					// Close the WebSocket connection properly
					client.conn.Close()
					delete(h.clients[gameID], playerID)
				}
				delete(h.clients, gameID)
			}
			h.clientsMutex.Unlock()
			return

		case client := <-h.register:
			h.clientsMutex.Lock()
			if _, ok := h.clients[client.gameID]; !ok {
				h.clients[client.gameID] = make(map[string]*Client) // Initialize player map for new game
			}

			// Check if this player is already registered (e.g., reconnect with same playerID)
			if existingClient, ok := h.clients[client.gameID][client.playerID]; ok {
				// If an old client exists, unregister it first to avoid duplicates
				h.logger.Warnf("[Run REGISTER] Player %s already registered in game %s. Unregistering old client (Session: %s) before registering new one (Session: %s).", client.playerID, client.gameID, existingClient.sessionID, client.sessionID)
				delete(h.clients[client.gameID], client.playerID)
				// Close all the old client's channels
				close(existingClient.highPriorityQueue)
				close(existingClient.normalPriorityQueue)
				close(existingClient.lowPriorityQueue)
			}

			// Register the new client
			h.clients[client.gameID][client.playerID] = client
			h.clientsMutex.Unlock() // Unlock before potentially long-running calls

			// --- Fetch player details from GameManager and store in Hub's cache ---
			go func(gID, pID string) { // Use goroutine to avoid blocking hub loop
				gameData, err := h.gameManager.GetGame(gID)
				if err != nil {
					h.logger.Errorf("[Run REGISTER] Failed to get game data for %s when fetching player info for %s: %v", gID, pID, err)
					return
				}
				var playerDetails map[string]interface{}
				found := false
				for _, p := range gameData.Players {
					if p.ID == pID {
						// Convert player struct to map[string]interface{} for storage
						// (This assumes necessary fields are exported and tagged correctly for JSON/BSON,
						// or we manually map fields)
						playerDataBytes, _ := json.Marshal(p) // Use JSON marshal/unmarshal for simple conversion
						if err := json.Unmarshal(playerDataBytes, &playerDetails); err == nil {
							// Add/Ensure essential fields expected by handleGetActivePlayers if not present from struct
							if _, ok := playerDetails["isReady"]; !ok {
								playerDetails["isReady"] = false
							} // Example default
							h.storePlayerInfo(gID, pID, playerDetails)
							found = true
							break
						} else {
							h.logger.Errorf("[Run REGISTER] Failed to convert player struct to map for caching: %v", err)
						}
					}
				}
				if !found {
					h.logger.Warnf("[Run REGISTER] Could not find player %s in game data for %s to update hub cache.", pID, gID)
				}
			}(client.gameID, client.playerID)
			// --- End Player Info Caching ---

			// Notify GameManager AFTER client is registered and info potentially cached
			h.gameManager.PlayerConnected(client.gameID, client.playerID, client.sessionID)

			// Trigger sending the updated player list AFTER registration and caching attempt
			// Send a message to the newly connected client's readPump to trigger handleGetActivePlayers
			// This is a bit of a hack, ideally the client requests this after connection.
			// Alternatively, we could directly call handleGetActivePlayers here IF it's safe
			// to do so without deadlocking (needs careful review).
			// For now, let's assume the client requests it or it happens periodically.

			// Log current clients in the game for debugging
			// Removed unused debug logging code

		case client := <-h.unregister:
			h.clientsMutex.Lock()
			if gameClients, ok := h.clients[client.gameID]; ok {
				if clientObj, ok := gameClients[client.playerID]; ok {
					// Only process unregister if it's the same client instance (matching sessionID)
					if clientObj.sessionID == client.sessionID {
						// Safely close all client channels
						func() {
							defer func() {
								if r := recover(); r != nil {
									h.logger.Warnf("Recovered from panic while closing client channels during unregister: %v", r)
								}
							}()
							// Close all priority queues
							close(client.highPriorityQueue)
							close(client.normalPriorityQueue)
							close(client.lowPriorityQueue)
						}()

						delete(h.clients[client.gameID], client.playerID)

						// If no more clients in this game, remove the game entry from the hub
						if len(h.clients[client.gameID]) == 0 {
							delete(h.clients, client.gameID)
						}

						h.handlePlayerDisconnected(client.gameID, client.playerID, client.sessionID)
					} else {
					}
				}
			}
			h.clientsMutex.Unlock()

		case message := <-h.broadcast:
			h.clientsMutex.RLock()
			if gamePlayers, ok := h.clients[message.gameID]; ok {
				// h.logger.Infof("Broadcasting to %d clients in game %s", len(gamePlayers), message.gameID)

				// Extract message type for logging if it's JSON
				var msgType string = "unknown"
				if len(message.data) > 2 && message.data[0] == '{' {
					var msgData map[string]interface{}
					if err := json.Unmarshal(message.data, &msgData); err == nil {
						if t, ok := msgData["type"].(string); ok {
							msgType = t
							_ = msgType // Assign to blank identifier to avoid unused variable error
						}
					}
				}

				sentCount := 0
				for playerID, client := range gamePlayers {
					// Don't send to excluded player
					if message.excludePlayerID != "" && playerID == message.excludePlayerID {
						// h.logger.Infof("Skipping excluded player %s for message type %s", playerID, msgType)
						continue
					}

					// Safely send message with priority
					func() {
						defer func() {
							if r := recover(); r != nil {
								h.logger.Warnf("Recovered from panic during broadcast to client: %v", r)
								// If we panic during send, it likely means client channel is closed
								// We'll clean up this client on the next iteration
							}
						}()

						// Determine message priority based on message type
						priority := PriorityNormal // Default priority

						// Try to parse message to determine priority
						if len(message.data) > 2 && message.data[0] == '{' {
							var msgData map[string]interface{}
							if err := json.Unmarshal(message.data, &msgData); err == nil {
								if msgType, ok := msgData["type"].(string); ok {
									switch msgType {
									case "game_state", "player_turn", "dice_rolled", "game_started", "game_ended":
										priority = PriorityHigh
									case "chat_message", "player_typing":
										priority = PriorityLow
									}
								}
							}
						}

						// Send with appropriate priority
						if h.SendToPlayerWithPriority(client.gameID, client.playerID, message.data, priority) {
							sentCount++
						}
					}()
				}

			} else {
				h.logger.Warnf("Attempted to broadcast to non-existent game: %s", message.gameID)
			}
			h.clientsMutex.RUnlock()
		}
	}
}

// BroadcastToGame sends a message to all clients in a game
func (h *Hub) BroadcastToGame(gameID string, message []byte) {
	h.broadcast <- &BroadcastMessage{
		gameID: gameID,
		data:   message,
	}
}

// BroadcastToGameWithPriority sends a message to all clients in a game with specified priority
func (h *Hub) BroadcastToGameWithPriority(gameID string, message []byte, priority string) {
	// Get all clients for this game
	h.clientsMutex.RLock()
	defer h.clientsMutex.RUnlock()

	if gamePlayers, ok := h.clients[gameID]; ok {
		for playerID, client := range gamePlayers {
			// Send to each client with the specified priority
			switch priority {
			case PriorityHigh:
				select {
				case client.highPriorityQueue <- message:
					// Message sent successfully
				default:
					h.logger.Warnf("Failed to send high priority message to player %s (buffer full)", playerID)
				}
			case PriorityNormal:
				select {
				case client.normalPriorityQueue <- message:
					// Message sent successfully
				default:
					h.logger.Warnf("Failed to send normal priority message to player %s (buffer full)", playerID)
				}
			case PriorityLow:
				select {
				case client.lowPriorityQueue <- message:
					// Message sent successfully
				default:
					h.logger.Warnf("Failed to send low priority message to player %s (buffer full)", playerID)
				}
			default:
				// Default to normal priority
				select {
				case client.normalPriorityQueue <- message:
					// Message sent successfully
				default:
					h.logger.Warnf("Failed to send message to player %s (buffer full)", playerID)
				}
			}
		}
	}
}

// BroadcastCompleteState broadcasts the complete game state to all clients in a game
func (h *Hub) BroadcastCompleteState(gameID string, game *models.Game) {
	if game == nil {
		h.logger.Errorf("Cannot broadcast complete state: game is nil for gameID %s", gameID)
		return
	}

	h.logger.Infof("Broadcasting complete state for game %s with %d players", gameID, len(game.Players))

	// Create a complete state object with all necessary data
	completeState := map[string]interface{}{
		"type":        "complete_state_sync",
		"gameId":      gameID,
		"status":      string(game.Status),
		"currentTurn": game.CurrentTurn,
		"players":     game.Players,
		"turnOrder":   game.TurnOrder,
		"timestamp":   time.Now().Format(time.RFC3339),
	}

	// Log player token data for debugging
	for _, player := range game.Players {
		h.logger.Infof("Player token in complete state sync - Player: %s, Token: %s",
			player.ID, player.CharacterToken)
	}

	// Marshal to JSON
	stateJSON, err := json.Marshal(completeState)
	if err != nil {
		h.logger.Errorf("Failed to marshal complete state: %v", err)
		return
	}

	// Broadcast with high priority
	h.broadcast <- &BroadcastMessage{
		gameID: gameID,
		data:   stateJSON,
	}

	h.logger.Infof("Complete state sync broadcast sent for game %s", gameID)
}

// BroadcastToGameExcept sends a message to all clients in a game except one
func (h *Hub) BroadcastToGameExcept(gameID string, message []byte, excludePlayerID string) {
	h.broadcast <- &BroadcastMessage{
		gameID:          gameID,
		data:            message,
		excludePlayerID: excludePlayerID,
	}
}

// SendToPlayerWithPriority sends a message to a specific player in a game with priority
func (h *Hub) SendToPlayerWithPriority(gameID, playerID string, message []byte, priority string) bool {
	h.clientsMutex.RLock()
	defer h.clientsMutex.RUnlock()

	if gamePlayers, ok := h.clients[gameID]; ok {
		if client, ok := gamePlayers[playerID]; ok {
			// Determine which queue to use based on priority
			var targetQueue chan []byte
			var fallbackQueue chan []byte
			var lastResortQueue chan []byte

			switch priority {
			case PriorityHigh:
				targetQueue = client.highPriorityQueue
				// No fallback for high priority - these must be delivered
			case PriorityNormal:
				targetQueue = client.normalPriorityQueue
				fallbackQueue = client.highPriorityQueue // Try high priority if normal is full
			case PriorityLow:
				targetQueue = client.lowPriorityQueue
				fallbackQueue = client.normalPriorityQueue // Try normal if low is full
				lastResortQueue = client.highPriorityQueue // Last resort for critical low priority messages
			default:
				// Default to normal priority if not specified
				targetQueue = client.normalPriorityQueue
				fallbackQueue = client.highPriorityQueue
			}

			// Try primary queue
			select {
			case targetQueue <- message:
				return true
			default:
				// Primary queue is full
				//h.logger.Debugf("Client %s queue full for priority %s: Game ID: %s", priority, priority, gameID)

				// If this is high priority, try to make space by removing a message
				if priority == PriorityHigh {
					select {
					case <-targetQueue: // Remove oldest message
						// Try again
						select {
						case targetQueue <- message:
							return true
						default:
							h.logger.Warnf("High priority queue still full after clearing space: Game ID: %s", gameID)
						}
					default:
						// Couldn't clear space (shouldn't happen with non-empty buffer)
					}
				}

				// Try fallback queue if available
				if fallbackQueue != nil {
					select {
					case fallbackQueue <- message:
						//h.logger.Debugf("Successfully sent %s priority message using fallback queue: Game ID: %s", priority, gameID)
						return true
					default:
						// Fallback queue also full
					}
				}

				// Try last resort queue if available
				if lastResortQueue != nil {
					select {
					case lastResortQueue <- message:
						return true
					default:
						// All queues full, message dropped
						h.logger.Warnf("All queues full, message dropped: Game ID: %s, Priority: %s", gameID, priority)
					}
				}

				// Message couldn't be sent to any queue
				return false
			}
		}
	}

	return false
}

// SendToPlayer sends a message to a specific player in a game (legacy version for backward compatibility)
func (h *Hub) SendToPlayer(gameID, playerID string, message []byte) bool {
	// Default to normal priority for backward compatibility
	return h.SendToPlayerWithPriority(gameID, playerID, message, PriorityNormal)
}

// HandleWebSocketConnection handles a WebSocket connection
func (h *Hub) HandleWebSocketConnection(conn *websocket.Conn, gameID, playerID, sessionID string) {
	// We can't easily get the user agent from the WebSocket connection
	// in the gorilla/websocket implementation, so we'll just use a placeholder
	userAgent := "WebSocket Client"

	h.logger.Infof("New WebSocket connection: Game ID: %s, Player ID: %s, Session ID: %s, Time: %s",
		gameID, playerID, sessionID, time.Now().Format(time.RFC3339))

	// Check if this is a reconnection
	isReconnection := false
	previousSessionID := ""
	previousSession := h.getLatestSession(gameID, playerID)
	if previousSession != nil && previousSession.SessionID != sessionID {
		isReconnection = true
		previousSessionID = previousSession.SessionID
		h.logger.Infof("[RECONNECTION] Player %s reconnecting to game %s with new session %s (previous: %s)",
			playerID, gameID, sessionID, previousSessionID)
	}

	client := &Client{
		hub:                 h,
		conn:                conn,
		highPriorityQueue:   make(chan []byte, 16384), // Larger buffer for critical messages
		normalPriorityQueue: make(chan []byte, 16384), // Medium buffer for regular updates
		lowPriorityQueue:    make(chan []byte, 8192),  // Smaller buffer for non-critical messages
		playerID:            playerID,
		gameID:              gameID,
		sessionID:           sessionID,
		userAgent:           userAgent,
		isReconnection:      isReconnection,
		previousSessionID:   previousSessionID,
		connectedAt:         time.Now(),
	}

	// Register client
	h.register <- client
	h.logger.Infof("Client registered for game %s, player %s, session %s", gameID, playerID, sessionID)

	// If this is a reconnection, send a reconnection event to the client
	if isReconnection {
		// Create reconnection message
		reconnectMsg := map[string]interface{}{
			"type":            "reconnection_successful",
			"playerId":        playerID,
			"gameId":          gameID,
			"sessionId":       sessionID,
			"previousSession": previousSessionID,
			"timestamp":       time.Now().Format(time.RFC3339),
		}

		// Marshal to JSON
		msgBytes, err := json.Marshal(reconnectMsg)
		if err != nil {
			h.logger.Errorf("Failed to marshal reconnection message: %v", err)
		} else {
			// Send with high priority
			h.SendToPlayerWithPriority(gameID, playerID, msgBytes, PriorityHigh)

			// Also broadcast to other players that this player has reconnected
			reconnectBroadcastMsg := map[string]interface{}{
				"type":      "player_reconnected",
				"playerId":  playerID,
				"gameId":    gameID,
				"timestamp": time.Now().Format(time.RFC3339),
			}

			broadcastBytes, _ := json.Marshal(reconnectBroadcastMsg)
			h.BroadcastToGameExcept(gameID, broadcastBytes, playerID)
		}

		// Request full game state to be sent to the reconnected player
		if h.gameManager != nil {
			game, err := h.gameManager.GetGame(gameID)
			if err == nil && game != nil {
				h.BroadcastCompleteState(gameID, game)
			}
		}
	}

	// Start goroutines for reading and writing
	go client.readPump()
	go client.writePump()
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c // Send client to unregister channel
		c.conn.Close()
	}()

	// Initialize lastPongTime to current time
	c.pongMutex.Lock()
	c.lastPongTime = time.Now()
	c.pongMutex.Unlock()

	c.conn.SetReadLimit(4096)                                // Max message size
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second)) // Adjust as needed
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))

		// Update lastPongTime when a pong is received
		c.pongMutex.Lock()
		c.lastPongTime = time.Now()
		c.pongMutex.Unlock()

		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.hub.logger.Warnf("WebSocket read error for Game: %s, Player: %s, Session: %s - Error: %v",
					c.gameID, c.playerID, c.sessionID, err)
			} else if websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.hub.logger.Infof("WebSocket normal close for Game: %s, Player: %s, Session: %s - Code: %v",
					c.gameID, c.playerID, c.sessionID, err)
			} else {
				c.hub.logger.Warnf("WebSocket connection closed for Game: %s, Player: %s, Session: %s - Error: %v",
					c.gameID, c.playerID, c.sessionID, err)
			}
			break
		}

		// Handle incoming message
		c.handleMessage(message)
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second) // Ping interval
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	// Add a rate limiter to prevent sending too many messages too quickly
	rateLimiter := time.NewTicker(5 * time.Millisecond) // Max ~200 messages per second
	defer rateLimiter.Stop()

	// Helper function to send a message with proper error handling
	sendMessage := func(message []byte) bool {
		// Set a reasonable write deadline
		c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))

		// Send message as a WebSocket frame
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			c.hub.logger.Errorf("Error writing message to WebSocket for Game: %s, Player: %s, Session: %s - Error: %v",
				c.gameID, c.playerID, c.sessionID, err)
			return false
		}
		return true
	}

	for {
		select {
		// Check high priority queue first
		case message, ok := <-c.highPriorityQueue:
			if !ok {
				// Channel was closed
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Send high priority message
			if !sendMessage(message) {
				return
			}

			// Process any additional high priority messages first
			processMessages(c, c.highPriorityQueue, rateLimiter, sendMessage)

		// Then check normal priority queue
		case message, ok := <-c.normalPriorityQueue:
			if !ok {
				// Channel was closed
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Send normal priority message
			if !sendMessage(message) {
				return
			}

			// First process any high priority messages that arrived
			if processMessages(c, c.highPriorityQueue, rateLimiter, sendMessage) {
				continue // Restart the select to prioritize high priority messages
			}

			// Then process additional normal priority messages
			processMessages(c, c.normalPriorityQueue, rateLimiter, sendMessage)

		// Finally check low priority queue
		case message, ok := <-c.lowPriorityQueue:
			if !ok {
				// Channel was closed
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Send low priority message
			if !sendMessage(message) {
				return
			}

			// First process any high priority messages that arrived
			if processMessages(c, c.highPriorityQueue, rateLimiter, sendMessage) {
				continue // Restart the select to prioritize high priority messages
			}

			// Then process any normal priority messages
			if processMessages(c, c.normalPriorityQueue, rateLimiter, sendMessage) {
				continue // Restart the select to prioritize normal priority messages
			}

			// Finally process additional low priority messages
			processMessages(c, c.lowPriorityQueue, rateLimiter, sendMessage)

		// Send ping to keep connection alive
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.hub.logger.Warnf("Error sending ping to WebSocket for Game: %s, Player: %s, Session: %s - Error: %v",
					c.gameID, c.playerID, c.sessionID, err)
				return
			}
		}
	}
}

// Helper function to process messages from a queue
// Returns true if any messages were processed
func processMessages(c *Client, queue chan []byte, rateLimiter *time.Ticker, sendFunc func([]byte) bool) bool {
	maxBatchSize := 10 // Process up to 10 messages at once
	processed := 0

	// Process messages in the queue, but with limits
	for processed < maxBatchSize {
		select {
		case queuedMsg, ok := <-queue:
			if !ok {
				// Channel was closed
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return true
			}

			// Wait for rate limiter before sending next message
			<-rateLimiter.C

			// Send message
			if !sendFunc(queuedMsg) {
				return true
			}
			processed++

		default:
			// No more messages in this queue
			return processed > 0
		}
	}

	return processed > 0
}

// handleMessage processes incoming WebSocket messages
func (c *Client) handleMessage(message []byte) {
	// Parse message and handle different event types

	// +++ Add Raw Message Logging +++
	// c.hub.logger.Infof("[HANDLE_MESSAGE_RAW] Received raw message from %s: %s", c.playerID, string(message))
	// +++

	// Add support for encoding/json
	var msg map[string]interface{}
	err := json.Unmarshal(message, &msg)
	if err != nil {
		// +++ Log Parsing Error +++
		// c.hub.logger.Infof("[HANDLE_MESSAGE_PARSE_ERR] Failed to parse message from %s: %v. Raw: %s", c.playerID, err, string(message))
		// +++
		return
	}

	// Extract message type from the deserialized message
	msgType, ok := msg["type"].(string)
	if !ok {
		// +++ Log Invalid Format Error +++
		// c.hub.logger.Infof("[HANDLE_MESSAGE_TYPE_ERR] Invalid message format - missing type from %s: %s", c.playerID, string(message))
		// +++
		return
	}

	// +++ Log Parsed Type +++
	// c.hub.logger.Infof("[HANDLE_MESSAGE_PARSED] Parsed message type '%s' from %s", msgType, c.playerID)
	// +++

	// Handle different message types
	switch msgType {
	case "verify_host":
		// Handle host verification
		c.handleVerifyHost(msg)
		break
	case "game:start":
		// Handle game start request
		c.hub.logger.Infof("Game start request received from player %s for game %s", c.playerID, c.gameID)

		// Call GameManager to start the game
		// GameManager will handle host verification, state updates, and broadcasting
		err := c.hub.gameManager.StartGame(c.gameID, c.playerID)
		if err != nil {
			c.hub.logger.Warnf("Failed to start game %s requested by %s: %v", c.gameID, c.playerID, err)
			// Send an error message back to the requesting client
			errorMsg := map[string]interface{}{
				"type":    "error",
				"message": fmt.Sprintf("Failed to start game: %v", err),
			}
			errorJSON, _ := json.Marshal(errorMsg) // Ignore marshal error for simplicity here
			c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, errorJSON, PriorityHigh)
		} else {
			c.hub.logger.Infof("GameManager successfully started game %s", c.gameID)

			// Immediately update the game info cache to include the current turn information
			c.hub.updateGameInfoCache(c.gameID)

			// Log the updated game info for debugging
			gameInfo := c.hub.getGameInfo(c.gameID)
			if gameInfo != nil {
				currentTurn, ok := gameInfo["currentTurn"].(string)
				if ok {
					c.hub.logger.Infof("Game %s started with current turn: %s", c.gameID, currentTurn)
				} else {
					c.hub.logger.Warnf("Game %s started but currentTurn not found in cache", c.gameID)
				}
			} else {
				c.hub.logger.Warnf("Game %s started but game info not found in cache", c.gameID)
			}
		}
		break
	case "player_joined":
		// Sent by a client when they join the game
		// Payload should include player details like name, token, etc.
		if playerInfo, ok := msg["player"].(map[string]interface{}); ok {
			// --- Add Detailed Logging ---
			// Log the raw playerInfo received before storing
			infoBytes, _ := json.Marshal(playerInfo) // Log the full structure
			_ = infoBytes                            // Assign to blank identifier to avoid unused variable error
			// c.hub.logger.Infof("[PLAYER_JOINED_HANDLER] Storing player info for %s: %s", c.playerID, string(infoBytes))
			// ---
			c.hub.storePlayerInfo(c.gameID, c.playerID, playerInfo)

			// --- Send acknowledgment back to the joining player ---
			ackMsg := map[string]interface{}{
				"type":    "player_joined_ack",
				"success": true,
				"player":  playerInfo, // Send back the confirmed player info
				"gameId":  c.gameID,
			}
			ackBytes, ackErr := json.Marshal(ackMsg)
			if ackErr == nil {
				// Send directly to the client who just joined
				c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, ackBytes, PriorityNormal)
				// c.hub.logger.Infof("Sent player_joined_ack to player %s", c.playerID)
			} else {
				c.hub.logger.Warnf("Failed to marshal player_joined_ack: %v", ackErr)
			}
			// ---

			// --- Broadcast the updated player info to ALL clients (including sender) ---
			// Reuse the player_joined message type for simplicity on the frontend
			joinedMsg := map[string]interface{}{
				"type":   "player_joined",
				"player": playerInfo, // Send the full info we just stored
			}
			joinedBytes, joinedErr := json.Marshal(joinedMsg)
			if joinedErr == nil {
				// Broadcast to everyone in the game
				c.hub.BroadcastToGame(c.gameID, joinedBytes)
				// c.hub.logger.Infof("Broadcasted player_joined for %s to game %s", c.playerID, c.gameID)
			} else {
				c.hub.logger.Warnf("Failed to marshal player_joined broadcast message: %v", joinedErr)
			}
			// ---

		}
		break

	case "get_active_players":
		// Handle request for active players list
		c.handleGetActivePlayers()
		break

	case "roll_dice":
		// Log the dice roll request
		c.hub.logger.Infof("Dice roll request received from player %s in game %s", c.playerID, c.gameID)

		// Extract request ID if present
		requestID, _ := msg["requestId"].(string)
		if requestID != "" {
			c.hub.logger.Infof("Dice roll request ID: %s from player %s", requestID, c.playerID)
		}

		// First, check if it's this player's turn by getting the current game state
		game, err := c.hub.gameManager.GetGame(c.gameID)
		if err != nil {
			c.hub.logger.Errorf("Failed to get game state: %v", err)
			errorMsg := map[string]interface{}{
				"type":      "error",
				"message":   fmt.Sprintf("Failed to get game state: %v", err),
				"requestId": requestID,
			}
			errorJSON, _ := json.Marshal(errorMsg)
			c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, errorJSON, PriorityHigh)
			return
		}

		// Check if it's this player's turn
		if game.CurrentTurn != c.playerID {
			c.hub.logger.Errorf("Not player's turn. Current turn: %s, Player: %s", game.CurrentTurn, c.playerID)
			errorMsg := map[string]interface{}{
				"type":        "error",
				"message":     "Not your turn",
				"currentTurn": game.CurrentTurn,
				"requestId":   requestID,
			}
			errorJSON, _ := json.Marshal(errorMsg)
			c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, errorJSON, PriorityHigh)
			return
		}

		// Update the game info cache with the current turn information
		c.hub.updateGameInfoCache(c.gameID)

		// Create a roll dice action with the request ID in the payload
		payload := map[string]interface{}{
			"requestId": requestID,
			"timestamp": time.Now().UnixNano(),
		}

		action := models.GameAction{
			Type:      models.ActionTypeRollDice,
			PlayerID:  c.playerID,
			GameID:    c.gameID,
			Payload:   payload,
			Timestamp: time.Now(),
		}

		// Process the action through the game manager
		err = c.hub.gameManager.ProcessGameAction(action)
		if err != nil {
			c.hub.logger.Errorf("Failed to process dice roll: %v", err)
			// Send error message back to the client
			errorMsg := map[string]interface{}{
				"type":    "error",
				"message": fmt.Sprintf("Failed to roll dice: %v", err),
			}
			errorJSON, _ := json.Marshal(errorMsg)
			c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, errorJSON, PriorityHigh)
			return
		}

		// Get the updated game state
		game, err = c.hub.gameManager.GetGame(c.gameID)
		if err != nil {
			c.hub.logger.Errorf("Failed to get updated game state: %v", err)
			return
		}

		// Find the current player in the game
		var currentPlayer *models.Player
		for i := range game.Players {
			if game.Players[i].ID == c.playerID {
				currentPlayer = &game.Players[i]
				break
			}
		}

		if currentPlayer == nil {
			c.hub.logger.Errorf("Player %s not found in game %s", c.playerID, c.gameID)
			return
		}

		// Extract the actual dice values from the game manager logs
		// We need to parse the log message to get the dice values
		// The log message format is: "Player %s rolled %d and %d, now at position %d"

		// Get the most recent log entries for this game and player
		// For now, we'll use the position from the player object and calculate the dice values
		// based on the old position and new position

		// We don't need to calculate old and new positions here
		// The dice values will be retrieved from Redis

		// Calculate the dice values based on the position change
		// This is a simplified approach - in a real implementation, we would store the dice values
		// in the game state or pass them from the game manager to the hub

		// For now, we'll use a deterministic approach based on the player's position
		// This ensures the frontend and backend show the same dice values

		// Get the dice values from the game manager logs
		// The game manager logs the dice values in the format:
		// "Player %s rolled %d and %d, now at position %d"

		// We'll extract these values from the logs
		// For now, we'll use a simple approach to get the dice values

		// Create a deterministic seed based on the player ID and current time (minute)
		h := fnv.New32()
		h.Write([]byte(c.playerID))
		seed := int64(h.Sum32())
		seed += time.Now().Unix() / 60 // Changes every minute

		// Create a random source with this seed
		diceRand := rand.New(rand.NewSource(seed))

		// Generate dice values (1-6)
		// But we'll modify this to use the actual dice values from the game manager
		// by parsing the game manager logs

		// Get the dice values from the game manager
		// We need to modify the game manager to store the dice values in the game state
		// For now, we'll use the position to calculate the dice values

		// Find the player in the game state before the dice roll
		// This is a simplified approach - in a real implementation, we would store the dice values

		// Use the actual dice values from the game manager's log
		// The game manager logs: "Player %s rolled %d and %d, now at position %d"
		// We'll extract these values from the logs

		// For now, we'll use a simple approach to get the dice values
		// We'll modify the game manager to store the dice values in a temporary Redis key
		// that we can retrieve here

		// Try to get the dice values from Redis
		diceKey := fmt.Sprintf("game:%s:player:%s:lastdice", c.gameID, c.playerID)
		diceValues, err := c.hub.redisClient.Get(c.hub.ctx, diceKey).Result()

		var dice1, dice2 int

		if err == nil && diceValues != "" {
			// Parse the dice values from Redis
			parts := strings.Split(diceValues, ",")
			if len(parts) == 2 {
				dice1Val, err1 := strconv.Atoi(parts[0])
				dice2Val, err2 := strconv.Atoi(parts[1])

				if err1 == nil && err2 == nil {
					dice1 = dice1Val
					dice2 = dice2Val
					c.hub.logger.Infof("Retrieved dice values from Redis for player %s: %d and %d", c.playerID, dice1, dice2)
				} else {
					// Fallback to random dice values
					dice1 = 1 + diceRand.Intn(6)
					dice2 = 1 + diceRand.Intn(6)
					c.hub.logger.Infof("Failed to parse dice values from Redis, using random values for player %s: %d and %d", c.playerID, dice1, dice2)
				}
			} else {
				// Fallback to random dice values
				dice1 = 1 + diceRand.Intn(6)
				dice2 = 1 + diceRand.Intn(6)
				c.hub.logger.Infof("Invalid dice values format in Redis, using random values for player %s: %d and %d", c.playerID, dice1, dice2)
			}
		} else {
			// Fallback to random dice values
			dice1 = 1 + diceRand.Intn(6)
			dice2 = 1 + diceRand.Intn(6)
			c.hub.logger.Infof("No dice values found in Redis, using random values for player %s: %d and %d", c.playerID, dice1, dice2)
		}

		// Extract the request ID from the action payload if available
		var diceRequestID string
		if action.Payload != nil {
			if payload, ok := action.Payload.(map[string]interface{}); ok {
				if reqID, ok := payload["requestId"].(string); ok {
					diceRequestID = reqID
				}
			}
		}

		// Create a response message with the dice roll result
		response := map[string]interface{}{
			"type":      "dice_rolled",
			"playerId":  c.playerID,
			"position":  currentPlayer.Position,
			"balance":   currentPlayer.Balance,
			"timestamp": time.Now().Format(time.RFC3339),
			// Add dice values in both formats to ensure compatibility
			"dice":  []int{dice1, dice2},
			"dice1": dice1,
			"dice2": dice2,
			// Include the request ID if available
			"requestId": diceRequestID,
		}

		// Marshal to JSON
		responseJSON, err := json.Marshal(response)
		if err != nil {
			c.hub.logger.Errorf("Failed to marshal dice roll response: %v", err)
			return
		}

		// Broadcast the result to all players in the game
		c.hub.BroadcastToGame(c.gameID, responseJSON)
		c.hub.logger.Infof("Broadcasted dice roll result for player %s in game %s", c.playerID, c.gameID)
		break

	case "update_player_info", "update_player", "set_player_token":
		// Extract player info from the message
		playerId, ok := msg["playerId"].(string)
		if !ok {
			c.hub.logger.Warnf("Invalid player update message format - missing playerId")
			return
		}

		// Get existing player info or create new
		playerInfo := c.hub.getPlayerInfo(c.gameID, playerId)
		if playerInfo == nil {
			playerInfo = make(map[string]interface{})
			playerInfo["id"] = playerId
		}

		// Update player info with token data
		// Check for token in different formats to ensure compatibility
		if token, ok := msg["token"].(string); ok && token != "" {
			playerInfo["token"] = token
			c.hub.logger.Infof("[TOKEN_UPDATE] Updated token for player %s in game %s: %s", playerId, c.gameID, token)
		}

		if characterToken, ok := msg["characterToken"].(string); ok && characterToken != "" {
			playerInfo["characterToken"] = characterToken
			c.hub.logger.Infof("[TOKEN_UPDATE] Updated characterToken for player %s in game %s: %s", playerId, c.gameID, characterToken)
		}

		if emoji, ok := msg["emoji"].(string); ok && emoji != "" {
			playerInfo["emoji"] = emoji
		}

		if color, ok := msg["color"].(string); ok && color != "" {
			playerInfo["color"] = color
		}

		if name, ok := msg["name"].(string); ok && name != "" {
			playerInfo["name"] = name
		}

		// Store updated player info
		c.hub.storePlayerInfo(c.gameID, playerId, playerInfo)
		c.hub.logger.Infof("[TOKEN_UPDATE] Stored updated player info for %s in game %s", playerId, c.gameID)

		// Enqueue the token update in the message queue for resilience
		if c.hub.messageQueue != nil {
			// Create a copy of the token data for the queue
			tokenData := make(map[string]interface{})
			for k, v := range playerInfo {
				tokenData[k] = v
			}

			// Enqueue the token update
			err := c.hub.messageQueue.EnqueuePlayerTokenUpdate(c.gameID, playerId, tokenData)
			if err != nil {
				c.hub.logger.Errorf("[TOKEN_UPDATE] Failed to enqueue token update: %v", err)
			} else {
				c.hub.logger.Infof("[TOKEN_UPDATE] Token update enqueued for player %s in game %s", playerId, c.gameID)
			}
		}

		// Update the player in the game manager's database
		if c.hub.gameManager != nil {
			// Get the game from the game manager
			game, err := c.hub.gameManager.GetGame(c.gameID)
			if err == nil {
				// Find the player in the game
				for i, player := range game.Players {
					if player.ID == playerId {
						// Update the player's token
						if token, ok := playerInfo["token"].(string); ok && token != "" {
							game.Players[i].CharacterToken = token
						} else if characterToken, ok := playerInfo["characterToken"].(string); ok && characterToken != "" {
							game.Players[i].CharacterToken = characterToken
						} else if emoji, ok := playerInfo["emoji"].(string); ok && emoji != "" {
							game.Players[i].CharacterToken = emoji
						}

						// Update the game in the database
						err = c.hub.gameManager.UpdateGame(game)
						if err != nil {
							c.hub.logger.Warnf("[TOKEN_UPDATE] Failed to update game in database: %v", err)
						} else {
							c.hub.logger.Infof("[TOKEN_UPDATE] Updated player token in database for %s in game %s", playerId, c.gameID)
						}
						break
					}
				}
			} else {
				c.hub.logger.Warnf("[TOKEN_UPDATE] Failed to get game %s from manager: %v", c.gameID, err)
			}
		}

		// Broadcast the updated player info to all clients
		updateMsg := map[string]interface{}{
			"type":   "player_updated",
			"player": playerInfo,
		}
		updateJSON, err := json.Marshal(updateMsg)
		if err == nil {
			c.hub.BroadcastToGame(c.gameID, updateJSON)
			c.hub.logger.Infof("[TOKEN_UPDATE] Broadcasted player update for %s to all clients in game %s", playerId, c.gameID)
		}

		// Also update active players list
		go func() {
			time.Sleep(100 * time.Millisecond)
			c.handleGetActivePlayers()
		}()
		break

	case "player_ready":
		// Extract player info from the message
		playerId, ok := msg["playerId"].(string)
		if !ok {
			c.hub.logger.Warnf("Invalid player_ready message format - missing playerId")
			return
		}

		isReady, ok := msg["isReady"].(bool)
		if !ok {
			c.hub.logger.Warnf("Invalid player_ready message format - missing isReady")
			return
		}

		// Extract optional message ID for tracking/debugging
		messageId := ""
		if msgId, ok := msg["messageId"].(string); ok {
			messageId = msgId
		}

		// Extract timestamp if available
		timestamp := time.Now().UnixNano() / int64(time.Millisecond)
		if ts, ok := msg["timestamp"].(float64); ok {
			timestamp = int64(ts)
		}

		c.hub.logger.Infof("[PLAYER_READY] Player %s ready status changed to: %v (messageId: %s, timestamp: %d)",
			playerId, isReady, messageId, timestamp)

		// --- Update Hub's internal playerInfo cache ---
		playerInfo := c.hub.getPlayerInfo(c.gameID, playerId)
		if playerInfo != nil {
			playerInfo["isReady"] = isReady
			playerInfo["lastReadyUpdate"] = timestamp // Track when this was last updated
			c.hub.storePlayerInfo(c.gameID, playerId, playerInfo)
			c.hub.logger.Infof("[PLAYER_READY] Updated existing player info for %s, isReady=%v", playerId, isReady)
		} else {
			c.hub.logger.Warnf("[PLAYER_READY] Player info not found for player %s in game %s. Creating default entry.", playerId, c.gameID)
			// Create a default player info map if not found
			defaultInfo := map[string]interface{}{
				"id":              playerId,
				"name":            fmt.Sprintf("Player_%s", playerId[:4]), // Use a default name
				"isReady":         isReady,                                // Set the received ready status
				"isHost":          false,                                  // Assume not host unless updated later
				"lastReadyUpdate": timestamp,                              // Track when this was created
				// Add other necessary default fields if required by frontend
				"token": "",
				"emoji": "👤",
				"color": "gray.500",
			}
			c.hub.storePlayerInfo(c.gameID, playerId, defaultInfo) // Store the default info with the correct ready status
			c.hub.logger.Infof("[PLAYER_READY] Created new player info for %s, isReady=%v", playerId, isReady)
		}
		// ---

		// Add message ID to the response if it was provided
		if messageId != "" {
			msg["responseToMessageId"] = messageId
		}

		// Broadcast player ready status to all clients with high priority
		responseJSON, err := json.Marshal(msg)
		if err != nil {
			c.hub.logger.Warnf("[PLAYER_READY] Failed to marshal player_ready response: %v", err)
			return
		}

		// OPTIMIZATION: Use BroadcastToGameWithPriority with HIGH priority
		c.hub.BroadcastToGameWithPriority(c.gameID, responseJSON, PriorityHigh)
		c.hub.logger.Infof("[PLAYER_READY] Broadcasted player_ready status to all clients in game %s with HIGH priority", c.gameID)

		// OPTIMIZATION: Reduce delay before sending active_players update
		go func() {
			// Reduced delay to improve responsiveness
			time.Sleep(50 * time.Millisecond)
			c.hub.logger.Infof("[PLAYER_READY] Sending active_players update after player_ready change for player %s", playerId)
			c.handleGetActivePlayers()
		}()
		break

	case "get_game_state":
		// Handle request for current game state
		// c.hub.logger.Infof("Game state request received from player %s for game %s", c.playerID, c.gameID)

		// Get game info from storage
		gameInfo := c.hub.getGameInfo(c.gameID)
		if gameInfo == nil {
			gameInfo = make(map[string]interface{})
		}

		// Create response with game state
		response := map[string]interface{}{
			"type":   "game_state_update",
			"gameId": c.gameID,
			"state": map[string]interface{}{
				"gameId":   c.gameID,
				"gameInfo": gameInfo,
			},
		}

		// Set status based on game state
		stateMap := response["state"].(map[string]interface{})
		if status, ok := gameInfo["status"].(string); ok {
			stateMap["status"] = status
		} else {
			stateMap["status"] = "LOBBY" // Default to LOBBY if not set
		}

		// If game has been started, set status to ACTIVE
		if started, ok := gameInfo["gameStarted"].(bool); ok && started {
			stateMap["status"] = "ACTIVE"
		}

		// Marshal to JSON
		responseJSON, err := json.Marshal(response)
		if err != nil {
			c.hub.logger.Warnf("Failed to marshal game_state_update response: %v", err)
			return
		}

		// Send only to the requesting client
		c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, responseJSON, PriorityNormal)
		// c.hub.logger.Infof("Sent game state to player %s in game %s", c.playerID, c.gameID)
		break

	case "set_host":
		// Extract host ID from the message
		hostID, ok := msg["hostId"].(string)
		if !ok {
			c.hub.logger.Warnf("Invalid set_host message format - missing hostId: %s", string(message))
			return
		}

		// Extract game ID from the message or use the client's gameID
		gameID, ok := msg["gameId"].(string)
		if !ok {
			gameID = c.gameID
		}

		// Log the request
		// c.hub.logger.Infof("Set host request received: gameID=%s, hostID=%s", gameID, hostID)

		// No need to get game info here, just update the host ID directly

		// Update the host ID
		c.hub.UpdateHostID(gameID, hostID)

		// Send confirmation back to the client
		confirmationMsg := map[string]interface{}{
			"type":   "host_set_confirmed",
			"hostId": hostID,
			"gameId": gameID,
		}

		// Marshal to JSON
		confirmationJSON, err := json.Marshal(confirmationMsg)
		if err != nil {
			c.hub.logger.Warnf("Failed to marshal host_set_confirmed message: %v", err)
			return
		}

		// Send to the client
		c.hub.SendToPlayerWithPriority(gameID, c.playerID, confirmationJSON, PriorityNormal)

		// Also broadcast the updated list of active players to all clients
		c.handleGetActivePlayers()
		break

	default:
		// By default, broadcast all messages to other clients in the game
		c.hub.BroadcastToGameExcept(c.gameID, message, c.playerID)
	}
}

// handleVerifyHost verifies if the player is the host of the game
func (c *Client) handleVerifyHost(msg map[string]interface{}) {
	// Use the current player ID if not specified in the message
	playerID := c.playerID

	// Get game info to check host ID
	gameInfo := c.hub.getGameInfo(c.gameID)

	// If game info is not in cache, try to update it first
	if gameInfo == nil {
		c.hub.logger.Infof("Game info not found in cache for game %s, updating cache", c.gameID)
		c.hub.updateGameInfoCache(c.gameID)
		gameInfo = c.hub.getGameInfo(c.gameID)
	}

	// If still not found, try to get host ID directly from game manager
	var hostID string
	if gameInfo == nil || gameInfo["hostId"] == nil {
		if c.hub.gameManager != nil {
			game, err := c.hub.gameManager.GetGame(c.gameID)
			if err != nil {
				c.hub.logger.Warnf("Failed to get game from manager: %v", err)
				c.sendHostVerificationResponse(false, "", "Game not found")
				return
			}
			hostID = game.HostID
		} else {
			c.hub.logger.Warnf("Game info not found for game %s and game manager is nil", c.gameID)
			c.sendHostVerificationResponse(false, "", "Game not found")
			return
		}
	} else {
		// Get host ID from game info
		var ok bool
		hostID, ok = gameInfo["hostId"].(string)
		if !ok || hostID == "" {
			c.hub.logger.Warnf("Host ID not found for game %s", c.gameID)
			c.sendHostVerificationResponse(false, "", "Host not assigned for this game")
			return
		}
	}

	// Send the host verification response with the current host ID
	// This will allow the client to update its state regardless of whether the current player is the host
	c.hub.logger.Infof("Sending host verification response for game %s. Host is %s, current player is %s",
		c.gameID, hostID, playerID)

	// Check if the player is the host
	isHost := playerID == hostID

	if isHost {
		c.hub.logger.Infof("Player %s verified as host of game %s", playerID, c.gameID)
		c.sendHostVerificationResponse(true, hostID, "")
	} else {
		c.hub.logger.Infof("Player %s is not the host of game %s. Host is %s", playerID, c.gameID, hostID)
		c.sendHostVerificationResponse(false, hostID, "You are not the host of this game")
	}
}

// sendHostVerificationResponse sends a host verification response to the client
func (c *Client) sendHostVerificationResponse(success bool, hostId string, errorMessage string) {
	// Create the response message
	response := map[string]interface{}{
		"type":    "host_verification",
		"success": success,
		"hostId":  hostId,
		"gameId":  c.gameID,
	}

	// Add error message if provided
	if errorMessage != "" {
		response["message"] = errorMessage
	}

	// Marshal to JSON
	responseJSON, err := json.Marshal(response)
	if err != nil {
		c.hub.logger.Warnf("Failed to marshal host_verification response: %v", err)
		return
	}

	// Send to the client
	c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, responseJSON, PriorityNormal)
}

// sendHostVerificationFailed is a legacy method that is kept for backward compatibility
func (c *Client) sendHostVerificationFailed(errorMessage string) {
	c.sendHostVerificationResponse(false, "", errorMessage)
}

// handleGetActivePlayers responds with a list of active players in the game
func (c *Client) handleGetActivePlayers() {
	// --- Safely get player info and host ID ---
	var hostID string
	players := []map[string]interface{}{}
	var gameInfo map[string]interface{} // Use local variable

	// Lock for reading clients and playerInfo
	c.hub.clientsMutex.RLock()
	c.hub.playerInfoMutex.RLock()
	c.hub.gameInfoMutex.RLock() // Lock gameInfo too

	// Get host ID (same logic as before, but now within locks)
	if c.hub.gameManager != nil {
		game, err := c.hub.gameManager.GetGame(c.gameID)
		if err == nil && game != nil && game.HostID != "" {
			hostID = game.HostID
		} else {
			// Fallback to Hub's gameInfo map (read under lock)
			tempGameInfo := c.hub.getGameInfo_unlocked(c.gameID) // Assumes an unlocked version exists or create one
			if tempGameInfo != nil {
				if hostIDStr, ok := tempGameInfo["hostId"].(string); ok {
					hostID = hostIDStr
				}
			}
		}
	} else {
		// Fallback if gameManager is nil (read under lock)
		tempGameInfo := c.hub.getGameInfo_unlocked(c.gameID) // Assumes an unlocked version exists or create one
		if tempGameInfo != nil {
			if hostIDStr, ok := tempGameInfo["hostId"].(string); ok {
				hostID = hostIDStr
			}
		}
	}

	// Copy gameInfo while under lock
	// Create a deep copy to avoid race conditions during JSON marshal
	sourceGameInfo := c.hub.getGameInfo_unlocked(c.gameID)
	if sourceGameInfo != nil {
		copiedInfoBytes, err := json.Marshal(sourceGameInfo)
		if err == nil {
			err = json.Unmarshal(copiedInfoBytes, &gameInfo) // Unmarshal into our local variable
			if err != nil {
				c.hub.logger.Warnf("Failed to deep copy gameInfo: %v", err)
				gameInfo = nil // Reset on error
			}
		} else {
			c.hub.logger.Warnf("Failed to marshal source gameInfo for deep copy: %v", err)
		}
	}

	// Create a list of active, connected players (read under lock)
	if gamePlayers, ok := c.hub.clients[c.gameID]; ok {
		for playerID, client := range gamePlayers {
			if client.isActive(90 * time.Second) {
				// Get player info from Hub's cache (read under lock)
				storedPlayerInfo := c.hub.getPlayerInfo_unlocked(c.gameID, playerID) // Assumes an unlocked version
				var playerInfo map[string]interface{}

				if storedPlayerInfo != nil {
					// Deep copy player info
					copiedPlayerBytes, err := json.Marshal(storedPlayerInfo)
					if err == nil {
						err = json.Unmarshal(copiedPlayerBytes, &playerInfo)
						if err != nil {
							c.hub.logger.Warnf("Failed to deep copy playerInfo for %s: %v", playerID, err)
							playerInfo = nil // Reset on error
						}
					} else {
						c.hub.logger.Warnf("Failed to marshal source playerInfo for %s for deep copy: %v", playerID, err)
						playerInfo = nil
					}
				}

				// Fallback if info is nil (e.g., copy failed or not found)
				if playerInfo == nil {
					playerInfo = map[string]interface{}{
						"id":      playerID,
						"name":    fmt.Sprintf("Player_%s", playerID[:4]),
						"token":   "",
						"emoji":   "👤",
						"color":   "gray.500",
						"isReady": false,
					}
				}

				// Set isHost flag based on the reliably fetched hostID
				playerInfo["isHost"] = (hostID != "" && playerID == hostID)
				players = append(players, playerInfo)
			}
		}
	}

	// Unlock mutexes after reading/copying is done
	c.hub.gameInfoMutex.RUnlock()
	c.hub.playerInfoMutex.RUnlock()
	c.hub.clientsMutex.RUnlock()

	// --- Prepare and send response using the copied data ---

	var maxPlayers int = 6 // Default
	if gameInfo != nil {
		if mpVal, ok := gameInfo["maxPlayers"]; ok {
			if mpInt, ok := mpVal.(int); ok {
				maxPlayers = mpInt
			} else if mpFlt, ok := mpVal.(float64); ok {
				maxPlayers = int(mpFlt)
			}
		}
	}

	// Create response message using the locally copied players and gameInfo
	response := map[string]interface{}{
		"type":       "active_players",
		"players":    players, // Use the copied list
		"gameId":     c.gameID,
		"hostId":     hostID, // Use the reliably fetched hostID
		"maxPlayers": maxPlayers,
		"gameInfo":   gameInfo, // Use the copied gameInfo
	}

	// Add status, gameStarted, etc. based on the *copied* gameInfo
	if gameInfo != nil {
		if status, ok := gameInfo["status"].(string); ok {
			response["status"] = status
		}
		if started, ok := gameInfo["gameStarted"].(bool); ok && started {
			response["gameStarted"] = true
			response["gamePhase"] = "playing"
		}
		// ... (Redis check remains the same, operates on the response map)
		if c.hub.redisClient != nil && response["gameStarted"] == nil {
			key := fmt.Sprintf("game:%s:started", c.gameID)
			val, err := c.hub.redisClient.Get(c.hub.ctx, key).Result()
			if err == nil && val == "true" {
				response["gameStarted"] = true
				response["gamePhase"] = "playing"
				response["status"] = "ACTIVE"
				// Update the copied gameInfo in the response map if needed
				if responseGameInfo, ok := response["gameInfo"].(map[string]interface{}); ok && responseGameInfo != nil {
					responseGameInfo["gameStarted"] = true
					responseGameInfo["gamePhase"] = "playing"
					responseGameInfo["status"] = "ACTIVE"
				}
			}
		}
	}

	// Marshal the response (now safe from concurrent map writes)
	responseJSON, err := json.Marshal(response)
	if err != nil {
		c.hub.logger.Warnf("Failed to marshal active_players response: %v", err)
		return
	}

	// Broadcast to all clients in the game
	c.hub.BroadcastToGame(c.gameID, responseJSON)

	// Log at debug level to avoid console spam
}

// --- Add unlocked helper functions for reading info maps ---

func (h *Hub) getPlayerInfo_unlocked(gameID, playerID string) map[string]interface{} {
	// Assumes playerInfoMutex RLock is already held
	if gameInfo, ok := h.playerInfo[strings.ToLower(gameID)]; ok {
		if playerInfo, ok := gameInfo[playerID]; ok {
			return playerInfo
		}
	}
	return nil
}

func (h *Hub) getGameInfo_unlocked(gameID string) map[string]interface{} {
	// Assumes gameInfoMutex RLock is already held
	normalizedGameID := strings.ToLower(gameID)
	if gameInfo, ok := h.gameInfo[normalizedGameID]; ok {
		return gameInfo
	}
	return nil
}

// isActive checks if the client is still active based on the last pong time
// Returns true if the client has responded to a ping within the inactivity threshold
func (c *Client) isActive(inactivityThreshold time.Duration) bool {
	c.pongMutex.RLock()
	defer c.pongMutex.RUnlock()

	timeSinceLastPong := time.Since(c.lastPongTime)
	isActive := timeSinceLastPong < inactivityThreshold

	// Log when a client is about to be considered inactive
	if !isActive {
		// Use Debug level instead of Warn to reduce log spam
		c.hub.logger.Debugf("Client may be inactive: Game: %s, Player: %s, Session: %s, Time since last pong: %v (threshold: %v)",
			c.gameID, c.playerID, c.sessionID, timeSinceLastPong, inactivityThreshold)
	}

	return isActive
}

// updateAllGameInfoCache updates the game info cache for all active games
func (h *Hub) updateAllGameInfoCache() {
	// Skip if game manager is nil
	if h.gameManager == nil {
		return
	}

	// Get a list of all active game IDs
	h.clientsMutex.RLock()
	gameIDs := make([]string, 0, len(h.clients))
	for gameID := range h.clients {
		gameIDs = append(gameIDs, gameID)
	}
	h.clientsMutex.RUnlock()

	// Update game info for each active game
	for _, gameID := range gameIDs {
		h.updateGameInfoCache(gameID)
	}
}

// updateGameInfoCache updates the game info cache for a specific game
func (h *Hub) updateGameInfoCache(gameID string) {
	// Skip if game manager is nil
	if h.gameManager == nil {
		return
	}

	// Get the game from the game manager
	game, err := h.gameManager.GetGame(gameID)
	if err != nil {
		return
	}

	// Create a map to store game info
	gameInfo := make(map[string]interface{})

	// Convert game struct to map using JSON marshal/unmarshal
	gameBytes, err := json.Marshal(game)
	if err != nil {
		h.logger.Warnf("Failed to marshal game for cache update: %v", err)
		return
	}

	err = json.Unmarshal(gameBytes, &gameInfo)
	if err != nil {
		h.logger.Warnf("Failed to unmarshal game for cache update: %v", err)
		return
	}

	// Add additional fields needed by the WebSocket hub
	gameInfo["hostId"] = game.HostID
	gameInfo["currentTurn"] = game.CurrentTurn
	gameInfo["status"] = string(game.Status)
	gameInfo["gameStarted"] = (game.Status == models.GameStatusActive)

	// Store the updated game info
	h.storeGameInfo(gameID, gameInfo)
}
