package manager

import (
	"github.com/kekopoly/backend/internal/game/models"
)

// GetActiveGames returns all active games and games with pending operations
func (gm *GameManager) GetActiveGames() ([]*models.Game, error) {
	var games []*models.Game

	// Get games from active games in memory
	gm.activeGamesMutex.RLock()
	defer gm.activeGamesMutex.RUnlock()

	for _, session := range gm.activeGames {
		session.mutex.RLock()
		// Include games in ACTIVE or LOBBY status to ensure we process messages for games
		// that are transitioning from LOBBY to ACTIVE
		if session.Game.Status == models.GameStatusActive || session.Game.Status == models.GameStatusLobby {
			// Create a copy to avoid race conditions
			gameCopy := *session.Game
			games = append(games, &gameCopy)
		}
		session.mutex.RUnlock()
	}
	// Removed debug log that was causing excessive output

	if len(games) == 0 {
		// Return empty slice instead of error to allow worker to continue checking
		// This prevents the worker from sleeping when there are no active games
		return []*models.Game{}, nil
	}

	return games, nil
}
