/**
 * Connection Handlers
 * 
 * This module contains methods for handling WebSocket connections,
 * including connecting, disconnecting, and handling connection events.
 */

import { log, logError, logWarning } from '../../utils/logger';
import { store } from '../../store/store';

/**
 * Establishes a WebSocket connection to the game server
 * @param {string} gameId - The ID of the game to connect to
 * @param {string} playerId - The ID of the player
 * @param {string} token - Authentication token
 * @param {Object} initialPlayerData - Initial player data to send on connection
 * @returns {Promise} - Resolves when connection is established
 */
export function connect(gameId, playerId, token, initialPlayerData) {
  // Ensure roomId is lowercase
  const normalizedRoomId = gameId.toLowerCase().trim();
  this.gameId = normalizedRoomId;
  this.playerId = playerId;
  this.token = token; // Store the token

  // Check if we have stored player token data from a previous session
  try {
    const storedTokenData = localStorage.getItem('kekopoly_player_token_data');
    if (storedTokenData) {
      const parsedTokenData = JSON.parse(storedTokenData);
      log('CONNECT', 'Found stored player token data', parsedTokenData);

      // Merge stored token data with initialPlayerData if provided
      if (initialPlayerData) {
        initialPlayerData = {
          ...initialPlayerData,
          token: initialPlayerData.token || parsedTokenData.token || '',
          emoji: initialPlayerData.emoji || parsedTokenData.emoji || '👤',
          color: initialPlayerData.color || parsedTokenData.color || 'gray.500',
          name: initialPlayerData.name || parsedTokenData.name || `Player_${playerId.substring(0, 4)}`
        };
        log('CONNECT', 'Merged initialPlayerData with stored token data', initialPlayerData);
      } else {
        // If no initialPlayerData was provided, create it from stored data
        initialPlayerData = {
          id: playerId,
          token: parsedTokenData.token || '',
          emoji: parsedTokenData.emoji || '👤',
          color: parsedTokenData.color || 'gray.500',
          name: parsedTokenData.name || `Player_${playerId.substring(0, 4)}`,
          position: 0,
          balance: 1500,
          properties: [],
          status: 'ACTIVE'
        };
        log('CONNECT', 'Created initialPlayerData from stored token data', initialPlayerData);
      }
    }
  } catch (e) {
    logWarning('CONNECT', 'Error restoring player token data from localStorage:', e);
  }

  // Store initial data if provided and save to persistent state
  this.initialPlayerDataToSend = initialPlayerData;

  // Save to connection state for potential reconnection during navigation
  if (initialPlayerData) {
    this.saveState('initialPlayerData', initialPlayerData);
  }

  log('CONNECT', 'Set this.initialPlayerDataToSend:', this.initialPlayerDataToSend);
  this.localPlayerId = playerId; // Set local player ID

  // Simplified Session ID Logic
  let sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = this.generateSessionId();
    localStorage.setItem('sessionId', sessionId);
  }
  this.sessionId = sessionId; // Assign to the class property

  // Return a Promise to allow async/await usage
  return new Promise((resolve, reject) => {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.onConnectionChange('connected');
      resolve(); // Already connected
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      // We might want to wait for the existing connection attempt or reject
      reject(new Error('Connection attempt already in progress.'));
      return;
    }

    // Construct the WebSocket URL, including the token
    // Ensure we have a valid token
    if (!this.token) {
      logError('CONNECT', 'No token available for WebSocket connection');
      // Try to get token from localStorage as fallback
      const storedToken = localStorage.getItem('kekopoly_auth_token');
      if (storedToken) {
        log('CONNECT', 'Using token from localStorage as fallback');
        this.token = storedToken;
      } else {
        logError('CONNECT', 'No token available in localStorage either');
        reject(new Error('No authentication token available for WebSocket connection'));
        return;
      }
    }

    // Ensure token is properly formatted and URI encoded
    let tokenValue = this.token;
    if (tokenValue.startsWith('Bearer ')) {
      tokenValue = tokenValue.substring(7);
    }

    // Double check that token is not empty after processing
    if (!tokenValue || tokenValue.trim() === '') {
      logError('CONNECT', 'Token is empty after processing');
      reject(new Error('Empty authentication token'));
      return;
    }

    const encodedToken = encodeURIComponent(tokenValue);

    // Use protocol based on current page protocol (ws or wss)
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;

    // Construct WebSocket URL with all required parameters
    const wsUrl = `${socketProtocol}//${host}/ws/${this.gameId}?sessionId=${this.sessionId}&token=${encodedToken}`;
    log('CONNECT', `Connecting to WebSocket URL: ${wsUrl.substring(0, wsUrl.indexOf('?'))}?sessionId=${this.sessionId}&token=***`);

    this.onConnectionChange('connecting');

    try {
      // Close existing socket if it exists
      if (this.socket) {
        try {
          this.socket.close();
        } catch (e) {
          logWarning('CONNECT', 'Error closing existing socket:', e);
        }
      }

      // Create new WebSocket connection
      this.socket = new WebSocket(wsUrl);

      // Clear previous listeners to avoid duplicates
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;

      // Assign new listeners
      this.socket.onopen = () => {
        // Connection established logging
        const timestamp = new Date().toISOString();
        log('CONNECT', `WebSocket connection opened at ${timestamp}`);
        log('CONNECT', `Connection details - GameID: ${this.gameId}, PlayerID: ${this.playerId}, SessionID: ${this.sessionId}`);
        log('CONNECT', `Token used (prefix only): ${this.token ? this.token.substring(0, 10) + '...' : 'none'}`);

        // Store successful connection info in localStorage for recovery
        try {
          localStorage.setItem('kekopoly_last_successful_connection', timestamp);
          localStorage.setItem('kekopoly_game_id', this.gameId);
          localStorage.setItem('kekopoly_player_id', this.playerId);
          localStorage.setItem('kekopoly_session_id', this.sessionId);
          localStorage.setItem('kekopoly_auth_token', this.token);
        } catch (e) {
          logWarning('CONNECT', 'Error storing connection info in localStorage:', e);
        }

        // Send initial player data if available (used for the first connection)
        if (initialPlayerData) {
          log('CONNECT', 'Sending initial player data on connection:', initialPlayerData);

          // Send player_joined message with complete player data
          this.sendMessage('player_joined', {
            playerId: this.playerId,
            playerData: initialPlayerData
          });

          // Also send update_player message as a backup
          this.sendMessage('update_player', {
            playerId: this.playerId,
            ...initialPlayerData
          });
        } else if (this.initialPlayerDataToSend) {
          log('CONNECT', 'Sending stored player data on connection:', this.initialPlayerDataToSend);

          // Send player_joined message with complete player data
          this.sendMessage('player_joined', {
            playerId: this.playerId,
            playerData: this.initialPlayerDataToSend
          });

          // Also send as legacy format
          this.sendMessage('player_joined', {
            player: this.initialPlayerDataToSend
          });

          // Store in connection state before clearing
          this.saveState('lastSentPlayerData', this.initialPlayerDataToSend);

          // Don't clear initialPlayerDataToSend to allow for reconnection during navigation
          // Instead, mark it as sent so we don't send duplicate data
          this.saveState('initialPlayerDataSent', true);
        }

        // Reset reconnect attempts on successful connection
        this.reconnectAttempts = 0;
        clearTimeout(this.reconnectTimer); // Clear any existing reconnect timer

        // Notify about the connection status change
        this.onConnectionChange('connected');

        // Dispatch a custom event that components can listen for
        window.dispatchEvent(new CustomEvent('websocket-connected', {
          detail: {
            gameId: this.gameId,
            playerId: this.playerId,
            timestamp: timestamp
          }
        }));

        // Request active players and game state after connection is established
        // Using a sequence of requests with slight delays to ensure proper order
        setTimeout(() => {
          log('CONNECT', 'Requesting active players after connection');
          this.sendMessage('get_active_players');

          // Request game state after active players
          setTimeout(() => {
            log('CONNECT', 'Requesting full game state after connection');
            this.sendMessage('get_game_state', { full: true });

            // Request current turn information
            setTimeout(() => {
              log('CONNECT', 'Requesting current turn information');
              this.sendMessage('get_current_turn', {});

              // Start periodic state synchronization
              if (this.startPeriodicStateSync) {
                this.startPeriodicStateSync();
              }
            }, 100);
          }, 100);
        }, 100);

        resolve(); // Resolve the promise on successful connection
      };

      this.socket.onclose = (event) => {
        this.handleDisconnect(event);
        // Don't automatically reject on close, let reconnect logic handle it if needed
      };

      this.socket.onerror = (error) => {
        logError('SOCKET', 'WebSocket Error:', error);
        this.onConnectionChange('error');
        this.onConnectionError(error); // Call the error callback
        reject(error); // Reject the promise on error
      };

      this.socket.onmessage = this.handleMessage;

    } catch (error) {
      logError('SOCKET', 'Failed to create WebSocket:', error);
      this.onConnectionChange('error');
      this.onConnectionError(error); // Call the error callback
      reject(error);
    }
  });
}

