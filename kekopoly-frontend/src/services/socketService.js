/**
 * Socket Service
 * 
 * This file serves as a proxy to the new modular socket service.
 * It maintains backward compatibility with existing code while
 * redirecting to the new implementation.
 * 
 * IMPORTANT: For new code, please import directly from './socket' instead.
 * This proxy file will be removed in a future update.
 * 
 * The socket service has been refactored into a modular structure:
 * - ./socket/index.js - Main export
 * - ./socket/SocketService.js - Core class
 * - ./socket/connectionHandlers.js - Connection-related methods
 * - ./socket/messageHandlers.js - Message handling methods
 * - ./socket/gameHandlers.js - Game-specific message handlers
 * - ./socket/playerHandlers.js - Player-specific message handlers
 * - ./socket/lobbyHandlers.js - Lobby-related functionality
 * - ./socket/stateManagement.js - State persistence methods
 * - ./socket/utils.js - Utility functions
 * - ./socket/syncUtils.js - Synchronization utilities
 */

import socketService from './socket';

// Re-export the socket service
export default socketService;
