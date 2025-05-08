/**
 * Socket Utilities
 * 
 * This module contains utility functions for the socket service.
 */

import { log, logError, logWarning } from '../../utils/logger';

/**
 * Processes a recovered message from a parsing error
 * @param {Object} data - The recovered message data
 */
export function processRecoveredMessage(data) {
  log('RECOVERY', 'Processing recovered message:', data);

  try {
    // Route the message to the appropriate handler based on type
    switch (data.type) {
      case 'player_joined':
        if (this.handlePlayerJoined) {
          this.handlePlayerJoined(data.player);
        }
        break;

      case 'active_players':
        if (this.handleActivePlayers) {
          this.handleActivePlayers(data);
        }
        break;

      case 'new_game_created':
        if (this.onNewGameCallback && data.game) {
          this.onNewGameCallback(data.game);
        }
        break;

      case 'game:start':
      case 'game_started':
      case 'game_state_update':  // Also handle game state updates that indicate game started
        log('RECOVERED', `Game start message (type: ${data.type}) recovered from malformed message at ${new Date().toISOString()}`);

        // Check if this is a game state update that indicates the game has started
        const isGameStarted = data.type === 'game_started' ||
                             data.type === 'game:start' ||
                             (data.type === 'game_state_update' &&
                              ((data.state && (data.state.status === 'ACTIVE' || data.state.gameStarted === true)) ||
                               (data.status === 'ACTIVE' || data.gameStarted === true)));

        if (isGameStarted && this.handleGameStarted) {
          this.handleGameStarted(data);
        }
        break;

      default:
        // Try to find a handler method based on the message type
        const handlerName = `handle${data.type.split('_').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join('')}`;
        
        if (this[handlerName] && typeof this[handlerName] === 'function') {
          log('RECOVERY', `Found handler method: ${handlerName}`);
          this[handlerName](data);
        } else {
          log('RECOVERY', `No handler found for message type: ${data.type}`);
        }
    }
  } catch (error) {
    logError('RECOVERY', 'Error processing recovered message:', error);
  }
}

/**
 * Attempts to recover from a synchronization error
 * @param {string} errorType - The type of error
 */
export function attemptSyncRecovery(errorType) {
  log('SYNC_RECOVERY', `Attempting recovery from ${errorType}`);

  // Request fresh game state
  if (this.socket && this.socket.readyState === WebSocket.OPEN) {
    log('SYNC_RECOVERY', 'Requesting fresh game state');
    this.sendMessage('get_game_state', { full: true });
    this.sendMessage('get_active_players', {});
  }
}

/**
 * Handles a synchronization error
 * @param {string} errorType - The type of error
 * @param {Error} error - The error object
 */
export function handleSyncError(errorType, error) {
  logError('SYNC_ERROR', `Sync error of type ${errorType}:`, error);

  // Attempt recovery
  this.attemptSyncRecovery(errorType);
}

/**
 * Ensures game state is properly initialized
 */
export function ensureGameStateInitialized() {
  // Check if we're transitioning to the game
  if (this.isTransitioningToGame) {
    log('TRANSITION', 'Checking game transition state');

    // Check if we have player data to restore
    const playerData = this.loadState('initialPlayerData') || this.loadState('lastSentPlayerData');
    
    // Check if this is a recent transition (within the last 10 seconds)
    const transitionTimestamp = parseInt(localStorage.getItem('kekopoly_navigation_timestamp') || '0');
    const isRecentTransition = Date.now() - transitionTimestamp < 10000;
    
    if (isRecentTransition && playerData) {
      log('TRANSITION', 'Recent game transition detected, restoring player data');

      // Request game state and active players
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Send player data to ensure server has latest state
        this.sendMessage('update_player', {
          playerId: this.playerId,
          ...playerData
        });

        // Request full game state and active players
        this.sendMessage('get_game_state', { full: true });
        this.sendMessage('get_active_players');

        // Send any queued messages
        this.sendQueuedMessages();
      }
    }

    // Reset transition flags
    this.isTransitioningToGame = false;
    this.saveState('isTransitioningToGame', false);
  }
}
