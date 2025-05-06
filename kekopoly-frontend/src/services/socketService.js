import { store } from '../store/store';
import {
  setHost,
  setMaxPlayers,
  setGameInfo,
  setGameStarted,
  setGamePhase,
  syncGameStatus,
  // Add these actions from the main gameSlice
  addGameMessage,
  setRoomCode,
  setCurrentPlayer,
  setIsRolling,
  updateDiceRoll,
  movePlayer,
  setPlayers
} from '../store/gameSlice';
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
} from '../store/playerSlice';
import {
  setSelectedProperty,
  updatePropertyDetails,
} from '../store/propertySlice';
import {
  setCurrentCard,
  shuffleCards,
} from '../store/cardSlice';
import { log, logError, logWarning } from '../utils/logger';

// We'll use inline WebSocket URL construction instead of a constant
// to avoid process.env issues

class SocketService {
  // WebSocket connections
  socket = null;
  lobbySocket = null;

  // Connection identifiers
  gameId = null;
  playerId = null;
  sessionId = null;
  token = null;
  localPlayerId = null; // Local player ID to help identify when it's the local player's turn

  // Reconnection settings
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  reconnectInterval = 1000;
  reconnectTimer = null;

  // Player data management
  initialPlayerDataToSend = null; // Store initial data if provided
  connectionState = {}; // Persistent connection state storage

  // Connection status callbacks
  onConnectionChange = (status) => {
    // Dispatch custom events for connection status changes
    if (status === 'connected') {
      window.dispatchEvent(new Event('socket-connected'));
    } else if (status === 'disconnected') {
      window.dispatchEvent(new Event('socket-disconnected'));
    }
  };
  onConnectionError = (error) => {};   // Default empty function
  onNewGameCallback = null;

  // Navigation state flags
  isNavigating = false; // Flag to track navigation state
  preserveConnection = false; // Flag to preserve connection during navigation
  isTransitioningToGame = false; // Flag to track game transition specifically

  initialize() {
    // Try to auto-reconnect if session info is present in localStorage
    const lastGameId = localStorage.getItem('kekopoly_game_id');
    const lastPlayerId = localStorage.getItem('kekopoly_player_id');
    const lastSessionId = localStorage.getItem('kekopoly_session_id');
    if (lastGameId && lastPlayerId && lastSessionId) {
      this.gameId = lastGameId;
      this.playerId = lastPlayerId;
      this.sessionId = lastSessionId;
      // Attempt reconnect (no initialPlayerData, so player_joined is not sent)
      this.connect(this.gameId, this.playerId, this.token).catch(() => {
        // If reconnect fails, clear session info
        localStorage.removeItem('kekopoly_game_id');
        localStorage.removeItem('kekopoly_player_id');
        localStorage.removeItem('kekopoly_session_id');
      });
    }
  }

