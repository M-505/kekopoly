import { GAME_STATUS, PLAYER_STATUS, MARKET_CONDITION, TURN_PHASE } from '../models/types';

/**
 * GameEngine class manages the core game flow and state transitions
 * It acts as the central coordinator for all game mechanics
 */
class GameEngine {
  /**
   * @param {Object} dependencies - Engine dependencies
   * @param {Object} dependencies.propertyManager - Property manager instance
   * @param {Object} dependencies.playerManager - Player manager instance
   * @param {Object} dependencies.cardManager - Card manager instance 
   * @param {Object} dependencies.diceManager - Dice manager instance
   * @param {Object} dependencies.ruleEngine - Rule engine instance
   */
  constructor(dependencies) {
    this.propertyManager = dependencies.propertyManager;
    this.playerManager = dependencies.playerManager;
    this.cardManager = dependencies.cardManager;
    this.diceManager = dependencies.diceManager;
    this.ruleEngine = dependencies.ruleEngine;
    
    // The current game state
    this.gameState = null;
    
    // Event handlers for various game events
    this.eventHandlers = {
      onStateChange: null,
      onPlayerTurnStart: null,
      onPlayerTurnEnd: null,
      onPlayerMove: null,
      onPropertyPurchase: null,
      onRentPayment: null,
      onCardDraw: null,
      onCardPlay: null,
      onGameEnd: null
    };
  }

  /**
   * Initialize a new game
   * @param {Object} config - Game configuration
   * @param {Array} players - Initial player data
   * @param {Object} boardConfig - Board and property configuration
   * @returns {Object} - Initial game state
   */
  initializeGame(config, players, boardConfig) {
    // Create initial game state
    this.gameState = {
      gameId: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      status: GAME_STATUS.LOBBY,
      players: {},
      currentTurn: null,
      turnOrder: [],
      turnPhase: null,
      properties: {},
      decks: {
        meme: [],
        redpill: [],
        eegi: []
      },
      cardsRemaining: {
        meme: 16,
        redpill: 16,
        eegi: 16
      },
      marketCondition: MARKET_CONDITION.NORMAL,
      marketConditionRemainingTurns: 0,
      lastDiceRoll: [1, 1], 
      isRolling: false,
      pendingAction: null
    };

    // Initialize players
    players.forEach(player => {
      this.playerManager.addPlayer(this.gameState, player);
    });

    // Initialize properties from board config
    Object.values(boardConfig.properties).forEach(property => {
      this.propertyManager.addProperty(this.gameState, property);
    });

    // Initialize card decks
    this.cardManager.initializeDecks(this.gameState);

    // Determine initial turn order
    this.determineInitialTurnOrder();

    // Initial setup is complete
    this.triggerEvent('onStateChange', this.gameState);
    
    return this.gameState;
  }

  /**
   * Start the game
   * @returns {Object} - Updated game state
   */
  startGame() {
    if (this.gameState.status !== GAME_STATUS.LOBBY) {
      throw new Error('Game must be in LOBBY status to start');
    }

    // Set game to active
    this.gameState.status = GAME_STATUS.ACTIVE;
    
    // Set first player's turn
    this.gameState.currentTurn = this.gameState.turnOrder[0];
    this.gameState.turnPhase = TURN_PHASE.MEMECONOMY;
    
    // Give each player their starting money
    Object.keys(this.gameState.players).forEach(playerId => {
      this.playerManager.updateBalance(
        this.gameState, 
        playerId, 
        2000, // Starting money amount from rules
        'set'
      );
      
      // Give each player a random Common card
      this.cardManager.drawInitialCard(this.gameState, playerId);
    });

    this.triggerEvent('onStateChange', this.gameState);
    this.triggerEvent('onPlayerTurnStart', {
      gameState: this.gameState,
      playerId: this.gameState.currentTurn
    });
    
    return this.gameState;
  }