/**
 * Disconnects from the WebSocket server
 * @param {boolean} preserve - Whether to preserve the connection state for reconnection
 */
export function disconnect(preserve = false) {
  this.preserveConnection = preserve;
  log('SOCKET', `Disconnect called with preserve=${preserve}`);

  // Save current connection state before potential disconnect
  this.saveState('connectionActive', !!this.socket);
  this.saveState('gameId', this.gameId);
  this.saveState('playerId', this.playerId);
  this.saveState('token', this.token);
  this.saveState('sessionId', this.sessionId);

  if (this.socket && !this.preserveConnection) {
    log('SOCKET', 'Closing socket connection');

    // Send a clean disconnect message if possible
    if (this.socket.readyState === WebSocket.OPEN) {
      try {
        this.sendMessage('client_navigating', {
          playerId: this.playerId,
          gameId: this.gameId,
          willReconnect: false
        });
      } catch (e) {
        logWarning('SOCKET', 'Failed to send navigation message:', e);
      }
    }

    this.socket.close();
    this.socket = null;
    this.onConnectionChange('disconnected');
  } else if (this.preserveConnection) {
    log('SOCKET', 'Preserving socket connection during navigation');

    // Set navigation flag to true to handle reconnection differently
    this.isNavigating = true;
    this.saveState('isNavigating', true);

    // Send a navigation message to the server if possible
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.sendMessage('client_navigating', {
          playerId: this.playerId,
          gameId: this.gameId,
          willReconnect: true
        });
      } catch (e) {
        logWarning('SOCKET', 'Failed to send navigation message:', e);
      }
    }
  }
}

