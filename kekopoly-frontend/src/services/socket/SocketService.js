/**
 * SocketService Class
 *
 * Core WebSocket service that handles connections to the game server.
 * This class is responsible for establishing and maintaining WebSocket connections,
 * sending messages, and routing received messages to the appropriate handlers.
 */

import { store } from '../../store/store';
import { log, logError, logWarning } from '../../utils/logger';

// Import handlers
import * as connectionHandlers from './connectionHandlers';
import * as messageHandlers from './messageHandlers';
import * as lobbyHandlers from './lobbyHandlers';
import * as stateManagement from './stateManagement';
import * as gameHandlers from './gameHandlers';
import * as playerHandlers from './playerHandlers';
import * as utils from './utils';
import * as syncUtils from './syncUtils';

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

  // Navigation state flags
  isNavigating = false; // Flag to track navigation state
  preserveConnection = false; // Flag to preserve connection during navigation
  isTransitioningToGame = false; // Flag to track game transition specifically

  // Connection status callbacks
  onConnectionChange = (status) => {
    // Dispatch custom events for connection status changes
    if (status === 'connected') {
      window.dispatchEvent(new Event('socket-connected'));
    } else if (status === 'disconnected') {
      window.dispatchEvent(new Event('socket-disconnected'));
    }
  };

  onConnectionError = () => {}; // Default empty function
  onNewGameCallback = null;

  constructor() {
    // Bind methods from imported modules to this instance
    this.bindMethods();
  }

  /**
   * Binds all methods from imported modules to this instance
   */
  bindMethods() {
    // Bind connection handlers
    this.connect = connectionHandlers.connect.bind(this);
    this.disconnect = connectionHandlers.disconnect.bind(this);
    this.handleConnect = connectionHandlers.handleConnect.bind(this);
    this.handleDisconnect = connectionHandlers.handleDisconnect.bind(this);
    this.handleError = connectionHandlers.handleError.bind(this);
    this.preserveSocketForNavigation = connectionHandlers.preserveSocketForNavigation.bind(this);
    this.setupSocketEventHandlers = connectionHandlers.setupSocketEventHandlers.bind(this);
    this.isConnected = connectionHandlers.isConnected.bind(this);
    this.getConnectionState = connectionHandlers.getConnectionState.bind(this);
    this.generateSessionId = connectionHandlers.generateSessionId.bind(this);

    // Bind message handlers
    this.handleMessage = messageHandlers.handleMessage.bind(this);
    this.sendMessage = messageHandlers.sendMessage.bind(this);
    this.sendQueuedMessages = messageHandlers.sendQueuedMessages.bind(this);

    // Bind lobby handlers
    this.connectToLobby = lobbyHandlers.connectToLobby.bind(this);
    this.disconnectFromLobby = lobbyHandlers.disconnectFromLobby.bind(this);
    this.handleLobbyConnect = lobbyHandlers.handleLobbyConnect.bind(this);
    this.handleLobbyDisconnect = lobbyHandlers.handleLobbyDisconnect.bind(this);
    this.handleLobbyError = lobbyHandlers.handleLobbyError.bind(this);
    this.handleLobbyMessage = lobbyHandlers.handleLobbyMessage.bind(this);
    this.getLobbySocketStateString = lobbyHandlers.getLobbySocketStateString.bind(this);
    this.onNewGame = lobbyHandlers.onNewGame.bind(this);

    // Bind state management methods
    this.saveState = stateManagement.saveState.bind(this);
    this.loadState = stateManagement.loadState.bind(this);

    // Bind game handlers
    this.handleGameState = gameHandlers.handleGameState.bind(this);
    this.handleDiceRolling = gameHandlers.handleDiceRolling.bind(this);
    this.handleDiceRolled = gameHandlers.handleDiceRolled.bind(this);
    this.handlePlayerMoved = gameHandlers.handlePlayerMoved.bind(this);
    this.handleGameStarted = gameHandlers.handleGameStarted.bind(this);
    this.handleCurrentTurn = gameHandlers.handleCurrentTurn.bind(this);
    this.handleTurnChanged = gameHandlers.handleTurnChanged.bind(this);
    this.handleErrorMessage = gameHandlers.handleErrorMessage.bind(this);

    // Bind player handlers
    this.handleActivePlayers = playerHandlers.handleActivePlayers.bind(this);
    this.handlePlayerJoined = playerHandlers.handlePlayerJoined.bind(this);
    this.handlePlayerDisconnected = playerHandlers.handlePlayerDisconnected.bind(this);
    this.handlePlayerReady = playerHandlers.handlePlayerReady.bind(this);
    this.handlePlayerBalance = playerHandlers.handlePlayerBalance.bind(this);
    this.handlePlayerCard = playerHandlers.handlePlayerCard.bind(this);
    this.handlePlayerProperty = playerHandlers.handlePlayerProperty.bind(this);
    this.handleHostChanged = playerHandlers.handleHostChanged.bind(this);
    this.handleSetHost = playerHandlers.handleSetHost.bind(this);
    this.handleHostInfo = playerHandlers.handleHostInfo.bind(this);

    // Bind utility methods
    this.processRecoveredMessage = utils.processRecoveredMessage.bind(this);
    this.attemptSyncRecovery = utils.attemptSyncRecovery.bind(this);
    this.handleSyncError = utils.handleSyncError.bind(this);
    this.ensureGameStateInitialized = utils.ensureGameStateInitialized.bind(this);

    // Bind sync utilities
    this.startPeriodicStateSync = syncUtils.startPeriodicStateSync.bind(this);
    this.stopPeriodicStateSync = syncUtils.stopPeriodicStateSync.bind(this);
    this.setupGameStartRetryCheck = syncUtils.setupGameStartRetryCheck.bind(this);
    this.syncPlayerDataBetweenStores = syncUtils.syncPlayerDataBetweenStores.bind(this);
    this._performPlayerDataSync = syncUtils._performPlayerDataSync.bind(this);
    this._initDebouncedSync = syncUtils._initDebouncedSync.bind(this);
  }

  /**
   * Initialize the socket service
   * Attempts to reconnect if session info is present in localStorage
   */
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
}

export default SocketService;
