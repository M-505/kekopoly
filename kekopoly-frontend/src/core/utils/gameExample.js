import createGameEngine from '../index';
import { getBoardConfig } from '../models/boardConfig';

/**
 * Example usage of the Kekopoly game engine
 */
const runKekopolyExample = () => {
  // console.log('Initializing Kekopoly game engine...');
  
  // Create game engine instance
  const { engine, playerManager, propertyManager, cardManager } = createGameEngine();
  
  // Get board configuration
  const boardConfig = getBoardConfig();
  
  // Create some sample players
  const players = [
    {
      playerId: 'player1',
      userId: 'user1',
      walletAddress: '0x123456789abcdef',
      characterToken: 'pepe',
      balance: 0, // Will be set to 2000 when game starts
      position: 0,
      cards: [],
      status: 'ACTIVE',
      properties: []
    },
    {
      playerId: 'player2',
      userId: 'user2',
      walletAddress: '0xabcdef123456789',
      characterToken: 'doge',
      balance: 0,
      position: 0,
      cards: [],
      status: 'ACTIVE',
      properties: []
    },
    {
      playerId: 'player3',
      userId: 'user3',
      walletAddress: '0x987654321fedcba',
      characterToken: 'wojak',
      balance: 0,
      position: 0,
      cards: [],
      status: 'ACTIVE',
      properties: []
    }
  ];
  
  // Register event handlers
  engine.on('onStateChange', (gameState) => {
    // console.log('Game state updated:',
    //   `Status: ${gameState.status}, ` +
    //   `Current Turn: ${gameState.currentTurn}, ` +
    //   `Phase: ${gameState.turnPhase}`
    // );
  });
  
  engine.on('onPlayerTurnStart', (data) => {
    // console.log(`Player ${data.playerId}'s turn has started`);
  });
  
  engine.on('onPlayerMove', (data) => {
    // console.log(`Player ${data.playerId} moved from position ${data.from} to ${data.to}`);
  });
  
  engine.on('onPropertyPurchase', (data) => {
    // console.log(`Player ${data.playerId} purchased property ${data.propertyId} for ${data.price} Kekels`);
  });
  
  // Initialize and start the game
  // console.log('Initializing game...');
  const gameState = engine.initializeGame({}, players, boardConfig);

  // console.log('Starting game...');
  engine.startGame();
  
  // Simulate some turns
  // console.log('\n--- Simulating turns ---\n');
  
  // Player 1's turn
  const currentPlayerId = gameState.currentTurn;
  // console.log(`Simulating turn for ${currentPlayerId}`);
  
  // Memeconomy phase
  // console.log('Memeconomy phase:');
  const memeconomyResult = engine.processMemeconomyPhase(currentPlayerId);
  // console.log('Memeconomy result:', memeconomyResult);
  
  // Movement phase
  // console.log('Movement phase:');
  const movementResult = engine.processMovementPhase(currentPlayerId);
  // console.log('Movement result:', movementResult);
  
  // Action phase
  // console.log('Action phase:');
  const actionResult = engine.processActionPhase(currentPlayerId);
  // console.log('Action result:', actionResult);
  
  // If landed on property, buy it
  if (actionResult.actionType === 'purchase_opportunity') {
    // console.log('Buying property...');
    const purchaseResult = engine.purchaseProperty(currentPlayerId, actionResult.propertyId);
    // console.log('Purchase result:', purchaseResult);
  }
  
  // Trading phase (skip)
  // console.log('Trading phase:');
  const tradingResult = engine.processTradingPhase(currentPlayerId);
  // console.log('Trading result:', tradingResult);
  
  // Building phase (skip)
  // console.log('Building phase:');
  const buildingResult = engine.processBuildingPhase(currentPlayerId);
  // console.log('Building result:', buildingResult);
  
  // Card play phase (skip)
  // console.log('Card play phase:');
  const cardPlayResult = engine.processCardPlayPhase(currentPlayerId);
  // console.log('Card play result:', cardPlayResult);
  
  // End turn
  // console.log('Turn completed, moving to next player');
  
  // Print current game state summary
  const finalState = engine.getGameState();
  // console.log('\n--- Game state summary ---\n');
  // console.log('Game ID:', finalState.gameId);
  // console.log('Status:', finalState.status);
  // console.log('Current Turn:', finalState.currentTurn);

  // console.log('\nPlayers:');
  Object.values(finalState.players).forEach(player => {
    // console.log(`- ${player.playerId}: ${player.balance} Kekels, Position: ${player.position}, Properties: ${player.properties.length}`);
  });
  
  return 'Example completed successfully!';
};

export default runKekopolyExample;