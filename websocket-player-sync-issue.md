# WebSocket Player Data Synchronization Issue and Solution

## Problem Overview

The Kekopoly game was experiencing an issue where players were not appearing on the Game Board despite successful WebSocket connections. Players would connect to the game room, but when transitioning to the actual game board, their avatars and positions would not be properly displayed. This created a confusing user experience where players could not see each other on the board, even though they were successfully connected to the game.

## Root Cause Analysis

The root cause of the issue was a data synchronization problem between two Redux stores:

1. **playerSlice**: Stores player data as an object with player IDs as keys
   ```javascript
   // playerSlice.js
   const initialState = {
     players: {}, // Object format with player IDs as keys
     selectedToken: null,
     selectedColor: null,
     localPlayerId: null,
   };
   ```

2. **gameSlice**: Stores player data as an array
   ```javascript
   // gameSlice.js
   const initialState = {
     players: [], // Array format
     currentPlayerIndex: 0,
     // ... other game state
   };
   ```

The issue occurred because:

1. When players joined the game, their data was correctly stored in the `playerSlice` (object format)
2. However, this data was not automatically synchronized to the `gameSlice` (array format)
3. The GameBoard component primarily used the `gameSlice` data to render players on the board
4. When WebSocket events updated player positions, they were sometimes only updating one of the stores, leading to inconsistent state

This created a situation where players could be present in one store but not the other, or have different positions in each store, causing rendering issues and gameplay confusion.

## Solution Implemented

We implemented a bidirectional synchronization mechanism between the two Redux stores to ensure player data consistency:

### 1. Synchronization from playerSlice to gameSlice

A `syncPlayerData` function was added to the GameBoard component to convert and synchronize player data from the object format in `playerSlice` to the array format in `gameSlice`:

```javascript
const syncPlayerData = useCallback(() => {
  // Log player data in both stores before synchronization
  console.log('[PLAYER_SYNC] Player data before synchronization:');
  console.log('[PLAYER_SYNC] lobbyPlayers (playerSlice):', lobbyPlayers);
  console.log('[PLAYER_SYNC] gamePlayers (gameSlice):', gamePlayers);
  
  if (Object.keys(lobbyPlayers || {}).length > 0 &&
      (gamePlayers.length === 0 ||
       Object.keys(lobbyPlayers).length !== gamePlayers.length)) {
    
    console.log('[PLAYER_SYNC] Synchronizing player data from playerSlice to gameSlice');
    
    // Convert playerSlice players (object) to array format for gameSlice
    const playersArray = Object.values(lobbyPlayers).map(player => ({
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
    dispatch(setPlayers(playersArray));
    
    // Log player data after synchronization
    console.log('[PLAYER_SYNC] Successfully synchronized player data to gameSlice');
    console.log('[PLAYER_SYNC] Player data after synchronization:', playersArray);
  } else {
    console.log('[PLAYER_SYNC] No synchronization needed or no players to synchronize');
  }
}, [lobbyPlayers, gamePlayers, dispatch]);
```

### 2. Synchronization from gameSlice to playerSlice

We also added code to synchronize data from `gameSlice` back to `playerSlice` when players are found in the game state but not in the Redux store:

```javascript
// If we have players in the game state but not in the Redux store, sync them to Redux
if (players.length > 0 && reduxPlayers.length === 0) {
  console.log('[PLAYER_DEBUG] Found players in game state but not in Redux store, syncing...');

  // Add each player to the Redux store
  players.forEach(player => {
    if (player && player.id) {
      dispatch(addPlayer({
        playerId: player.id,
        playerData: player
      }));
    }
  });
}
```

### 3. Automatic Synchronization Triggers

The synchronization is triggered in multiple scenarios to ensure data consistency:

1. **On component mount**: To ensure initial synchronization
   ```javascript
   useEffect(() => {
     syncPlayerData();
   }, [syncPlayerData, lobbyPlayers, gamePlayers]);
   ```

