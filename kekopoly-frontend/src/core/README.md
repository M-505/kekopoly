# Kekopoly Game Logic

This directory contains the core game logic for Kekopoly, a multiplayer property trading board game based on internet meme culture, using Kekels Meme Tokens (KMT) on the Solana blockchain.

## Architecture

The game logic is implemented as a modular, event-driven system that handles all game mechanics independent of UI concerns. The core components are:

### Core Engine Components

- **GameEngine**: Orchestrates the overall game flow and state transitions
- **PlayerManager**: Handles player-related operations (balance updates, movement, etc.)
- **PropertyManager**: Manages property ownership, rent calculations, and building mechanics
- **CardManager**: Handles card decks, drawing, and effect application
- **DiceManager**: Manages dice rolling and turn order mechanics
- **RuleEngine**: Implements special game rules and validates game actions

### Data Models

- **Game State**: Overall game status, current turn, market conditions
- **Player**: Player information, balance, cards, properties
- **Property**: Property attributes, ownership, buildings, rent values
- **Card**: Card details including type, rarity, and effects
- **Special Effects**: Time-limited effects applied to properties or players

## Game Mechanics Implemented

The following key game mechanics have been implemented:

- **Game Initialization**: Starting money, property setup, initial card distribution
- **Turn-based Flow**: Complete turn structure (Memeconomy, Movement, Action, Trading, Building, Card Play)
- **Property Handling**: Buying, selling, rent calculation with multipliers
- **Card System**: Three rarity tiers (Common, Rare, Legendary) with various effects
- **Special Rules**: Kek's Blessing, Giga Chad Move, Redpill, etc.
- **Building System**: Engagement (houses) and Blue Checkmark (hotel) mechanics
- **Shadowban (Jail)**: Multiple ways to get in/out of Shadowban

## Usage

The game engine is designed to be easily integrated with any UI framework. Here's a simple example:

```javascript
import createGameEngine from './core/index';
import { getBoardConfig } from './core/models/boardConfig';

// Create game engine instance
const { engine, playerManager, propertyManager, cardManager } = createGameEngine();

// Get board configuration
const boardConfig = getBoardConfig();

// Define players
const players = [
  {
    playerId: 'player1',
    userId: 'user1',
    walletAddress: '0x123...',
    characterToken: 'pepe',
    balance: 0, // Will be set to 2000 when game starts
    position: 0,
    cards: [],
    status: 'ACTIVE',
    properties: []
  },
  // Add more players...
];

// Register event handlers
engine.on('onStateChange', (gameState) => {
  console.log('Game state updated');
  // Update UI based on new state
});

// Initialize and start the game
const gameState = engine.initializeGame({}, players, boardConfig);
engine.startGame();

// On player's turn, process each phase
engine.processMemeconomyPhase(currentPlayerId);
engine.processMovementPhase(currentPlayerId);
engine.processActionPhase(currentPlayerId);
engine.processTradingPhase(currentPlayerId);
engine.processBuildingPhase(currentPlayerId);
engine.processCardPlayPhase(currentPlayerId);
```

For a more detailed example, see `utils/gameExample.js`.

## Future Enhancements

- Blockchain integration for token handling
- Multiplayer networking via Socket.IO
- AI opponents
- Additional special cards and rules

## Directory Structure

```
src/core/
├── engine/             # Core game engine components
│   ├── GameEngine.js   # Main game orchestrator
│   ├── PlayerManager.js
│   ├── PropertyManager.js
│   ├── CardManager.js
│   ├── DiceManager.js
│   └── RuleEngine.js
├── models/             # Data models and types
│   ├── types.js        # Type definitions
│   └── boardConfig.js  # Board configuration
├── utils/              # Utility functions
│   └── gameExample.js  # Usage example
└── index.js            # Main entry point
```

## Integration Points

The core game logic is designed to be integrated with:

1. **UI Frontend**: Connect UI components to game engine events and actions
2. **Network Layer**: For multiplayer functionality
3. **Blockchain Integration**: For token transactions

Each of these can be implemented independently without modifying the core game logic.