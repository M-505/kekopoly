package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/kekopoly/backend/internal/game/manager"
	"github.com/kekopoly/backend/internal/game/models"
	"github.com/kekopoly/backend/internal/game/websocket"
)

// GameHandler handles game-related requests
type GameHandler struct {
	gameManager *manager.GameManager
	wsHub       *websocket.Hub
	logger      *zap.SugaredLogger
}

// NewGameHandler creates a new GameHandler
func NewGameHandler(gameManager *manager.GameManager, wsHub *websocket.Hub, logger *zap.SugaredLogger) *GameHandler {
	return &GameHandler{
		gameManager: gameManager,
		wsHub:       wsHub,
		logger:      logger,
	}
}

// CreateGameRequest represents a create game request
type CreateGameRequest struct {
	GameName   string `json:"gameName" validate:"required"`
	MaxPlayers int    `json:"maxPlayers,omitempty"`
}

// JoinGameRequest represents a join game request
type JoinGameRequest struct {
	WalletAddress string `json:"walletAddress" validate:"required"`
}

// ActionRequest represents a game action request
type ActionRequest struct {
	PlayerID string      `json:"playerId" validate:"required"`
	Payload  interface{} `json:"payload"`
}

// CreateGame creates a new game
func (h *GameHandler) CreateGame(c echo.Context) error {
	var req CreateGameRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// Get user ID from context (set by JWT middleware)
	userID := c.Get("userID").(string)
	walletAddress := c.Get("walletAddress").(string)
	// Create game with the specified name and max players
	maxPlayers := req.MaxPlayers
	if maxPlayers == 0 {
		maxPlayers = 6 // Default max players if not specified
	}
	gameID, err := h.gameManager.CreateGame(userID, walletAddress, req.GameName, maxPlayers)
	if err != nil {
		h.logger.Errorf("Failedcto create game: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to create game")
	}

	// Broadcast new game to all connected clients
	go h.broadcastNewGame(gameID)

	return c.JSON(http.StatusCreated, map[string]string{
		"gameId": gameID,
	})
}

// broadcastNewGame fetches the newly created game and broadcasts it to all connected clients
func (h *GameHandler) broadcastNewGame(gameID string) {
	h.logger.Infof("Broadcasting new game %s at %s", gameID, time.Now().Format(time.RFC3339))

	// Get the newly created game
	game, err := h.gameManager.GetGame(gameID)
	if err != nil {
		h.logger.Errorf("Failed to get newly created game for broadcast: %v", err)
		return
	}

	// Transform the game to the response format
	hostName := ""
	if len(game.Players) > 0 {
		hostName = game.Players[0].WalletAddress
		if len(hostName) > 10 {
			hostName = hostName[:6] + "..." + hostName[len(hostName)-4:]
		}
	}

	gameResponse := map[string]interface{}{
		"id":         game.ID.Hex(),
		"name":       game.Name,
		"status":     string(game.Status),
		"players":    len(game.Players),
		"maxPlayers": game.MaxPlayers, // Use the actual value from the game model
		"createdAt":  game.CreatedAt.Format(time.RFC3339),
		"hostName":   hostName,
		"updatedAt":  time.Now().Format(time.RFC3339), // Add timestamp for tracking
	}

	// Create the broadcast message
	broadcastMsg := map[string]interface{}{
		"type":      "new_game_created",
		"game":      gameResponse,
		"timestamp": time.Now().Format(time.RFC3339),
	}

	// Marshal to JSON
	msgBytes, err := json.Marshal(broadcastMsg)
	if err != nil {
		h.logger.Errorf("Failed to marshal new game broadcast message: %v", err)
		return
	}

	// Count connected lobby clients
	h.logger.Infof("Preparing to broadcast new game %s to lobby clients", gameID)

	// Broadcast to all connected clients (using a special "lobby" game ID)
	h.wsHub.BroadcastToGame("lobby", msgBytes)
	h.logger.Infof("Broadcasted new game %s to all connected lobby clients", gameID)

	// Also log the raw message for debugging
	h.logger.Infof("Broadcast message content: %s", string(msgBytes))
}