/**
 * Preserves socket connection during navigation
 */
export function preserveSocketForNavigation() {
  log('SOCKET', 'Preserving socket connection for navigation');

  // Set the navigation flags to preserve connection
  this.isNavigating = true;
  this.preserveConnection = true;
  this.isTransitioningToGame = true;

  // Store connection info in localStorage for reconnection
  try {
    localStorage.setItem('kekopoly_socket_preserve', 'true');
    localStorage.setItem('kekopoly_socket_gameId', this.gameId);
    localStorage.setItem('kekopoly_socket_playerId', this.playerId);
    localStorage.setItem('kekopoly_socket_timestamp', Date.now().toString());

    // Also store critical game state information
    localStorage.setItem('kekopoly_game_started', 'true');
    localStorage.setItem('kekopoly_game_id', this.gameId);
    localStorage.setItem('kekopoly_game_phase', 'playing');
    localStorage.setItem('kekopoly_game_status', 'ACTIVE');

    log('SOCKET', 'Stored connection and game state info in localStorage for reconnection');
  } catch (e) {
    logWarning('SOCKET', 'Could not store socket preservation info in localStorage:', e);
  }

  // Save current connection state for potential reconnection
  this.saveState('connectionActive', true);
  this.saveState('gameId', this.gameId);
  this.saveState('playerId', this.playerId);
  this.saveState('token', this.token);
  this.saveState('sessionId', this.sessionId);
  this.saveState('isNavigating', true);
  this.saveState('preserveConnection', true);
  this.saveState('isTransitioningToGame', true);

  // Send a navigation message to the server if possible
  if (this.socket && this.socket.readyState === WebSocket.OPEN) {
    try {
      this.sendMessage('client_navigating', {
        playerId: this.playerId,
        gameId: this.gameId,
        willReconnect: true,
        timestamp: Date.now()
      });

      // Also request the latest game state to ensure we have it after navigation
      this.sendMessage('get_game_state', { full: true });
      this.sendMessage('get_active_players', {});
    } catch (e) {
      logWarning('SOCKET', 'Failed to send navigation message:', e);
    }
  }
}

/**
 * Handles WebSocket connection event
 */
export function handleConnect() {
  const timestamp = new Date().toISOString();
  log('CONNECT', `WebSocket connected at ${timestamp} for player ${this.playerId} in game ${this.gameId}`);
  log('CONNECT', `Connection details - GameID: ${this.gameId}, PlayerID: ${this.playerId}, SessionID: ${this.sessionId}`);
  log('CONNECT', `Token used (prefix): ${this.token ? this.token.substring(0, 10) + '...' : 'none'}`);

  // Reset reconnect attempts on successful connection
  this.reconnectAttempts = 0;

  // Request current game state and active players
  setTimeout(() => {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendMessage('get_game_state', {});
      log('CONNECT', 'Requested game state');

      // Also request active players list to ensure we have all connected players
      this.sendMessage('get_active_players', {});
      log('CONNECT', 'Requested active players list');

      // Check if game has already started
      if (this.checkIfGameAlreadyStarted) {
        this.checkIfGameAlreadyStarted();
      }

      // Start periodic state synchronization to ensure consistent state across clients
      log('CONNECT', 'Starting periodic state synchronization');
      if (this.startPeriodicStateSync) {
        this.startPeriodicStateSync();
      }
    } else {
      logWarning('CONNECT', 'Cannot request game state: socket not open');
    }
  }, 500);
}

