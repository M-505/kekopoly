// Test script to verify WebSocket fixes
const WebSocket = require('ws');

// Configuration
const config = {
  gameId: '6816F74DA28425A355DC1877', // Use the same game ID from the screenshot
  player1: {
    id: 'player1',
    name: 'Chad',
    emoji: '👨'
  },
  player2: {
    id: 'player2',
    name: 'Pepe',
    emoji: '🐸'
  },
  wsUrl: 'ws://localhost:8080/ws/'
};

// Create WebSocket connections for both players
const createPlayerConnection = (playerId, playerName, playerEmoji) => {
  const sessionId = Math.random().toString(36).substring(2, 15);
  const wsUrl = `${config.wsUrl}${config.gameId.toLowerCase()}?sessionId=${sessionId}`;
  
  console.log(`Connecting ${playerName} (${playerId}) to ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log(`[${playerName}] Connected to WebSocket server`);
    
    // Send player_joined message
    const playerJoinedMsg = {
      type: 'player_joined',
      player: {
        id: playerId,
        name: playerName,
        token: '',
        emoji: playerEmoji,
        color: 'gray.500',
        isReady: false
      }
    };
    
    ws.send(JSON.stringify(playerJoinedMsg));
    console.log(`[${playerName}] Sent player_joined message`);
    
    // Request active players
    setTimeout(() => {
      const getActivePlayers = {
        type: 'get_active_players'
      };
      ws.send(JSON.stringify(getActivePlayers));
      console.log(`[${playerName}] Sent get_active_players message`);
    }, 1000);
    
    // Verify host
    setTimeout(() => {
      const verifyHost = {
        type: 'verify_host',
        gameId: config.gameId.toLowerCase()
      };
      ws.send(JSON.stringify(verifyHost));
      console.log(`[${playerName}] Sent verify_host message`);
    }, 2000);
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`[${playerName}] Received message:`, message.type);
      
      // Log specific message types in detail
      if (message.type === 'active_players') {
        console.log(`[${playerName}] Active players:`, message.players.map(p => `${p.name} (${p.id})`));
        console.log(`[${playerName}] Host ID:`, message.hostId);
      } else if (message.type === 'host_verification') {
        console.log(`[${playerName}] Host verification:`, message);
      } else if (message.type === 'host_changed') {
        console.log(`[${playerName}] Host changed to:`, message.hostId);
      }
    } catch (error) {
      console.error(`[${playerName}] Error parsing message:`, error);
    }
  });
  
  ws.on('error', (error) => {
    console.error(`[${playerName}] WebSocket error:`, error);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`[${playerName}] WebSocket connection closed:`, code, reason);
  });
  
  return ws;
};

// Create connections for both players
const player1Connection = createPlayerConnection(
  config.player1.id,
  config.player1.name,
  config.player1.emoji
);

// Wait a bit before connecting the second player
setTimeout(() => {
  const player2Connection = createPlayerConnection(
    config.player2.id,
    config.player2.name,
    config.player2.emoji
  );
  
  // Close connections after 10 seconds
  setTimeout(() => {
    console.log('Closing WebSocket connections...');
    player1Connection.close();
    player2Connection.close();
  }, 10000);
}, 3000);
