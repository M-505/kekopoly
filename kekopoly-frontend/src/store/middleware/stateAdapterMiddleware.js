import { addPlayer, updatePlayer } from '../playerSlice';
import { setPlayers } from '../gameSlice';

/**
 * State Adapter Middleware
 *
 * This middleware synchronizes player data between the gameSlice (array format)
 * and playerSlice (object format) to ensure consistent state across the application.
 *
 * It intercepts specific actions that modify player data and ensures the changes
 * are reflected in both stores.
 */
const stateAdapterMiddleware = store => next => action => {
  // Process the action first
  const result = next(action);

  // Get current state after the action has been processed
  const state = store.getState();

  // Flag to prevent circular updates
  // We'll check if we're already in the middle of a sync operation
  if (window._isPlayerSyncInProgress) {
    return result;
  }

  // Handle synchronization based on action type
  switch (action.type) {
    // When players are added to playerSlice, sync to gameSlice
    case 'players/addPlayer': {
      const { players: playerSlicePlayers } = state.players;
      const { players: gameSlicePlayers } = state.game;

      console.log('[STATE_ADAPTER] Detected player added to playerSlice, syncing to gameSlice');

      // Check if we need to sync (different number of players in stores)
      if (Object.keys(playerSlicePlayers).length !== gameSlicePlayers.length) {
        try {
          // Set sync flag to prevent circular updates
          window._isPlayerSyncInProgress = true;

          // Convert playerSlice players (object) to array format for gameSlice
          const playersArray = Object.values(playerSlicePlayers).map(player => ({
            id: player.id,
            name: player.name || `Player_${player.id.substring(0, 4)}`,
            token: player.token || player.characterToken || player.emoji || '👤',
            color: player.color || 'gray.500',
            position: player.position !== undefined ? player.position : 0,
            balance: player.balance !== undefined ? player.balance : 1500,
            properties: player.properties || [],
            inJail: player.inJail || false,
            jailTurns: player.jailTurns || 0,
            isReady: player.isReady || false,
            isHost: player.isHost || false,
            walletAddress: player.walletAddress || '',
            kekels: player.kekels || {
              k100: 2,
              k50: 5,
              k10: 10,
            },
          }));

          // Update the gameSlice with the converted players array
          // Pass isSync=true to prevent circular updates
          store.dispatch(setPlayers(playersArray, true));
          console.log('[STATE_ADAPTER] Synchronized players from playerSlice to gameSlice');
        } finally {
          // Clear sync flag
          window._isPlayerSyncInProgress = false;
        }
      }
      break;
    }

    // When players are updated in playerSlice, sync to gameSlice
    case 'players/updatePlayer': {
      const { players: playerSlicePlayers } = state.players;

      console.log('[STATE_ADAPTER] Detected player update in playerSlice, syncing to gameSlice');

      try {
        // Set sync flag to prevent circular updates
        window._isPlayerSyncInProgress = true;

        // Convert playerSlice players (object) to array format for gameSlice
        const playersArray = Object.values(playerSlicePlayers).map(player => ({
          id: player.id,
          name: player.name || `Player_${player.id.substring(0, 4)}`,
          token: player.token || player.characterToken || player.emoji || '👤',
          color: player.color || 'gray.500',
          position: player.position !== undefined ? player.position : 0,
          balance: player.balance !== undefined ? player.balance : 1500,
          properties: player.properties || [],
          inJail: player.inJail || false,
          jailTurns: player.jailTurns || 0,
          isReady: player.isReady || false,
          isHost: player.isHost || false,
          walletAddress: player.walletAddress || '',
          kekels: player.kekels || {
            k100: 2,
            k50: 5,
            k10: 10,
          },
        }));

        // Update the gameSlice with the converted players array
        // Pass isSync=true to prevent circular updates
        store.dispatch(setPlayers(playersArray, true));
        console.log('[STATE_ADAPTER] Synchronized players from playerSlice to gameSlice after update');
      } finally {
        // Clear sync flag
        window._isPlayerSyncInProgress = false;
      }
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

      console.log('[STATE_ADAPTER] Detected players set in gameSlice, syncing to playerSlice');

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
                walletAddress: player.walletAddress || '',
                kekels: player.kekels || {
                  k100: 2,
                  k50: 5,
                  k10: 10,
                },
              }
            }));
            console.log(`[STATE_ADAPTER] Added player ${playerId} to playerSlice`);
          } else {
            // Player exists in both stores, ensure all critical fields are synced
            // Always update to ensure consistent state between slices
            store.dispatch(updatePlayer({
              playerId,
              updates: {
                name: player.name || existingPlayer.name,
                token: player.token || player.characterToken || player.emoji || existingPlayer.token || '👤',
                characterToken: player.characterToken || player.token || player.emoji || existingPlayer.characterToken || '👤',
                emoji: player.emoji || existingPlayer.emoji || '👤',
                color: player.color || existingPlayer.color || 'gray.500',
                position: player.position !== undefined ? player.position : (existingPlayer.position || 0),
                balance: player.balance !== undefined ? player.balance : (existingPlayer.balance || 1500),
                properties: player.properties || existingPlayer.properties || [],
                inJail: player.inJail !== undefined ? player.inJail : (existingPlayer.inJail || false),
                jailTurns: player.jailTurns !== undefined ? player.jailTurns : (existingPlayer.jailTurns || 0),
                isReady: player.isReady !== undefined ? player.isReady : (existingPlayer.isReady || false),
                isHost: player.isHost !== undefined ? player.isHost : (existingPlayer.isHost || false),
              }
            }));
            console.log(`[STATE_ADAPTER] Updated player ${playerId} in playerSlice with complete data`);
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

      console.log(`[STATE_ADAPTER] Detected player ${playerId} moved to position ${newPosition}, syncing to playerSlice`);

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
      } finally {
        // Clear sync flag
        window._isPlayerSyncInProgress = false;
      }
      break;
    }

    // Add more cases for other actions that modify player data
    default:
      // No synchronization needed for other actions
      break;
  }

  return result;
};

export default stateAdapterMiddleware;