// ListGames lists available games
func (h *GameHandler) ListGames(c echo.Context) error {
	// Get all available games from the game manager
	games, err := h.gameManager.ListAvailableGames()
	if err != nil {
		h.logger.Errorf("Failed to list games: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to list games")
	}

	// Transform the game model to a simplified response format
	type GameResponse struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Status     string `json:"status"`
		Players    int    `json:"players"`
		MaxPlayers int    `json:"maxPlayers"`
		CreatedAt  string `json:"createdAt"`
		HostName   string `json:"hostName,omitempty"`
	}

	gamesList := make([]GameResponse, 0, len(games))
	for _, game := range games {
		hostName := ""
		if len(game.Players) > 0 {
			// Assume the first player is the host
			hostName = game.Players[0].WalletAddress
			// Truncate the wallet address for display
			if len(hostName) > 10 {
				hostName = hostName[:6] + "..." + hostName[len(hostName)-4:]
			}
		}

		// Count only active players for the lobby display
		activePlayerCount := 0
		h.logger.Debugf("Checking players for game %s (%s):", game.ID.Hex(), game.Name)
		for _, player := range game.Players {
			h.logger.Debugf("  - Player ID: %s, Status: %s", player.ID, player.Status)
			if player.Status == models.PlayerStatusActive {
				activePlayerCount++
			}
		}
		h.logger.Debugf("Active player count for game %s: %d", game.ID.Hex(), activePlayerCount)

		gamesList = append(gamesList, GameResponse{
			ID:         game.ID.Hex(),
			Name:       game.Name, // Assuming there's a Name field in the game model
			Status:     string(game.Status),
			Players:    activePlayerCount, // Use the count of active players
			MaxPlayers: game.MaxPlayers,   // Use the actual value from the game model
			CreatedAt:  game.CreatedAt.Format(time.RFC3339),
			HostName:   hostName,
		})
	}

	// Return the response in the format expected by the frontend: { games: [...] }
	return c.JSON(http.StatusOK, map[string]interface{}{
		"games": gamesList,
	})
}

// GetGameDetails gets details for a specific game
func (h *GameHandler) GetGameDetails(c echo.Context) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// Normalize gameID to lowercase to ensure consistent handling
	gameID = strings.ToLower(gameID)
	h.logger.Infof("Normalized gameID to lowercase: %s", gameID)

	// Get game from game manager
	game, err := h.gameManager.GetGame(gameID)
	if err != nil {
		h.logger.Errorf("Failed to get game: %v", err)
		return echo.NewHTTPError(http.StatusNotFound, "Game not found")
	}

	return c.JSON(http.StatusOK, game)
}

// JoinGame joins a game
func (h *GameHandler) JoinGame(c echo.Context) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// Normalize gameID to lowercase to ensure consistent handling
	gameID = strings.ToLower(gameID)
	h.logger.Infof("Normalized gameID to lowercase: %s", gameID)

	var req JoinGameRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	// Get user ID from context (set by JWT middleware)
	userID := c.Get("userID").(string)

	// Join game
	sessionID, err := h.gameManager.JoinGame(gameID, userID, req.WalletAddress)
	if err != nil {
		h.logger.Errorf("Failed to join game: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to join game")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"sessionId": sessionID,
	})
}

// LeaveGame leaves a game
func (h *GameHandler) LeaveGame(c echo.Context) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// Unused code
	// userID := c.Get("userID").(string)

	// In a real implementation, we would remove the player from the game
	// For this simplified implementation, we'll just return success
	return c.NoContent(http.StatusNoContent)
}

// StartGame starts a game
func (h *GameHandler) StartGame(c echo.Context) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// Normalize gameID to lowercase to ensure consistent handling
	gameID = strings.ToLower(gameID)
	h.logger.Infof("Normalized gameID to lowercase: %s", gameID)

	// Get user ID from context (set by JWT middleware)
	userID := c.Get("userID").(string)
	h.logger.Infof("Start game request from user %s for game %s", userID, gameID)

	// Start game with the requesting player ID for host verification
	err := h.gameManager.StartGame(gameID, userID)
	if err != nil {
		h.logger.Errorf("Failed to start game: %v", err)
		if err.Error() == "only the host can start the game" {
			return echo.NewHTTPError(http.StatusForbidden, "Only the host can start the game")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to start game")
	}

	h.logger.Infof("Game %s started successfully by user %s", gameID, userID)
	return c.NoContent(http.StatusNoContent)
}

// PauseGame pauses a game
func (h *GameHandler) PauseGame(c echo.Context) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// In a real implementation, we would pause the game
	// For this simplified implementation, we'll just return success
	return c.NoContent(http.StatusNoContent)
}

// GetGameState gets the current state of a game
func (h *GameHandler) GetGameState(c echo.Context) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// Get game from game manager
	game, err := h.gameManager.GetGame(gameID)
	if err != nil {
		h.logger.Errorf("Failed to get game: %v", err)
		return echo.NewHTTPError(http.StatusNotFound, "Game not found")
	}

	return c.JSON(http.StatusOK, game)
}

// RollDice handles the roll dice action
func (h *GameHandler) RollDice(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeRollDice)
}

