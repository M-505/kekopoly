package manager

import (
	"errors"
	"fmt"
	"time"

	"github.com/kekopoly/backend/internal/game/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// ResetGameStatus resets an abandoned game back to LOBBY status
func (gm *GameManager) ResetGameStatus(gameID string, requestingPlayerID string) error {
	// Get game from database to ensure we have the latest state
	objID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	collection := gm.mongoClient.Database(gm.dbName).Collection("games")
	var game models.Game
	err = collection.FindOne(gm.ctx, bson.M{"_id": objID}).Decode(&game)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return fmt.Errorf("game not found")
		}
		return fmt.Errorf("failed to get game: %w", err)
	}

	// Verify the game is in ABANDONED status
	if game.Status != models.GameStatusAbandoned {
		return fmt.Errorf("only abandoned games can be reset")
	}

	// Update game status to LOBBY
	now := time.Now()
	_, err = collection.UpdateOne(
		gm.ctx,
		bson.M{"_id": objID},
		bson.M{"$set": bson.M{
			"status":       models.GameStatusLobby,
			"updatedAt":    now,
			"lastActivity": now,
			"hostId":       requestingPlayerID, // Set the requesting player as the new host
		}},
	)

	if err != nil {
		return fmt.Errorf("failed to update game status: %w", err)
	}

	// Create or update game session
	gm.activeGamesMutex.Lock()
	defer gm.activeGamesMutex.Unlock()

	// Update the game object with the new status
	game.Status = models.GameStatusLobby
	game.UpdatedAt = now
	game.LastActivity = now
	game.HostID = requestingPlayerID

	// Create a new session or update existing one
	session, exists := gm.activeGames[gameID]
	if !exists {
		session = &GameSession{
			Game:              &game,
			ConnectedPlayers:  make(map[string]string),
			PlayerConnections: make(map[string]PlayerConnection),
		}
		gm.activeGames[gameID] = session
	} else {
		session.mutex.Lock()
		session.Game.Status = models.GameStatusLobby
		session.Game.UpdatedAt = now
		session.Game.LastActivity = now
		session.Game.HostID = requestingPlayerID
		session.mutex.Unlock()
	}

	gm.logger.Infof("Game %s reset from ABANDONED to LOBBY status by player %s", gameID, requestingPlayerID)
	return nil
}
