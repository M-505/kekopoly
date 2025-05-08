/**
 * Message Handlers
 *
 * This module contains methods for handling WebSocket messages,
 * including sending messages and processing received messages.
 */

import { log, logError, logWarning } from '../../utils/logger';
import { store } from '../../store/store';
import {
  setHost,
  setGameStarted,
  setGamePhase,
  syncGameStatus,
  setCurrentPlayer,
  setIsRolling,
  updateDiceRoll,
  movePlayer
} from '../../store/gameSlice';
import {
  addPlayer,
  updatePlayer,
  updatePlayerPosition,
  updatePlayerBalance,
  addPlayerCard,
  removePlayerCard,
  addPlayerProperty,
  removePlayerProperty,
  removePlayer,
  setPlayerReady
} from '../../store/playerSlice';

/**
 * Sends a message to the WebSocket server
 * @param {string} type - The message type
 * @param {Object} payload - The message payload
 */
export function sendMessage(type, payload = {}) {
  if (this.socket && this.socket.readyState === WebSocket.OPEN) {
    const message = JSON.stringify({ type, ...payload });
    this.socket.send(message);
  } else {
    logWarning('SOCKET', `Cannot send message type '${type}', WebSocket not open. State: ${this.socket?.readyState}`);

    // Queue important messages to be sent when connection is restored
    if (['player_joined', 'update_player', 'set_player_token', 'update_player_info'].includes(type)) {
      const queuedMessage = {
        type,
        payload: {
          ...payload,
          gameId: this.gameId,
          playerId: this.playerId
        },
        timestamp: Date.now()
      };
      this.saveState('messageQueue', [...(this.loadState('messageQueue', [])), queuedMessage]);
      log('SOCKET', 'Message queued for later sending:', type);
    }
  }
}

/**
 * Sends any queued messages after reconnection
 */
export function sendQueuedMessages() {
  const messageQueue = this.loadState('messageQueue', []);
  if (messageQueue.length > 0) {
    log('SOCKET', `Sending ${messageQueue.length} queued messages after reconnection`);

    // Process messages in order
    messageQueue.forEach(message => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        log('SOCKET', `Sending queued message: ${message.type}`);
        this.sendMessage(message.type, message.payload);
      }
    });

    // Clear the queue after processing
    this.saveState('messageQueue', []);
  }
}

/**
 * Handles incoming WebSocket messages
 * @param {MessageEvent} event - The message event
 */