/**
 * Handles WebSocket disconnection event
 * @param {Event} event - The close event
 */
export function handleDisconnect(event) {
  const timestamp = new Date().toISOString();
  log('DISCONNECT', `WebSocket disconnected at ${timestamp}: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
  log('DISCONNECT', `Disconnection details - GameID: ${this.gameId}, PlayerID: ${this.playerId}, SessionID: ${this.sessionId}`);
  log('DISCONNECT', `Navigation state: isNavigating=${this.isNavigating}, preserveConnection=${this.preserveConnection}`);

  // Save disconnection state
  this.saveState('lastDisconnectTime', timestamp);
  this.saveState('lastDisconnectReason', event.reason);
  this.saveState('lastDisconnectCode', event.code);
  this.saveState('lastDisconnectWasClean', event.wasClean);

  // Stop periodic state synchronization
  if (this.stopPeriodicStateSync) {
    this.stopPeriodicStateSync();
  }

  // Call connection change callback
  this.onConnectionChange('disconnected');

  // Check if we're in the middle of a navigation or if the connection should be preserved
  if (this.isNavigating || this.preserveConnection || this.loadState('isNavigating', false)) {
    log('NAVIGATION_DISCONNECT', 'Disconnection occurred during navigation or with preserve flag, will reconnect immediately');

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Reset reconnect attempts since this is a navigation-related disconnect
    this.reconnectAttempts = 0;

    // Attempt to reconnect immediately with minimal delay
    this.reconnectTimer = setTimeout(() => {
      log('NAVIGATION_DISCONNECT', 'Immediate reconnection attempt after navigation');

      // Check if we're on the game board page now
      const isOnGameBoard = window.location.pathname.includes('/game/');
      log(`NAVIGATION_DISCONNECT', 'Current location: ${window.location.pathname}, isOnGameBoard: ${isOnGameBoard}`);

      // Retrieve connection information from state if not available directly
      const gameId = this.gameId || this.loadState('gameId');
      const playerId = this.playerId || this.loadState('playerId');
      const token = this.token || this.loadState('token');

      // Retrieve player data that might have been saved before navigation
      const savedPlayerData = this.loadState('initialPlayerData') || this.loadState('lastSentPlayerData');

      // Only attempt reconnection if we have the necessary information
      if (gameId && playerId && token) {
        log(`NAVIGATION_DISCONNECT', 'Reconnecting with gameId=${gameId}, playerId=${playerId}`);
        log(`NAVIGATION_DISCONNECT', 'Using saved player data:`, savedPlayerData);

        // Pass required arguments to connect, including saved player data if available
        this.connect(gameId, playerId, token, savedPlayerData)
          .then(() => {
            log('NAVIGATION_DISCONNECT', 'Reconnection successful after navigation');

            // Reset navigation flags after successful reconnection
            this.isNavigating = false;
            this.saveState('isNavigating', false);

            // Request game state and active players to ensure we're in sync
            setTimeout(() => {
              if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                log('NAVIGATION_DISCONNECT', 'Requesting game state and active players after reconnection');
                this.sendMessage('get_game_state', { full: true });
                this.sendMessage('get_active_players');

                // Also send player data again to ensure server has latest state
                if (savedPlayerData) {
                  log('NAVIGATION_DISCONNECT', 'Re-sending player data after reconnection');
                  this.sendMessage('update_player', {
                    playerId: playerId,
                    ...savedPlayerData
                  });
                }
              }
            }, 200);
          })
          .catch(err => {
            logError("NAVIGATION_DISCONNECT", "Reconnect after navigation failed:", err);

            // Try again after a short delay if we're still on the game board
            if (window.location.pathname.includes('/game/')) {
              log('NAVIGATION_DISCONNECT', 'Will try reconnecting again in 1 second');
              setTimeout(() => {
                this.connect(gameId, playerId, token, savedPlayerData)
                  .catch(err => {
                    logError("NAVIGATION_DISCONNECT", "Second reconnect attempt failed:", err);
                    // If second attempt fails, try with a clean connection
                    setTimeout(() => {
                      log('NAVIGATION_DISCONNECT', 'Trying final reconnect with clean connection');
                      this.connect(gameId, playerId, token)
                        .catch(err => logError("NAVIGATION_DISCONNECT", "Final reconnect attempt failed:", err));
                    }, 1000);
                  });
              }, 1000);
            }
          });
      } else {
        logError('NAVIGATION_DISCONNECT', 'Missing required information for reconnection');
        log(`gameId: ${gameId}, playerId: ${playerId}, token: ${token ? 'present' : 'missing'}`);

        // Try to recover from localStorage as a last resort
        const lastGameId = localStorage.getItem('kekopoly_game_id');
        const lastPlayerId = localStorage.getItem('kekopoly_player_id');
        const lastToken = localStorage.getItem('kekopoly_auth_token');

        if (lastGameId && lastPlayerId && lastToken) {
          log('NAVIGATION_DISCONNECT', 'Attempting recovery using localStorage data');
          this.connect(lastGameId, lastPlayerId, lastToken)
            .catch(err => logError("NAVIGATION_DISCONNECT", "Recovery attempt failed:", err));
        }
      }
    }, 100);

    return;
  }

  // Standard reconnection logic for non-navigation disconnects
  if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
    this.reconnectAttempts++;

    log(`RECONNECT', 'Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    // Exponential backoff
    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      log(`RECONNECT', 'Reconnection attempt ${this.reconnectAttempts} at ${new Date().toISOString()}`);

      // Try to use saved player data for reconnection
      const savedPlayerData = this.loadState('initialPlayerData') || this.loadState('lastSentPlayerData');

      // Pass required arguments to connect
      this.connect(this.gameId, this.playerId, this.token, savedPlayerData)
        .catch(err => {
          logError(`RECONNECT', 'Reconnection attempt ${this.reconnectAttempts} failed:`, err);

          // If we have saved player data but reconnection failed, try without it
          if (savedPlayerData && this.reconnectAttempts < this.maxReconnectAttempts) {
            log(`RECONNECT', 'Trying reconnection without saved player data`);
            setTimeout(() => {
              this.connect(this.gameId, this.playerId, this.token)
                .catch(err => logError(`RECONNECT', 'Clean reconnection attempt failed:`, err));
            }, 1000);
          }
        });
    }, delay);
  } else if (event.wasClean) {
    log("DISCONNECT", "Clean disconnection, not attempting reconnect.");
  } else {
    log("DISCONNECT", "Max reconnect attempts reached, giving up.");
    this.onConnectionChange('failed'); // Indicate final failure
  }
}

