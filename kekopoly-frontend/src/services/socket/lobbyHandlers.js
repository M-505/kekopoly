/**
 * Lobby Handlers
 * 
 * This module contains methods for handling lobby WebSocket connections,
 * including connecting, disconnecting, and handling lobby-specific messages.
 */

import { log, logError, logWarning } from '../../utils/logger';

/**
 * Connects to the lobby WebSocket
 * @param {string} token - Authentication token
 * @param {string} playerId - The player ID
 */
export function connectToLobby(token, playerId) {
  if (!token || !playerId) {
    logError('LOBBY', 'Cannot connect to lobby: token and playerId are required');
    return;
  }

  this.token = token;
  this.playerId = playerId;

  // Generate a session ID if we don't have one yet
  if (!this.sessionId) {
    this.sessionId = Math.random().toString(36).substring(2, 15);
  }

  // Clean up any existing lobby connection
  this.disconnectFromLobby();

  try {
    // Create WebSocket connection with query parameters including token
    // Strip the "Bearer " prefix from the token if present
    const tokenValue = this.token.startsWith('Bearer ') ? this.token.substring(7) : this.token;
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;
    const wsUrl = `${socketProtocol}//${host}/ws/lobby?sessionId=${this.sessionId}&token=${encodeURIComponent(tokenValue)}`;

    this.lobbySocket = new WebSocket(wsUrl);

    // Set up event handlers
    this.lobbySocket.onopen = this.handleLobbyConnect;
    this.lobbySocket.onclose = this.handleLobbyDisconnect;
    this.lobbySocket.onerror = this.handleLobbyError;
    this.lobbySocket.onmessage = this.handleLobbyMessage;

    log('LOBBY', "WebSocket connection initiated");
    log('LOBBY', `Initial socket state: ${this.getLobbySocketStateString()}`);

    // Monitor connection state changes but limit logging
    let checkCount = 0;
    const checkSocketState = () => {
      // Only log every other check to reduce spam
      if (checkCount % 2 === 0) {
        log('LOBBY', `Current socket state: ${this.getLobbySocketStateString()}`);
      }
      checkCount++;

      if (this.lobbySocket && this.lobbySocket.readyState === WebSocket.OPEN) {
        log('LOBBY', "Socket connection fully established");
        clearInterval(stateCheckInterval);
      }
    };

    const stateCheckInterval = setInterval(checkSocketState, 1000);
    // Clear interval after 5 seconds to avoid memory leaks
    setTimeout(() => clearInterval(stateCheckInterval), 5000);
  } catch (error) {
    logError('LOBBY', "Error creating WebSocket:", error);
  }
}

/**
 * Disconnects from the lobby WebSocket
 */
export function disconnectFromLobby() {
  if (this.lobbySocket) {
    this.lobbySocket.close();
    this.lobbySocket = null;
  }
}

/**
 * Handles lobby WebSocket connection event
 */
export function handleLobbyConnect() {
  log('LOBBY', `Lobby WebSocket connected for player ${this.playerId}`);
  log('LOBBY', `Lobby connection established at ${new Date().toISOString()}`);

  // Reset reconnect attempts on successful connection
  this.reconnectAttempts = 0;

  // Request current game list immediately after connection
  // Reduced timeout to 500ms for faster initial sync
  setTimeout(() => {
    log('LOBBY', "Requesting initial game list after WebSocket connection");
    if (window.refreshGameList && typeof window.refreshGameList === 'function') {
      window.refreshGameList();
    }
  }, 500);
}

/**
 * Handles lobby WebSocket disconnection event
 * @param {Event} event - The close event
 */
export function handleLobbyDisconnect(event) {
  log('LOBBY', `Lobby WebSocket disconnected: ${event.reason}`);

  // Try to reconnect unless it was an intentional disconnect
  if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
    this.reconnectAttempts++;

    log('LOBBY', `Attempting to reconnect to lobby (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    // Exponential backoff
    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.connectToLobby(this.token, this.playerId);
    }, delay);
  }
}

/**
 * Handles lobby WebSocket error event
 * @param {Event} error - The error event
 */
export function handleLobbyError(error) {
  logError('LOBBY', 'WebSocket error:', error);
}

/**
 * Handles lobby WebSocket message event
 * @param {MessageEvent} event - The message event
 */
export function handleLobbyMessage(event) {
  try {
    // Clean the message by removing any leading/trailing whitespace or newlines
    const cleanedData = typeof event.data === 'string' ? event.data.trim() : event.data;
    const data = JSON.parse(cleanedData);

    // Log message type only to reduce console spam
    log('LOBBY', `Message received: ${data.type}`);

    // Handle new game created event
    if (data.type === 'new_game_created') {
      log('LOBBY', 'New game created event received', data.game);

      // If we have a callback registered, call it with the new game data
      if (this.onNewGameCallback) {
        log('LOBBY', 'Calling onNewGameCallback with game data');
        this.onNewGameCallback(data.game);
      } else {
        logWarning('LOBBY', 'No onNewGameCallback registered to handle new game event');
      }
    }
  } catch (error) {
    logError('LOBBY', 'Error processing WebSocket message:', error);
    logError('LOBBY', 'Raw message that caused error:', event.data);

    // Enhanced error recovery for parsing errors
    try {
      if (typeof event.data === 'string') {
        // Try to extract valid JSON objects from the message
        const jsonPattern = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
        const matches = event.data.match(jsonPattern);

        if (matches && matches.length > 0) {
          log('LOBBY', `Found ${matches.length} potential JSON objects in message`);

          // Try to parse each potential JSON object
          for (let i = 0; i < matches.length; i++) {
            try {
              const extractedData = JSON.parse(matches[i]);
              log('LOBBY', `Successfully extracted data from object ${i+1}:`, extractedData);

              // Process the extracted data
              if (extractedData.type === 'new_game_created' && this.onNewGameCallback) {
                log('LOBBY', 'Processing extracted new game data');
                this.onNewGameCallback(extractedData.game);
              }
            } catch (parseError) {
              log('LOBBY', `Failed to parse potential JSON object ${i+1}:`, parseError.message);
            }
          }
        } else {
          logError('LOBBY', 'No valid JSON objects found in message');
        }
      }
    } catch (recoveryError) {
      logError('LOBBY', 'Failed to recover from parsing error:', recoveryError);
    }
  }
}

/**
 * Gets a readable string representation of the lobby socket state
 * @returns {string} - The socket state as a string
 */
export function getLobbySocketStateString() {
  if (!this.lobbySocket) return "SOCKET_NOT_CREATED";

  switch(this.lobbySocket.readyState) {
    case WebSocket.CONNECTING: return "CONNECTING";
    case WebSocket.OPEN: return "OPEN";
    case WebSocket.CLOSING: return "CLOSING";
    case WebSocket.CLOSED: return "CLOSED";
    default: return "UNKNOWN";
  }
}

/**
 * Registers a callback for new game events
 * @param {Function} callback - The callback function
 */
export function onNewGame(callback) {
  this.onNewGameCallback = callback;
}
