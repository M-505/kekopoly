/**
 * Synchronization Utilities
 *
 * This module contains methods for synchronizing game state between
 * the client and server, and between different Redux stores.
 */

import { log, logWarning } from '../../utils/logger';
import { store } from '../../store/store';
import { setPlayers } from '../../store/gameSlice';
import { debounce } from '../../utils/debounceUtils';

// Interval IDs for periodic synchronization
let stateSyncInterval = null;
let playerSyncInterval = null;

/**
 * Starts periodic state synchronization
 */
export function startPeriodicStateSync() {
  // Clear any existing intervals first
  stopPeriodicStateSync();

  log('SYNC', 'Starting periodic state synchronization');

  // Set up interval for game state synchronization (every 10 seconds)
  stateSyncInterval = setInterval(() => {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      log('SYNC', 'Requesting periodic game state update');
      this.sendMessage('get_game_state', {});
    }
  }, 10000);

  // Set up interval for player data synchronization (every 5 seconds)
  playerSyncInterval = setInterval(() => {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      log('SYNC', 'Synchronizing player data between stores');
      this.syncPlayerDataBetweenStores();
    }
  }, 5000);
}

/**
 * Stops periodic state synchronization
 */
export function stopPeriodicStateSync() {
  if (stateSyncInterval) {
    clearInterval(stateSyncInterval);
    stateSyncInterval = null;
  }

  if (playerSyncInterval) {
    clearInterval(playerSyncInterval);
    playerSyncInterval = null;
  }

  log('SYNC', 'Stopped periodic state synchronization');
}

/**
 * Sets up a retry mechanism to check if game has started
 */
export function setupGameStartRetryCheck() {
  log('GAME_CHECK', 'Setting up game start retry check');

  // Check current location
  const currentLocation = window.location.pathname;
  const isOnGameBoard = currentLocation.includes('/game/');

  log('GAME_CHECK', `Current location: ${currentLocation}, isOnGameBoard: ${isOnGameBoard}`);

  // If we're not on the game board, set up a retry mechanism
  if (!isOnGameBoard) {
    log('GAME_CHECK', 'Not on game board, setting up retry mechanism');

    // Store navigation timestamp
    try {
      localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
    } catch (e) {
      logWarning('GAME_CHECK', 'Could not store navigation timestamp:', e);
    }

    // Create a custom event to trigger navigation
    const gameStartEvent = new CustomEvent('game-started', {
      detail: {
        gameId: this.gameId,
        timestamp: Date.now()
      }
    });

    // Dispatch the event
    log('GAME_CHECK', 'Dispatching game-started event');
    window.dispatchEvent(gameStartEvent);

    // Set up a retry mechanism in case the event doesn't trigger navigation
    setTimeout(() => {
      // Check if we're still not on the game board
      if (!window.location.pathname.includes('/game/')) {
        log('GAME_CHECK', 'Still not on game board after timeout, retrying');

        // Try dispatching the event again
        window.dispatchEvent(gameStartEvent);

        // Set the transition flag to ensure proper state restoration after navigation
        this.isTransitioningToGame = true;
        this.saveState('isTransitioningToGame', true);
      }
    }, 2000);
  }
}

/**
 * Synchronizes player data between playerSlice (object format) and gameSlice (array format)
 */
export function syncPlayerDataBetweenStores() {
  // Initialize the debounced function if needed
  this._initDebouncedSync();

  // Use the debounced version to prevent excessive updates
  this._debouncedSyncPlayerData();
}

/**
 * Performs the actual player data synchronization
 */
export function _performPlayerDataSync() {
  const { dispatch } = store;
  const state = store.getState();

  // Get players from playerSlice (object format)
  const playerSlicePlayers = state.players.players;

  // Convert to array format for gameSlice
  const playersArray = Object.values(playerSlicePlayers);

  log('SYNC', `Synchronizing ${playersArray.length} players between stores`);

  // Update gameSlice with the array of players
  dispatch(setPlayers(playersArray));
}

/**
 * Initializes the debounced sync function
 */
export function _initDebouncedSync() {
  if (!this._debouncedSyncPlayerData) {
    // Create a debounced version of the sync function
    this._debouncedSyncPlayerData = debounce(() => {
      this._performPlayerDataSync();
    }, 500); // 500ms debounce
  }
}