/**
 * Handles WebSocket error event
 * @param {Event} error - The error event
 */
export function handleError(error) {
  logError('WS_ERROR', 'WebSocket error:', error);
  log('WS_ERROR', `Connection details - GameID: ${this.gameId}, PlayerID: ${this.playerId}`);

  const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;
  const wsUrl = `${socketProtocol}//${host}/ws`;
  log('WS_ERROR', `Auth token: ${this.token ? (this.token.substring(0, 10) + '...') : 'none'}, URL base: ${wsUrl}`);

  // Try to detect the specific issue
  fetch(`http://localhost:8080/health`)
    .then(response => {
      log('WS_ERROR', 'Backend health check response:', response.status);
    })
    .catch(err => {
      logError('WS_ERROR', 'Backend appears to be unreachable. Check if the server is running on port 8080:', err);
    });
}

/**
 * Setup socket event handlers
 */
export function setupSocketEventHandlers() {
  if (!this.socket) {
    logError('SOCKET', 'Cannot set up event handlers: socket is not initialized');
    return;
  }

  this.socket.onopen = this.handleConnect;
  this.socket.onclose = this.handleDisconnect;
  this.socket.onerror = this.handleError;
  this.socket.onmessage = this.handleMessage;

  log('SOCKET', 'WebSocket event handlers set up');
}

/**
 * Get current connection state as a string
 * @returns {string} - The connection state
 */
export function getConnectionState() {
  if (!this.socket) return 'disconnected';
  switch (this.socket.readyState) {
    case WebSocket.CONNECTING: return 'connecting';
    case WebSocket.OPEN: return 'connected';
    case WebSocket.CLOSING: return 'disconnected'; // Treat closing as disconnected
    case WebSocket.CLOSED: return 'disconnected';
    default: return 'disconnected';
  }
}

/**
 * Check if the socket is connected
 * @returns {boolean} - True if connected
 */
export function isConnected() {
  return this.socket && this.socket.readyState === WebSocket.OPEN;
}

/**
 * Generate a simple session ID
 * @returns {string} - A random session ID
 */
export function generateSessionId() {
  return Math.random().toString(36).substring(2, 15);
}