// BuyProperty handles the buy property action
func (h *GameHandler) BuyProperty(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeBuyProperty)
}

// PayRent handles the pay rent action
func (h *GameHandler) PayRent(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypePayRent)
}

// DrawCard handles the draw card action
func (h *GameHandler) DrawCard(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeDrawCard)
}

// UseCard handles the use card action
func (h *GameHandler) UseCard(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeUseCard)
}

// MortgageProperty handles the mortgage property action
func (h *GameHandler) MortgageProperty(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeMortgageProperty)
}

// UnmortgageProperty handles the unmortgage property action
func (h *GameHandler) UnmortgageProperty(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeUnmortgageProperty)
}

// BuildEngagement handles the build engagement action
func (h *GameHandler) BuildEngagement(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeBuildEngagement)
}

// BuildCheckmark handles the build checkmark action
func (h *GameHandler) BuildCheckmark(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeBuildCheckmark)
}

// EndTurn handles the end turn action
func (h *GameHandler) EndTurn(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeEndTurn)
}

// InitiateTrade handles the initiate trade action
func (h *GameHandler) InitiateTrade(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeTrade)
}

// RespondToTrade handles the respond to trade action
func (h *GameHandler) RespondToTrade(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeTrade)
}

// SpecialAction handles special actions
func (h *GameHandler) SpecialAction(c echo.Context) error {
	return h.handleGameAction(c, models.ActionTypeSpecial)
}

// CleanupStaleGames removes stale/duplicate game records from the database
func (h *GameHandler) CleanupStaleGames(c echo.Context) error {
	logger := c.Get("logger").(*zap.SugaredLogger)
	logger.Info("Starting cleanup of stale game rooms")

	// Get stale games (games older than 24 hours or with duplicate IDs)
	staleGames, err := h.gameManager.CleanupStaleGames()
	if err != nil {
		logger.Errorf("Error cleaning up stale games: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to clean up stale games")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":      "Stale games cleanup completed",
		"gamesRemoved": len(staleGames),
		"games":        staleGames,
	})
}

// ResetGame resets an abandoned game back to LOBBY status
func (h *GameHandler) ResetGame(c echo.Context) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// Get user ID from context (set by JWT middleware)
	userID := c.Get("userID").(string)

	// Get the game to check its status
	game, err := h.gameManager.GetGame(gameID)
	if err != nil {
		h.logger.Errorf("Failed to get game for reset: %v", err)
		return echo.NewHTTPError(http.StatusNotFound, "Game not found")
	}

	// Only allow resetting abandoned games
	if game.Status != models.GameStatusAbandoned {
		return echo.NewHTTPError(http.StatusBadRequest, "Only abandoned games can be reset")
	}

	// Reset the game status to LOBBY
	err = h.gameManager.ResetGameStatus(gameID, userID)
	if err != nil {
		h.logger.Errorf("Failed to reset game: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to reset game")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "Game has been reset to LOBBY status",
	})
}

// SyncGameState forces a complete game state sync to all clients
func (h *GameHandler) SyncGameState(c echo.Context) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// Normalize gameID to lowercase to ensure consistent handling
	gameID = strings.ToLower(gameID)
	h.logger.Infof("Normalized gameID to lowercase for state sync: %s", gameID)

	// Get the complete game data
	game, err := h.gameManager.GetGame(gameID)
	if err != nil {
		h.logger.Errorf("Failed to get game for state sync: %v", err)
		return echo.NewHTTPError(http.StatusNotFound, "Game not found")
	}

	// Log player token data for debugging
	h.logger.Infof("Game %s has %d players before state sync", gameID, len(game.Players))
	for _, player := range game.Players {
		h.logger.Infof("Player %s has token: %s", player.ID, player.CharacterToken)
	}

	// Broadcast complete state to all clients
	h.wsHub.BroadcastCompleteState(gameID, game)
	h.logger.Infof("Initiated complete state sync for game %s", gameID)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "Game state sync initiated",
	})
}

// handleGameAction is a helper function to handle game actions
func (h *GameHandler) handleGameAction(c echo.Context, actionType models.ActionType) error {
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	var req ActionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	// Get user ID from context (set by JWT middleware)
	userID := c.Get("userID").(string)

	// Create game action
	action := models.GameAction{
		Type:     actionType,
		PlayerID: userID,
		GameID:   gameID,
		Payload:  req.Payload,
	}

	// Process action
	err := h.gameManager.ProcessGameAction(action)
	if err != nil {
		h.logger.Errorf("Failed to process action: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to process action")
	}

	return c.NoContent(http.StatusNoContent)
}
