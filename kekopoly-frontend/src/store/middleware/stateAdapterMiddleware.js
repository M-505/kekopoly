import { addPlayer, updatePlayer } from '../playerSlice';
import { setPlayers } from '../gameSlice';
import { debounce } from '../../utils/debounceUtils';

/**
 * State Adapter Middleware - Optimized Version with Debouncing
 *
 * This middleware synchronizes player data between the gameSlice (array format)
 * and playerSlice (object format) to ensure consistent state across the application.
 *
 * It intercepts specific actions that modify player data and ensures the changes
 * are reflected in both stores, with optimizations to prevent unnecessary updates.
 *
 * Debouncing is used to limit the frequency of synchronization operations.
 */
// Create debounced sync functions to limit update frequency
// These functions are created outside the middleware to persist between calls

// Debounced function to sync from playerSlice to gameSlice
const debouncedSyncToGameSlice = debounce((store, playerSlicePlayers) => {
  try {
    // Set sync flag to prevent circular updates
    window._isPlayerSyncInProgress = true;

    // Convert playerSlice players (object) to array format for gameSlice
    const playersArray = Object.values(playerSlicePlayers).map(player => ({
      id: player.id,
      name: player.name || `Player_${player.id.substring(0, 4)}`,
      token: player.token || player.characterToken || player.emoji || '👤',
      characterToken: player.characterToken || player.token || player.emoji || '👤',
      emoji: player.emoji || '👤',
      color: player.color || 'gray.500',
      position: player.position !== undefined ? player.position : 0,
      balance: player.balance !== undefined ? player.balance : 1500,
      properties: player.properties || [],
      inJail: player.inJail || false,
      jailTurns: player.jailTurns || 0,
      isReady: player.isReady || false,
      isHost: player.isHost || false,
      walletAddress: player.walletAddress || '',
      _tokenInitialized: player._tokenInitialized || false,
      kekels: player.kekels || {
        k100: 2,
        k50: 5,
        k10: 10,
      },
    }));

    // Update the gameSlice with the converted players array
    // Pass isSync flag in meta to prevent circular updates
    store.dispatch(setPlayers(playersArray, { isSync: true }));

    // console.log('[SYNC] Debounced sync from playerSlice to gameSlice completed');
  } finally {
    // Clear sync flag
    window._isPlayerSyncInProgress = false;
  }
}, 100); // Debounce for 100ms

// Debounced function to sync specific player position
const debouncedSyncPlayerPosition = debounce((store, playerId, newPosition) => {
  try {
    // Set sync flag to prevent circular updates
    window._isPlayerSyncInProgress = true;

    // Update player position in playerSlice
    store.dispatch(updatePlayer({
      playerId,
      updates: {
        position: newPosition
      }
    }));

    // console.log(`[SYNC] Debounced sync of player ${playerId} position to ${newPosition}`);
  } finally {
    // Clear sync flag
    window._isPlayerSyncInProgress = false;
  }
}, 50); // Shorter debounce for position updates (50ms)

const stateAdapterMiddleware = store => next => action => {
  // Process the action first
  const result = next(action);

  // Flag to prevent circular updates
  // We'll check if we're already in the middle of a sync operation
  if (window._isPlayerSyncInProgress) {
    return result;
  }

  // Get current state after the action has been processed
  const state = store.getState();

  // Handle synchronization based on action type
  switch (action.type) {
    // When players are added to playerSlice, sync to gameSlice
    case 'players/addPlayer': {
      const { players: playerSlicePlayers } = state.players;
      const { players: gameSlicePlayers } = state.game;

      // Check if we need to sync (different number of players in stores)
      if (Object.keys(playerSlicePlayers).length !== gameSlicePlayers.length) {
        // Use debounced sync function to limit update frequency
        debouncedSyncToGameSlice(store, playerSlicePlayers);
        // console.log('[SYNC] Scheduled debounced sync after player added');
      }
      break;
    }

    // When players are updated in playerSlice, sync to gameSlice
    case 'players/updatePlayer': {
      // Only sync on important player updates
      const updates = action.payload?.updates;

      // Skip synchronization for non-critical updates to reduce overhead
      if (updates && Object.keys(updates).length === 1 &&
          (updates._tokenInitialized !== undefined || updates._lastSynced !== undefined)) {
        return result;
      }

      const { players: playerSlicePlayers } = state.players;

      // Use debounced sync function to limit update frequency
      debouncedSyncToGameSlice(store, playerSlicePlayers);
      // console.log('[SYNC] Scheduled debounced sync after player update');
      break;
    }

    // When players are set in gameSlice, sync to playerSlice
    case 'game/setPlayers': {
      // Skip if this is a sync operation from playerSlice to gameSlice
      if (action.meta?.isSync) {
        return result;
      }

      const { players: playerSlicePlayers } = state.players;
      const { players: gameSlicePlayers } = state.game;

      try {
        // Set sync flag to prevent circular updates
        window._isPlayerSyncInProgress = true;

        // Check each player in gameSlice
        gameSlicePlayers.forEach(player => {
          if (!player || !player.id) return;

          const playerId = player.id;
          const existingPlayer = playerSlicePlayers[playerId];

          if (!existingPlayer) {
            // Player exists in gameSlice but not in playerSlice, add them
            store.dispatch(addPlayer({
              playerId,
              playerData: {
                id: playerId,
                name: player.name,
                token: player.token || player.characterToken || player.emoji || '👤',
                characterToken: player.characterToken || player.token || player.emoji || '👤',
                emoji: player.emoji || '👤',
                color: player.color || 'gray.500',
                position: player.position !== undefined ? player.position : 0,
                balance: player.balance !== undefined ? player.balance : 1500,
                properties: player.properties || [],
                inJail: player.inJail || false,
                jailTurns: player.jailTurns || 0,
                isReady: player.isReady || false,
                isHost: player.isHost || false,
                _tokenInitialized: player._tokenInitialized || false,
                walletAddress: player.walletAddress || '',
                kekels: player.kekels || {
                  k100: 2,
                  k50: 5,
                  k10: 10,
                },
              }
            }));
          } else {
            // Player exists in both stores, only update if there are actual changes
            const updates = {};
            let hasChanges = false;

            // Only include fields that have actually changed
            if (player.name && player.name !== existingPlayer.name) {
              updates.name = player.name;
              hasChanges = true;
            }

            if (player.position !== undefined && player.position !== existingPlayer.position) {
              updates.position = player.position;
              hasChanges = true;
            }

            if (player.balance !== undefined && player.balance !== existingPlayer.balance) {
              updates.balance = player.balance;
              hasChanges = true;
            }

            // Only dispatch update if there are actual changes
            if (hasChanges) {
              store.dispatch(updatePlayer({
                playerId,
                updates
              }));
            }
          }
        });
      } finally {
        // Clear sync flag
        window._isPlayerSyncInProgress = false;
      }
      break;
    }

    // When a player moves in gameSlice, sync to playerSlice
    case 'game/movePlayer': {
      const { playerId, newPosition } = action.payload;

      // Use debounced sync function for position updates
      debouncedSyncPlayerPosition(store, playerId, newPosition);
      // console.log(`[SYNC] Scheduled debounced sync of player ${playerId} position to ${newPosition}`);
      break;
    }

    // No synchronization needed for other actions
    default:
      break;
  }

  return result;
};

export default stateAdapterMiddleware;