  connect = (gameId, playerId, token, initialPlayerData) => {
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
        console.log('[CONNECT] Found stored player token data:', parsedTokenData);

        // Merge stored token data with initialPlayerData if provided
        if (initialPlayerData) {
          initialPlayerData = {
            ...initialPlayerData,
            token: initialPlayerData.token || parsedTokenData.token || '',
            emoji: initialPlayerData.emoji || parsedTokenData.emoji || '👤',
            color: initialPlayerData.color || parsedTokenData.color || 'gray.500',
            name: initialPlayerData.name || parsedTokenData.name || `Player_${playerId.substring(0, 4)}`
          };
          console.log('[CONNECT] Merged initialPlayerData with stored token data:', initialPlayerData);
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
          console.log('[CONNECT] Created initialPlayerData from stored token data:', initialPlayerData);
        }
      }
    } catch (e) {
      console.warn('[CONNECT] Error restoring player token data from localStorage:', e);
    }

    // Store initial data if provided and save to persistent state
    this.initialPlayerDataToSend = initialPlayerData;

    // Save to connection state for potential reconnection during navigation
    if (initialPlayerData) {
      this.saveState('initialPlayerData', initialPlayerData);
    }

    // --- Add Logging ---
    log('CONNECT', 'Set this.initialPlayerDataToSend:', this.initialPlayerDataToSend);
    // ---
    this.localPlayerId = playerId; // Set local player ID

    // --- Simplified Session ID Logic ---
    let sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = this.generateSessionId();
      localStorage.setItem('sessionId', sessionId);
    } else {
    }
    this.sessionId = sessionId; // Assign to the class property
    // ---

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

      // --- Construct the WebSocket URL, including the token ---
      // Ensure we have a valid token
      if (!this.token) {
        console.error('[CONNECT] No token available for WebSocket connection');
        // Try to get token from localStorage as fallback
        const storedToken = localStorage.getItem('kekopoly_auth_token');
        if (storedToken) {
          console.log('[CONNECT] Using token from localStorage as fallback');
          this.token = storedToken;
        } else {
          console.error('[CONNECT] No token available in localStorage either');
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
        console.error('[CONNECT] Token is empty after processing');
        reject(new Error('Empty authentication token'));
        return;
      }

      const encodedToken = encodeURIComponent(tokenValue);

      // Use protocol based on current page protocol (ws or wss)
      const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;

      // Construct WebSocket URL with all required parameters
      const wsUrl = `${socketProtocol}//${host}/ws/${this.gameId}?sessionId=${this.sessionId}&token=${encodedToken}`;
      console.log(`[CONNECT] Connecting to WebSocket URL: ${wsUrl.substring(0, wsUrl.indexOf('?'))}?sessionId=${this.sessionId}&token=***`);

      this.onConnectionChange('connecting');

      try {
        // Close existing socket if it exists
        if (this.socket) {
          try {
            this.socket.close();
          } catch (e) {
            console.warn('[CONNECT] Error closing existing socket:', e);
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
        this.socket.onopen = (event) => {
          // --- Enhanced Logging ---
          const timestamp = new Date().toISOString();
          console.log(`[CONNECT] WebSocket connection opened at ${timestamp}`);
          console.log(`[CONNECT] Connection details - GameID: ${this.gameId}, PlayerID: ${this.playerId}, SessionID: ${this.sessionId}`);
          console.log(`[CONNECT] Token used (prefix only): ${this.token ? this.token.substring(0, 10) + '...' : 'none'}`);
          // ---

          // Store successful connection info in localStorage for recovery
          try {
            localStorage.setItem('kekopoly_last_successful_connection', timestamp);
            localStorage.setItem('kekopoly_game_id', this.gameId);
            localStorage.setItem('kekopoly_player_id', this.playerId);
            localStorage.setItem('kekopoly_session_id', this.sessionId);
            localStorage.setItem('kekopoly_auth_token', this.token);
          } catch (e) {
            console.warn('[CONNECT] Error storing connection info in localStorage:', e);
          }

          // Send initial player data if available (used for the first connection)
          if (initialPlayerData) {
            console.log('[CONNECT] Sending initial player data on connection:', initialPlayerData);

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
            console.log('[CONNECT] Sending stored player data on connection:', this.initialPlayerDataToSend);

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
            console.log('[CONNECT] Requesting active players after connection');
            this.sendMessage('get_active_players');

            // Request game state after active players
            setTimeout(() => {
              console.log('[CONNECT] Requesting full game state after connection');
              this.sendMessage('get_game_state', { full: true });
            }, 100);
          }, 100);
        };

        this.socket.onclose = (event) => {
          this.handleDisconnect(event);
          // Don't automatically reject on close, let reconnect logic handle it if needed
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket Error:', error);
          this.onConnectionChange('error');
          this.onConnectionError(error); // Call the error callback
          reject(error); // Reject the promise on error
        };

        this.socket.onmessage = this.handleMessage;

      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        this.onConnectionChange('error');
        this.onConnectionError(error); // Call the error callback
        reject(error);
      }
    });
  };

  // Enhanced disconnect method with navigation awareness
  disconnect = (preserve = false) => {
    this.preserveConnection = preserve;
    console.log(`[SOCKET] Disconnect called with preserve=${preserve}`);

    // Save current connection state before potential disconnect
    this.saveState('connectionActive', !!this.socket);
    this.saveState('gameId', this.gameId);
    this.saveState('playerId', this.playerId);
    this.saveState('token', this.token);
    this.saveState('sessionId', this.sessionId);

    if (this.socket && !this.preserveConnection) {
      console.log('[SOCKET] Closing socket connection');

      // Send a clean disconnect message if possible
      if (this.socket.readyState === WebSocket.OPEN) {
        try {
          this.sendMessage('client_navigating', {
            playerId: this.playerId,
            gameId: this.gameId,
            willReconnect: false
          });
        } catch (e) {
          console.warn('[SOCKET] Failed to send navigation message:', e);
        }
      }

      this.socket.close();
      this.socket = null;
      this.onConnectionChange('disconnected');
    } else if (this.preserveConnection) {
      console.log('[SOCKET] Preserving socket connection during navigation');

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
          console.warn('[SOCKET] Failed to send navigation message:', e);
        }
      }
    }
  };

  // Method to preserve socket connection during navigation
  preserveSocketForNavigation = () => {
    console.log('[SOCKET] Preserving socket connection for navigation');

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
      console.log('[SOCKET] Stored connection info in localStorage for reconnection');
    } catch (e) {
      console.warn('[SOCKET] Could not store socket preservation info in localStorage:', e);
    }

    // Send a navigation message to the server if possible
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.sendMessage('client_navigating', {
          playerId: this.playerId,
          gameId: this.gameId,
          willReconnect: true
        });
      } catch (e) {
        console.warn('[SOCKET] Failed to send navigation message:', e);
      }
    }
  };

  // State persistence methods for connection management
  saveState = (key, value) => {
    this.connectionState[key] = value;

    // Also save critical connection data to localStorage for recovery
    if (['gameId', 'playerId', 'sessionId', 'token'].includes(key)) {
      try {
        localStorage.setItem(`kekopoly_${key}`, value);
      } catch (e) {
        console.warn(`[STATE] Failed to save ${key} to localStorage:`, e);
      }
    }
  };

  loadState = (key, defaultValue = null) => {
    // First try to get from memory state
    if (this.connectionState.hasOwnProperty(key)) {
      return this.connectionState[key];
    }

    // Then try localStorage for critical connection data
    if (['gameId', 'playerId', 'sessionId', 'token'].includes(key)) {
      try {
        const value = localStorage.getItem(`kekopoly_${key}`);
        if (value !== null) {
          return value;
        }
      } catch (e) {
        console.warn(`[STATE] Failed to load ${key} from localStorage:`, e);
      }
    }

    return defaultValue;
  };

  sendMessage = (type, payload) => {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, ...payload });
      this.socket.send(message);
    } else {
      console.warn(`Cannot send message, WebSocket not open. State: ${this.socket?.readyState}`);
    }
  };

  // Method to connect to the lobby socket for real-time game updates
  connectToLobby(token, playerId) {
    if (!token || !playerId) {
      console.error('Cannot connect to lobby: token and playerId are required');
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

      console.log("Lobby WebSocket connection initiated");

      // Add connection state logging
      console.log(`Initial lobby socket state: ${this.getLobbySocketStateString()}`);

      // Monitor connection state changes
      const checkSocketState = () => {
        console.log(`Current lobby socket state: ${this.getLobbySocketStateString()}`);
        if (this.lobbySocket && this.lobbySocket.readyState === WebSocket.OPEN) {
          console.log("Lobby socket connection fully established");
          clearInterval(stateCheckInterval);
        }
      };

      const stateCheckInterval = setInterval(checkSocketState, 500);
      // Clear interval after 10 seconds to avoid memory leaks
      setTimeout(() => clearInterval(stateCheckInterval), 10000);
    } catch (error) {
      console.error("Error creating lobby WebSocket:", error);
    }
  }

  // Helper to get readable WebSocket state
  getLobbySocketStateString() {
    if (!this.lobbySocket) return "SOCKET_NOT_CREATED";

    switch(this.lobbySocket.readyState) {
      case WebSocket.CONNECTING: return "CONNECTING";
      case WebSocket.OPEN: return "OPEN";
      case WebSocket.CLOSING: return "CLOSING";
      case WebSocket.CLOSED: return "CLOSED";
      default: return "UNKNOWN";
    }
  }

  disconnectFromLobby() {
    if (this.lobbySocket) {
      this.lobbySocket.close();
      this.lobbySocket = null;
    }
  }

  // Lobby connection handlers
  handleLobbyConnect = (event) => {
    console.log(`Lobby WebSocket connected for player ${this.playerId}`);
    console.log(`Lobby connection established at ${new Date().toISOString()}`);

    // Reset reconnect attempts on successful connection
    this.reconnectAttempts = 0;

    // Request current game list immediately after connection
    // Reduced timeout to 500ms for faster initial sync
    setTimeout(() => {
      console.log("Requesting initial game list after WebSocket connection");
      if (window.refreshGameList && typeof window.refreshGameList === 'function') {
        window.refreshGameList();
      }
    }, 500);
  };

  handleLobbyDisconnect = (event) => {
    console.log(`Lobby WebSocket disconnected: ${event.reason}`);

    // Try to reconnect unless it was an intentional disconnect
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;

      console.log(`Attempting to reconnect to lobby (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      // Exponential backoff
      const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);

      this.reconnectTimer = setTimeout(() => {
        this.connectToLobby(this.token, this.playerId);
      }, delay);
    }
  };

  handleLobbyError = (error) => {
    console.error('Lobby WebSocket error:', error);
  };

  handleLobbyMessage = (event) => {
    try {
      // Log raw message for debugging
      console.log(`Raw lobby message received at ${new Date().toISOString()}:`, event.data);

      // Clean the message by removing any leading/trailing whitespace or newlines
      const cleanedData = typeof event.data === 'string' ? event.data.trim() : event.data;

      const data = JSON.parse(cleanedData);

      // Log all incoming messages for debugging
      console.log('Parsed lobby message:', data);

      // Handle new game created event
      if (data.type === 'new_game_created') {
        console.log('New game created event received:', data.game);

        // If we have a callback registered, call it with the new game data
        if (this.onNewGameCallback) {
          console.log('Calling onNewGameCallback with game data');
          this.onNewGameCallback(data.game);
        } else {
          console.warn('No onNewGameCallback registered to handle new game event');
        }
      }
    } catch (error) {
      console.error('Error processing lobby WebSocket message:', error);
      console.error('Raw message that caused error:', event.data);

      // Enhanced error recovery for parsing errors
      try {
        if (typeof event.data === 'string') {
          // Try to extract valid JSON objects from the message
          const jsonPattern = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
          const matches = event.data.match(jsonPattern);

          if (matches && matches.length > 0) {
            console.log(`Found ${matches.length} potential JSON objects in message`);

            // Try to parse each potential JSON object
            for (let i = 0; i < matches.length; i++) {
              try {
                const extractedData = JSON.parse(matches[i]);
                console.log(`Successfully extracted data from object ${i+1}:`, extractedData);

                // Process the extracted data
                if (extractedData.type === 'new_game_created' && this.onNewGameCallback) {
                  console.log('Processing extracted new game data');
                  this.onNewGameCallback(extractedData.game);
                }
              } catch (parseError) {
                console.log(`Failed to parse potential JSON object ${i+1}:`, parseError.message);
              }
            }
          } else {
            console.error('No valid JSON objects found in message');
          }
        }
      } catch (recoveryError) {
        console.error('Failed to recover from parsing error:', recoveryError);
      }
    }
  };

  // Register a callback for new game events
  onNewGame(callback) {
    this.onNewGameCallback = callback;
  }

  // Connection handlers
  handleConnect = (event) => {
    const timestamp = new Date().toISOString();
    console.log(`WebSocket connected at ${timestamp} for player ${this.playerId} in game ${this.gameId}`);
    console.log(`Connection details - GameID: ${this.gameId}, PlayerID: ${this.playerId}, SessionID: ${this.sessionId}`);
    console.log(`Token used (prefix): ${this.token ? this.token.substring(0, 10) + '...' : 'none'}`);

    // Reset reconnect attempts on successful connection
    this.reconnectAttempts = 0;

    // Request current game state and active players
    setTimeout(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage('get_game_state', {});
        console.log('Requested game state');

        // Also request active players list to ensure we have all connected players
        this.sendMessage('get_active_players', {});
        console.log('Requested active players list');

        // Check if game has already started
        this.checkIfGameAlreadyStarted();
      } else {
        console.warn('Cannot request game state: socket not open');
      }
    }, 500);
  };

  // Check if game has already started when connecting/reconnecting
  checkIfGameAlreadyStarted = () => {
    console.log('[GAME_CHECK] Checking if game has already started on connect/reconnect');

    // Get current game state from Redux
    const gameState = store.getState().game;
    const currentLocation = window.location.pathname;

    console.log('[GAME_CHECK] Current game state:', {
      gameStarted: gameState.gameStarted,
      gamePhase: gameState.gamePhase,
      currentLocation
    });

    // If we're not on the game board but the game has started according to Redux
    // Only transition to game board if gamePhase is explicitly 'playing'
    if ((!currentLocation.includes('/game/')) &&
        (gameState.gameStarted && gameState.gamePhase === 'playing')) {
      console.log('[GAME_CHECK] Game appears to be already started and in playing phase, setting up retry mechanism');

      // Set up retry mechanism to ensure transition to game board
      this.setupGameStartRetryCheck();
    } else if ((!currentLocation.includes('/game/')) && gameState.gameStarted) {
      console.log('[GAME_CHECK] Game has started but not in playing phase yet, staying in game room');
    } else {
      // Request game state from server to double-check
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log('[GAME_CHECK] Requesting game state from server to verify game status');
        this.sendMessage('get_game_state', {});
      }
    }
  };

  handleDisconnect = (event) => {
    const timestamp = new Date().toISOString();
    console.log(`WebSocket disconnected at ${timestamp}: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
    console.log(`Disconnection details - GameID: ${this.gameId}, PlayerID: ${this.playerId}, SessionID: ${this.sessionId}`);
    console.log(`Navigation state: isNavigating=${this.isNavigating}, preserveConnection=${this.preserveConnection}`);

    // Save disconnection state
    this.saveState('lastDisconnectTime', timestamp);
    this.saveState('lastDisconnectReason', event.reason);
    this.saveState('lastDisconnectCode', event.code);
    this.saveState('lastDisconnectWasClean', event.wasClean);

    // Call connection change callback
    this.onConnectionChange('disconnected');

    // Check if we're in the middle of a navigation or if the connection should be preserved
    if (this.isNavigating || this.preserveConnection || this.loadState('isNavigating', false)) {
      console.log('[NAVIGATION_DISCONNECT] Disconnection occurred during navigation or with preserve flag, will reconnect immediately');

      // Clear any existing reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }

      // Reset reconnect attempts since this is a navigation-related disconnect
      this.reconnectAttempts = 0;

      // Attempt to reconnect immediately with minimal delay
      this.reconnectTimer = setTimeout(() => {
        console.log('[NAVIGATION_DISCONNECT] Immediate reconnection attempt after navigation');

        // Check if we're on the game board page now
        const isOnGameBoard = window.location.pathname.includes('/game/');
        console.log(`[NAVIGATION_DISCONNECT] Current location: ${window.location.pathname}, isOnGameBoard: ${isOnGameBoard}`);

        // Retrieve connection information from state if not available directly
        const gameId = this.gameId || this.loadState('gameId');
        const playerId = this.playerId || this.loadState('playerId');
        const token = this.token || this.loadState('token');

        // Retrieve player data that might have been saved before navigation
        const savedPlayerData = this.loadState('initialPlayerData') || this.loadState('lastSentPlayerData');

        // Only attempt reconnection if we have the necessary information
        if (gameId && playerId && token) {
          console.log(`[NAVIGATION_DISCONNECT] Reconnecting with gameId=${gameId}, playerId=${playerId}`);
          console.log(`[NAVIGATION_DISCONNECT] Using saved player data:`, savedPlayerData);

          // Pass required arguments to connect, including saved player data if available
          this.connect(gameId, playerId, token, savedPlayerData)
            .then(() => {
              console.log('[NAVIGATION_DISCONNECT] Reconnection successful after navigation');

              // Reset navigation flags after successful reconnection
              this.isNavigating = false;
              this.saveState('isNavigating', false);

              // Request game state and active players to ensure we're in sync
              setTimeout(() => {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                  console.log('[NAVIGATION_DISCONNECT] Requesting game state and active players after reconnection');
                  this.sendMessage('get_game_state', { full: true });
                  this.sendMessage('get_active_players');

                  // Also send player data again to ensure server has latest state
                  if (savedPlayerData) {
                    console.log('[NAVIGATION_DISCONNECT] Re-sending player data after reconnection');
                    this.sendMessage('update_player', {
                      playerId: playerId,
                      ...savedPlayerData
                    });
                  }
                }
              }, 200);
            })
            .catch(err => {
              console.error("[NAVIGATION_DISCONNECT] Reconnect after navigation failed:", err);

              // Try again after a short delay if we're still on the game board
              if (window.location.pathname.includes('/game/')) {
                console.log('[NAVIGATION_DISCONNECT] Will try reconnecting again in 1 second');
                setTimeout(() => {
                  this.connect(gameId, playerId, token, savedPlayerData)
                    .catch(err => {
                      console.error("[NAVIGATION_DISCONNECT] Second reconnect attempt failed:", err);
                      // If second attempt fails, try with a clean connection
                      setTimeout(() => {
                        console.log('[NAVIGATION_DISCONNECT] Trying final reconnect with clean connection');
                        this.connect(gameId, playerId, token)
                          .catch(err => console.error("[NAVIGATION_DISCONNECT] Final reconnect attempt failed:", err));
                      }, 1000);
                    });
                }, 1000);
              }
            });
        } else {
          console.error('[NAVIGATION_DISCONNECT] Missing required information for reconnection');
          console.log(`gameId: ${gameId}, playerId: ${playerId}, token: ${token ? 'present' : 'missing'}`);

          // Try to recover from localStorage as a last resort
          const lastGameId = localStorage.getItem('kekopoly_game_id');
          const lastPlayerId = localStorage.getItem('kekopoly_player_id');
          const lastToken = localStorage.getItem('kekopoly_auth_token');

          if (lastGameId && lastPlayerId && lastToken) {
            console.log('[NAVIGATION_DISCONNECT] Attempting recovery using localStorage data');
            this.connect(lastGameId, lastPlayerId, lastToken)
              .catch(err => console.error("[NAVIGATION_DISCONNECT] Recovery attempt failed:", err));
          }
        }
      }, 100);

      return;
    }

    // Standard reconnection logic for non-navigation disconnects
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;

      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      // Exponential backoff
      const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);

      this.reconnectTimer = setTimeout(() => {
        console.log(`Reconnection attempt ${this.reconnectAttempts} at ${new Date().toISOString()}`);

        // Try to use saved player data for reconnection
        const savedPlayerData = this.loadState('initialPlayerData') || this.loadState('lastSentPlayerData');

        // Pass required arguments to connect
        this.connect(this.gameId, this.playerId, this.token, savedPlayerData)
          .catch(err => {
            console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, err);

            // If we have saved player data but reconnection failed, try without it
            if (savedPlayerData && this.reconnectAttempts < this.maxReconnectAttempts) {
              console.log(`Trying reconnection without saved player data`);
              setTimeout(() => {
                this.connect(this.gameId, this.playerId, this.token)
                  .catch(err => console.error(`Clean reconnection attempt failed:`, err));
              }, 1000);
            }
          });
      }, delay);
    } else if (event.wasClean) {
        console.log("Clean disconnection, not attempting reconnect.");
    } else {
        console.log("Max reconnect attempts reached, giving up.");
        this.onConnectionChange('failed'); // Indicate final failure
    }
  };

  handleError = (error) => {
    console.error('WebSocket error:', error);
    console.log(`Connection details - GameID: ${this.gameId}, PlayerID: ${this.playerId}`);

    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;
    const wsUrl = `${socketProtocol}//${host}/ws`;
    console.log(`Auth token: ${this.token ? (this.token.substring(0, 10) + '...') : 'none'}, URL base: ${wsUrl}`);

    // Try to detect the specific issue
    fetch(`http://localhost:8080/health`)
      .then(response => {
        console.log('Backend health check response:', response.status);
      })
      .catch(err => {
        console.error('Backend appears to be unreachable. Check if the server is running on port 8080:', err);
      });
  };

  handleMessage = (event) => {
    try {
      // Reduce logging to prevent console flooding
      // Only log message type, not the entire message
      const data = JSON.parse(event.data);

      // Log a simplified version of the message to reduce console output
      if (data.type) {
        console.log(`[WS] Received message type: ${data.type}`);
      } else {
        console.log('[WS] Received message without type');
      }

      // Handle different message types
      switch (data.type) {
        case 'game_state_update':
          // Call the existing handler for game state
          this.handleGameState(data);
          break;

        case 'player_joined_ack':
          // Log acknowledgment from server
          console.log('[ACK] Server acknowledged player joined:', data.player?.id);
          break;

        case 'game_state':
          this.handleGameState(data);
          break;

        case 'dice_rolled':
          console.log('[DICE] Received dice roll result:', data);
          this.handleDiceRolled(data);
          break;

        case 'dice_rolling':
          console.log('[DICE] Received dice rolling state:', data.isRolling);
          this.handleDiceRolling(data.isRolling);
          break;

        case 'active_players':
          this.handleActivePlayers(data);
          break;

        case 'player_joined':
          this.handlePlayerJoined(data.player);
          break;

        case 'player_disconnected':
          this.handlePlayerDisconnected(data.playerId);
          break;

        case 'player_ready':
          this.handlePlayerReady(data.playerId, data.isReady);
          break;

        case 'game_started':
          this.handleGameStarted(data);
          break;

        case 'game_turn':
          this.handleGameTurn(data);
          break;

        case 'current_turn':
          this.handleCurrentTurn(data);
          break;

        case 'player_moved':
          this.handlePlayerMoved(data);
          break;

        case 'player_balance_change':
          this.handlePlayerBalance(data);
          break;

        case 'player_card_change':
          this.handlePlayerCard(data);
          break;

        case 'player_property_change':
          this.handlePlayerProperty(data);
          break;

        case 'property_updated':
          this.handlePropertyUpdated(data);
          break;

        case 'property_owner_change':
          this.handlePropertyOwner(data);
          break;

        case 'property_engagement_change':
          this.handlePropertyEngagements(data);
          break;

        case 'property_checkmark_change':
          this.handlePropertyCheckmark(data);
          break;

        case 'property_mortgage_change':
          this.handlePropertyMortgage(data);
          break;

        case 'property_effect_change':
          this.handlePropertyEffect(data);
          break;

        case 'cards_remaining':
          this.handleCardRemaining(data.cardsRemaining);
          break;

        case 'card_drawn':
          this.handleCardDrawn(data.card);
          break;

        case 'card_played':
          this.handleCardPlayed(data.cardId);
          break;

        case 'market_condition':
          this.handleMarketCondition(data);
          break;

        case 'host_changed':
          this.handleHostChanged(data.hostId, data.gameId);
          break;

        case 'set_host':
          this.handleSetHost(data.hostId, data.gameId);
          break;

        case 'turn_changed':
          this.handleTurnChanged(data);
          break;

        case 'jail_event':
          this.handleJailEvent(data);
          break;

        case 'error':
          this.handleErrorMessage(data);
          break;

        case 'host_verification':
          this.handleHostVerification(data);
          break;

        case 'broadcast_game_started':
          this.handleBroadcastGameStarted(data);
          break;

        default:
          console.warn('Unhandled message type:', data.type);
      }
    } catch (error) {
      // Enhanced error handling for JSON parsing errors
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        console.error('[SYNC_ERROR] JSON parsing error in WebSocket message:', error.message);

        // Try to identify the problematic part of the message
        try {
          const rawData = event.data;
          if (rawData && typeof rawData === 'string') {
            console.log('[SYNC_ERROR] Attempting to recover from malformed message. Raw data length:', rawData.length);

            // Check for common issues like multiple JSON objects concatenated together
            if (rawData.includes('}{')) {
              console.log('[SYNC_ERROR] Detected multiple concatenated JSON objects');

              // Split the message at the boundary between objects
              const splitMessages = rawData.split(/(?<=\})(?=\{)/);
              console.log(`[SYNC_ERROR] Split into ${splitMessages.length} separate messages`);

              // Process each message separately
              for (let i = 0; i < splitMessages.length; i++) {
                try {
                  const messagePart = splitMessages[i].trim();
                  console.log(`[SYNC_ERROR] Processing message part ${i+1}/${splitMessages.length}, length: ${messagePart.length}`);

                  const parsedData = JSON.parse(messagePart);
                  console.log(`[SYNC_ERROR] Successfully parsed message part ${i+1}:`, parsedData);

                  // Process the valid JSON object
                  this.processRecoveredMessage(parsedData);
                } catch (splitError) {
                  console.log(`[SYNC_ERROR] Failed to parse message part ${i+1}:`, splitError.message);
                }
              }
            } else if (rawData.trim().startsWith('{') && rawData.trim().endsWith('}')) {
              console.log('[SYNC_ERROR] Message appears to be JSON but has parsing issues. First 50 chars:',
                rawData.substring(0, 50), '... Last 50 chars:', rawData.substring(rawData.length - 50));

              // Try to extract valid JSON objects from the message
              // Using a more robust regex pattern that can handle nested objects
              const jsonPattern = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
              const jsonMatches = rawData.match(jsonPattern);

              if (jsonMatches && jsonMatches.length > 0) {
                console.log(`[SYNC_ERROR] Found ${jsonMatches.length} potential JSON objects in message`);

                // Try to parse each potential JSON object
                for (let i = 0; i < jsonMatches.length; i++) {
                  try {
                    const parsedData = JSON.parse(jsonMatches[i]);
                    console.log(`[SYNC_ERROR] Successfully parsed JSON object ${i+1}:`, parsedData);

                    // Process the valid JSON object by routing it to the appropriate handler
                    this.processRecoveredMessage(parsedData);
                  } catch (parseError) {
                    console.log(`[SYNC_ERROR] Failed to parse potential JSON object ${i+1}:`, parseError.message);
                  }
                }
              }
            } else {
              console.log('[SYNC_ERROR] Message does not appear to be valid JSON format. First 50 chars:',
                rawData.substring(0, 50));
            }
          }
        } catch (e) {
          console.error('[SYNC_ERROR] Error while analyzing malformed JSON:', e);
        }

        // Attempt recovery by requesting fresh game state
        this.attemptSyncRecovery('json_parse_error');
      } else {
        console.error('[SYNC_ERROR] Error processing WebSocket message:', error);
        this.handleSyncError('message_processing', error);
      }
    }
  };

  // Helper method to process recovered messages from JSON parsing errors
  processRecoveredMessage = (data) => {
    console.log('Processing recovered message:', data);

    try {
      // Route the message to the appropriate handler based on type
      switch (data.type) {
        case 'player_joined':
          this.handlePlayerJoined(data.player);
          break;

        case 'active_players':
          // Handle active players list
          console.log('Recovered active players list:', data.players);
          const { dispatch } = store;

          if (Array.isArray(data.players)) {
            data.players.forEach(player => {
              if (player && player.id) {
                dispatch(addPlayer({
                  playerId: player.id,
                  playerData: player
                }));
              }
            });
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
          console.log(`[RECOVERED] Game start message (type: ${data.type}) recovered from malformed message at ${new Date().toISOString()}`);

          // Import necessary action creators
          const { setGameStarted, setGamePhase, syncGameStatus } = require('../store/gameSlice');
          const { setGameStatus } = require('../store/slices/gameSlice');

          // Check if this is a game state update that indicates the game has started
          const isGameStarted = data.type === 'game_started' ||
                               data.type === 'game:start' ||
                               (data.type === 'game_state_update' &&
                                ((data.state && (data.state.status === 'ACTIVE' || data.state.gameStarted === true)) ||
                                 (data.status === 'ACTIVE' || data.gameStarted === true)));

          if (isGameStarted) {
            console.log('[RECOVERED] Detected game started state in recovered message');

            // Update game state in Redux store
            dispatch(setGameStarted(true));
            console.log('[WEBSOCKET_SYNC] Game started, setting game phase to playing and status to ACTIVE');
            dispatch(setGamePhase('playing'));
            dispatch(syncGameStatus('ACTIVE'));
            dispatch(setGameStatus('ACTIVE'));

            // Log player data for debugging
            console.log('[WEBSOCKET_SYNC] Current player data in stores:');
            console.log('[WEBSOCKET_SYNC] gameSlice players:', store.getState().game.players);
            console.log('[WEBSOCKET_SYNC] playerSlice players:', store.getState().players.players);

            // Directly update the game state with fulfilled action
            dispatch({
              type: 'game/startGameAsync/fulfilled',
              payload: true,
              meta: { requestId: data.type, arg: undefined }
            });

            // Store in localStorage as a backup mechanism
            try {
              localStorage.setItem('kekopoly_game_started', 'true');
              localStorage.setItem('kekopoly_game_id', this.gameId);
              localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
              localStorage.setItem('kekopoly_game_status', 'ACTIVE');
            } catch (e) {
              console.warn('[RECOVERED] Could not use localStorage:', e);
            }

            // Set up retry mechanism to ensure game board appears
            this.setupGameStartRetryCheck();

            console.log(`[RECOVERED] Game state updated to ACTIVE from recovered ${data.type} message`);
            console.log(`[RECOVERED] Player ${this.playerId} processed recovered ${data.type} event. Current game state:`, {
              gameStarted: store.getState().game.gameStarted,
              gamePhase: store.getState().game.gamePhase,
              status: store.getState().game.status
            });

            // Request updated game state and player list
            setTimeout(() => {
              if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                console.log('[RECOVERED] Requesting updated game state and player list');
                this.sendMessage('get_game_state', { full: true });
                this.sendMessage('get_active_players', {});
              }
            }, 500);
          }
          break;

        case 'host_verification_success':
          console.log('[RECOVERED] Host verification success message recovered');
          // The host was verified, now we can proceed with game start logic
          // This is handled automatically since the game:start message should follow
          break;

        default:
          console.log('Unhandled recovered message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing recovered message:', error);
    }
  };

  // Enhanced game state handler with partial update support and retry mechanism
  handleGameState = (gameState) => {
    const { dispatch } = store;
    console.log('[HANDLE_GAME_STATE] Processing game state:', gameState);

    // Track if this is a partial update
    const isPartialUpdate = gameState.partial === true;
    console.log(`[HANDLE_GAME_STATE] Update type: ${isPartialUpdate ? 'Partial' : 'Full'}`);

    // Process basic game state properties
    // We no longer need to update the slices/gameSlice properties
    // Instead, update the main gameSlice with equivalent information
    if (gameState.gameId) {
      dispatch(setRoomCode(gameState.gameId));
    }
    if (gameState.status) {
      // Map the status to the appropriate gamePhase
      if (gameState.status === 'ACTIVE') {
        console.log('[GAME_STATE] Game status is ACTIVE, syncing game status');
        dispatch(syncGameStatus('ACTIVE'));
      } else if (gameState.status === 'COMPLETED') {
        dispatch(setGamePhase('ended'));
      }
    }
    if (gameState.currentTurn) {
      dispatch(setCurrentPlayer(gameState.currentTurn));
    }

    // Process gameInfo if available
    if (gameState.gameInfo) {
      console.log('[HANDLE_GAME_STATE] Processing gameInfo:', gameState.gameInfo);
      dispatch(setGameInfo(gameState.gameInfo));

      // Update host ID if present in gameInfo - server is the source of truth
      if (gameState.gameInfo.hostId) {
        console.log('[HANDLE_GAME_STATE] Setting host ID from gameInfo:', gameState.gameInfo.hostId);
        dispatch(setHost(gameState.gameInfo.hostId));

        // Update isHost flag for all players based on hostId
        this.updatePlayersHostStatus(gameState.gameInfo.hostId);
      }
    }

    // Check if game state indicates the game has started
    if (gameState.status === 'ACTIVE' ||
        (gameState.gameInfo && gameState.gameInfo.gameStarted === true) ||
        (gameState.gameInfo && gameState.gameInfo.status === 'ACTIVE') ||
        (gameState.gameStarted === true) ||
        (gameState.gamePhase === 'playing')) {
      console.log('[HANDLE_GAME_STATE] Detected active game from game state update');

      // Dispatch startGameAsync action to ensure all reducers are updated
      dispatch({
        type: 'game/startGameAsync/fulfilled',
        payload: true,
        meta: { requestId: 'game_state_update', arg: undefined }
      });

      // Use the synchronization function to ensure consistent state
      this.syncGameStateAcrossSlices('ACTIVE');

      // Set up retry mechanism to ensure game board appears
      this.setupGameStartRetryCheck();

      console.log('[HANDLE_GAME_STATE] Game state updated to ACTIVE, game board transition should occur');

      // Get current location to check if we need to navigate
      const currentLocation = window.location.pathname;
      console.log('[HANDLE_GAME_STATE] Current location:', currentLocation);

      // If we're not already on the game board, log this for debugging
      if (!currentLocation.includes('/game/')) {
        console.log('[HANDLE_GAME_STATE] Not on game board yet, transition should happen soon');

        // Store in localStorage as a backup mechanism
        try {
          localStorage.setItem('kekopoly_game_started', 'true');
          localStorage.setItem('kekopoly_game_id', this.gameId);
          localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
          localStorage.setItem('kekopoly_game_status', 'ACTIVE');
        } catch (e) {
          console.warn('[HANDLE_GAME_STATE] Could not use localStorage:', e);
        }
      }
    }

    // Process players with improved handling
    if (gameState.players) {
      console.log(`[HANDLE_GAME_STATE] Processing ${gameState.players.length} players`);

      // Get current players from store for comparison
      const currentState = store.getState();
      const existingPlayers = currentState.players.players || {};

      gameState.players.forEach(player => {
        // Ensure we have a valid player ID
        const playerId = player.playerId || player.id;
        if (!playerId) {
          console.warn('[HANDLE_GAME_STATE] Received player without ID:', player);
          return;
        }

        // Check if this player already exists in our state
        const existingPlayer = existingPlayers[playerId];

        // Merge with existing player data if available
        const mergedPlayerData = {
          ...(existingPlayer || {}),
          ...player,
          // Ensure ID is consistent
          id: playerId,
          playerId: playerId
        };

        console.log(`[HANDLE_GAME_STATE] ${existingPlayer ? 'Updating' : 'Adding'} player:`,
          { id: playerId, name: mergedPlayerData.name });

        dispatch(addPlayer({
          playerId: playerId,
          playerData: mergedPlayerData
        }));
      });
    }

    // Process properties
    if (gameState.boardState && gameState.boardState.properties) {
      console.log(`[HANDLE_GAME_STATE] Processing ${gameState.boardState.properties.length} properties`);
      gameState.boardState.properties.forEach(property => {
        dispatch(updateProperty({
          propertyId: property.propertyId,
          updates: property
        }));
      });
    }

    // Process remaining cards
    if (gameState.boardState && gameState.boardState.cardsRemaining) {
      dispatch(updateCardsRemaining(gameState.boardState.cardsRemaining));
    }

    // Check if we need to request additional data
    if (isPartialUpdate || this.shouldRequestAdditionalData(gameState)) {
      this.requestAdditionalGameData();
    }

    // Log completion of game state processing
    console.log('[HANDLE_GAME_STATE] Finished processing game state update');
  };

  // Helper method to determine if we need to request additional data
  shouldRequestAdditionalData = (gameState) => {
    // Check for missing critical data
    const missingPlayers = !gameState.players || gameState.players.length === 0;
    const missingBoardState = !gameState.boardState;
    const missingGameInfo = !gameState.gameInfo;

    // Check if we're in an active game but missing data
    const isActiveGame = gameState.status === 'ACTIVE' ||
                        (gameState.gameInfo && gameState.gameInfo.status === 'ACTIVE');

    if (isActiveGame && (missingPlayers || missingBoardState)) {
      console.log('[HANDLE_GAME_STATE] Active game missing critical data, will request additional data');
      return true;
    }

    // Check if we're missing host information
    const missingHostId = !gameState.gameInfo || !gameState.gameInfo.hostId;
    if (missingHostId) {
      console.log('[HANDLE_GAME_STATE] Missing host information, will request additional data');
      return true;
    }

    return false;
  };

  // Request additional game data when needed
  requestAdditionalGameData = () => {
    console.log('[HANDLE_GAME_STATE] Requesting additional game data');

    // Only request if socket is open
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Request full game state
      this.sendMessage('get_game_state', { full: true });

      // Also request active players list
      this.sendMessage('get_active_players', {});

      console.log('[HANDLE_GAME_STATE] Additional data requests sent');
    } else {
      console.warn('[HANDLE_GAME_STATE] Cannot request additional data: socket not open');
    }
  };

  // Update all players' host status based on hostId
  updatePlayersHostStatus = (hostId, skipBroadcast = false) => {
    if (!hostId) {
      console.warn('[UPDATE_HOST_STATUS] No hostId provided');
      return;
    }

    console.log('[UPDATE_HOST_STATUS] Updating all players host status based on hostId:', hostId);

    // Get current player list from the store
    const currentState = store.getState();
    const existingPlayers = currentState.players.players || {};
    const { dispatch } = store;

    // First, ensure the hostId is set in the game state
    if (currentState.game.hostId !== hostId) {
      console.log(`[UPDATE_HOST_STATUS] Updating game state hostId: ${currentState.game.hostId} → ${hostId}`);
      dispatch(setHost(hostId));

      // Verify host status with the server
      if (this.socket && this.socket.readyState === WebSocket.OPEN && !skipBroadcast) {
        console.log('[UPDATE_HOST_STATUS] Verifying host status with server');
        this.sendMessage('verify_host', {
          gameId: this.gameId
        });
      }
    }

    // Track if any player's host status was actually changed
    let hostStatusChanged = false;

    // Update isHost flag for all players
    Object.keys(existingPlayers).forEach(playerId => {
      const isPlayerHost = playerId === hostId;
      const player = existingPlayers[playerId];

      // Only update if the host status is different
      if (player.isHost !== isPlayerHost) {
        console.log(`[UPDATE_HOST_STATUS] Updating player ${playerId} host status: ${player.isHost} → ${isPlayerHost}`);
        hostStatusChanged = true;

        // Preserve other important player properties when updating host status
        dispatch(updatePlayer({
          playerId,
          updates: {
            isHost: isPlayerHost,
            // Explicitly preserve these properties to prevent them from being reset
            isReady: player.isReady,
            name: player.name,
            token: player.token,
            emoji: player.emoji,
            color: player.color
          }
        }));
      }
    });

    // Only request active players list if host status actually changed and we're not skipping broadcast
    if (hostStatusChanged && !skipBroadcast) {
      // Request active players list from server to ensure all clients are in sync
      // But add a small delay to prevent message flood
      setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.sendMessage('get_active_players', {});
        }
      }, 500);
    }
  };

  // Method to send a property purchase request
  buyProperty = (propertyId) => {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendMessage('buy_property', { propertyId, playerId: this.playerId });
      console.log(`[PROPERTY] Sent buy_property request for property ${propertyId}`);
    } else {
      console.warn(`Cannot send buy_property message, WebSocket not open. State: ${this.socket?.readyState}`);
    }
  };

  // Helper method to check if it's the local player's turn
  isLocalPlayerTurn = () => {
    try {
      const gameState = store.getState().game;

      // Get the current player from Redux state
      const currentTurn = gameState.currentPlayer;

      // Check if it's the local player's turn
      const isMyTurn = this.localPlayerId && currentTurn === this.localPlayerId;

      console.log('[TURN_CHECK] Is it my turn?', {
        localPlayerId: this.localPlayerId,
        currentPlayer: currentTurn,
        isMyTurn: isMyTurn
      });

      // ALWAYS request the current turn from the server to ensure we have the latest state
      // This is critical for turn-based actions like rolling dice
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Always request the current turn, but limit frequency to prevent spam
        const now = Date.now();
        if (!this.lastTurnCheck || now - this.lastTurnCheck > 300) { // Further reduced from 500ms to 300ms
          this.lastTurnCheck = now;

          // Request current turn from server immediately
          this.sendMessage('get_current_turn', {});
          console.log('[TURN_CHECK] Requested current turn from server');

          // Also request full game state occasionally to ensure complete synchronization
          if (!this.lastFullStateCheck || now - this.lastFullStateCheck > 2000) {
            this.lastFullStateCheck = now;
            this.sendMessage('get_game_state', { full: true });
            console.log('[TURN_CHECK] Requested full game state from server');
          }
        }
      }

      // If we're in a game that's just started, be extra cautious and return false
      // if we haven't received explicit confirmation from the server
      if (gameState.gameStartedTimestamp) {
        const gameStartTime = gameState.gameStartedTimestamp;
        const now = Date.now();
        const gameJustStarted = now - gameStartTime < 5000; // Within 5 seconds of game start

        if (gameJustStarted && !this.confirmedFirstTurn) {
          console.log('[TURN_CHECK] Game just started and first turn not confirmed, returning false');

          // Request current turn from server immediately
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.sendMessage('get_current_turn', {});
          }

          return false; // Safer to return false until we get confirmation
        }
      }

      return isMyTurn;
    } catch (error) {
      console.error('[TURN_CHECK] Error checking if it\'s local player\'s turn:', error);
      return false; // Default to false on error (safer)
    }
  };

  // Reuse all the existing handlers
  handleGameStatus = (status) => {
    store.dispatch(setGameStatus(status));
  };

  // Handle current_turn message from server
  handleCurrentTurn = (data) => {
    const { dispatch } = store;
    const currentState = store.getState();
    const previousTurn = currentState.game.currentPlayer;
    const currentTurn = data.currentTurn || data.currentPlayer;

    console.log(`[TURN_MANAGEMENT] Received current_turn message: ${currentTurn}`, {
      previousTurn,
      localPlayerId: this.localPlayerId,
      fullData: data
    });

    // Make sure currentTurn is valid
    if (!currentTurn) {
      console.error('[TURN_MANAGEMENT] Received invalid currentTurn:', currentTurn);
      return;
    }

    // Mark that we've confirmed the first turn from the server
    this.confirmedFirstTurn = true;

    // Always update the current turn in Redux to ensure client and server are in sync
    // This is critical for turn-based actions like rolling dice
    console.log(`[TURN_MANAGEMENT] Updating current turn from ${previousTurn} to ${currentTurn}`);

    // Force update the current player in Redux
    dispatch(setCurrentPlayer(currentTurn));

    // Dispatch a special action to ensure all components are aware of the turn change
    dispatch({ type: 'game/forceTurnUpdate', payload: currentTurn });

    // Double-check that the Redux store was updated correctly
    setTimeout(() => {
      const updatedState = store.getState().game;
      if (updatedState.currentPlayer !== currentTurn) {
        console.error('[TURN_MANAGEMENT] Redux store was not updated correctly!', {
          expected: currentTurn,
          actual: updatedState.currentPlayer
        });

        // Force update again with both actions
        dispatch(setCurrentPlayer(currentTurn));
        dispatch({ type: 'game/forceTurnUpdate', payload: currentTurn });
      } else {
        console.log('[TURN_MANAGEMENT] Redux store updated successfully to', currentTurn);
      }
    }, 50);

    // Find player name if possible
    let playerName = "another player";
    const players = currentState.game.players || [];
    const currentPlayerObj = players.find(p => p.id === currentTurn);
    if (currentPlayerObj && currentPlayerObj.name) {
      playerName = currentPlayerObj.name;
    }

    // Only add a game message if the turn has actually changed
    if (previousTurn !== currentTurn) {
      // Add a game message about the turn change
      dispatch(addGameMessage({
        type: 'TURN',
        content: `Current turn is ${playerName}`,
        timestamp: Date.now()
      }));

      // Check if it's the local player's turn and show a notification
      if (currentTurn === this.localPlayerId) {
        console.log(`[TURN_MANAGEMENT] It's now your turn (Player ${this.localPlayerId})`);

        // Show a toast notification to the user
        try {
          const { toast } = require('@chakra-ui/react');
          if (toast) {
            toast({
              title: "Your Turn",
              description: "It's your turn to roll the dice!",
              status: "success", // Changed from info to success for more visibility
              duration: 5000,    // Increased duration
              isClosable: true,
              position: "top",   // Position at top for more visibility
            });
          }
        } catch (e) {
          console.log('[TURN_MANAGEMENT] Could not show toast notification:', e);
        }
      } else {
        console.log(`[TURN_MANAGEMENT] It's NOT your turn. Current turn: ${currentTurn}, Your ID: ${this.localPlayerId}`);

        // Show a toast notification to the user that it's not their turn
        try {
          const { toast } = require('@chakra-ui/react');
          if (toast) {
            toast({
              title: "Other Player's Turn",
              description: `It's ${playerName}'s turn to roll the dice.`,
              status: "info",
              duration: 3000,
              isClosable: true,
              position: "top",
            });
          }
        } catch (e) {
          console.log('[TURN_MANAGEMENT] Could not show toast notification:', e);
        }
      }
    } else {
      console.log(`[TURN_MANAGEMENT] Current turn unchanged: ${currentTurn}`);

      // Even if the turn hasn't changed, update the UI if it's the first confirmation
      // This helps ensure the UI is correct at game start
      if (currentState.gameStartedTimestamp) {
        const gameStartTime = currentState.gameStartedTimestamp;
        const now = Date.now();
        const gameJustStarted = now - gameStartTime < 5000; // Within 5 seconds of game start

        if (gameJustStarted) {
          console.log('[TURN_MANAGEMENT] Game just started, showing turn notification even though turn unchanged');

          // Check if it's the local player's turn and show a notification
          if (currentTurn === this.localPlayerId) {
            try {
              const { toast } = require('@chakra-ui/react');
              if (toast) {
                toast({
                  title: "Your Turn",
                  description: "It's your turn to roll the dice!",
                  status: "success",
                  duration: 5000,
                  isClosable: true,
                  position: "top",
                });
              }
            } catch (e) {
              console.log('[TURN_MANAGEMENT] Could not show toast notification:', e);
            }
          } else {
            try {
              const { toast } = require('@chakra-ui/react');
              if (toast) {
                toast({
                  title: "Other Player's Turn",
                  description: `It's ${playerName}'s turn to roll the dice.`,
                  status: "info",
                  duration: 3000,
                  isClosable: true,
                  position: "top",
                });
              }
            } catch (e) {
              console.log('[TURN_MANAGEMENT] Could not show toast notification:', e);
            }
          }
        }
      }
    }
  };

  handleGameTurn = ({ currentTurn, turnOrder, gameId }) => {
    const { dispatch } = store;
    const currentState = store.getState();
    const previousTurn = currentState.game.currentPlayer;

    console.log(`[TURN_MANAGEMENT] Turn changing from ${previousTurn} to ${currentTurn}`, {
      gameId,
      turnOrder,
      localPlayerId: this.localPlayerId,
      fullEvent: { currentTurn, turnOrder, gameId }
    });

    // Make sure currentTurn is valid
    if (!currentTurn) {
      console.error('[TURN_MANAGEMENT] Received invalid currentTurn:', currentTurn);
      return;
    }

    // Force update the current player in Redux
    dispatch(setCurrentPlayer(currentTurn));
    console.log(`[TURN_MANAGEMENT] Dispatched setCurrentPlayer with: ${currentTurn}`);

    // Update turn order if provided
    if (turnOrder) {
      console.log(`[TURN_MANAGEMENT] Setting turn order: ${JSON.stringify(turnOrder)}`);
      dispatch(setTurnOrder(turnOrder));
    }

    // Add a game message about the turn change
    dispatch(addGameMessage({
      type: 'TURN',
      content: `Turn changed to player ${currentTurn}`,
      timestamp: Date.now()
    }));

    // Check if it's the local player's turn
    const isMyTurn = currentTurn === this.localPlayerId;
    console.log(`[TURN_MANAGEMENT] Is it my turn? ${isMyTurn}`, {
      currentTurn,
      localPlayerId: this.localPlayerId,
      match: currentTurn === this.localPlayerId
    });

    if (isMyTurn) {
      console.log(`[TURN_MANAGEMENT] It's now your turn (Player ${this.localPlayerId})`);

      // Show a toast notification to the user
      try {
        const { toast } = require('@chakra-ui/react');
        if (toast) {
          toast({
            title: "Your Turn",
            description: "It's your turn to roll the dice!",
            status: "info",
            duration: 3000,
            isClosable: true,
          });
        }
      } catch (e) {
        console.log('[TURN_MANAGEMENT] Could not show toast notification:', e);
      }
    } else {
      console.log(`[TURN_MANAGEMENT] It's NOT your turn. Current turn: ${currentTurn}, Your ID: ${this.localPlayerId}`);

      // Show a toast notification to the user that it's not their turn
      try {
        const { toast } = require('@chakra-ui/react');
        if (toast) {
          // Find the player name if possible
          const players = currentState.game.players || [];
          const currentPlayerObj = players.find(p => p.id === currentTurn);
          const playerName = currentPlayerObj ? currentPlayerObj.name : `Player ${currentTurn.substring(0, 5)}...`;

          toast({
            title: "Other Player's Turn",
            description: `It's ${playerName}'s turn to roll the dice.`,
            status: "info",
            duration: 3000,
            isClosable: true,
          });
        }
      } catch (e) {
        console.log('[TURN_MANAGEMENT] Could not show toast notification:', e);
      }
    }

    // Log the current state after update for debugging
    setTimeout(() => {
      const updatedState = store.getState().game;
      console.log('[TURN_MANAGEMENT] After turn change, current state:', {
        currentPlayer: updatedState.currentPlayer,
        localPlayerId: this.localPlayerId,
        isMyTurn: this.isLocalPlayerTurn()
      });

      // Double-check that the Redux store was actually updated
      if (updatedState.currentPlayer !== currentTurn) {
        console.error('[TURN_MANAGEMENT] Redux store was not updated correctly!', {
          expected: currentTurn,
          actual: updatedState.currentPlayer
        });

        // Force update again
        console.log('[TURN_MANAGEMENT] Forcing another update to Redux store');
        dispatch(setCurrentPlayer(currentTurn));
      }
    }, 100);
  };

  handleMarketCondition = ({ condition, remainingTurns }) => {
    store.dispatch(setMarketCondition({ condition, remainingTurns }));
  };

  handlePlayerJoined = (player) => {
    console.log('[PLAYER_DISPLAY] Player joined event received:', player);

    if (!player || !player.id) {
      console.error('[PLAYER_DISPLAY] Invalid player data received:', player);
      return;
    }

    // Immediately request active players to ensure we have the latest player list
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('[PLAYER_DISPLAY] Requesting active_players immediately after player_joined event');
      this.sendMessage('get_active_players', {});
    }

    // Check if this is the local player and we have stored token data
    if (player.id === this.playerId || player.id === this.localPlayerId) {
      try {
        const storedTokenData = localStorage.getItem('kekopoly_player_token_data');
        if (storedTokenData) {
          const parsedTokenData = JSON.parse(storedTokenData);
          console.log('[PLAYER_DISPLAY] Found stored token data for local player:', parsedTokenData);

          // Send an explicit update to the server to ensure token is set
          this.sendMessage('update_player_info', {
            playerId: player.id,
            characterToken: parsedTokenData.token || parsedTokenData.emoji || '👤',
            token: parsedTokenData.token || '',
            emoji: parsedTokenData.emoji || '👤',
            color: parsedTokenData.color || 'gray.500',
            name: player.name || parsedTokenData.name || `Player_${player.id.substring(0, 4)}`
          });
          console.log('[PLAYER_DISPLAY] Sent explicit token update to server for local player');
        }
      } catch (e) {
        console.warn('[PLAYER_DISPLAY] Error retrieving token data from localStorage:', e);
      }
    }

    const { dispatch } = store;
    const currentState = store.getState();
    const existingPlayers = currentState.players.players || {};
    let hostId = currentState.game.hostId; // Use let as it might be updated

    console.log('[PLAYER_DISPLAY] Current hostId in Redux when player joined:', hostId);
    console.log('[PLAYER_DISPLAY] Current player list:', Object.keys(existingPlayers));

    // Check if this player already exists in our state
    const existingPlayer = existingPlayers[player.id];

    if (existingPlayer) {
      console.log(`[PLAYER_DISPLAY] Player ${player.id} already exists. Handling as update.`);

      // If the joining player message explicitly marks them as host, update the hostId
      let updatedHostStatus = existingPlayer.isHost;
      if (player.isHost === true && hostId !== player.id) {
        console.log(`[HOST_MANAGEMENT] Player ${player.id} marked as host in join message, updating game state hostId.`);
        dispatch(setHost(player.id));
        hostId = player.id; // Update local hostId for consistency below
        updatedHostStatus = true;
      } else if (player.id === hostId) {
         updatedHostStatus = true; // Ensure host status is correct if they rejoin
      }

      // Only dispatch an update if necessary fields have changed
      const updates = {};
      let needsUpdate = false;

      // Check all important fields for changes
      if (existingPlayer.isHost !== updatedHostStatus) {
        updates.isHost = updatedHostStatus;
        needsUpdate = true;
      }

      if (player.isReady !== undefined && existingPlayer.isReady !== player.isReady) {
        updates.isReady = player.isReady;
        needsUpdate = true;
      }

      // Check for display property changes
      if (player.name && existingPlayer.name !== player.name) {
        updates.name = player.name;
        needsUpdate = true;
      }

      if (player.token && existingPlayer.token !== player.token) {
        updates.token = player.token;
        needsUpdate = true;
      }

      if (player.emoji && existingPlayer.emoji !== player.emoji) {
        updates.emoji = player.emoji;
        needsUpdate = true;
      }

      if (player.color && existingPlayer.color !== player.color) {
        updates.color = player.color;
        needsUpdate = true;
      }

      if (player.status && existingPlayer.status !== player.status) {
        updates.status = player.status;
        needsUpdate = true;
      }

      if (needsUpdate) {
         console.log(`[PLAYER_DISPLAY] Updating existing player ${player.id} with:`, updates);
         console.log('[PLAYER_UPDATE] Updating player from WebSocket event:', {
           playerId: data.playerId,
           updates: data
         });
         dispatch(updatePlayer({
          playerId: player.id,
          updates: updates
         }));

         // If host status changed, ensure consistency across all players
         if (updates.isHost !== undefined) {
            this.updatePlayersHostStatus(hostId, true); // Skip broadcast from here
         }

         // Synchronize player data between stores
         this.syncPlayerDataBetweenStores();

         // Request active players to ensure everyone is in sync
         setTimeout(() => {
           if (this.socket && this.socket.readyState === WebSocket.OPEN) {
             console.log('[PLAYER_DISPLAY] Requesting active_players after player update');
             this.sendMessage('get_active_players');
           }
         }, 200);
      } else {
         console.log(`[PLAYER_DISPLAY] No necessary updates for existing player ${player.id} from join message.`);
      }

      return;
    }

    // --- Player does NOT exist, proceed with adding ---
    console.log(`[PLAYER_DISPLAY] Player ${player.id} does not exist. Adding new player.`);

    // Determine if this player should be the host using enhanced logic
    let isPlayerHost = false;

    // Case 1: Player is explicitly marked as host in the message
    if (player.isHost === true) {
      isPlayerHost = true;
      // Update game state hostId to match this player
      console.log(`[HOST_MANAGEMENT] Player ${player.id} is marked as host in message, setting as host.`);
      dispatch(setHost(player.id));
      hostId = player.id; // Update local hostId
    }
    // Case 2: Player ID matches the hostId in game state
    else if (player.id === hostId) {
      isPlayerHost = true;
      console.log(`[HOST_MANAGEMENT] Player ${player.id} matches existing hostId ${hostId}.`);
    }
    // Case 3: No hostId is set and no players exist yet
    else if (!hostId && Object.keys(existingPlayers).length === 0) {
      isPlayerHost = true;
      console.log(`[HOST_MANAGEMENT] No host set and no existing players, setting ${player.id} as host.`);
      dispatch(setHost(player.id));
      hostId = player.id; // Update local hostId
    }

    console.log(`[HOST_MANAGEMENT] Determined host status for new player ${player.id}: ${isPlayerHost}`);

    // Make sure player has all required fields
    const playerData = {
      // Default values for missing fields
      id: player.id,
      position: 0,
      balance: 1500,
      properties: [],
      status: player.status || 'ACTIVE',

      // Prioritize new data from the message for display properties
      name: player.name || `Player ${player.id.substring(0, 4)}`,
      token: player.token || player.characterToken || '',
      emoji: player.emoji || '👤',
      color: player.color || 'gray.500',
      characterToken: player.characterToken || player.token || player.emoji || '👤',

      // Handle ready state
      isReady: player.isReady !== undefined ? player.isReady : false,

      // Always ensure isHost is set correctly based on above logic
      isHost: isPlayerHost
    };

    // If this is the local player, check for stored token data
    if (player.id === this.playerId || player.id === this.localPlayerId) {
      try {
        const storedTokenData = localStorage.getItem('kekopoly_player_token_data');
        if (storedTokenData) {
          const parsedTokenData = JSON.parse(storedTokenData);
          console.log('[PLAYER_DISPLAY] Using stored token data for local player in playerData:', parsedTokenData);

          // Update the playerData with stored token information
          playerData.token = parsedTokenData.token || playerData.token;
          playerData.emoji = parsedTokenData.emoji || playerData.emoji;
          playerData.color = parsedTokenData.color || playerData.color;
          playerData.characterToken = parsedTokenData.token || parsedTokenData.emoji || playerData.characterToken;
        }
      } catch (e) {
        console.warn('[PLAYER_DISPLAY] Error retrieving token data from localStorage for playerData:', e);
      }
    }

    // Ensure properties is an array
    if (!Array.isArray(playerData.properties)) {
      playerData.properties = [];
    }

    // Log the player being added
    console.log(`[PLAYER_DISPLAY] Adding new player:`, playerData);

    // Add the player to the store
    dispatch(addPlayer({
      playerId: player.id,
      playerData: playerData
    }));

    // If this new player was set as host, update all players' status
    if (isPlayerHost) {
       this.updatePlayersHostStatus(hostId, true);
    }

    // Synchronize player data between stores
    this.syncPlayerDataBetweenStores();

    // Request active players to ensure everyone is in sync
    setTimeout(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log('[PLAYER_DISPLAY] Requesting active_players after adding new player');
        this.sendMessage('get_active_players');
      }
    }, 200);
  };

  handlePlayerUpdated = ({ playerId, updates }) => {
    store.dispatch(updatePlayer({ playerId, updates }));
  };

  handlePlayerMoved = ({ playerId, position }) => {
    console.log(`[PLAYER_MOVED] Received player_moved event for player ${playerId} to position ${position}`);

    // Get the space name for better logging
    const { boardSpaces } = require('../core/models/boardConfig');
    const space = boardSpaces.find(s => s.position === position);
    const spaceName = space ? space.name : `Position ${position}`;
    console.log(`[PLAYER_MOVED] Player ${playerId} moved to ${spaceName} (position ${position})`);

    // Update position in playerSlice
    store.dispatch(updatePlayerPosition({ playerId, position }));
    console.log(`[PLAYER_MOVED] Updated position in playerSlice`);

    // Get current state after playerSlice update
    const currentState = store.getState();
    const gameState = currentState.game;
    const playerIndex = gameState.players.findIndex(p => p.id === playerId);

    if (playerIndex !== -1) {
      const oldPosition = gameState.players[playerIndex].position || 0;
      console.log(`[PLAYER_MOVED] Found player in gameSlice at index ${playerIndex}, current position: ${oldPosition}`);

      if (oldPosition !== position) {
        // Use movePlayer to update the position in the game slice
        console.log(`[PLAYER_MOVED] Updating position in gameSlice from ${oldPosition} to ${position}`);
        store.dispatch(movePlayer({
          playerId,
          newPosition: position,
          oldPosition: oldPosition
        }));
      } else {
        console.log(`[PLAYER_MOVED] Position already up to date in gameSlice: ${position}`);
      }
    } else {
      console.warn(`[PLAYER_MOVED] Player ${playerId} not found in gameSlice players array`);

      // Player exists in playerSlice but not in gameSlice - sync the stores
      console.log(`[PLAYER_MOVED] Synchronizing stores to ensure player exists in gameSlice`);
      this.syncPlayerDataBetweenStores();

      // After synchronization, try updating the position again
      setTimeout(() => {
        const updatedState = store.getState();
        const updatedPlayerIndex = updatedState.game.players.findIndex(p => p.id === playerId);

        if (updatedPlayerIndex !== -1) {
          const oldPosition = updatedState.game.players[updatedPlayerIndex].position || 0;
          console.log(`[PLAYER_MOVED] After sync, found player in gameSlice at index ${updatedPlayerIndex}`);

          // Use movePlayer to update the position in the game slice
          store.dispatch(movePlayer({
            playerId,
            newPosition: position,
            oldPosition: oldPosition
          }));
        }
      }, 50);
    }

    // Request active players to ensure everyone is in sync
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log(`[PLAYER_MOVED] Requesting active_players to ensure sync across clients`);
      setTimeout(() => {
        this.sendMessage('get_active_players');
      }, 100);

      // Also broadcast the player_moved event to all clients to ensure everyone gets the update
      console.log(`[PLAYER_MOVED] Broadcasting player_moved event to all clients`);
      this.sendMessage('broadcast_player_moved', {
        playerId,
        position,
        timestamp: Date.now()
      });
    }
  };

  handlePlayerBalance = ({ playerId, amount, operation }) => {
    store.dispatch(updatePlayerBalance({ playerId, amount, operation }));
  };

  handlePropertyOwner = ({ propertyId, ownerId, previousOwnerId }) => {
    const { dispatch } = store;
    log('PROPERTY', `Property ${propertyId} ownership changed from ${previousOwnerId} to ${ownerId}`);

    // Get property name from boardConfig
    const { configBoardSpaces } = require('../core/models/boardConfig');
    const propertySpace = configBoardSpaces.find(s => s.id === propertyId);
    const propertyName = propertySpace ? propertySpace.name : `Property ${propertyId}`;

    // Update property owner in the store
    dispatch(buyProperty({
      playerId: ownerId,
      propertyId: propertyId
    }));

    // Add a game message about the property purchase
    if (ownerId) {
      const currentState = store.getState();
      const player = currentState.players.players[ownerId];
      const playerName = player ? player.name : `Player ${ownerId}`;

      dispatch(addGameMessage({
        type: 'PROPERTY',
        playerId: ownerId,
        content: `${playerName} purchased ${propertyName}`,
        data: {
          propertyId,
          propertyName,
          previousOwnerId
        },
        timestamp: Date.now()
      }));
    }
  };

  handlePlayerCard = ({ playerId, card, action }) => {
    const { dispatch } = store;
    if (action === 'add') {
      dispatch(addPlayerCard({ playerId, card }));
    } else if (action === 'remove') {
      dispatch(removePlayerCard({ playerId, cardId: card.cardId }));
    }
  };

  handlePlayerProperty = ({ playerId, propertyId, action }) => {
    const { dispatch } = store;
    if (action === 'add') {
      dispatch(addPlayerProperty({ playerId, propertyId }));
    } else if (action === 'remove') {
      dispatch(removePlayerProperty({ playerId, propertyId }));
    }
  };

  handlePropertyUpdated = ({ propertyId, updates }) => {
    store.dispatch(updateProperty({ propertyId, updates }));
  };

  // This function is a duplicate of the one above and has been merged

  handlePropertyEngagements = ({ propertyId, action }) => {
    const { dispatch } = store;
    if (action === 'add') {
      dispatch(addEngagement({ propertyId }));
    } else if (action === 'remove') {
      dispatch(removeEngagement({ propertyId }));
    }
  };

  handlePropertyCheckmark = ({ propertyId }) => {
    store.dispatch(toggleBlueCheckmark({ propertyId }));
  };

  handlePropertyMortgage = ({ propertyId }) => {
    store.dispatch(toggleMortgage({ propertyId }));
  };

  handlePropertyEffect = ({ propertyId, effect }) => {
    store.dispatch(addSpecialEffect({ propertyId, effect }));
  };

  handleDiceRolled = (data) => {
    const { dispatch } = store;
    console.log('[DICE] Received dice_rolled event with data:', data);

    // IMPORTANT: Set isRolling to false immediately to ensure UI updates
    // This is critical to fix the "stuck in Rolling..." state
    dispatch(setIsRolling(false));

    // Check if dice values are present in the response
    if (!data.dice && !data.dice1 && !data.dice2) {
      console.error('[DICE] No dice values found in response:', data);
      // Create default dice values as fallback
      data.dice = [1, 1];
    }

    // Always get dice values as an array and ensure they are valid numbers
    let dice = Array.isArray(data.dice) ? data.dice : [data.dice1, data.dice2];
    console.log('[DICE] Raw dice values from server:', dice);

    // Validate dice values - ensure they are numbers between 1-6
    dice = dice.map(value => {
      // Convert to number if it's a string
      const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

      // Validate the number is between 1-6
      if (typeof numValue !== 'number' || isNaN(numValue) || numValue < 1 || numValue > 6) {
        console.warn(`[DICE] Invalid dice value: ${value}, using default value 1`);
        return 1; // Default to 1 for invalid values
      }
      return numValue;
    });

    const [dice1, dice2] = dice;
    console.log(`[DICE] Processed dice values: ${dice1}, ${dice2}`);

    // Store the dice values with a timestamp for tracking recent rolls
    const rollTimestamp = Date.now();

    // Update Redux with validated dice values and timestamp
    dispatch(updateDiceRoll({
      dice: [dice1, dice2],
      isDoubles: dice1 === dice2,
      playerId: data.playerId,
      timestamp: rollTimestamp
    }));

    // Move the player and trigger ROLL_RESULT notification via reducer
    if (typeof data.position === 'number' && data.playerId) {
      // Get current player position for oldPosition if not provided
      let oldPosition = data.oldPosition;
      if (oldPosition === undefined || oldPosition === null) {
        const currentState = store.getState();
        const player = currentState.game.players.find(p => p.id === data.playerId);
        oldPosition = player ? player.position : 0;
      }

      console.log('[DICE] Dispatching movePlayer with diceValues:', dice, 'from', oldPosition, 'to', data.position);

      // Track that we're animating this player to prevent duplicate animations
      window._kekopolyAnimatingPlayers = window._kekopolyAnimatingPlayers || [];
      if (!window._kekopolyAnimatingPlayers.includes(data.playerId)) {
        window._kekopolyAnimatingPlayers.push(data.playerId);
      }

      // Create a success event for dice roll
      const successEvent = new CustomEvent('dice-roll-success', {
        detail: {
          dice: [dice1, dice2],
          playerId: data.playerId,
          oldPosition: oldPosition,
          newPosition: data.position
        }
      });
      window.dispatchEvent(successEvent);

      // Dispatch the move player action with the timestamp to track this specific roll
      dispatch(movePlayer({
        playerId: data.playerId,
        newPosition: data.position,
        oldPosition: oldPosition,
        diceValues: [dice1, dice2],
        timestamp: rollTimestamp
      }));

      // Add a specific ROLL message to the game log
      const currentState = store.getState();
      const player = currentState.game.players.find(p => p.id === data.playerId);
      const playerName = player ? player.name : `Player ${data.playerId}`;

      // Add a game message with the correct dice values
      dispatch(addGameMessage({
        type: 'ROLL_RESULT',
        playerId: data.playerId,
        content: `${playerName} rolled ${dice1} and ${dice2}`,
        dice: [dice1, dice2],
        timestamp: rollTimestamp
      }));

      // Remove player from animating list after animation completes
      // Animation takes about 300ms per step, plus a small buffer
      const animationTime = Math.abs(data.position - oldPosition) * 300 + 500;
      setTimeout(() => {
        window._kekopolyAnimatingPlayers = window._kekopolyAnimatingPlayers.filter(id => id !== data.playerId);
        console.log(`[DICE] Removed player ${data.playerId} from animating list after ${animationTime}ms`);
      }, animationTime);
    }

    // Double-check that rolling state is set to false
    const currentState = store.getState();
    if (currentState.game.isRolling) {
      console.log('[DICE] isRolling still true after processing, forcing to false');
      dispatch(setIsRolling(false));
    }

    // Synchronize player data between stores to ensure consistent positions
    setTimeout(() => this.syncPlayerDataBetweenStores(), 50);

    console.log('[DICE] Finished processing dice_rolled event');
  };

  handleDiceRolling = (isRolling) => {
    // We don't need this action anymore as updateDiceRoll handles the state
    // But we can add a game message for dice rolling
    if (isRolling) {
      store.dispatch(addGameMessage({
        type: 'DICE',
        content: 'Rolling dice...',
        timestamp: Date.now()
      }));
    }
  };

  handleCardRemaining = (cardsRemaining) => {
    store.dispatch(updateCardsRemaining(cardsRemaining));
  };

  handleCardDrawn = (card) => {
    const { dispatch } = store;
    // Use the main gameSlice's addGameMessage to show card information
    dispatch(addGameMessage({
      type: 'CARD',
      content: `Card drawn: ${card.name || 'Unknown'} - ${card.description || 'No description'}`,
      data: card,
      timestamp: Date.now()
    }));
  };

  handleCardPlayed = (cardId) => {
    // Add a game message for card played
    store.dispatch(addGameMessage({
      type: 'CARD_PLAYED',
      content: `Card ${cardId} was played`,
      timestamp: Date.now()
    }));
  };

  // Handle game started message from server
  handleGameStarted = (data) => {
    console.log('[GAME_STARTED] Received game_started message:', data);
    const { dispatch } = store;

    // Check if we've already processed this game start message
    if (window._gameStartProcessed) {
      console.log('[GAME_STARTED] Game start already processed, skipping duplicate handling');
      return;
    }

    // Set flag to prevent duplicate processing
    window._gameStartProcessed = true;

    // Set the transition flags to preserve connection during navigation
    this.isTransitioningToGame = true;
    this.isNavigating = true;
    this.preserveConnection = true;

    console.log('[GAME_STARTED] Set transition flags: isTransitioningToGame=true, isNavigating=true, preserveConnection=true');

    // Update game state in the main gameSlice - set both gameStarted and gamePhase
    dispatch(setGameStarted(true));
    dispatch(setGamePhase('playing')); // Explicitly set to 'playing' to trigger navigation

    // Store the game start timestamp for turn validation
    const startTimestamp = Date.now();
    dispatch({ type: 'game/setGameStartedTimestamp', payload: startTimestamp });

    // Sync the game status to PLAYING to ensure navigation
    dispatch(syncGameStatus('PLAYING'));

    // Get the current host ID from the store
    const currentState = store.getState();
    const hostId = currentState.game.hostId;

    // Add a game message to indicate the game has started
    dispatch(addGameMessage({
      type: 'SYSTEM',
      content: 'Game has started! Navigating to game board...',
      timestamp: startTimestamp
    }));

    console.log('[GAME_STARTED] Updated gameSlice state to playing phase');

    // Store connection info in localStorage for reconnection
    try {
      // Get current player data to preserve token information
      const currentState = store.getState();
      const playerData = currentState.players.players[this.playerId];

      localStorage.setItem('kekopoly_socket_preserve', 'true');
      localStorage.setItem('kekopoly_socket_gameId', this.gameId);
      localStorage.setItem('kekopoly_socket_playerId', this.playerId);
      localStorage.setItem('kekopoly_socket_timestamp', Date.now().toString());

      // Store player token data to ensure it's preserved during navigation
      if (playerData) {
        const playerTokenData = {
          playerId: this.playerId,
          token: playerData.token || '',
          emoji: playerData.emoji || '👤',
          color: playerData.color || 'gray.500',
          name: playerData.name || `Player_${this.playerId.substring(0, 4)}`
        };

        // Store in localStorage
        localStorage.setItem('kekopoly_player_token_data', JSON.stringify(playerTokenData));
        console.log('[GAME_STARTED] Stored player token data in localStorage:', playerTokenData);

        // Also send an explicit update to the server to ensure token is set
        // Send multiple times with different formats to ensure the server receives it

        // Format 1: Using update_player_info with characterToken field
        this.sendMessage('update_player_info', {
          playerId: this.playerId,
          characterToken: playerData.token || playerData.emoji || '👤',
          token: playerData.token || '',
          emoji: playerData.emoji || '👤',
          color: playerData.color || 'gray.500',
          name: playerData.name || `Player_${this.playerId.substring(0, 4)}`
        });

        // Format 2: Using update_player with explicit token field
        this.sendMessage('update_player', {
          playerId: this.playerId,
          token: playerData.token || playerData.emoji || '👤',
          characterToken: playerData.token || playerData.emoji || '👤'
        });

        // Format 3: Using set_player_token with direct token field
        this.sendMessage('set_player_token', {
          playerId: this.playerId,
          token: playerData.token || playerData.emoji || '👤'
        });

        console.log('[GAME_STARTED] Sent explicit token updates to server using multiple formats');

        // Also update the player in Redux to ensure token is set
        dispatch(updatePlayer({
          playerId: this.playerId,
          updates: {
            token: playerData.token || '',
            emoji: playerData.emoji || '👤',
            color: playerData.color || 'gray.500',
            characterToken: playerData.token || playerData.emoji || '👤'
          }
        }));
      }

      console.log('[GAME_STARTED] Stored connection info in localStorage for reconnection');
    } catch (e) {
      console.warn('[GAME_STARTED] Could not store socket preservation info in localStorage:', e);
    }

    // Set up retry mechanism to ensure game board appears
    this.setupGameStartRetryCheck();

    // Reset the confirmedFirstTurn flag
    this.confirmedFirstTurn = false;

    // CRITICAL: Check if the server provided a currentTurn in the game_started message
    if (data.currentTurn) {
      console.log(`[TURN_MANAGEMENT] Server specified current turn: ${data.currentTurn}`);

      // Force update the current player in Redux with the server's value
      dispatch(setCurrentPlayer(data.currentTurn));

      // Mark that we've confirmed the first turn from the server
      this.confirmedFirstTurn = true;

      // Show a notification about whose turn it is
      const isMyTurn = data.currentTurn === this.localPlayerId;

      // Find player name if possible
      let playerName = "another player";
      const players = currentState.game.players || [];
      const currentPlayer = players.find(p => p.id === data.currentTurn);
      if (currentPlayer && currentPlayer.name) {
        playerName = currentPlayer.name;
      }

      // Add a game message about the turn
      dispatch(addGameMessage({
        type: 'TURN',
        content: isMyTurn ?
          "It's your turn to start the game!" :
          `It's ${playerName}'s turn to start the game`,
        timestamp: startTimestamp
      }));

      // Show a toast notification about whose turn it is
      try {
        const { toast } = require('@chakra-ui/react');
        if (toast) {
          toast({
            title: isMyTurn ? "Your Turn!" : "Game Started",
            description: isMyTurn ?
              "It's your turn to roll the dice!" :
              `It's ${playerName}'s turn to roll the dice.`,
            status: isMyTurn ? "success" : "info",
            duration: 5000,
            isClosable: true,
            position: "top"
          });
        }
      } catch (e) {
        console.log('[GAME_STARTED] Could not show toast notification:', e);
      }

      console.log(`[TURN_MANAGEMENT] Current turn set to ${data.currentTurn}, is it my turn? ${isMyTurn}`);

      // Request current turn from server again after a short delay to double-check
      setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.sendMessage('get_current_turn', {});
        }
      }, 500);
    }
    // If server didn't provide currentTurn, use the host as the first player
    else if (hostId) {
      console.log(`[TURN_MANAGEMENT] Setting initial turn to host player: ${hostId}`);
      dispatch(setCurrentPlayer(hostId));

      // Send a message to the server to set the initial turn
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage('set_current_turn', {
          playerId: hostId,
          gameId: this.gameId
        });

        // Also explicitly request the current turn from the server
        this.sendMessage('get_current_turn', {});
      }

      // Add a game message about the turn
      const isMyTurn = hostId === this.localPlayerId;
      dispatch(addGameMessage({
        type: 'TURN',
        content: isMyTurn ?
          "It's your turn to start the game!" :
          `It's the host's turn to start the game`,
        timestamp: startTimestamp
      }));

      // Request current turn from server again after a short delay to double-check
      setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.sendMessage('get_current_turn', {});
        }
      }, 500);
    } else {
      console.warn('[TURN_MANAGEMENT] No host ID or currentTurn found when starting game, cannot set initial turn');

      // Request current turn from server to try to get the correct turn
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage('get_current_turn', {});
        this.sendMessage('get_game_state', { full: true });
      }
    }

    // Log the current game state after update
    setTimeout(() => {
      const updatedState = store.getState().game;
      console.log('[GAME_STARTED] Game state after update:', {
        gameStarted: updatedState.gameStarted,
        gamePhase: updatedState.gamePhase,
        hostId: updatedState.hostId,
        currentPlayer: updatedState.currentPlayer,
        localPlayerId: this.localPlayerId,
        isMyTurn: this.isLocalPlayerTurn(),
        timestamp: new Date().toISOString()
      });
    }, 100);

    // Store in localStorage as a backup mechanism
    try {
      localStorage.setItem('kekopoly_game_started', 'true');
      localStorage.setItem('kekopoly_game_id', this.gameId);
      localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
      localStorage.setItem('kekopoly_game_phase', 'playing');
    } catch (e) {
      console.warn('[GAME_STARTED] Could not use localStorage:', e);
    }

    // Broadcast to all clients that the game has started
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('[GAME_STARTED] Broadcasting game started to all clients');
      this.sendMessage('broadcast_game_started', {
        gameId: this.gameId,
        timestamp: Date.now()
      });
    }

    // Request updated game state and player list
    setTimeout(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log('[GAME_STARTED] Requesting updated game state and player list');
        this.sendMessage('get_game_state', { full: true });
        this.sendMessage('get_active_players', {});

        // Also explicitly request the current turn information
        this.sendMessage('get_current_turn', {});
      }
    }, 500);

    // Define a navigation function that preserves the WebSocket connection
    const navigateToGameBoard = () => {
      const currentLocation = window.location.pathname;
      if (!currentLocation.includes('/game/')) {
        console.log('[GAME_STARTED] Navigating to game board with connection preservation');

        // Set the transition flags again to ensure they're set
        this.isTransitioningToGame = true;
        this.isNavigating = true;
        this.preserveConnection = true;

        // Try to use the navigateToGame function if available
        if (window.navigateToGame && typeof window.navigateToGame === 'function') {
          console.log('[GAME_STARTED] Using navigateToGame function');
          window.navigateToGame(this.gameId);
        } else {
          // Fallback to direct location change
          try {
            console.log('[GAME_STARTED] Using direct location change');
            window.location.href = `/game/${this.gameId}`;
          } catch (e) {
            console.warn('[GAME_STARTED] Navigation failed:', e);
          }
        }
        return true;
      }
      return false;
    };

    // Force navigation to game board after a short delay
    setTimeout(() => {
      navigateToGameBoard();
    }, 300);

    // Set up a second navigation attempt as a backup
    setTimeout(() => {
      const currentLocation = window.location.pathname;
      if (!currentLocation.includes('/game/')) {
        console.log('[GAME_STARTED] Second attempt at forcing navigation to game board');

        // Try one more time with direct location change
        try {
          // Set the transition flags again to ensure they're set
          this.isTransitioningToGame = true;
          this.isNavigating = true;
          this.preserveConnection = true;

          window.location.href = `/game/${this.gameId}`;
        } catch (e) {
          console.warn('[GAME_STARTED] Second navigation attempt failed:', e);
        }
      }
    }, 1000);
  };

  // Methods to send events to server (adapted for WebSocket)
  sendMessage(type, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: WebSocket is not connected');

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
        console.log('[SOCKET] Message queued for later sending:', type);
      }

      return;
    }

    const message = JSON.stringify({
      type,
      ...payload,
      gameId: this.gameId,
      playerId: this.playerId
    });

    this.socket.send(message);

    // Save important messages to state for potential reconnection
    if (['player_joined', 'update_player', 'set_player_token', 'update_player_info'].includes(type)) {
      this.saveState('lastPlayerUpdate', { type, payload, timestamp: Date.now() });
    }
  }

  // Method to send any queued messages after reconnection
  sendQueuedMessages() {
    const messageQueue = this.loadState('messageQueue', []);
    if (messageQueue.length > 0) {
      console.log(`[SOCKET] Sending ${messageQueue.length} queued messages after reconnection`);

      // Process messages in order
      messageQueue.forEach(message => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          console.log(`[SOCKET] Sending queued message: ${message.type}`);
          this.sendMessage(message.type, message.payload);
        }
      });

      // Clear the queue after processing
      this.saveState('messageQueue', []);
    }
  }

  // Synchronize game state in the Redux store to ensure consistent state
  syncGameStateAcrossSlices(status = 'ACTIVE') {
    console.log('[SYNC_SLICES] Starting synchronization of game state across slices with status:', status);
    console.log(`[SYNC_SLICES] Connection state: isNavigating=${this.isNavigating}, preserveConnection=${this.preserveConnection}, isTransitioningToGame=${this.isTransitioningToGame}`);

    // Set the navigation flags to preserve connection during game start
    this.isNavigating = true;
    this.preserveConnection = true;
    this.isTransitioningToGame = true;

    // Save state for reconnection
    this.saveState('isNavigating', true);
    this.saveState('preserveConnection', true);
    this.saveState('isTransitioningToGame', true);
    this.saveState('navigationTimestamp', Date.now());

    console.log('[SYNC_SLICES] Set connection preservation flags for game start');

    // Store connection info in localStorage for reconnection
    try {
      localStorage.setItem('kekopoly_socket_preserve', 'true');
      localStorage.setItem('kekopoly_socket_gameId', this.gameId);
      localStorage.setItem('kekopoly_socket_playerId', this.playerId);
      localStorage.setItem('kekopoly_socket_timestamp', Date.now().toString());
      console.log('[SYNC_SLICES] Stored connection info in localStorage for reconnection');
    } catch (e) {
      console.warn('[SYNC_SLICES] Could not store socket preservation info in localStorage:', e);
    }

    }

  // Synchronize player data between playerSlice and gameSlice
  syncPlayerData() {
      const { dispatch } = store;
      const currentState = store.getState();
      const { players: playerSlicePlayers } = currentState.players;
      const { players: gameSlicePlayers } = currentState.game;

      console.log('[SYNC_PLAYERS] Synchronizing player data between stores');
      console.log('[SYNC_PLAYERS] playerSlice players:', playerSlicePlayers);
      console.log('[SYNC_PLAYERS] gameSlice players:', gameSlicePlayers);

      // Convert playerSlice players (object) to array format for gameSlice
      if (Object.keys(playerSlicePlayers).length > 0) {
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
        dispatch(setPlayers(playersArray));
        console.log('[SYNC_PLAYERS] Updated gameSlice with players from playerSlice');

        // Save player data for reconnection
        if (this.playerId && playerSlicePlayers[this.playerId]) {
          this.saveState('playerDataBeforeNavigation', playerSlicePlayers[this.playerId]);
        }
      }

      // Also check if we need to sync from gameSlice to playerSlice
      if (gameSlicePlayers && gameSlicePlayers.length > 0 && Object.keys(playerSlicePlayers).length === 0) {
        console.log('[SYNC_PLAYERS] Synchronizing from gameSlice to playerSlice');

        gameSlicePlayers.forEach(player => {
          if (player && player.id) {
            dispatch(addPlayer({
              playerId: player.id,
              playerData: player
            }));
          }
        });

        console.log('[SYNC_PLAYERS] Updated playerSlice with players from gameSlice');
      }
    }

  // Method to handle game transitions
  handleGameTransition() {
    // Check if we're in the middle of a game transition
    if (this.loadState('isTransitioningToGame', false)) {
      console.log('[TRANSITION] Handling game transition');

      // Get saved state
      const navigationTimestamp = this.loadState('navigationTimestamp', 0);
      const playerData = this.loadState('playerDataBeforeNavigation', null);

      // Check if this is a recent transition (within last 30 seconds)
      const isRecentTransition = Date.now() - navigationTimestamp < 30000;

      if (isRecentTransition && playerData) {
        console.log('[TRANSITION] Recent game transition detected, restoring player data');

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

  syncGameStateAcrossSlices(status = 'ACTIVE') {
    const { dispatch } = store;

    // Update the main gameSlice only
    dispatch(setGameStarted(true));

    // Only set the game phase to 'playing' when explicitly transitioning to the game board
    if (status === 'PLAYING') {
      dispatch(setGamePhase('playing'));
    }

    console.log('[SYNC_SLICES] Dispatching syncGameStatus with status:', status);
    dispatch(syncGameStatus(status));

    // Also dispatch the fulfilled action for startGameAsync to ensure all reducers are updated
    dispatch({
      type: 'game/startGameAsync/fulfilled',
      payload: true,
      meta: { requestId: 'game_started', arg: undefined }
    });

    // Synchronize player data between stores
    this.syncPlayerData();

    // Log the state after synchronization
    const currentState = store.getState();
    console.log('[SYNC_SLICES] Game state after synchronization:', {
      gameStarted: currentState.game.gameStarted,
      gamePhase: currentState.game.gamePhase,
      gamePlayers: currentState.game.players.length,
      lobbyPlayers: Object.keys(currentState.players.players || {}).length,
      timestamp: new Date().toISOString()
    });

    // Log detailed player data for debugging
    console.log('[SYNC_SLICES] Detailed player data after synchronization:');
    console.log('[SYNC_SLICES] gameSlice players:', currentState.game.players);
    console.log('[SYNC_SLICES] playerSlice players:', currentState.players.players);

    // Store in localStorage as a backup mechanism
    try {
      localStorage.setItem('kekopoly_game_started', 'true');
      localStorage.setItem('kekopoly_game_id', this.gameId);
      localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
      localStorage.setItem('kekopoly_game_status', status);
    } catch (e) {
      console.warn('[SYNC_SLICES] Could not use localStorage:', e);
    }

    return true;
  }

  joinGame = (gameId, playerInfo, token) => {
    this.gameId = gameId;
    this.playerId = playerInfo.playerId;
    this.token = token;
    this.connect();
  };

  createGame = (gameConfig) => {
    this.sendMessage('game:create', { config: gameConfig });
  };

  startGame = () => {
    console.log('[START_GAME] Starting game process');
    const { dispatch } = store;

    // Get the current state to check host status
    const currentState = store.getState();
    const hostId = currentState.game.hostId;

    // Verify this player is actually the host
    if (this.playerId !== hostId) {
      console.warn(`[START_GAME] Player ${this.playerId} attempted to start game but is not the host (${hostId})`);
      return;
    }

    console.log(`[START_GAME] Host player ${this.playerId} initiating game start`);

    // Update local state immediately to improve perceived performance
    dispatch(setGameStarted(true));
    dispatch(setGamePhase('playing'));

    // Dispatch startGameAsync action to update Redux state
    dispatch({
      type: 'game/startGameAsync/fulfilled',
      payload: true,
      meta: { requestId: 'game_start_request', arg: undefined }
    });

    // Synchronize game state - use 'PLAYING' status to ensure navigation
    this.syncGameStateAcrossSlices('PLAYING');

    // Store in localStorage immediately
    try {
      localStorage.setItem('kekopoly_game_started', 'true');
      localStorage.setItem('kekopoly_game_id', this.gameId);
      localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
      localStorage.setItem('kekopoly_game_phase', 'playing');
    } catch (e) {
      console.warn('[START_GAME] Could not use localStorage:', e);
    }

    // Define navigation function
    const navigateToGameBoard = () => {
      const currentLocation = window.location.pathname;
      if (!currentLocation.includes('/game/')) {
        console.log('[START_GAME] Navigating to game board');
        window.location.href = `/game/${this.gameId}`;
        return true;
      }
      return false;
    };

    // First verify host status with server
    this.sendMessage('verify_host', {
      playerId: this.playerId,
      gameId: this.gameId
    });

    // Send a single game:start message
    console.log('[START_GAME] Sending game:start message to server');
    this.sendMessage('game:start', {
      gameId: this.gameId,
      hostId: this.playerId,
      timestamp: Date.now(),
      initialTurn: this.playerId
    });

    // Try to navigate immediately
    navigateToGameBoard();

    // Set up a single retry check with a short delay
    setTimeout(() => {
      // Check if we need to retry navigation
      if (!window.location.pathname.includes('/game/')) {
        console.log('[START_GAME] Retry navigation to game board');
        navigateToGameBoard();
      }

      // Request game state to ensure we have the latest data
      this.sendMessage('get_game_state', { full: true });
      this.sendMessage('get_current_turn', {});
    }, 500);
  };

  // Get the current turn from the server and then roll dice if it's our turn
  rollDice = () => {
    console.log('[DICE] Preparing to roll dice...');
    const { dispatch } = store;

    // OPTIMIZATION: Set isRolling to true immediately to update UI
    dispatch(setIsRolling(true));

    // Create a custom event for dice roll errors
    const createDiceRollErrorEvent = (message) => {
      const errorEvent = new CustomEvent('dice-roll-error', {
        detail: { message }
      });
      window.dispatchEvent(errorEvent);
    };

    // Check if socket is connected
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('[DICE] Cannot roll dice: WebSocket not connected');
      createDiceRollErrorEvent("Not connected to game server");
      dispatch(setIsRolling(false));
      return;
    }

    // Get the current state from Redux
    const currentState = store.getState();
    const currentPlayerId = currentState.game.currentPlayer;
    const isMyTurn = currentPlayerId === this.localPlayerId;

    console.log(`[DICE] Current turn check from Redux: currentPlayer=${currentPlayerId}, localPlayer=${this.localPlayerId}, isMyTurn=${isMyTurn}`);

    // OPTIMIZATION: If it's clearly our turn, send the roll request immediately
    if (isMyTurn && this.confirmedFirstTurn) {
      console.log('[DICE] Local state confirms it is our turn, sending roll_dice request immediately');
      this.sendMessage('roll_dice', {});

      // Set up error handler for server errors
      this.setupDiceRollErrorHandler();

      // Create a success event for tracking
      const successEvent = new CustomEvent('dice-roll-request-sent', {
        detail: { timestamp: Date.now() }
      });
      window.dispatchEvent(successEvent);

      return;
    }

    // OPTIMIZATION: Simplified server validation with a single attempt
    const validateTurnAndRoll = () => {
      // Set up a one-time handler to process the server response
      const handleServerResponse = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Check if this is a turn-related response
          if ((data.type === 'game_state' && data.currentTurn) ||
              (data.type === 'game_turn') ||
              (data.type === 'current_turn')) {

            // Extract the current turn from the response
            const serverCurrentTurn = data.currentTurn || data.currentPlayer;
            console.log('[DICE] Server reports current turn is:', serverCurrentTurn);

            // Update our local state to match the server
            if (serverCurrentTurn) {
              dispatch(setCurrentPlayer(serverCurrentTurn));

              // Check if it's our turn
              const isMyTurn = this.localPlayerId === serverCurrentTurn;

              if (isMyTurn) {
                // It's our turn, send the roll dice message
                console.log('[DICE] Server confirms it is our turn, sending roll_dice request');
                this.sendMessage('roll_dice', {});

                // Set up error handler for server errors
                this.setupDiceRollErrorHandler();
              } else {
                // It's not our turn
                console.error(`[DICE] Server confirms it's not our turn. Current turn: ${serverCurrentTurn}`);

                // Get player name for better error message
                const players = currentState.game.players || [];
                const currentPlayer = players.find(p => p.id === serverCurrentTurn);
                const playerName = currentPlayer ? currentPlayer.name : `Player ${serverCurrentTurn}`;

                // Create a more informative error message
                createDiceRollErrorEvent(`It's not your turn. It's ${playerName}'s turn to roll the dice.`);

                // Reset rolling state
                dispatch(setIsRolling(false));
              }
            }

            // Remove the event listener
            this.socket.removeEventListener('message', handleServerResponse);
          }
        } catch (e) {
          console.error('[DICE] Error processing server response:', e);
          dispatch(setIsRolling(false));
        }
      };

      // Add the event listener
      this.socket.addEventListener('message', handleServerResponse);

      // Request the current turn from the server
      console.log('[DICE] Requesting current turn from server...');
      this.sendMessage('get_current_turn', {});

      // Set a timeout to clean up if we don't get a response
      setTimeout(() => {
        this.socket.removeEventListener('message', handleServerResponse);

        // If we're still in rolling state, try to roll anyway
        if (store.getState().game.isRolling) {
          console.log('[DICE] No server response received, proceeding with roll based on local state');

          // Use the local state to determine if it's our turn
          const latestState = store.getState();
          const latestCurrentPlayer = latestState.game.currentPlayer;
          const isStillMyTurn = this.localPlayerId === latestCurrentPlayer;

          if (isStillMyTurn) {
            // Send the roll dice message
            this.sendMessage('roll_dice', {});
            this.setupDiceRollErrorHandler();
          } else {
            // Reset rolling state
            dispatch(setIsRolling(false));

            // Show error
            createDiceRollErrorEvent("Could not confirm whose turn it is. Please try again.");
          }
        }
      }, 500); // Reduced timeout from 1000ms to 500ms
    };

    // Start the validation process
    validateTurnAndRoll();
  };

  // Set up error handler for dice roll errors
  setupDiceRollErrorHandler = () => {
    // Create a custom event for dice roll errors
    const createDiceRollErrorEvent = (message) => {
      const errorEvent = new CustomEvent('dice-roll-error', {
        detail: { message }
      });
      window.dispatchEvent(errorEvent);
    };

    // Set up error handler for server errors
    const handleErrorMessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle error messages from the server
        if (data.type === 'error') {
          console.error('[DICE] Server error message received:', data);

          if (data.message && data.message.includes('not player\'s turn')) {
            console.error('[DICE] Server rejected dice roll: not player\'s turn');

            // Get the current state to find out whose turn it actually is
            const state = store.getState();
            const currentPlayerId = state.game.currentPlayer;
            const players = state.game.players || [];
            const currentPlayer = players.find(p => p.id === currentPlayerId);
            const playerName = currentPlayer ? currentPlayer.name : `Player ${currentPlayerId}`;

            // Create a more informative error message
            createDiceRollErrorEvent(`It's not your turn. It's ${playerName}'s turn.`);

            // Update the current player in Redux to match the server
            if (currentPlayerId) {
              store.dispatch(setCurrentPlayer(currentPlayerId));
            }

            // Request updated game state to resync
            this.sendMessage('get_game_state', { full: true });
            this.sendMessage('get_current_turn', {});
          } else {
            // Handle other types of errors
            createDiceRollErrorEvent(data.message || "The server couldn't process your dice roll. Try again.");
          }

          // Remove this handler after processing the error
          this.socket.removeEventListener('message', handleErrorMessage);
        }
      } catch (e) {
        // Ignore parsing errors
        console.warn('[DICE] Error parsing message in error handler:', e);
      }
    };

    // Add temporary error handler
    if (this.socket) {
      this.socket.addEventListener('message', handleErrorMessage);

      // Remove the handler after a short timeout
      setTimeout(() => {
        if (this.socket) {
          this.socket.removeEventListener('message', handleErrorMessage);
        }
      }, 3000);
    }
  };

  endTurn = () => {
    this.sendMessage('end_turn', {});
  };

  purchaseProperty = (propertyId) => {
    this.sendMessage('buy_property', { propertyId });
  };

  buildEngagement = (propertyId) => {
    this.sendMessage('build_engagement', { propertyId });
  };

  buildCheckmark = (propertyId) => {
    this.sendMessage('build_checkmark', { propertyId });
  };

  mortgageProperty = (propertyId) => {
    this.sendMessage('mortgage_property', { propertyId });
  };

  drawCard = (cardType) => {
    this.sendMessage('draw_card', { cardType });
  };

  playCard = (cardId, targetPlayerId = null, targetPropertyId = null) => {
    this.sendMessage('use_card', {
      cardId,
      targetPlayerId,
      targetPropertyId
    });
  };

  // Explicitly update player token on the server
  updatePlayerTokenOnServer = () => {
    console.log('[TOKEN_UPDATE] Attempting to update player token on server');

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('[TOKEN_UPDATE] Cannot update token: WebSocket not connected');
      return false;
    }

    if (!this.playerId) {
      console.warn('[TOKEN_UPDATE] Cannot update token: No player ID available');
      return false;
    }

    // Get current player data from Redux
    const currentState = store.getState();
    const playerData = currentState.players.players[this.playerId];

    if (!playerData) {
      console.warn('[TOKEN_UPDATE] Cannot update token: No player data found in Redux');
      return false;
    }

    // Create token update payload
    const tokenUpdatePayload = {
      playerId: this.playerId,
      characterToken: playerData.token || playerData.emoji || '👤',
      token: playerData.token || '',
      emoji: playerData.emoji || '👤',
      color: playerData.color || 'gray.500',
      name: playerData.name || `Player_${this.playerId.substring(0, 4)}`
    };

    console.log('[TOKEN_UPDATE] Sending token update to server:', tokenUpdatePayload);

    // Send the update to the server
    this.sendMessage('update_player_info', tokenUpdatePayload);

    // Also store in localStorage for reconnection
    try {
      localStorage.setItem('kekopoly_player_token_data', JSON.stringify({
        token: playerData.token || '',
        emoji: playerData.emoji || '👤',
        color: playerData.color || 'gray.500',
        name: playerData.name || `Player_${this.playerId.substring(0, 4)}`
      }));
      console.log('[TOKEN_UPDATE] Stored token data in localStorage');
    } catch (e) {
      console.warn('[TOKEN_UPDATE] Could not store token data in localStorage:', e);
    }

    return true;
  };

  handlePlayerReady = (playerId, isReady) => {
    const { dispatch } = store;
    log('PLAYER_READY', `Player ${playerId} ready status changed to: ${isReady}`);

    // Use setPlayerReady instead of updatePlayer
    dispatch(setPlayerReady({
      playerId,
      isReady
    }));

    // Request active players to ensure everyone is in sync
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      setTimeout(() => {
        this.sendMessage('get_active_players');
      }, 100);
    }

    // Make sure we don't automatically start the game when all players are ready
    // Only the host should be able to start the game by clicking the Start Game button
    console.log('[PLAYER_READY] Player ready status updated, but game will only start when host clicks Start Game');
  };

  // Handle host changed messages from the server
  handleHostChanged = (hostId, gameId) => {
    if (!hostId) {
      console.warn('[HOST_CHANGED] Received host_changed message without hostId');
      return;
    }

    console.log(`[HOST_CHANGED] Host changed to ${hostId} for game ${gameId || this.gameId}`);
    const { dispatch } = store;

    // Normalize gameId to ensure consistency
    const normalizedGameId = (gameId || this.gameId).toLowerCase().trim();

    // Log Redux state before update
    console.log('[HOST_CHANGED] Redux state before host change:', {
      hostId: store.getState().game.hostId,
      players: Object.keys(store.getState().players.players || {})
    });

    // Update the host ID in the game state
    dispatch(setHost(hostId));

    // Update all players' host status based on the new hostId
    // Pass true to skipBroadcast to avoid infinite loops
    this.updatePlayersHostStatus(hostId, true);

    // Log Redux state after hostId update
    console.log('[HOST_CHANGED] Redux state after host change:', {
      hostId: store.getState().game.hostId,
      players: Object.keys(store.getState().players.players || {})
    });

    // Get current player list from the store
    const currentState = store.getState();
    const existingPlayers = currentState.players.players || {};

    console.log('[HOST_CHANGED] Existing players before host update:', existingPlayers);

    // Update isHost flag for all players in a single batch
    const playerUpdates = [];

    Object.keys(existingPlayers).forEach(playerId => {
      const isPlayerHost = playerId === hostId;
      const player = existingPlayers[playerId];

      // Only update if the host status actually changed
      if (player.isHost !== isPlayerHost) {
        console.log(`[HOST_CHANGED] Player ${playerId} - Updating isHost: ${player.isHost} → ${isPlayerHost}`);

        // Create updated player data
        const updatedPlayer = {
          ...player,
          isHost: isPlayerHost
        };

        // Add to batch updates
        playerUpdates.push({
          playerId,
          playerData: updatedPlayer
        });
      }
    });

    // Apply all updates at once
    if (playerUpdates.length > 0) {
      console.log(`[HOST_CHANGED] Applying host status updates to ${playerUpdates.length} players`);
      playerUpdates.forEach(update => {
        dispatch(addPlayer(update));
      });
    } else {
      console.log('[HOST_CHANGED] No player host status changes needed');
    }

    // Check if current player is the host and update local state
    const wasHost = this.isHost;
    this.isHost = (this.playerId === hostId);

    if (wasHost !== this.isHost) {
      console.log(`[HOST_CHANGED] Current player ${this.playerId} host status changed: ${wasHost} → ${this.isHost}`);
    }

    // Acknowledge the host change to the server, but only if we're not already in a broadcast loop
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('[HOST_CHANGED] Acknowledging host change to server');
      this.sendMessage('host_change_ack', {
        hostId: hostId,
        gameId: normalizedGameId,
        receivedBy: this.playerId,
        timestamp: Date.now()
      });

      // Request updated player list to ensure all clients are in sync
      setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          console.log('[HOST_CHANGED] Requesting updated player list');
          this.sendMessage('get_active_players', {});
        }
      }, 200);
    }
  };
  // Optimized retry mechanism to ensure game board appears for all players
  setupGameStartRetryCheck = () => {
    const gameState = store.getState().game;
    const currentLocation = window.location.pathname;
    const isAlreadyOnGameBoard = currentLocation.includes('/game/');

    // If we're already on the game board, no need to do anything
    if (isAlreadyOnGameBoard) {
      console.log(`[GAME_START_RETRY] Already on game board, skipping retry mechanism`);
      return;
    }

    console.log(`[GAME_START_RETRY] Setting up optimized retry mechanism for player ${this.playerId}`);

    // Check for localStorage backup data
    let storedGameId = null;
    try {
      storedGameId = localStorage.getItem('kekopoly_game_id');

      // Update localStorage with fresh timestamp to ensure it's recent
      localStorage.setItem('kekopoly_game_started', 'true');
      localStorage.setItem('kekopoly_game_id', this.gameId || storedGameId);
      localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
      localStorage.setItem('kekopoly_game_phase', 'playing');
    } catch (e) {
      console.warn('[GAME_START_RETRY] Could not read/write localStorage:', e);
    }

    // Initialize retry counter with fewer attempts
    this.gameStartRetryCount = 0;
    this.maxGameStartRetries = 5; // Reduced for better performance

    // Clear any existing retry timer
    if (this.gameStartRetryTimer) {
      clearTimeout(this.gameStartRetryTimer);
    }

    // Use the synchronization function to ensure consistent state across slices
    this.syncGameStateAcrossSlices('ACTIVE');

    // Store the gameId for navigation
    const gameId = this.gameId || storedGameId;

    // OPTIMIZATION: Define navigation function
    const navigateToGameBoard = () => {
      if (!window.location.pathname.includes('/game/')) {
        console.log('[GAME_START_RETRY] Navigating to game board');
        window.location.href = `/game/${gameId}`;
        return true;
      }
      return false;
    };

    // OPTIMIZATION: Try to navigate immediately
    const navigatedImmediately = navigateToGameBoard();

    if (navigatedImmediately) {
      console.log('[GAME_START_RETRY] Immediate navigation successful, skipping retry checks');
      return;
    }

    // Set up a single retry check with a short delay
    this.gameStartRetryTimer = setTimeout(() => {
      console.log(`[GAME_START_RETRY] Executing retry check for player ${this.playerId}`);

      // If we're still not on the game board, force navigation
      if (!window.location.pathname.includes('/game/')) {
        console.log('[GAME_START_RETRY] Still not on game board, forcing navigation');
        navigateToGameBoard();
      }
    }, 300);

    // Request game state from server to ensure we have the latest data
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendMessage('get_game_state', { full: true });
      this.sendMessage('get_current_turn', {});
    }
  };

  // Simplified check if game board is visible and navigate if needed
  checkGameBoardVisibility = (gameId, hasStorageFlag) => {
    // Get current location
    const currentLocation = window.location.pathname;

    // Check if we're already on the game board
    const isOnGameBoard = currentLocation.includes('/game/');

    if (isOnGameBoard) {
      console.log('[GAME_START_RETRY] Already on game board, no navigation needed');
      return;
    }

    // If we're not on the game board, navigate directly
    console.log(`[GAME_START_RETRY] Game board not visible, navigating directly`);

    // Force the game state to be in playing mode
    store.dispatch(setGameStarted(true));
    store.dispatch(setGamePhase('playing'));
    store.dispatch(syncGameStatus('PLAYING'));

    // Update localStorage
    try {
      localStorage.setItem('kekopoly_game_started', 'true');
      localStorage.setItem('kekopoly_game_id', gameId || this.gameId);
      localStorage.setItem('kekopoly_navigation_timestamp', Date.now().toString());
      localStorage.setItem('kekopoly_game_phase', 'playing');
    } catch (e) {
      console.warn('[GAME_START_RETRY] Could not use localStorage:', e);
    }

    // Set the navigation flags to preserve connection
    this.isNavigating = true;
    this.preserveConnection = true;
    this.isTransitioningToGame = true;

    // Store connection info in localStorage for reconnection
    try {
      localStorage.setItem('kekopoly_socket_preserve', 'true');
      localStorage.setItem('kekopoly_socket_gameId', gameId || this.gameId);
      localStorage.setItem('kekopoly_socket_playerId', this.playerId);
      localStorage.setItem('kekopoly_socket_timestamp', Date.now().toString());
      console.log('[GAME_START_RETRY] Stored connection info in localStorage for reconnection');
    } catch (e) {
      console.warn('[GAME_START_RETRY] Could not store socket preservation info in localStorage:', e);
    }

    // Navigate directly to the game board
    try {
      const navTarget = `/game/${gameId || this.gameId}`;
      console.log(`[GAME_START_RETRY] Navigating to ${navTarget}`);
      window.location.href = navTarget;
    } catch (e) {
      console.warn('[GAME_START_RETRY] Navigation failed:', e);
    }

    // Request updated game state from server
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendMessage('get_game_state', { full: true });
      this.sendMessage('get_current_turn', {});
    }
  };

  // Periodically check if another player has started the game
  startGameStatePolling = () => {
    console.log('[GAME_STATE_POLLING] Starting periodic game state check');

    // Clear any existing polling timer
    if (this.gameStatePollingTimer) {
      clearInterval(this.gameStatePollingTimer);
    }

    // Define polling function to avoid duplicate code
    const checkGameState = () => {
      console.log('[GAME_STATE_POLLING] Checking if game has been started by another player');

      // Get the current game state from Redux
      const state = store.getState();
      const gameState = state.game;
      const slicesGameState = state.slices?.game || {};

      // Check if game has started via multiple indicators
      const gameStarted = (
        gameState.gameStarted ||
        gameState.gamePhase === 'playing' ||
        gameState.status === 'ACTIVE' ||
        slicesGameState.status === 'ACTIVE'
      );

      // Also check localStorage as a fallback mechanism
      let storedGameStarted = false;
      let storedGameId = null;
      try {
        storedGameStarted = localStorage.getItem('kekopoly_game_started') === 'true';
        storedGameId = localStorage.getItem('kekopoly_game_id');
        const timestamp = localStorage.getItem('kekopoly_navigation_timestamp');
        const isRecent = timestamp && (Date.now() - parseInt(timestamp, 10) < 60000); // within last minute

        if (storedGameStarted && isRecent) {
          console.log('[GAME_STATE_POLLING] Found recent game started flag in localStorage');

          // If we have a stored game ID that matches current game, treat as started
          if (storedGameId === this.gameId) {
            console.log('[GAME_STATE_POLLING] Stored game ID matches current game, treating as started');

            // Update Redux state
            const { setGameStarted, setGamePhase, syncGameStatus } = require('../store/gameSlice');
            const { setGameStatus } = require('../store/slices/gameSlice');

            // Set game as started in both slices
            store.dispatch(setGameStarted(true));
            store.dispatch(setGamePhase('playing'));
            store.dispatch(syncGameStatus('ACTIVE'));
            store.dispatch(setGameStatus('ACTIVE'));

            // Navigate to game board
            this.navigateToGameBoard(this.gameId);

            // Stop polling
            if (this.gameStatePollingTimer) {
              clearInterval(this.gameStatePollingTimer);
              this.gameStatePollingTimer = null;
              console.log('[GAME_STATE_POLLING] Stopping polling due to localStorage game started flag');
            }

            return true;
          }
        }
      } catch (e) {
        console.warn('[GAME_STATE_POLLING] Error accessing localStorage:', e);
      }

      // If game is started in Redux, update our internal state and navigate
      if (gameStarted) {
        console.log('[GAME_STATE_POLLING] Game already started, stopping polling');

        // Request updated game state from server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.sendMessage('get_game_state', { full: true });
        }

        // Navigate to game board
        this.navigateToGameBoard(this.gameId);

        // Stop polling
        if (this.gameStatePollingTimer) {
          clearInterval(this.gameStatePollingTimer);
          this.gameStatePollingTimer = null;
        }

        return true;
      }

      // Request updated game state from server
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage('get_game_state', {});

        // Also request active players in case host information has changed
        this.sendMessage('get_active_players', {});
      }

      return false;
    };

    // Run initial check
    const gameStarted = checkGameState();

    // If game already started, no need to set up polling
    if (!gameStarted) {
       // Set up polling at 3-second intervals
       /* --- Temporarily disable polling interval to reduce log spam ---
       this.gameStatePollingTimer = setInterval(checkGameState, 30000); // Increase interval significantly if re-enabled
       */
       console.log('[GAME_STATE_POLLING] Polling interval currently disabled.');
       // ---------
    }
  };

  // Helper method to navigate to the game board
  navigateToGameBoard = (gameId) => {
    if (!gameId) {
      console.warn('[NAVIGATION] Cannot navigate to game board: no gameId provided');
      return false;
    }

    console.log(`[NAVIGATION] Attempting to navigate to game board for game ${gameId}`);

    // Set the navigation flags to preserve connection
    this.isNavigating = true;
    this.preserveConnection = true;
    this.isTransitioningToGame = true;
    console.log('[NAVIGATION] Set connection preservation flags for navigation');

    // Store connection info in localStorage for reconnection
    try {
      localStorage.setItem('kekopoly_socket_preserve', 'true');
      localStorage.setItem('kekopoly_socket_gameId', gameId);
      localStorage.setItem('kekopoly_socket_playerId', this.playerId);
      localStorage.setItem('kekopoly_socket_timestamp', Date.now().toString());
      console.log('[NAVIGATION] Stored connection info in localStorage for reconnection');
    } catch (e) {
      console.warn('[NAVIGATION] Could not store socket preservation info in localStorage:', e);
    }

    // Try multiple approaches in sequence

    // Approach 1: Use React Router via exposed window function
    if (window.navigateToGame && typeof window.navigateToGame === 'function') {
      console.log('[NAVIGATION] Using navigateToGame window function');
      window.navigateToGame(gameId);
      return true;
    }

    // Approach 2: Use direct location change
    if (!window.location.pathname.includes(`/game/${gameId}`)) {
      try {
        console.log(`[NAVIGATION] Using direct location change to /game/${gameId}`);
        window.location.href = `/game/${gameId}`;
        return true;
      } catch (e) {
        console.warn('[NAVIGATION] Direct navigation failed:', e);
      }
    } else {
      console.log(`[NAVIGATION] Already on game board at ${window.location.pathname}`);
      return true;
    }

    return false;
  };

  // Handle synchronization errors
  handleSyncError = (errorType, error, data = null) => {
    console.error(`[SYNC_ERROR] ${errorType} error:`, error);

    // Log detailed information about the current state
    const currentState = store.getState();
    console.log('[SYNC_ERROR] Current game state:', {
      gameStarted: currentState.game.gameStarted,
      gamePhase: currentState.game.gamePhase,
      hostId: currentState.game.hostId,
      playerCount: Object.keys(currentState.players.players || {}).length,
      slicesGameStatus: currentState.slices?.game?.status || 'unknown'
    });

    // Log the data that caused the error
    if (data) {
      console.log('[SYNC_ERROR] Data that caused the error:', data);
    }

    // Attempt recovery based on error type
    this.attemptSyncRecovery(errorType);
  };

  // Attempt to recover from synchronization errors
  attemptSyncRecovery = (errorType) => {
    console.log(`[SYNC_RECOVERY] Attempting recovery from ${errorType}`);

    // Only attempt recovery if socket is open
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.log('[SYNC_RECOVERY] Cannot attempt recovery: socket not open');
      return;
    }

    // Request fresh game state
    console.log('[SYNC_RECOVERY] Requesting fresh game state');
    this.sendMessage('get_game_state', { full: true });

    // Request active players list
    console.log('[SYNC_RECOVERY] Requesting active players list');
    this.sendMessage('get_active_players', {});

    // Log recovery attempt
    console.log('[SYNC_RECOVERY] Recovery attempt completed at', new Date().toISOString());
  };

  // Handler for set_host message
  handleSetHost = (hostId, gameId) => {
    console.log(`Set host message received. Setting host to ${hostId} for game ${gameId}`);
    if (hostId) {
      const { dispatch } = store;
      dispatch(setHost(hostId));
      this.updatePlayersHostStatus(hostId);
    }
  };

  // Handle active_players message from the server
  handleActivePlayers = (data) => {
    console.log('[ACTIVE_PLAYERS] Active players message received:', data);
    console.log('[ACTIVE_PLAYERS] Raw player data:', JSON.stringify(data.players));

    if (!data) {
      console.error('[ACTIVE_PLAYERS] No data received in active_players message');
      return;
    }

    // Fix for missing players array
    if (!Array.isArray(data.players)) {
      console.error('[ACTIVE_PLAYERS] Invalid players array in data:', data);

      // Try to recover if players is not an array but exists as an object
      if (data.players && typeof data.players === 'object') {
        console.log('[ACTIVE_PLAYERS] Attempting to convert players object to array');
        try {
          // Convert object to array if possible
          data.players = Object.values(data.players);
          console.log('[ACTIVE_PLAYERS] Converted players to array:', data.players);
        } catch (e) {
          console.error('[ACTIVE_PLAYERS] Failed to convert players object to array:', e);
          // Create empty array as fallback
          data.players = [];
        }
      } else {
        // Create empty array as fallback
        console.log('[ACTIVE_PLAYERS] Creating empty players array as fallback');
        data.players = [];
      }
    }

    // Ensure we have at least an empty array to work with
    data.players = data.players || [];

    // Normalize the room ID to ensure consistency
    const normalizedGameId = (data.gameId || this.gameId || '').toLowerCase().trim();

    // Check if game status is included and update it
    if (data.gameStatus) {
      console.log(`[ACTIVE_PLAYERS] Game status received: ${data.gameStatus}`);
      const { dispatch } = store;
      dispatch(syncGameStatus(data.gameStatus));
    }

    // Log the number of players received
    console.log(`[ACTIVE_PLAYERS] Received ${data.players.length} players for game ${normalizedGameId}`);

    const { dispatch } = store;
    const currentState = store.getState();
    const existingPlayers = currentState.players.players || {};

    // Log existing players for comparison
    console.log(`[ACTIVE_PLAYERS] Current player list has ${Object.keys(existingPlayers).length} players:`,
      Object.keys(existingPlayers).map(id => ({
        id,
        name: existingPlayers[id].name,
        isHost: existingPlayers[id].isHost
      }))
    );

    // Update hostId in game state if it's provided in the message
    let hostId = data.hostId;

    if (hostId) {
      console.log('[ACTIVE_PLAYERS] Setting hostId from active_players message:', hostId);

      // Check if this is a change from the current host
      const currentHostId = currentState.game.hostId;
      if (currentHostId !== hostId) {
        console.log(`[ACTIVE_PLAYERS] Host changing from ${currentHostId || 'none'} to ${hostId}`);
        dispatch(setHost(hostId));
      } else {
        console.log(`[ACTIVE_PLAYERS] Host unchanged: ${hostId}`);
      }

      // Update local host status
      const wasHost = this.isHost;
      this.isHost = (this.playerId === hostId);

      if (wasHost !== this.isHost) {
        console.log(`[ACTIVE_PLAYERS] Local host status changed: ${wasHost} → ${this.isHost}`);
      }
    } else if (data.players.length > 0) {
      // If no hostId is provided but we have players, we need to determine the host

      // First check if we already have a host ID in the game state
      const currentHostId = currentState.game.hostId;

      // Check if the current host ID is valid and that player still exists
      const isCurrentHostValid = currentHostId &&
                               data.players.some(p => p.id === currentHostId);

      if (isCurrentHostValid) {
        // If we already have a valid host ID and that player still exists, keep it
        console.log('[ACTIVE_PLAYERS] No hostId provided in message, but keeping existing host:', currentHostId);
        hostId = currentHostId;
        data.hostId = currentHostId; // Update for later use

        // Update local host status
        const wasHost = this.isHost;
        this.isHost = (this.playerId === currentHostId);

        if (wasHost !== this.isHost) {
          console.log(`[ACTIVE_PLAYERS] Local host status changed: ${wasHost} → ${this.isHost}`);
        }
      } else {
        // If we don't have a valid host ID or that player no longer exists, assign the first player as host
        const firstPlayerId = data.players[0].id;
        console.log('[ACTIVE_PLAYERS] No valid host, assigning first player as host:', firstPlayerId);
        dispatch(setHost(firstPlayerId));
        hostId = firstPlayerId;
        data.hostId = firstPlayerId; // Update for later use

        // Update local host status
        const wasHost = this.isHost;
        this.isHost = (this.playerId === firstPlayerId);

        if (wasHost !== this.isHost) {
          console.log(`[ACTIVE_PLAYERS] Local host status changed: ${wasHost} → ${this.isHost}`);
        }

        // Acknowledge the host change to the server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          console.log('[ACTIVE_PLAYERS] Acknowledging host change to server');
          this.sendMessage('host_change_ack', {
            hostId: firstPlayerId,
            gameId: normalizedGameId,
            receivedBy: this.playerId,
            timestamp: Date.now()
          });
        }
      }
    }

    // Track players we've seen in this message to detect removed players
    const seenPlayerIds = new Set();

    // Batch player updates to reduce Redux dispatches
    const playerUpdates = [];
    const playerAdditions = [];

    // Ensure game state is properly set
    dispatch(setGameStarted(true));
    dispatch(setGamePhase('playing'));

    // Process each player in the list
    data.players.forEach(player => {
      if (!player || !player.id) {
        console.warn('[ACTIVE_PLAYERS] Invalid player data:', player);
        return;
      }

      // Add to seen players set
      seenPlayerIds.add(player.id);

      // Get existing player data if available
      const existingPlayer = existingPlayers[player.id];

      // Determine if this player should be the host
      const isPlayerHost = player.isHost === true || player.id === hostId;

      // Create complete player data by merging existing data with new data
      const playerData = {
        // Start with existing player data if available
        ...(existingPlayer || {}),

        // Default values for missing fields
        id: player.id,
        // Prioritize position from the message if available
        position: player.position !== undefined ? player.position : (existingPlayer?.position || 0),
        balance: player.balance !== undefined ? player.balance : (existingPlayer?.balance || 1500),
        properties: player.properties || existingPlayer?.properties || [],
        status: player.status || 'ACTIVE',

        // Prioritize new data from the message for display properties
        name: player.name || existingPlayer?.name || `Player_${player.id.substring(0, 4)}`,

        // For token, emoji, and color, prioritize existing data if available
        // This ensures token information is preserved across reconnections
        token: existingPlayer?.token || player.token || player.characterToken || '',
        emoji: existingPlayer?.emoji || player.emoji || '👤',
        color: existingPlayer?.color || player.color || 'gray.500',
        characterToken: existingPlayer?.characterToken || player.characterToken || player.token || existingPlayer?.token || player.emoji || existingPlayer?.emoji || '👤',

        // Handle ready state - preserve existing ready state if not explicitly changed
        isReady: player.isReady !== undefined ? player.isReady : (existingPlayer?.isReady || false),

        // Always ensure isHost is set correctly
        isHost: isPlayerHost
      };

      // Ensure emoji is never empty
      if (!playerData.emoji || playerData.emoji === '') {
        // Assign default emoji based on player ID to ensure consistency
        const emojiOptions = ['👤', '🐸', '💪', '😢', '🐕', '🐱', '👹', '🌕', '🚀'];
        const playerIndex = parseInt(playerData.id.replace(/\D/g, '')) % emojiOptions.length;
        playerData.emoji = emojiOptions[playerIndex];
      }

      // Ensure properties is an array
      if (!Array.isArray(playerData.properties)) {
        playerData.properties = [];
      }

      // Check if this is a new player or an existing player with changes
      if (!existingPlayer) {
        // New player - add to batch additions
        console.log(`[ACTIVE_PLAYERS] Adding new player: ${playerData.name} (${playerData.id})`);
        playerAdditions.push({
          playerId: player.id,
          playerData: playerData
        });
      } else {
        // Existing player - check for changes
        const hasChanges =
          existingPlayer.name !== playerData.name ||
          existingPlayer.token !== playerData.token ||
          existingPlayer.emoji !== playerData.emoji ||
          existingPlayer.color !== playerData.color ||
          existingPlayer.isReady !== playerData.isReady ||
          existingPlayer.isHost !== playerData.isHost ||
          existingPlayer.position !== playerData.position ||
          existingPlayer.balance !== playerData.balance ||
          existingPlayer.status !== playerData.status;

        if (hasChanges) {
          // Only update if there are actual changes
          console.log(`[ACTIVE_PLAYERS] Updating player: ${playerData.name} (${playerData.id})`);
          playerUpdates.push({
            playerId: player.id,
            playerData: playerData
          });
        } else {
          console.log(`[ACTIVE_PLAYERS] No changes for player: ${playerData.name} (${playerData.id})`);
        }
      }
    });

    // Apply all player additions first
    if (playerAdditions.length > 0) {
      console.log(`[ACTIVE_PLAYERS] Adding ${playerAdditions.length} new players`);
      playerAdditions.forEach(addition => {
        try {
          console.log(`[ACTIVE_PLAYERS] Adding player:`, addition);
          dispatch(addPlayer(addition));
        } catch (e) {
          console.error(`[ACTIVE_PLAYERS] Error adding player ${addition.playerId}:`, e);
        }
      });
    } else {
      console.log(`[ACTIVE_PLAYERS] No new players to add`);
    }

    // Then apply all player updates
    if (playerUpdates.length > 0) {
      console.log(`[ACTIVE_PLAYERS] Updating ${playerUpdates.length} existing players`);
      playerUpdates.forEach(update => {
        try {
          console.log(`[ACTIVE_PLAYERS] Updating player:`, update);
          dispatch(addPlayer(update));
        } catch (e) {
          console.error(`[ACTIVE_PLAYERS] Error updating player ${update.playerId}:`, e);
        }
      });
    } else {
      console.log(`[ACTIVE_PLAYERS] No existing players to update`);
    }

    // If we have no player additions or updates but have players in the message,
    // force add all players as a fallback mechanism
    if (playerAdditions.length === 0 && playerUpdates.length === 0 && data.players.length > 0) {
      console.log(`[ACTIVE_PLAYERS] No players were added or updated, forcing addition of all ${data.players.length} players`);
      data.players.forEach(player => {
        if (!player || !player.id) return;

        try {
          const playerData = {
            id: player.id,
            position: player.position || 0,
            balance: player.balance || 1500,
            properties: player.properties || [],
            status: player.status || 'ACTIVE',
            name: player.name || `Player_${player.id.substring(0, 4)}`,
            token: player.token || player.characterToken || '',
            emoji: player.emoji || '👤',
            color: player.color || 'gray.500',
            characterToken: player.characterToken || player.token || player.emoji || '👤',
            isReady: player.isReady !== undefined ? player.isReady : false,
            isHost: player.isHost === true || player.id === hostId
          };

          console.log(`[ACTIVE_PLAYERS] Force adding player:`, playerData);
          console.log('[ACTIVE_PLAYERS] Adding player from active_players event:', {
            playerId: player.id,
            name: playerData.name,
            token: playerData.token || playerData.characterToken || playerData.emoji,
            position: playerData.position
          });

          dispatch(addPlayer({
            playerId: player.id,
            playerData: playerData
          }));

          // Synchronize with gameSlice after adding player
          setTimeout(() => this.syncPlayerDataBetweenStores(), 50);
        } catch (e) {
          console.error(`[ACTIVE_PLAYERS] Error force adding player ${player.id}:`, e);
        }
      });
    }

    // Remove players that weren't in the active_players message
    const playersToRemove = Object.keys(existingPlayers).filter(id => !seenPlayerIds.has(id));

    if (playersToRemove.length > 0) {
      console.log(`[ACTIVE_PLAYERS] Removing ${playersToRemove.length} players that are no longer active:`, playersToRemove);
      playersToRemove.forEach(playerId => {
        dispatch(removePlayer(playerId));

        // Synchronize with gameSlice after removing player
        setTimeout(() => this.syncPlayerDataBetweenStores(), 50);
      });
    }

    // Update all players' host status based on the hostId
    if (hostId) {
      // Skip broadcast to avoid loops
      this.updatePlayersHostStatus(hostId, true);
    }

    // Update maxPlayers if provided
    if (data.maxPlayers) {
      dispatch(setMaxPlayers(data.maxPlayers));
    }

    // Update gameInfo if provided
    if (data.gameInfo) {
      dispatch(setGameInfo(data.gameInfo));
    }

    // Check if the local player is missing a token and update it if needed
    const updatedState = store.getState();
    const localPlayer = updatedState.players.players[this.playerId];

    if (localPlayer && (!localPlayer.characterToken || !localPlayer.token)) {
      console.log('[ACTIVE_PLAYERS] Local player is missing token information, checking localStorage');

      try {
        const storedTokenData = localStorage.getItem('kekopoly_player_token_data');
        if (storedTokenData) {
          const parsedTokenData = JSON.parse(storedTokenData);
          console.log('[ACTIVE_PLAYERS] Found stored token data for local player:', parsedTokenData);

          // Send an explicit update to the server to ensure token is set
          this.sendMessage('update_player_info', {
            playerId: this.playerId,
            characterToken: parsedTokenData.token || parsedTokenData.emoji || '👤',
            token: parsedTokenData.token || '',
            emoji: parsedTokenData.emoji || '👤',
            color: parsedTokenData.color || 'gray.500',
            name: localPlayer.name || parsedTokenData.name || `Player_${this.playerId.substring(0, 4)}`
          });
          console.log('[ACTIVE_PLAYERS] Sent explicit token update to server for local player');

          // Also update the local Redux store
          dispatch(updatePlayer({
            playerId: this.playerId,
            updates: {
              token: parsedTokenData.token || '',
              emoji: parsedTokenData.emoji || '👤',
              color: parsedTokenData.color || 'gray.500',
              characterToken: parsedTokenData.token || parsedTokenData.emoji || '👤'
            }
          }));

          // Synchronize with gameSlice after updating player
          setTimeout(() => this.syncPlayerDataBetweenStores(), 50);
        }
      } catch (e) {
        console.warn('[ACTIVE_PLAYERS] Error retrieving token data from localStorage:', e);
      }
    }

    // Log the final state after processing
    console.log(`[ACTIVE_PLAYERS] Processing complete. Host ID: ${hostId}, Current player: ${this.playerId}, Is host: ${this.isHost}`);
    console.log(`[ACTIVE_PLAYERS] Final player count: ${data.players.length} (Added: ${playerAdditions.length}, Updated: ${playerUpdates.length}, Removed: ${playersToRemove.length})`);

    // Ensure game state is properly set
    dispatch(setGameStarted(true));
    dispatch(setGamePhase('playing'));

    // Synchronize player data between playerSlice (object format) and gameSlice (array format)
    this.syncPlayerDataBetweenStores();

    // Check if we still have zero players in the Redux store after processing
    setTimeout(() => {
      const finalState = store.getState();
      const finalPlayerCount = Object.keys(finalState.players.players || {}).length;
      console.log(`[ACTIVE_PLAYERS] Final player count in Redux store: ${finalPlayerCount}`);

      // If we still have zero players but received players in the message, try requesting again
      if (finalPlayerCount === 0 && data.players.length > 0) {
        console.log(`[ACTIVE_PLAYERS] Still have zero players in Redux store despite receiving ${data.players.length} players. Requesting active players again...`);

        // Wait a bit and request active players again
        setTimeout(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log(`[ACTIVE_PLAYERS] Re-requesting active players due to zero player count`);
            this.sendMessage('get_active_players');

            // Also request game state to ensure we have all data
            this.sendMessage('get_game_state', { full: true });

            // Force synchronize player data again
            this.syncPlayerDataBetweenStores();
          }
        }, 500);
      } else {
        // Even if we have players, force synchronize one more time to ensure consistency
        this.syncPlayerDataBetweenStores();
      }
    }, 100);
  };

  // Synchronize player data between playerSlice (object format) and gameSlice (array format)
  syncPlayerDataBetweenStores = () => {
    console.log('[SYNC_PLAYERS] Synchronizing player data between Redux stores');

    const { dispatch } = store;
    const currentState = store.getState();

    // Get players from playerSlice (object format with IDs as keys)
    const playerSlicePlayers = currentState.players.players || {};

    // Get players from gameSlice (array format)
    const gameSlicePlayers = currentState.game.players || [];

    // Log the current player counts in both stores
    console.log(`[SYNC_PLAYERS] playerSlice has ${Object.keys(playerSlicePlayers).length} players`);
    console.log(`[SYNC_PLAYERS] gameSlice has ${gameSlicePlayers.length} players`);

    // Convert playerSlice players (object) to array format for gameSlice
    const playersArray = Object.values(playerSlicePlayers).map(player => {
      // Ensure all required fields are present for gameSlice
      return {
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
        kekels: player.kekels || {
          k100: 2,
          k50: 5,
          k10: 10,
        },
      };
    });

    // Always update gameSlice with players from playerSlice to ensure consistency
    if (playersArray.length > 0) {
      console.log('[SYNC_PLAYERS] Updating gameSlice with players from playerSlice:', playersArray);

      // Update the gameSlice with the converted players array
      dispatch(setPlayers(playersArray));

      // Ensure game state is properly set
      dispatch(setGameStarted(true));
      dispatch(setGamePhase('playing'));

      console.log('[SYNC_PLAYERS] Successfully synchronized player data between stores');

      // Log the player IDs for debugging
      console.log('[SYNC_PLAYERS] Player IDs in sync:', playersArray.map(p => p.id));
    } else {
      console.log('[SYNC_PLAYERS] No players to synchronize');

      // If we have gameSlice players but no playerSlice players, sync from gameSlice to playerSlice
      if (gameSlicePlayers.length > 0) {
        console.log('[SYNC_PLAYERS] Found players in gameSlice but not in playerSlice, syncing from gameSlice to playerSlice');

        gameSlicePlayers.forEach(player => {
          if (!player || !player.id) return;

          dispatch(addPlayer({
            playerId: player.id,
            playerData: {
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
              kekels: player.kekels || {
                k100: 2,
                k50: 5,
                k10: 10,
              },
            }
          }));
        });

        console.log('[SYNC_PLAYERS] Synced players from gameSlice to playerSlice');
      }
    }
  };

  // Helper method to determine if it's the local player's turn
  // Cache the result to prevent excessive calculations
  _cachedTurnResult = null;
  _lastTurnCheck = 0;
  _turnCheckInterval = 1000; // Check at most once per second

  isLocalPlayerTurn = () => {
    try {
      const now = Date.now();

      // Use cached result if it's recent enough
      if (this._cachedTurnResult !== null && now - this._lastTurnCheck < this._turnCheckInterval) {
        return this._cachedTurnResult;
      }

      // Update the last check time
      this._lastTurnCheck = now;

      const state = store.getState();

      // First try to get currentPlayer from the game state
      let currentTurn = state?.game?.currentPlayer;

      // If not found, try the currentTurn property
      if (currentTurn === undefined) {
        currentTurn = state?.game?.currentTurn;
      }

      // If still not found, try the slices.game path as fallback
      if (currentTurn === undefined) {
        currentTurn = state?.slices?.game?.currentTurn;
      }

      // If still not found, try to get the current player from the currentPlayerIndex
      if (currentTurn === undefined && state?.game?.players && state?.game?.currentPlayerIndex !== undefined) {
        const currentPlayerIndex = state.game.currentPlayerIndex;
        if (state.game.players[currentPlayerIndex]) {
          currentTurn = state.game.players[currentPlayerIndex].id;
        }
      }

      // If we have a socket connection, request the current turn from the server
      // This ensures we always have the most up-to-date turn information
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Only request if we haven't requested recently (prevent spam)
        if (now - (this.lastTurnCheck || 0) > 5000) { // Reduced frequency to 5 seconds
          this.lastTurnCheck = now;
          // Request current turn from server asynchronously
          setTimeout(() => {
            this.sendMessage('get_current_turn', {});
          }, 0);
        }
      }

      // Return false if either value is undefined
      if (!currentTurn || !this.localPlayerId) {
        this._cachedTurnResult = false;
        return false;
      }

      // Cache and return the result
      this._cachedTurnResult = currentTurn === this.localPlayerId;
      return this._cachedTurnResult;
    } catch (error) {
      this._cachedTurnResult = false;
      return false; // Default to false on error
    }
  };

  // Setup socket event handlers
  setupSocketEventHandlers = () => {
    if (!this.socket) {
      console.error('Cannot set up event handlers: socket is not initialized');
      return;
    }

    this.socket.onopen = this.handleConnect;
    this.socket.onclose = this.handleDisconnect;
    this.socket.onerror = this.handleError;
    this.socket.onmessage = this.handleMessage;

    console.log('WebSocket event handlers set up');
  }

  // --- Add method to get current connection state string ---
  getConnectionState = () => {
    if (!this.socket) return 'disconnected';
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'disconnected'; // Treat closing as disconnected
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'disconnected';
    }
  };

  // Check if the socket is connected
  isConnected = () => {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  };
  // ---

  // --- Method to generate a simple session ID ---
  generateSessionId = () => {
    return Math.random().toString(36).substring(2, 15);
  };
  // ---

  // Add this new handler function
  handlePlayerDisconnected = (playerId) => {
    console.log(`[PLAYER_DISCONNECT] Received player_disconnected event for player: ${playerId}`);
    const { dispatch } = store;

    // Update the player's status to DISCONNECTED in the Redux store
    dispatch(updatePlayer({
      playerId,
      updates: { status: 'DISCONNECTED' }
    }));

    // Optionally, if the disconnected player was the host, trigger host change logic
    const currentState = store.getState();
    if (currentState.game.hostId === playerId) {
      console.log(`[PLAYER_DISCONNECT] Disconnected player ${playerId} was the host. Server should assign a new host.`);
      // Consider requesting active players again to get the new host ID promptly
      // Or rely on the server sending a host_changed message
      // setTimeout(() => this.sendMessage('get_active_players'), 500);
    }

    // Log message for confirmation
    console.log(`[PLAYER_DISCONNECT] Updated player ${playerId} status to DISCONNECTED in Redux.`);
  };

  // Enhanced handler for turn_changed messages
  handleTurnChanged = (data) => {
    const { dispatch } = store;
    const { currentTurn, playerName, rolledDoubles } = data;

    // Log the turn change event
    console.log('[TURN_CHANGED] Received turn_changed event:', {
      currentTurn,
      playerName,
      rolledDoubles,
      localPlayerId: this.localPlayerId,
      previousTurn: store.getState().game.currentPlayer
    });

    // Validate the currentTurn value
    if (!currentTurn) {
      console.error('[TURN_CHANGED] Received invalid currentTurn:', currentTurn);
      return;
    }

    // Update the current player in Redux
    dispatch(setCurrentPlayer(currentTurn));

    // Double-check that the Redux store was updated correctly
    setTimeout(() => {
      const updatedState = store.getState().game;
      if (updatedState.currentPlayer !== currentTurn) {
        console.error('[TURN_CHANGED] Redux store was not updated correctly!', {
          expected: currentTurn,
          actual: updatedState.currentPlayer
        });

        // Force update again
        dispatch(setCurrentPlayer(currentTurn));
      } else {
        console.log('[TURN_CHANGED] Redux store updated successfully to', currentTurn);
      }
    }, 50);

    // Add a game message
    let content = rolledDoubles
      ? `${playerName} rolled doubles and gets another turn!`
      : `It's now ${playerName}'s turn.`;
    dispatch(addGameMessage({
      type: rolledDoubles ? 'EXTRA_TURN' : 'TURN_CHANGE',
      playerId: currentTurn,
      content,
      timestamp: Date.now()
    }));

    // Always show a toast notification for doubles, regardless of whose turn it is
    try {
      const { toast } = require('@chakra-ui/react');
      if (toast) {
        if (rolledDoubles) {
          // Show a prominent notification for doubles to ALL players
          toast({
            title: "DOUBLES ROLLED!",
            description: `${playerName} rolled doubles and gets another turn!`,
            status: "success",
            duration: 5000,
            isClosable: true,
            position: "top",
            // Make the toast more prominent
            variant: "solid",
          });

          // Play a sound effect for doubles if available
          try {
            const audio = new Audio('/sounds/doubles.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('[SOUND] Could not play doubles sound:', e));
          } catch (e) {
            console.log('[SOUND] Could not play doubles sound:', e);
          }

          // Add a special animation class to the game board
          setTimeout(() => {
            const gameBoard = document.querySelector('.game-board-container');
            if (gameBoard) {
              gameBoard.classList.add('doubles-animation');
              setTimeout(() => gameBoard.classList.remove('doubles-animation'), 1000);
            }
          }, 100);
        }

        // Show a turn notification if it's the local player's turn
        if (currentTurn === this.localPlayerId) {
          console.log(`[TURN_CHANGED] It's now your turn (Player ${this.localPlayerId})`);

          toast({
            title: rolledDoubles ? "Your Turn Again!" : "Your Turn",
            description: rolledDoubles ?
              "You rolled doubles! Roll again!" :
              "It's your turn to roll the dice!",
            status: "info",
            duration: 3000,
            isClosable: true,
          });
        }
      }

      // Show a toast/banner notification for 5 seconds using window.toast if available
      if (window.toast) {
        window.toast.close('turn-changed-toast');
        window.toast({
          id: 'turn-changed-toast',
          title: rolledDoubles ? 'Doubles! Extra Turn' : 'Turn Changed',
          description: content,
          status: rolledDoubles ? 'success' : 'info',
          duration: 5000,
          isClosable: true,
          position: 'top',
        });
      }
    } catch (e) {
      console.log('[TURN_CHANGED] Could not show toast notification:', e);
    }
  }

  // Add this new handler method
  handleJailEvent = (data) => {
    const { dispatch } = store;
    // Try to resolve player name from state
    let playerName = 'A player';
    const state = store.getState();
    if (data.playerId && state && state.game && Array.isArray(state.game.players)) {
      const player = state.game.players.find(p => p.id === data.playerId);
      if (player && player.name) playerName = player.name;
    }
    dispatch(addGameMessage({
      type: 'JAIL_EVENT',
      playerId: data.playerId,
      playerName,
      event: data.event,
      jailTurns: data.jailTurns,
      dice: data.dice,
      timestamp: Date.now(),
    }));
  }

  // Handle host verification messages from the server
  handleHostVerification = (data) => {
    console.log('[HOST_VERIFICATION] Received host verification message:', data);

    const { dispatch } = store;

    if (data.success) {
      console.log(`[HOST_VERIFICATION] Host verification successful. Host ID: ${data.hostId}`);

      // Update the host ID in the game state
      if (data.hostId) {
        dispatch(setHost(data.hostId));

        // Update local host status
        if (this.playerId === data.hostId) {
          console.log(`[HOST_VERIFICATION] Current player ${this.playerId} is confirmed as the host`);
          this.isHost = true;
        } else {
          console.log(`[HOST_VERIFICATION] Current player ${this.playerId} is confirmed as NOT the host`);
          this.isHost = false;
        }

        // Update all players' host status
        this.updatePlayersHostStatus(data.hostId);
      }
    } else {
      console.warn(`[HOST_VERIFICATION] Host verification failed: ${data.message || 'Unknown error'}`);

      // Request active players to ensure we have the correct host
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage('get_active_players', {});
      }
    }
  };

  // Handle broadcast_game_started message
  handleBroadcastGameStarted = (data) => {
    console.log('[BROADCAST_GAME_STARTED] Received broadcast_game_started message:', data);

    const { dispatch } = store;
    const { gameId, timestamp } = data;

    // Only process if this is for our current game
    if (gameId && gameId === this.gameId) {
      console.log('[BROADCAST_GAME_STARTED] Processing game start broadcast for current game');

      // Update game state in Redux
      dispatch(setGameStarted(true));
      dispatch(setGamePhase('playing'));
      dispatch(syncGameStatus('PLAYING'));

      // Set localStorage flags to ensure consistent behavior
      try {
        localStorage.setItem('kekopoly_game_started', 'true');
        localStorage.setItem('kekopoly_game_id', gameId);
        localStorage.setItem('kekopoly_navigation_timestamp', timestamp || Date.now().toString());
        localStorage.setItem('kekopoly_game_phase', 'playing');

        // Also set the player ID in the standard format that GameBoard.jsx expects
        localStorage.setItem('kekopoly_player_id', this.playerId);

        // Store the auth token in the format GameBoard.jsx expects
        if (this.token) {
          localStorage.setItem('kekopoly_auth_token', this.token);
        }

        console.log('[BROADCAST_GAME_STARTED] Set localStorage flags for game start');
        console.log('[BROADCAST_GAME_STARTED] Stored player ID in standard format:', this.playerId);
      } catch (e) {
        console.warn('[BROADCAST_GAME_STARTED] Could not use localStorage:', e);
      }

      // Check if we need to navigate to the game board
      const currentLocation = window.location.pathname;
      if (!currentLocation.includes('/game/')) {
        console.log('[BROADCAST_GAME_STARTED] Not on game board, should navigate');

        // Use the window.navigateToGame function if available
        if (window.navigateToGame && typeof window.navigateToGame === 'function') {
          console.log('[BROADCAST_GAME_STARTED] Using window.navigateToGame to navigate to game board');
          window.navigateToGame(gameId);
        } else {
          console.log('[BROADCAST_GAME_STARTED] window.navigateToGame not available, using window.location');
          // Fallback to direct navigation
          window.location.href = `/game/${gameId}`;
        }
      } else {
        console.log('[BROADCAST_GAME_STARTED] Already on game board, no navigation needed');
      }
    } else {
      console.log('[BROADCAST_GAME_STARTED] Ignoring broadcast for different game');
    }
  };

  // Handle error messages from the server
  handleErrorMessage = (data) => {
    console.error('[SERVER_ERROR] Received error message from server:', data);

    const { dispatch } = store;

    // Add the error to the game messages
    dispatch(addGameMessage({
      type: 'ERROR',
      content: data.message || 'Unknown server error',
      timestamp: Date.now()
    }));

    // Check for specific error types
    if (data.message && data.message.includes('not player\'s turn')) {
      console.error('[TURN_ERROR] Server reports it\'s not this player\'s turn');

      // Create a custom event for dice roll errors
      const errorEvent = new CustomEvent('dice-roll-error', {
        detail: { message: "The server says it's not your turn. The game state may be out of sync." }
      });
      window.dispatchEvent(errorEvent);

      // Force set isRolling to false
      dispatch(setIsRolling(false));

      // Request the current game state to resync
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log('[TURN_ERROR] Requesting updated game state to resync');
        this.sendMessage('get_game_state', { full: true });
        this.sendMessage('get_active_players', {});
      }
    }
  }
}

// Create and export a singleton instance
const socketService = new SocketService();

// Start game state polling when the service is first imported
setTimeout(() => {
  socketService.startGameStatePolling();
}, 5000); // Start polling 5 seconds after initialization

export default socketService;