  /**
   * Determine initial turn order based on dice rolls
   * @private
   */
  determineInitialTurnOrder() {
    // In a real implementation, this would be based on actual dice rolls
    // For now, we'll just use the player IDs in the order they joined
    this.gameState.turnOrder = Object.keys(this.gameState.players);
    
    // Shuffle the turn order for randomness
    for (let i = this.gameState.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.gameState.turnOrder[i], this.gameState.turnOrder[j]] = 
      [this.gameState.turnOrder[j], this.gameState.turnOrder[i]];
    }
  }

  /**
   * Process the memeconomy phase (market condition check)
   * @param {string} playerId - Current player's ID
   * @returns {Object} - Phase result
   */
  processMemeconomyPhase(playerId) {
    if (this.gameState.currentTurn !== playerId || 
        this.gameState.turnPhase !== TURN_PHASE.MEMECONOMY) {
      throw new Error('Not player\'s turn or wrong phase');
    }
    
    // Roll a die to check market conditions
    const roll = this.diceManager.rollDie();
    
    let result = {
      roll,
      effectApplied: false,
      marketChange: null
    };
    
    // Apply market condition based on roll
    if (roll === 6) {
      // Meme market crash - properties devalue by 10% for one round
      this.gameState.marketCondition = MARKET_CONDITION.CRASH;
      this.gameState.marketConditionRemainingTurns = Object.keys(this.gameState.players).length;
      result.effectApplied = true;
      result.marketChange = MARKET_CONDITION.CRASH;
    } else if (roll === 1) {
      // Bull market - properties increase value by 10% for one round
      this.gameState.marketCondition = MARKET_CONDITION.BULL;
      this.gameState.marketConditionRemainingTurns = Object.keys(this.gameState.players).length;
      result.effectApplied = true;
      result.marketChange = MARKET_CONDITION.BULL;
    }
    
    // Move to next phase
    this.gameState.turnPhase = TURN_PHASE.MOVEMENT;
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return result;
  }

  /**
   * Process player movement
   * @param {string} playerId - Current player's ID
   * @returns {Object} - Movement result with new position and relevant events
   */
  processMovementPhase(playerId) {
    if (this.gameState.currentTurn !== playerId || 
        this.gameState.turnPhase !== TURN_PHASE.MOVEMENT) {
      throw new Error('Not player\'s turn or wrong phase');
    }
    
    const player = this.gameState.players[playerId];
    
    // Check if player is shadowbanned (in jail)
    if (player.shadowbanned) {
      return this.processShadowbannedPlayerMove(playerId);
    }
    
    // Roll the dice
    const diceRoll = this.diceManager.rollDice();
    this.gameState.lastDiceRoll = diceRoll;
    
    const diceSum = diceRoll[0] + diceRoll[1];
    const isDoubles = diceRoll[0] === diceRoll[1];
    
    // Calculate new position
    const oldPosition = player.position;
    let newPosition = (oldPosition + diceSum) % 40; // 40 spaces on board
    
    // Check if player passes START
    const passedStart = oldPosition + diceSum >= 40;
    
    // Update player position
    this.playerManager.updatePosition(this.gameState, playerId, newPosition);
    
    // Record result
    const result = {
      diceRoll,
      oldPosition,
      newPosition,
      passedStart,
      isDoubles
    };
    
    // Handle passing START
    if (passedStart) {
      // Player can choose to collect 100 Kekels OR draw a card
      // For now, we'll default to collecting Kekels
      this.playerManager.updateBalance(this.gameState, playerId, 100, 'add');
      result.passedStartAction = 'collect';
    }
    
    // Check for three doubles in a row
    if (isDoubles) {
      player.doublesCount = (player.doublesCount || 0) + 1;
      
      if (player.doublesCount >= 3) {
        // Three doubles in a row - go to Shadowban
        this.playerManager.sendToShadowban(this.gameState, playerId);
        result.sentToShadowban = true;
        player.doublesCount = 0;
      } else {
        // Player gets another turn
        result.getAnotherTurn = true;
      }
    } else {
      // Reset doubles count
      player.doublesCount = 0;
    }
    
    // Move to next phase
    this.gameState.turnPhase = TURN_PHASE.ACTION;
    
    // Trigger movement event
    this.triggerEvent('onPlayerMove', {
      gameState: this.gameState,
      playerId,
      from: oldPosition,
      to: newPosition,
      diceRoll
    });
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return result;
  }

  /**
   * Handle movement for shadowbanned player
   * @param {string} playerId - Current player's ID
   * @returns {Object} - Result of shadowban roll
   * @private
   */
  processShadowbannedPlayerMove(playerId) {
    const player = this.gameState.players[playerId];
    
    // Roll the dice to try to get out
    const diceRoll = this.diceManager.rollDice();
    this.gameState.lastDiceRoll = diceRoll;
    
    const isDoubles = diceRoll[0] === diceRoll[1];
    
    let result = {
      diceRoll,
      inShadowban: true,
      gotOut: false
    };
    
    // Check if player rolls doubles to get out
    if (isDoubles) {
      // Player gets out of shadowban
      this.playerManager.releaseFromShadowban(this.gameState, playerId);
      
      // Move player based on the roll
      const diceSum = diceRoll[0] + diceRoll[1];
      const oldPosition = player.position;
      const newPosition = (oldPosition + diceSum) % 40;
      
      this.playerManager.updatePosition(this.gameState, playerId, newPosition);
      
      result.gotOut = true;
      result.oldPosition = oldPosition;
      result.newPosition = newPosition;
      
      // Trigger movement event
      this.triggerEvent('onPlayerMove', {
        gameState: this.gameState,
        playerId,
        from: oldPosition,
        to: newPosition,
        diceRoll
      });
    } else {
      // Player stays in shadowban
      player.shadowbanRemainingTurns--;
      
      if (player.shadowbanRemainingTurns <= 0) {
        // Player has spent 3 turns in shadowban, can pay to get out next turn
        result.canPayToGetOut = true;
      }
    }
    
    // Move to action phase (even if player didn't move)
    this.gameState.turnPhase = TURN_PHASE.ACTION;
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return result;
  }

  /**
   * Process the action phase based on the space landed on
   * @param {string} playerId - Current player's ID
   * @returns {Object} - Result of the action
   */
  processActionPhase(playerId) {
    if (this.gameState.currentTurn !== playerId || 
        this.gameState.turnPhase !== TURN_PHASE.ACTION) {
      throw new Error('Not player\'s turn or wrong phase');
    }
    
    const player = this.gameState.players[playerId];
    const position = player.position;
    
    // Find the property or space at this position
    const propertyId = Object.keys(this.gameState.properties).find(id => 
      this.gameState.properties[id].position === position
    );
    
    let result = {
      position,
      actionType: null
    };
    
    if (propertyId) {
      const property = this.gameState.properties[propertyId];
      result.propertyId = propertyId;
      
      if (property.type === 'SPECIAL') {
        // Handle special spaces
        result.actionType = 'special';
        result.specialAction = this.handleSpecialSpace(playerId, property);
      } else if (property.ownerId === null) {
        // Unowned property - can be purchased
        result.actionType = 'purchase_opportunity';
        result.property = property;
      } else if (property.ownerId !== playerId) {
        // Property owned by another player - pay rent
        result.actionType = 'pay_rent';
        result.rentResult = this.propertyManager.processRentPayment(
          this.gameState, 
          playerId, 
          propertyId
        );
      }
      // Owned by current player - nothing happens
    } else {
      // Check for card spaces
      if (position === 2 || position === 17 || position === 33) {
        // Meme card space
        result.actionType = 'draw_card';
        result.cardType = 'meme';
        result.cardResult = this.cardManager.drawCard(this.gameState, playerId, 'meme');
      } else if (position === 7 || position === 22 || position === 36) {
        // Redpill card space
        result.actionType = 'draw_card';
        result.cardType = 'redpill';
        result.cardResult = this.cardManager.drawCard(this.gameState, playerId, 'redpill');
      } else if (position === 12 || position === 27 || position === 37) {
        // EEGI card space
        result.actionType = 'draw_card';
        result.cardType = 'eegi';
        result.cardResult = this.cardManager.drawCard(this.gameState, playerId, 'eegi');
      } else if (position === 0) {
        // START space - already handled during movement
        result.actionType = 'start';
      } else if (position === 10) {
        // Just visiting Shadowban
        result.actionType = 'visiting_shadowban';
      } else if (position === 20) {
        // Free Space / Touch Grass
        result.actionType = 'free_space';
        result.canTouchGrass = true;
      } else if (position === 30) {
        // Go to Shadowban
        result.actionType = 'go_to_shadowban';
        this.playerManager.sendToShadowban(this.gameState, playerId);
      }
    }
    
    // Move to the trading phase
    this.gameState.turnPhase = TURN_PHASE.TRADING;
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return result;
  }

  /**
   * Handle special spaces (Gaming Chair, etc.)
   * @param {string} playerId - Current player's ID
   * @param {Object} property - The special property landed on
   * @returns {Object} - Result of the special action
   * @private
   */
  handleSpecialSpace(playerId, property) {
    // Implementation for special spaces
    const result = {
      spaceType: property.name
    };
    
    if (property.name === 'Gaming Chair') {
      // Player can choose to "Stream" a property they own
      result.action = 'can_stream_property';
      result.ownedProperties = this.propertyManager.getPlayerProperties(
        this.gameState, 
        playerId
      );
    } else if (property.name.includes('FREE SPACE')) {
      // Player can choose to "Touch Grass" (skip next turn) to collect 150 Kekels
      result.action = 'can_touch_grass';
    }
    
    return result;
  }

  /**
   * Process the trading phase
   * @param {string} playerId - Current player's ID
   * @param {Object} tradeData - Trade details (optional)
   * @returns {Object} - Result of the trade
   */
  processTradingPhase(playerId, tradeData = null) {
    if (this.gameState.currentTurn !== playerId || 
        this.gameState.turnPhase !== TURN_PHASE.TRADING) {
      throw new Error('Not player\'s turn or wrong phase');
    }
    
    let result = {
      tradeInitiated: false
    };
    
    // If trade data is provided, process the trade
    if (tradeData) {
      result.tradeInitiated = true;
      result.tradeResult = this.processTrade(playerId, tradeData);
    }
    
    // Move to building phase
    this.gameState.turnPhase = TURN_PHASE.BUILDING;
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return result;
  }

  /**
   * Process a trade between players
   * @param {string} initiatingPlayerId - ID of player initiating the trade
   * @param {Object} tradeData - Data about the trade
   * @returns {Object} - Result of the trade
   * @private
   */
  processTrade(initiatingPlayerId, tradeData) {
    const { 
      otherPlayerId, 
      offeredProperties = [], 
      requestedProperties = [],
      offeredCards = [],
      requestedCards = [],
      offeredKekels = 0,
      requestedKekels = 0
    } = tradeData;
    
    // Validate the trade
    if (!this.gameState.players[otherPlayerId]) {
      throw new Error('Invalid player in trade');
    }
    
    // Check if the players own the properties they're offering
    const initiatingPlayerProperties = this.propertyManager.getPlayerProperties(
      this.gameState, 
      initiatingPlayerId
    );
    
    const otherPlayerProperties = this.propertyManager.getPlayerProperties(
      this.gameState, 
      otherPlayerId
    );
    
    const initiatingPlayerHasProperties = offeredProperties.every(propId => 
      initiatingPlayerProperties.some(p => p.propertyId === propId)
    );
    
    const otherPlayerHasProperties = requestedProperties.every(propId => 
      otherPlayerProperties.some(p => p.propertyId === propId)
    );
    
    if (!initiatingPlayerHasProperties || !otherPlayerHasProperties) {
      throw new Error('One or more properties in trade not owned by respective player');
    }
    
    // Check if players have sufficient Kekels
    if (this.gameState.players[initiatingPlayerId].balance < offeredKekels) {
      throw new Error('Initiating player does not have enough Kekels');
    }
    
    if (this.gameState.players[otherPlayerId].balance < requestedKekels) {
      throw new Error('Other player does not have enough Kekels');
    }
    
    // Check if players have the cards they're offering
    // This would need card validation logic similar to properties
    
    // If everything is valid, execute the trade
    // First, transfer properties
    offeredProperties.forEach(propId => {
      this.propertyManager.transferProperty(
        this.gameState, 
        propId, 
        initiatingPlayerId, 
        otherPlayerId
      );
    });
    
    requestedProperties.forEach(propId => {
      this.propertyManager.transferProperty(
        this.gameState, 
        propId, 
        otherPlayerId, 
        initiatingPlayerId
      );
    });
    
    // Transfer Kekels
    if (offeredKekels > 0) {
      this.playerManager.transferKekels(
        this.gameState, 
        initiatingPlayerId, 
        otherPlayerId, 
        offeredKekels
      );
    }
    
    if (requestedKekels > 0) {
      this.playerManager.transferKekels(
        this.gameState, 
        otherPlayerId, 
        initiatingPlayerId, 
        requestedKekels
      );
    }
    
    // Transfer cards (this would need implementation in card manager)
    // cardManager.transferCards(...)
    
    return {
      success: true,
      tradeSummary: {
        from: initiatingPlayerId,
        to: otherPlayerId,
        offeredProperties,
        requestedProperties,
        offeredKekels,
        requestedKekels
      }
    };
  }

  /**
   * Process the building phase
   * @param {string} playerId - Current player's ID
   * @param {Object} buildData - Building details (optional)
   * @returns {Object} - Result of building action
   */
  processBuildingPhase(playerId, buildData = null) {
    if (this.gameState.currentTurn !== playerId || 
        this.gameState.turnPhase !== TURN_PHASE.BUILDING) {
      throw new Error('Not player\'s turn or wrong phase');
    }
    
    let result = {
      buildingAttempted: false
    };
    
    // If build data is provided, process the building
    if (buildData) {
      result.buildingAttempted = true;
      
      const { propertyId, action } = buildData;
      
      if (action === 'add_engagement') {
        result.buildResult = this.propertyManager.addEngagement(
          this.gameState, 
          propertyId
        );
      } else if (action === 'add_blue_checkmark') {
        result.buildResult = this.propertyManager.addBlueCheckmark(
          this.gameState, 
          propertyId
        );
      }
    }
    
    // Move to card play phase
    this.gameState.turnPhase = TURN_PHASE.CARD_PLAY;
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return result;
  }

  /**
   * Process the card play phase
   * @param {string} playerId - Current player's ID
   * @param {Object} cardPlayData - Card play details (optional)
   * @returns {Object} - Result of card play
   */
  processCardPlayPhase(playerId, cardPlayData = null) {
    if (this.gameState.currentTurn !== playerId || 
        this.gameState.turnPhase !== TURN_PHASE.CARD_PLAY) {
      throw new Error('Not player\'s turn or wrong phase');
    }
    
    let result = {
      cardPlayed: false
    };
    
    // If card play data is provided, process the card play
    if (cardPlayData) {
      result.cardPlayed = true;
      
      const { cardId, targetPlayerId, targetPropertyId } = cardPlayData;
      
      result.cardPlayResult = this.cardManager.playCard(
        this.gameState, 
        playerId, 
        cardId, 
        { targetPlayerId, targetPropertyId }
      );
    }
    
    // End the turn
    this.endTurn(playerId);
    
    return result;
  }

  /**
   * End the current player's turn
   * @param {string} playerId - Current player's ID
   * @returns {Object} - Result of turn end
   */
  endTurn(playerId) {
    if (this.gameState.currentTurn !== playerId) {
      throw new Error('Not player\'s turn');
    }
    
    const currentPlayer = this.gameState.players[playerId];
    
    // Trigger turn end event
    this.triggerEvent('onPlayerTurnEnd', {
      gameState: this.gameState,
      playerId
    });
    
    // Check if player gets another turn (due to doubles)
    if (currentPlayer.doublesCount > 0) {
      // Reset phase to start the turn again
      this.gameState.turnPhase = TURN_PHASE.MEMECONOMY;
      
      this.triggerEvent('onPlayerTurnStart', {
        gameState: this.gameState,
        playerId
      });
      
      return {
        turnEnded: false,
        anotherTurn: true
      };
    }
    
    // Move to the next player
    const currentIndex = this.gameState.turnOrder.indexOf(playerId);
    const nextIndex = (currentIndex + 1) % this.gameState.turnOrder.length;
    const nextPlayerId = this.gameState.turnOrder[nextIndex];
    
    // Set the next player's turn
    this.gameState.currentTurn = nextPlayerId;
    this.gameState.turnPhase = TURN_PHASE.MEMECONOMY;
    
    // Update market condition remaining turns
    if (this.gameState.marketCondition !== MARKET_CONDITION.NORMAL) {
      this.gameState.marketConditionRemainingTurns--;
      
      if (this.gameState.marketConditionRemainingTurns <= 0) {
        this.gameState.marketCondition = MARKET_CONDITION.NORMAL;
      }
    }
    
    // Update special effects remaining turns
    this.propertyManager.updateSpecialEffects(this.gameState);
    
    // Trigger state change and next player's turn start
    this.triggerEvent('onStateChange', this.gameState);
    this.triggerEvent('onPlayerTurnStart', {
      gameState: this.gameState,
      playerId: nextPlayerId
    });
    
    return {
      turnEnded: true,
      nextPlayerId
    };
  }

  /**
   * Purchase a property
   * @param {string} playerId - Player attempting to purchase
   * @param {string} propertyId - Property to purchase
   * @returns {Object} - Result of the purchase attempt
   */
  purchaseProperty(playerId, propertyId) {
    // Check if property exists and is unowned
    const property = this.gameState.properties[propertyId];
    
    if (!property) {
      throw new Error('Property does not exist');
    }
    
    if (property.ownerId !== null) {
      throw new Error('Property is already owned');
    }
    
    // Check if player has enough money
    const player = this.gameState.players[playerId];
    
    if (player.balance < property.price) {
      throw new Error('Player does not have enough Kekels');
    }
    
    // Process the purchase
    this.playerManager.updateBalance(
      this.gameState, 
      playerId, 
      property.price, 
      'subtract'
    );
    
    this.propertyManager.updatePropertyOwner(
      this.gameState, 
      propertyId, 
      playerId
    );
    
    // Update player's properties list
    this.playerManager.addProperty(
      this.gameState, 
      playerId, 
      propertyId
    );
    
    // Trigger events
    this.triggerEvent('onPropertyPurchase', {
      gameState: this.gameState,
      playerId,
      propertyId,
      price: property.price
    });
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return {
      success: true,
      property,
      price: property.price
    };
  }

  /**
   * Check game end conditions and finalize if needed
   * @returns {boolean} - Whether the game has ended
   */
  checkGameEndConditions() {
    // Check if only one player remains solvent
    const solventPlayers = Object.values(this.gameState.players).filter(
      player => player.status !== PLAYER_STATUS.BANKRUPT
    );
    
    if (solventPlayers.length === 1) {
      // Game over, we have a winner
      this.endGame(solventPlayers[0].playerId);
      return true;
    }
    
    // Check for Meme Lord victory condition
    for (const playerId in this.gameState.players) {
      if (this.checkMemeLordVictory(playerId)) {
        this.endGame(playerId);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a player meets the Meme Lord victory condition
   * @param {string} playerId - Player to check
   * @returns {boolean} - Whether player has achieved Meme Lord status
   * @private
   */
  checkMemeLordVictory(playerId) {
    const playerProperties = this.propertyManager.getPlayerProperties(
      this.gameState, 
      playerId
    );
    
    // Check if player has at least one property in each color group
    const colorGroups = new Set();
    playerProperties.forEach(property => {
      if (property.type === 'REGULAR') {
        colorGroups.add(property.group);
      }
    });
    
    // Get total number of color groups
    const allColorGroups = new Set();
    Object.values(this.gameState.properties).forEach(property => {
      if (property.type === 'REGULAR') {
        allColorGroups.add(property.group);
      }
    });
    
    // Check if player has at least one property from each color group
    const hasAllColorGroups = colorGroups.size === allColorGroups.size;
    
    // Check if player has at least one property with a Blue Checkmark
    const hasBlueCheckmark = playerProperties.some(property => 
      property.blueCheckmark
    );
    
    return hasAllColorGroups && hasBlueCheckmark;
  }

  /**
   * End the game with a winner
   * @param {string} winnerId - ID of the winning player
   */
  endGame(winnerId) {
    this.gameState.status = GAME_STATUS.COMPLETED;
    this.gameState.winnerId = winnerId;
    
    // Calculate final net worth for all players
    Object.keys(this.gameState.players).forEach(playerId => {
      const netWorth = this.calculatePlayerNetWorth(playerId);
      this.gameState.players[playerId].netWorth = netWorth;
    });
    
    this.triggerEvent('onGameEnd', {
      gameState: this.gameState,
      winnerId,
      reason: 'victory'
    });
    
    this.triggerEvent('onStateChange', this.gameState);
  }

  /**
   * Calculate a player's total net worth
   * @param {string} playerId - Player to calculate for
   * @returns {number} - Total net worth in Kekels
   * @private
   */
  calculatePlayerNetWorth(playerId) {
    const player = this.gameState.players[playerId];
    
    // Start with cash
    let netWorth = player.balance;
    
    // Add property values
    player.properties.forEach(propertyId => {
      const property = this.gameState.properties[propertyId];
      
      // Base property value
      netWorth += property.price;
      
      // Add value of engagements
      if (property.engagements > 0) {
        // Calculate based on engagement cost
        const engagementCost = Math.floor(property.price * 0.6);
        netWorth += property.engagements * engagementCost;
      }
      
      // Add value of blue checkmark
      if (property.blueCheckmark) {
        // Calculate based on blue checkmark cost
        const blueCheckmarkCost = Math.floor(property.price * 1.5);
        netWorth += blueCheckmarkCost;
      }
    });
    
    return netWorth;
  }

  /**
   * Pay to get out of shadowban
   * @param {string} playerId - Player attempting to pay
   * @returns {Object} - Result of the payment
   */
  payToGetOutOfShadowban(playerId) {
    const player = this.gameState.players[playerId];
    
    if (!player.shadowbanned) {
      throw new Error('Player is not shadowbanned');
    }
    
    if (player.balance < 50) {
      throw new Error('Player does not have enough Kekels');
    }
    
    // Pay the fee
    this.playerManager.updateBalance(
      this.gameState, 
      playerId, 
      50, 
      'subtract'
    );
    
    // Release from shadowban
    this.playerManager.releaseFromShadowban(this.gameState, playerId);
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return {
      success: true,
      amountPaid: 50
    };
  }

  /**
   * Use a verification card to get out of shadowban
   * @param {string} playerId - Player using the card
   * @param {string} cardId - ID of the Verification card
   * @returns {Object} - Result of using the card
   */
  useVerificationCard(playerId, cardId) {
    const player = this.gameState.players[playerId];
    
    if (!player.shadowbanned) {
      throw new Error('Player is not shadowbanned');
    }
    
    // Check if player has the card
    const cardIndex = player.cards.findIndex(card => 
      card.cardId === cardId && 
      (card.name === 'Verification Check' || card.name === 'Zero-shot Learning')
    );
    
    if (cardIndex === -1) {
      throw new Error('Player does not have a valid Verification card');
    }
    
    // Use the card
    this.cardManager.removeCardFromPlayer(
      this.gameState, 
      playerId, 
      cardId
    );
    
    // Release from shadowban
    this.playerManager.releaseFromShadowban(this.gameState, playerId);
    
    this.triggerEvent('onStateChange', this.gameState);
    
    return {
      success: true,
      cardUsed: player.cards[cardIndex].name
    };
  }

  /**
   * Register an event handler
   * @param {string} eventName - Name of the event
   * @param {Function} handler - Handler function
   */
  on(eventName, handler) {
    if (this.eventHandlers[eventName]) {
      this.eventHandlers[eventName] = handler;
    }
  }

  /**
   * Trigger an event
   * @param {string} eventName - Name of the event to trigger
   * @param {any} data - Data to pass to the event handler
   * @private
   */
  triggerEvent(eventName, data) {
    if (this.eventHandlers[eventName]) {
      this.eventHandlers[eventName](data);
    }
  }

  /**
   * Get a copy of the current game state
   * @returns {Object} - Current game state
   */
  getGameState() {
    return JSON.parse(JSON.stringify(this.gameState));
  }
}

export default GameEngine;