export function handleMessage(event) {
  try {
    // Parse the message data
    const data = JSON.parse(event.data);

    // Log only the message type to reduce console spam
    if (data.type) {
      log('WS', `Received message type: ${data.type}`);
    } else {
      log('WS', 'Received message without type');
    }

    // Ensure game state is properly initialized after receiving any message
    // This helps recover from incomplete state situations
    if (this.ensureGameStateInitialized) {
      this.ensureGameStateInitialized();
    }

    // Handle different message types
    switch (data.type) {
      case 'game_state_update':
        // Call the existing handler for game state
        if (this.handleGameState) {
          this.handleGameState(data);
        }
        break;

      case 'player_joined_ack':
        // Log acknowledgment from server
        log('ACK', 'Server acknowledged player joined:', data.player?.id);
        break;

      case 'game_state':
        if (this.handleGameState) {
          this.handleGameState(data);
        }
        break;

      case 'dice_rolled':
        log('DICE', 'Received dice roll result:', data);
        if (this.handleDiceRolled) {
          this.handleDiceRolled(data);
        }
        break;

      case 'dice_rolling':
        log('DICE', 'Received dice rolling state:', data.isRolling);
        if (this.handleDiceRolling) {
          this.handleDiceRolling(data.isRolling);
        }
        break;

      case 'active_players':
        if (this.handleActivePlayers) {
          this.handleActivePlayers(data);
        }
        break;

      case 'player_joined':
        if (this.handlePlayerJoined) {
          this.handlePlayerJoined(data.player);
        }
        break;

      case 'player_disconnected':
        if (this.handlePlayerDisconnected) {
          this.handlePlayerDisconnected(data.playerId);
        }
        break;

      case 'player_ready':
        // Extract optional messageId and timestamp
        const messageId = data.messageId || data.responseToMessageId || null;
        const timestamp = data.timestamp || Date.now();
        if (this.handlePlayerReady) {
          this.handlePlayerReady(data.playerId, data.isReady, messageId, timestamp);
        }
        break;

      case 'game_started':
        if (this.handleGameStarted) {
          this.handleGameStarted(data);
        }
        break;

      case 'game_turn':
        if (this.handleGameTurn) {
          this.handleGameTurn(data);
        }
        break;

      case 'current_turn':
        if (this.handleCurrentTurn) {
          this.handleCurrentTurn(data);
        }
        break;

      case 'player_moved':
        if (this.handlePlayerMoved) {
          this.handlePlayerMoved(data);
        }
        break;

      case 'player_balance_change':
        if (this.handlePlayerBalance) {
          this.handlePlayerBalance(data);
        }
        break;

      case 'player_card_change':
        if (this.handlePlayerCard) {
          this.handlePlayerCard(data);
        }
        break;

      case 'player_property_change':
        if (this.handlePlayerProperty) {
          this.handlePlayerProperty(data);
        }
        break;

      case 'property_updated':
        if (this.handlePropertyUpdated) {
          this.handlePropertyUpdated(data);
        }
        break;

      case 'property_owner_change':
        if (this.handlePropertyOwner) {
          this.handlePropertyOwner(data);
        }
        break;

      case 'property_engagement_change':
        if (this.handlePropertyEngagements) {
          this.handlePropertyEngagements(data);
        }
        break;

      case 'property_checkmark_change':
        if (this.handlePropertyCheckmark) {
          this.handlePropertyCheckmark(data);
        }
        break;

      case 'property_mortgage_change':
        if (this.handlePropertyMortgage) {
          this.handlePropertyMortgage(data);
        }
        break;

      case 'property_effect_change':
        if (this.handlePropertyEffect) {
          this.handlePropertyEffect(data);
        }
        break;

      case 'cards_remaining':
        if (this.handleCardRemaining) {
          this.handleCardRemaining(data.cardsRemaining);
        }
        break;

      case 'card_drawn':
        if (this.handleCardDrawn) {
          this.handleCardDrawn(data.card);
        }
        break;

      case 'card_played':
        if (this.handleCardPlayed) {
          this.handleCardPlayed(data.cardId);
        }
        break;

      case 'market_condition':
        if (this.handleMarketCondition) {
          this.handleMarketCondition(data);
        }
        break;

      case 'host_changed':
        if (this.handleHostChanged) {
          this.handleHostChanged(data.hostId, data.gameId);
        }
        break;

      case 'set_host':
        if (this.handleSetHost) {
          this.handleSetHost(data.hostId, data.gameId);
        }
        break;

      case 'host_info':
        if (this.handleHostInfo) {
          this.handleHostInfo(data.hostId, data.gameId);
        } else {
          // Update the host ID in the Redux store
          const { dispatch } = store;
          if (data.hostId) {
            dispatch(setHost(data.hostId));
            log('HOST', 'Updated host ID from host_info message:', data.hostId);
          }
        }
        break;

      case 'turn_changed':
        if (this.handleTurnChanged) {
          this.handleTurnChanged(data);
        }
        break;

      case 'jail_event':
        if (this.handleJailEvent) {
          this.handleJailEvent(data);
        }
        break;

      case 'error':
        if (this.handleErrorMessage) {
          this.handleErrorMessage(data);
        }
        break;

      case 'host_verification':
        if (this.handleHostVerification) {
          this.handleHostVerification(data);
        } else {
          // Default handler if specific handler not available
          const { dispatch } = store;
          if (data.hostId) {
            dispatch(setHost(data.hostId));

            // Also update player isHost flags
            const state = store.getState();
            const players = state.players.players;

            // Update each player's isHost flag based on the hostId
            Object.entries(players).forEach(([playerId, player]) => {
              const isHost = playerId === data.hostId;

              // Only dispatch if the isHost flag needs to change
              if (player.isHost !== isHost) {
                dispatch(updatePlayer({
                  ...player,
                  isHost
                }));
              }
            });
          }
        }
        break;

      case 'broadcast_game_started':
        if (this.handleBroadcastGameStarted) {
          this.handleBroadcastGameStarted(data);
        }
        break;

      case 'player_updated':
        if (this.handlePlayerUpdated) {
          this.handlePlayerUpdated(data);
        } else {
          // Fallback to updatePlayer if specific handler not available
          const { dispatch } = store;
          if (data.player) {
            dispatch(updatePlayer(data.player));
            log('PLAYER', 'Updated player from player_updated message:', data.player.id);
          }
        }
        break;

      case 'get_current_turn':
        if (this.handleGetCurrentTurn) {
          this.handleGetCurrentTurn(data);
        } else {
          // Send current turn information back to server if we have it
          const state = store.getState();
          const currentPlayerId = state.game.currentPlayerId;
          if (currentPlayerId && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.sendMessage('current_turn_response', {
              currentPlayerId,
              gameId: this.gameId
            });
            log('TURN', 'Responded to get_current_turn with:', currentPlayerId);
          }
        }
        break;

      case 'check_game_started':
        if (this.handleCheckGameStarted) {
          this.handleCheckGameStarted(data);
        } else {
          // Respond with game started status
          const state = store.getState();
          const isGameStarted = state.game.gameStarted;
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.sendMessage('game_started_status', {
              gameId: this.gameId,
              isGameStarted
            });
            log('GAME', 'Responded to check_game_started with status:', isGameStarted);
          }
        }
        break;
        
      case 'game_started_status':
        if (this.handleGameStartedStatus) {
          this.handleGameStartedStatus(data);
        } else {
          // Handle game started status message
          const { dispatch } = store;
          if (data.isGameStarted) {
            log('GAME', 'Received game_started_status: Game is started');

            // Update game state in Redux
            dispatch(setGameStarted(true));
            dispatch(setGamePhase('playing'));
            dispatch(syncGameStatus('ACTIVE'));

            // Store in localStorage
            try {
              localStorage.setItem('kekopoly_game_started', 'true');
              localStorage.setItem('kekopoly_game_id', this.gameId);
              localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
            } catch (e) {
              logWarning('GAME', 'Could not use localStorage:', e);
            }

            // Trigger navigation if we're in the game room
            if (window.location.pathname.includes('/room/')) {
              log('GAME', 'Game has started, triggering navigation from game_started_status');

              // Preserve socket connection for navigation
              this.preserveSocketForNavigation();

              // Use the navigateToGame function if available
              if (typeof window.navigateToGame === 'function') {
                window.navigateToGame(this.gameId);
              } else {
                // Fallback: Dispatch a custom event
                const gameStartedEvent = new CustomEvent('game-started', {
                  detail: {
                    gameId: this.gameId,
                    forceNavigate: true
                  }
                });
                window.dispatchEvent(gameStartedEvent);
              }
            }
          } else {
            log('GAME', 'Received game_started_status: Game is not started');
          }
        }
        break;

      case 'get_host':
        if (this.handleGetHost) {
          this.handleGetHost(data);
        } else {
          // Respond with host information
          const state = store.getState();
          const hostId = state.game.hostId;
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.sendMessage('host_info', {
              gameId: data.gameId || this.gameId,
              hostId: hostId
            });
            log('HOST', 'Responded to get_host with hostId:', hostId);
          }
        }
        break;

      default:
        logWarning('WS', 'Unhandled message type:', data.type);
    }
  } catch (error) {
    // Enhanced error handling for JSON parsing errors
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      logError('SYNC_ERROR', 'JSON parsing error in WebSocket message:', error.message);

      // Try to identify the problematic part of the message
      try {
        const rawData = event.data;
        if (rawData && typeof rawData === 'string') {
          log('SYNC_ERROR', 'Attempting to recover from malformed message. Raw data length:', rawData.length);

          // Check for common issues like multiple JSON objects concatenated together
          if (rawData.includes('}{')) {
            log('SYNC_ERROR', 'Detected multiple concatenated JSON objects');

            // Split the message at the boundary between objects
            const splitMessages = rawData.split(/(?<=\})(?=\{)/);
            log('SYNC_ERROR', `Split into ${splitMessages.length} separate messages`);

            // Process each message separately
            for (let i = 0; i < splitMessages.length; i++) {
              try {
                const messagePart = splitMessages[i].trim();
                log('SYNC_ERROR', `Processing message part ${i+1}/${splitMessages.length}, length: ${messagePart.length}`);

                const parsedData = JSON.parse(messagePart);
                log('SYNC_ERROR', `Successfully parsed message part ${i+1}`, parsedData);

                // Process the valid JSON object
                if (this.processRecoveredMessage) {
                  this.processRecoveredMessage(parsedData);
                }
              } catch (splitError) {
                logWarning('SYNC_ERROR', `Failed to parse message part ${i+1}:`, splitError.message);
              }
            }
          } else if (rawData.trim().startsWith('{') && rawData.trim().endsWith('}')) {
            log('SYNC_ERROR', `Message appears to be JSON but has parsing issues. First/last 50 chars: ${rawData.substring(0, 50)}...${rawData.substring(rawData.length - 50)}`);

            // Try to extract valid JSON objects from the message
            // Using a more robust regex pattern that can handle nested objects
            const jsonPattern = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
            const jsonMatches = rawData.match(jsonPattern);

            if (jsonMatches && jsonMatches.length > 0) {
              log('SYNC_ERROR', `Found ${jsonMatches.length} potential JSON objects in message`);

              // Try to parse each potential JSON object
              for (let i = 0; i < jsonMatches.length; i++) {
                try {
                  const parsedData = JSON.parse(jsonMatches[i]);
                  log('SYNC_ERROR', `Successfully parsed JSON object ${i+1}`, parsedData);

                  // Process the valid JSON object by routing it to the appropriate handler
                  if (this.processRecoveredMessage) {
                    this.processRecoveredMessage(parsedData);
                  }
                } catch (parseError) {
                  logWarning('SYNC_ERROR', `Failed to parse potential JSON object ${i+1}:`, parseError.message);
                }
              }
            }
          } else {
            logWarning('SYNC_ERROR', `Message does not appear to be valid JSON format. First 50 chars: ${rawData.substring(0, 50)}`);
          }
        }
      } catch (e) {
        logError('SYNC_ERROR', 'Error while analyzing malformed JSON:', e);
      }

      // Attempt recovery by requesting fresh game state
      if (this.attemptSyncRecovery) {
        this.attemptSyncRecovery('json_parse_error');
      }
    } else {
      logError('SYNC_ERROR', 'Error processing WebSocket message:', error);
      if (this.handleSyncError) {
        this.handleSyncError('message_processing', error);
      }
    }
  }
}
