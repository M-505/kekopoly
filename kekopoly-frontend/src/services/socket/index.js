/**
 * Socket Service Module
 * 
 * This module exports the SocketService singleton instance for use throughout the application.
 * The socket service handles all WebSocket communication with the game server.
 */

import SocketService from './SocketService';

// Create a singleton instance of the SocketService
const socketService = new SocketService();

export default socketService;