2. **When player data changes**: The dependency array includes `lobbyPlayers` and `gamePlayers` to trigger synchronization when either store changes

3. **After WebSocket reconnection**: To ensure data is synchronized after connection issues
   ```javascript
   const handleWebSocketConnected = (event) => {
     console.log('[WEBSOCKET_EVENT] WebSocket connected event received');
     setSocketConnected(true);

     // Request active players and game state
     setTimeout(() => {
       if (socketService?.socket?.readyState === WebSocket.OPEN) {
         console.log('[WEBSOCKET_EVENT] Requesting active players and game state after connection event');
         socketService.sendMessage('get_active_players');
         socketService.sendMessage('get_game_state', { full: true });
       }
     }, 200);
   };
   ```

4. **When player positions change**: To ensure position updates are reflected in both stores
   ```javascript
   // Track player position changes and animate movements
   useEffect(() => {
     // Skip if we're already animating a player
     if (animatingPlayer) return;

     // Check each player for position changes
     players.forEach(player => {
       const prevPos = prevPlayerPositions.current[player.id];
       const newPos = player.position;

       // Update positions in both stores when changes are detected
       // ...
     });
   }, [players, dispatch, animatingPlayer, currentPlayer, lastRoll]);
   ```

## Code Changes

The following key files were modified to implement the solution:

1. **kekopoly-frontend/src/components/game/GameBoard.jsx**
   - Added `syncPlayerData` function to convert and synchronize player data between stores
   - Added useEffect hooks to trigger synchronization at appropriate times
   - Enhanced player position tracking to ensure consistent state
   - Added debugging logs to track synchronization status

2. **kekopoly-frontend/src/services/socketService.js**
   - Enhanced WebSocket event handling to ensure player data is properly updated in both stores
   - Improved reconnection logic to maintain player data consistency
   - Added additional logging for debugging synchronization issues

3. **kekopoly-frontend/src/store/gameSlice.js**
   - No structural changes, but ensured the `setPlayers` action was properly implemented to handle the array format

4. **kekopoly-frontend/src/store/playerSlice.js**
   - No structural changes, but ensured the `addPlayer` and `updatePlayer` actions were properly implemented to handle the object format

## Testing and Verification

To verify the fix works correctly, follow these steps:

1. **Basic Connection Test**:
   - Start the game server
   - Connect multiple players to a game room
   - Transition to the game board
   - Verify all players appear on the board with correct positions

2. **Reconnection Test**:
   - With multiple players in a game, disconnect one player (close browser tab)
   - Reconnect the player to the game
   - Verify the player reappears on the board with the correct position

3. **Movement Test**:
   - Roll dice to move a player
   - Verify the player's position updates correctly on all connected clients
   - Verify the player's position is consistent in both Redux stores

4. **Console Verification**:
   - Open browser developer tools
   - Check for logs with the `[PLAYER_SYNC]` prefix
   - Verify that player data is consistent between stores
   - No errors or warnings related to player synchronization should appear

## Future Recommendations

To prevent similar issues in the future and improve the codebase, we recommend:

1. **Standardize Data Format**: Consider standardizing on a single data format for players across the application. Either:
   - Convert `playerSlice` to use an array format like `gameSlice`, or
   - Convert `gameSlice` to use an object format like `playerSlice`

2. **Implement a Middleware Solution**: Create a Redux middleware that automatically synchronizes specific parts of the state between slices, eliminating the need for manual synchronization in components.

3. **Enhance WebSocket Protocol**: Update the WebSocket protocol to include more explicit player state information in each message, reducing the need for separate state management.

4. **Add Automated Tests**: Create automated tests specifically for player data synchronization to catch similar issues early in development.

5. **Improve Error Handling**: Enhance error handling for WebSocket disconnections and reconnections to better maintain state consistency.

6. **Consider Using Redux Toolkit's Entity Adapters**: For managing normalized state, which could simplify the management of player data across the application.

By implementing these recommendations, the application will be more robust against data synchronization issues and provide a more consistent experience for users.