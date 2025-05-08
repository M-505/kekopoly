/**
 * Game Handlers
 *
 * This module contains methods for handling game-specific WebSocket messages,
 * such as game state updates, dice rolls, and turn changes.
 */

import { log, logError, logWarning } from '../../utils/logger';
import { store } from '../../store/store';
import {
  setHost,
  setMaxPlayers,
  setGameInfo,
  setGameStarted,
  setGamePhase,
  syncGameStatus,
  addGameMessage,
  setRoomCode,
  setCurrentPlayer,
  setIsRolling,
  updateDiceRoll,
  movePlayer,
  setPlayers,
  setLastTurnChangeTimestamp
} from '../../store/gameSlice';

/**
 * Handles game state update messages
 * @param {Object} data - The message data
 */
export function handleGameState(data) {
  const { dispatch } = store;

  log('GAME_STATE', 'Received game state update');

  // Extract game state from the message
  const gameState = data.state || data;

  // Update game info in Redux store
  if (gameState.info) {
    dispatch(setGameInfo(gameState.info));
  }

  // Update room code
  if (gameState.roomCode) {
    dispatch(setRoomCode(gameState.roomCode));
  }

  // Update host
  if (gameState.hostId) {
    console.log('[HOST_DEBUG] handleGameState: Setting host ID from game state:', gameState.hostId);
    dispatch(setHost(gameState.hostId));

    // Also update player isHost flags
    const state = store.getState();
    const players = state.players.players;

    // Update each player's isHost flag based on the hostId
    Object.entries(players).forEach(([playerId, player]) => {
      const isHost = playerId === gameState.hostId;
      console.log(`[HOST_DEBUG] Player ${playerId} isHost=${isHost} (current=${player.isHost})`);

      // Only dispatch if the isHost flag needs to change
      if (player.isHost !== isHost) {
        dispatch(updatePlayer({
          ...player,
          isHost
        }));
      }
    });
  }

  // Update max players
  if (gameState.maxPlayers) {
    dispatch(setMaxPlayers(gameState.maxPlayers));
  }

  // Update game started state
  if (gameState.gameStarted !== undefined) {
    dispatch(setGameStarted(gameState.gameStarted));
  }

  // Update game phase
  if (gameState.gamePhase) {
    dispatch(setGamePhase(gameState.gamePhase));
  }

  // Update game status
  if (gameState.status) {
    dispatch(syncGameStatus(gameState.status));
  }

  // Update current player
  if (gameState.currentPlayer) {
    dispatch(setCurrentPlayer(gameState.currentPlayer));
    dispatch(setLastTurnChangeTimestamp(Date.now()));
  }
}

/**
 * Handles dice rolling state messages
 * @param {boolean} isRolling - Whether dice are rolling
 */
export function handleDiceRolling(isRolling) {
  const { dispatch } = store;

  log('DICE', `Dice rolling state changed to: ${isRolling}`);
  dispatch(setIsRolling(isRolling));
}

/**
 * Handles dice rolled messages
 * @param {Object} data - The message data
 */
export function handleDiceRolled(data) {
  const { dispatch } = store;

  log('DICE', 'Dice roll result received:', data);

  // Update dice roll in Redux store
  dispatch(updateDiceRoll({
    dice1: data.dice1,
    dice2: data.dice2,
    total: data.total,
    playerId: data.playerId
  }));

  // Set rolling state to false
  dispatch(setIsRolling(false));
}

/**
 * Handles player moved messages
 * @param {Object} data - The message data
 */
export function handlePlayerMoved(data) {
  const { dispatch } = store;

  log('PLAYER_MOVE', `Player ${data.playerId} moved to position ${data.position}`);

  // Update player position in both stores
  dispatch(updatePlayerPosition({
    playerId: data.playerId,
    position: data.position
  }));

  dispatch(movePlayer({
    playerId: data.playerId,
    position: data.position
  }));
}

/**
 * Handles game started messages
 * @param {Object} data - The message data
 */
