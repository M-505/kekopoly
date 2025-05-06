/**
 * Utility functions for managing localStorage
 */

/**
 * Clear all game-related localStorage data
 * @param {string} gameId - Optional game ID to clear only data for a specific game
 */
export const clearGameStorageData = (gameId = null) => {
  try {
    // Keys to clear for all games
    const generalKeys = [
      'kekopoly_game_started',
      'kekopoly_game_phase',
      'kekopoly_navigation_timestamp',
      'kekopoly_force_redirect',
      'kekopoly_socket_preserve',
      'kekopoly_socket_timestamp',
      'kekopoly_game_start_timeout_id'
    ];
    
    // Keys that may have game-specific data
    const gameSpecificKeys = [
      'kekopoly_game_id',
      'kekopoly_socket_gameId',
      'kekopoly_socket_playerId',
      'kekopoly_player_token_data'
    ];
    
    // Clear general keys
    generalKeys.forEach(key => localStorage.removeItem(key));
    
    // Clear game-specific keys
    if (gameId) {
      // Only clear if the stored game ID matches the provided game ID
      gameSpecificKeys.forEach(key => {
        const storedValue = localStorage.getItem(key);
        if (key === 'kekopoly_game_id' && storedValue === gameId) {
          localStorage.removeItem(key);
        } else if (key === 'kekopoly_socket_gameId' && storedValue === gameId) {
          localStorage.removeItem(key);
        } else if (key === 'kekopoly_player_token_data') {
          try {
            const tokenData = JSON.parse(storedValue);
            if (tokenData && tokenData.gameId === gameId) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      });
      
      // Also clear any game-specific player data
      localStorage.removeItem(`kekopoly_player_${gameId}`);
      localStorage.removeItem(`kekopoly_player_token_${gameId}`);
    } else {
      // Clear all game-specific keys if no game ID provided
      gameSpecificKeys.forEach(key => localStorage.removeItem(key));
      
      // Find and clear any game-specific player data
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('kekopoly_player_') || key.includes('_game_'))) {
          localStorage.removeItem(key);
        }
      }
    }
    
    console.log(`[STORAGE] Cleared game storage data${gameId ? ` for game ${gameId}` : ''}`);
    return true;
  } catch (e) {
    console.error('[STORAGE] Error clearing game storage data:', e);
    return false;
  }
};

/**
 * Check if a game exists in localStorage
 * @param {string} gameId - Game ID to check
 * @returns {boolean} - True if the game exists in localStorage
 */
export const gameExistsInStorage = (gameId) => {
  try {
    const storedGameId = localStorage.getItem('kekopoly_game_id');
    return storedGameId === gameId;
  } catch (e) {
    console.error('[STORAGE] Error checking if game exists in storage:', e);
    return false;
  }
};

/**
 * Set game data in localStorage
 * @param {string} gameId - Game ID
 * @param {boolean} started - Whether the game has started
 * @param {string} phase - Game phase (e.g., 'setup', 'playing')
 */
export const setGameStorageData = (gameId, started = true, phase = 'playing') => {
  try {
    localStorage.setItem('kekopoly_game_started', started.toString());
    localStorage.setItem('kekopoly_game_id', gameId);
    localStorage.setItem('kekopoly_game_phase', phase);
    localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
    
    console.log(`[STORAGE] Set game storage data for game ${gameId}`);
    return true;
  } catch (e) {
    console.error('[STORAGE] Error setting game storage data:', e);
    return false;
  }
};