export function handleGameStarted(data) {
  const { dispatch } = store;

  log('GAME_START', 'Game started message received');

  // Update game state in Redux store
  dispatch(setGameStarted(true));
  dispatch(setGamePhase('playing'));
  dispatch(syncGameStatus('ACTIVE'));

  // Store in localStorage as a backup mechanism
  try {
    localStorage.setItem('kekopoly_game_started', 'true');
    localStorage.setItem('kekopoly_game_id', this.gameId);
    localStorage.setItem('kekopoly_game_phase', 'playing');
    localStorage.setItem('kekopoly_game_status', 'ACTIVE');
    localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
  } catch (e) {
    logWarning('GAME_START', 'Could not use localStorage:', e);
  }

  // Trigger navigation to game board for non-host players
  if (window.location.pathname.includes('/room/')) {
    log('GAME_START', 'Triggering navigation to game board');

    // Preserve socket connection for navigation
    this.preserveSocketForNavigation();

    // Force navigation regardless of other conditions if forceNavigate flag is set
    const forceNavigate = data.forceNavigate === true;

    // Use the navigateToGame function if available
    if (typeof window.navigateToGame === 'function') {
      log('GAME_START', `Using window.navigateToGame to navigate (forceNavigate: ${forceNavigate})`);
      window.navigateToGame(this.gameId);
    } else {
      // Fallback: Dispatch a custom event that the GameRoom component can listen for
      log('GAME_START', 'Dispatching game-started event for navigation');
      const gameStartedEvent = new CustomEvent('game-started', {
        detail: {
          gameId: this.gameId,
          forceNavigate: forceNavigate,
          hostId: data.hostId,
          timestamp: data.timestamp
        }
      });
      window.dispatchEvent(gameStartedEvent);
    }

    // Set a backup timeout to force navigation if the above methods don't work
    setTimeout(() => {
      if (window.location.pathname.includes('/room/')) {
        log('GAME_START', 'Backup timeout triggered, forcing navigation');

        // Try to navigate using window.location as a last resort
        window.location.href = `/game/${this.gameId}`;
      }
    }, 2000); // 2 second backup timeout
  }
}

/**
 * Handles current turn messages
 * @param {Object} data - The message data
 */
export function handleCurrentTurn(data) {
  const { dispatch } = store;

  log('TURN', `Current turn: ${data.playerId}`);

  // Update current player in Redux store
  dispatch(setCurrentPlayer(data.playerId));
  dispatch(setLastTurnChangeTimestamp(Date.now()));
}

/**
 * Handles turn changed messages
 * @param {Object} data - The message data
 */
export function handleTurnChanged(data) {
  const { dispatch } = store;

  log('TURN', `Turn changed to player: ${data.playerId}`);

  // Update current player in Redux store
  dispatch(setCurrentPlayer(data.playerId));
  dispatch(setLastTurnChangeTimestamp(Date.now()));
}

/**
 * Handles broadcast_game_started messages
 * @param {Object} data - The message data
 */
export function handleBroadcastGameStarted(data) {
  const { dispatch } = store;

  log('GAME_START', 'Received broadcast_game_started message');

  // Update game state in Redux store
  dispatch(setGameStarted(true));
  dispatch(setGamePhase('playing'));
  dispatch(syncGameStatus('ACTIVE'));

  // Store in localStorage as a backup mechanism
  try {
    localStorage.setItem('kekopoly_game_started', 'true');
    localStorage.setItem('kekopoly_game_id', this.gameId);
    localStorage.setItem('kekopoly_game_phase', 'playing');
    localStorage.setItem('kekopoly_game_status', 'ACTIVE');
    localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
  } catch (e) {
    logWarning('GAME_START', 'Could not use localStorage:', e);
  }

  // Trigger navigation to game board for non-host players
  if (window.location.pathname.includes('/room/')) {
    log('GAME_START', 'Triggering navigation to game board from broadcast');

    // Preserve socket connection for navigation
    this.preserveSocketForNavigation();

    // Force navigation regardless of other conditions if forceNavigate flag is set
    const forceNavigate = data.forceNavigate === true;

    // Use the navigateToGame function if available
    if (typeof window.navigateToGame === 'function') {
      log('GAME_START', `Using window.navigateToGame to navigate (forceNavigate: ${forceNavigate})`);
      window.navigateToGame(this.gameId);
    } else {
      // Fallback: Dispatch a custom event that the GameRoom component can listen for
      log('GAME_START', 'Dispatching game-started event for navigation');
      const gameStartedEvent = new CustomEvent('game-started', {
        detail: {
          gameId: this.gameId,
          forceNavigate: forceNavigate,
          hostId: data.hostId,
          timestamp: data.timestamp
        }
      });
      window.dispatchEvent(gameStartedEvent);
    }

    // Set a backup timeout to force navigation if the above methods don't work
    setTimeout(() => {
      if (window.location.pathname.includes('/room/')) {
        log('GAME_START', 'Backup timeout triggered, forcing navigation');

        // Try to navigate using window.location as a last resort
        window.location.href = `/game/${this.gameId}`;
      }
    }, 2000); // 2 second backup timeout
  }
}

/**
 * Handles error messages
 * @param {Object} data - The message data
 */
export function handleErrorMessage(data) {
  logError('SERVER_ERROR', `Server error: ${data.message}`);

  // Check for specific error types
  if (data.message && data.message.includes('not player\'s turn')) {
    logError('TURN_ERROR', 'Server reports it\'s not this player\'s turn');

    // Create a custom event for dice roll errors
    const errorEvent = new CustomEvent('dice-roll-error', {
      detail: { message: "The server says it's not your turn. The game state may be out of sync." }
    });
    window.dispatchEvent(errorEvent);

    // Force set isRolling to false
    store.dispatch(setIsRolling(false));

    // Request the current game state to resync
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      log('TURN_ERROR', 'Requesting updated game state to resync');
      this.sendMessage('get_game_state', { full: true });
      this.sendMessage('get_active_players', {});
    }
  }
}
