/**
 * RuleEngine handles special game rules and validates game actions
 */
class RuleEngine {
  /**
   * Initialize rule engine
   * @param {Object} dependencies - Engine dependencies
   * @param {Object} dependencies.propertyManager - Property manager
   * @param {Object} dependencies.playerManager - Player manager
   * @param {Object} dependencies.diceManager - Dice manager
   */
  constructor(dependencies) {
    this.propertyManager = dependencies.propertyManager;
    this.playerManager = dependencies.playerManager;
    this.diceManager = dependencies.diceManager;
  }
  
  /**
   * Check if a player can invoke Kek's Blessing
   * (Avoid paying rent when landing on another player's property)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of check
   */
  canInvokeKeksBlessing(gameState, playerId) {
    const player = gameState.players[playerId];
    
    if (!player) {
      return { canInvoke: false, reason: 'Player not found' };
    }
    
    // Check if player has already used Kek's Blessing
    if (player.usedKeksBlessing) {
      return { canInvoke: false, reason: 'Already used Kek\'s Blessing this game' };
    }
    
    // Check if player owns all Temple of Kek properties
    const templeOfKekProperties = Object.values(gameState.properties).filter(
      property => property.group === 'Temple of Kek'
    );
    
    if (templeOfKekProperties.length === 0) {
      return { canInvoke: false, reason: 'No Temple of Kek properties defined' };
    }
    
    const ownsAllTemples = templeOfKekProperties.every(
      property => property.ownerId === playerId
    );
    
    if (!ownsAllTemples) {
      return { canInvoke: false, reason: 'Must own all Temple of Kek properties' };
    }
    
    return { canInvoke: true };
  }
  
  /**
   * Invoke Kek's Blessing to avoid paying rent
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of invoking blessing
   */
  invokeKeksBlessing(gameState, playerId) {
    const checkResult = this.canInvokeKeksBlessing(gameState, playerId);
    
    if (!checkResult.canInvoke) {
      return { success: false, reason: checkResult.reason };
    }
    
    // Mark blessing as used
    gameState.players[playerId].usedKeksBlessing = true;
    
    return {
      success: true,
      message: 'Kek\'s Blessing invoked - rent payment avoided'
    };
  }
  
  /**
   * Check if a player can make a Giga Chad Move
   * (Challenge owner to dice roll to avoid/double rent)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of check
   */
  canMakeGigaChadMove(gameState, playerId) {
    const player = gameState.players[playerId];
    
    if (!player) {
      return { canMake: false, reason: 'Player not found' };
    }
    
    // Check if player has already used Giga Chad Move
    if (player.usedGigaChadMove) {
      return { canMake: false, reason: 'Already used Giga Chad Move this game' };
    }
    
    return { canMake: true };
  }
  
  /**
   * Make a Giga Chad Move to challenge for rent
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of challenging player
   * @param {string} propertyOwnerId - ID of property owner
   * @returns {Object} - Result of challenge
   */
  makeGigaChadMove(gameState, playerId, propertyOwnerId) {
    const checkResult = this.canMakeGigaChadMove(gameState, playerId);
    
    if (!checkResult.canMake) {
      return { success: false, reason: checkResult.reason };
    }
    
    // Roll for both players
    const challengerRoll = this.diceManager.rollDie();
    const ownerRoll = this.diceManager.rollDie();
    
    // Mark move as used
    gameState.players[playerId].usedGigaChadMove = true;
    
    // Determine outcome
    if (challengerRoll > ownerRoll) {
      // Challenger wins - no rent
      return {
        success: true,
        message: 'Giga Chad Move successful - no rent payment',
        challengerRoll,
        ownerRoll,
        result: 'no_rent'
      };
    } else {
      // Owner wins - double rent
      return {
        success: true,
        message: 'Giga Chad Move failed - double rent payment',
        challengerRoll,
        ownerRoll,
        result: 'double_rent'
      };
    }
  }
  
  /**
   * Check if a player can choose to be "redpilled"
   * (Skip collecting 100 Kekels to draw a Redpill Card)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of check
   */
  canTakeRedpill(gameState, playerId) {
    // Check if player is passing START
    const player = gameState.players[playerId];
    
    if (!player) {
      return { canTake: false, reason: 'Player not found' };
    }
    
    // This would be called when player passes START,
    // so in actual implementation, we'd check more conditions
    
    return { canTake: true };
  }
  
  /**
   * Take the redpill (draw Redpill card instead of collecting 100 Kekels)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @param {Function} drawCardFunction - Function to draw card
   * @returns {Object} - Result of taking redpill
   */
  takeRedpill(gameState, playerId, drawCardFunction) {
    const checkResult = this.canTakeRedpill(gameState, playerId);
    
    if (!checkResult.canTake) {
      return { success: false, reason: checkResult.reason };
    }
    
    // Draw a Redpill card instead of collecting 100 Kekels
    const drawResult = drawCardFunction(gameState, playerId, 'redpill');
    
    return {
      success: drawResult.success,
      message: 'Took the Redpill instead of collecting Kekels',
      drawResult
    };
  }
  
  /**
   * Check if a player can declare "Dankest Meme"
   * (Get 50 Kekels from each player if approved)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of check
   */
  canDeclareDankestMeme(gameState, playerId) {
    const player = gameState.players[playerId];
    
    if (!player) {
      return { canDeclare: false, reason: 'Player not found' };
    }
    
    // Check if player has already used Dankest Meme
    if (player.usedDankestMeme) {
      return { canDeclare: false, reason: 'Already declared Dankest Meme this game' };
    }
    
    // Check if player owns at least 3 properties
    if (player.properties.length < 3) {
      return { canDeclare: false, reason: 'Must own at least 3 properties' };
    }
    
    return { canDeclare: true };
  }
  
  /**
   * Declare Dankest Meme for vote
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of declaration
   */
  declareDankestMeme(gameState, playerId) {
    const checkResult = this.canDeclareDankestMeme(gameState, playerId);
    
    if (!checkResult.canDeclare) {
      return { success: false, reason: checkResult.reason };
    }
    
    // Mark as used
    gameState.players[playerId].usedDankestMeme = true;
    
    // Return pending vote - in real implementation, this would
    // trigger a voting mechanism among other players
    return {
      success: true,
      message: 'Dankest Meme declared - voting required',
      pendingVote: true,
      votingPlayers: Object.keys(gameState.players).filter(id => id !== playerId)
    };
  }
  
  /**
   * Process Dankest Meme vote results
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player who declared
   * @param {boolean} approved - Whether declaration was approved
   * @returns {Object} - Result of vote
   */
  processDankestMemeVote(gameState, playerId, approved) {
    if (approved) {
      // Each player pays 50 Kekels to declarer
      let totalCollected = 0;
      
      Object.keys(gameState.players).forEach(otherPlayerId => {
        if (otherPlayerId !== playerId) {
          const otherPlayer = gameState.players[otherPlayerId];
          const amount = Math.min(50, otherPlayer.balance);
          
          otherPlayer.balance -= amount;
          totalCollected += amount;
        }
      });
      
      // Add to player's balance
      gameState.players[playerId].balance += totalCollected;
      
      return {
        success: true,
        approved: true,
        amountCollected: totalCollected
      };
    } else {
      // Declarer pays 50 Kekels to each player
      const player = gameState.players[playerId];
      const otherPlayerCount = Object.keys(gameState.players).length - 1;
      
      // Calculate total to pay
      const totalToPay = 50 * otherPlayerCount;
      const canPay = player.balance >= totalToPay;
      
      if (canPay) {
        // Full payment
        player.balance -= totalToPay;
        
        // Distribute to other players
        Object.keys(gameState.players).forEach(otherPlayerId => {
          if (otherPlayerId !== playerId) {
            gameState.players[otherPlayerId].balance += 50;
          }
        });
        
        return {
          success: true,
          approved: false,
          amountPaid: totalToPay
        };
      } else {
        // Partial payment (bankruptcy)
        const amountPerPlayer = Math.floor(player.balance / otherPlayerCount);
        const totalPaid = amountPerPlayer * otherPlayerCount;
        
        // Distribute what player can pay
        Object.keys(gameState.players).forEach(otherPlayerId => {
          if (otherPlayerId !== playerId) {
            gameState.players[otherPlayerId].balance += amountPerPlayer;
          }
        });
        
        // Player goes bankrupt
        player.balance = 0;
        player.status = 'BANKRUPT';
        
        return {
          success: true,
          approved: false,
          amountPaid: totalPaid,
          bankrupt: true
        };
      }
    }
  }
  
  /**
   * Check if properties have meme royalties
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property landed on
   * @returns {Object} - Result of check
   */
  checkMemeRoyalties(gameState, propertyId) {
    const property = gameState.properties[propertyId];
    
    if (!property) {
      return { hasRoyalty: false };
    }
    
    // Check if property has a meme name (set when first engagement is built)
    if (property.memeName && property.engagements > 0) {
      return {
        hasRoyalty: true,
        memeName: property.memeName,
        royaltyAmount: 10
      };
    }
    
    return { hasRoyalty: false };
  }
  
  /**
   * Pay meme royalty when not saying the meme name
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player paying royalty
   * @param {string} propertyId - ID of property landed on
   * @returns {Object} - Result of royalty payment
   */
  payMemeRoyalty(gameState, playerId, propertyId) {
    const royaltyCheck = this.checkMemeRoyalties(gameState, propertyId);
    
    if (!royaltyCheck.hasRoyalty) {
      return { success: false, reason: 'No royalty required' };
    }
    
    const property = gameState.properties[propertyId];
    const player = gameState.players[playerId];
    
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }
    
    // Pay the royalty to property owner
    const amount = Math.min(royaltyCheck.royaltyAmount, player.balance);
    
    if (amount > 0 && property.ownerId) {
      player.balance -= amount;
      
      if (gameState.players[property.ownerId]) {
        gameState.players[property.ownerId].balance += amount;
      }
      
      return {
        success: true,
        amount,
        memeName: royaltyCheck.memeName,
        recipient: property.ownerId
      };
    }
    
    return {
      success: false,
      reason: 'Could not process royalty payment'
    };
  }
  
  /**
   * Check if player can initiate a Blockchain Fork
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of check
   */
  canInitiateBlockchainFork(gameState, playerId) {
    const player = gameState.players[playerId];
    
    if (!player) {
      return { canInitiate: false, reason: 'Player not found' };
    }
    
    // Check if player landed on START and rolled doubles on their next turn
    if (player.position !== 0) {
      return { canInitiate: false, reason: 'Must be on START position' };
    }
    
    if (!gameState.lastDiceRoll || !this.diceManager.isDoubles(gameState.lastDiceRoll)) {
      return { canInitiate: false, reason: 'Must roll doubles' };
    }
    
    return { canInitiate: true };
  }
  
  /**
   * Initiate a Blockchain Fork
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of fork
   */
  initiateBlockchainFork(gameState, playerId) {
    const checkResult = this.canInitiateBlockchainFork(gameState, playerId);
    
    if (!checkResult.canInitiate) {
      return { success: false, reason: checkResult.reason };
    }
    
    // Roll to determine if values increase or decrease
    const roll = this.diceManager.rollDie();
    const valueChange = roll <= 3 ? -0.25 : 0.25; // -25% or +25%
    
    // Apply to all properties
    Object.values(gameState.properties).forEach(property => {
      property.price = Math.floor(property.price * (1 + valueChange));
      property.rentBase = Math.floor(property.rentBase * (1 + valueChange));
      
      // Update current rent based on new base rent
      this.propertyManager.updatePropertyRent(gameState, property.propertyId);
    });
    
    return {
      success: true,
      roll,
      valueChangePercent: valueChange * 100,
      valueIncreased: valueChange > 0
    };
  }
  
  /**
   * Check if player can use the "Touch Grass" option on Free Space
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of check
   */
  canTouchGrass(gameState, playerId) {
    const player = gameState.players[playerId];
    
    if (!player) {
      return { canTouch: false, reason: 'Player not found' };
    }
    
    // Check if player is on a Free Space
    const position = player.position;
    const onFreeSpace = position === 20; // Free Space position
    
    if (!onFreeSpace) {
      return { canTouch: false, reason: 'Must be on Free Space' };
    }
    
    return { canTouch: true };
  }
  
  /**
   * Use the Touch Grass option
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of touching grass
   */
  touchGrass(gameState, playerId) {
    const checkResult = this.canTouchGrass(gameState, playerId);
    
    if (!checkResult.canTouch) {
      return { success: false, reason: checkResult.reason };
    }
    
    // Mark player to skip next turn
    gameState.players[playerId].skipNextTurn = true;
    
    // Give 150 Kekels
    gameState.players[playerId].balance += 150;
    
    return {
      success: true,
      message: 'Touched Grass - collect 150 Kekels but skip next turn',
      kekelEarned: 150
    };
  }
  
  /**
   * Check if a player can stream a property (Gaming Chair space)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Result of check
   */
  canStreamProperty(gameState, playerId) {
    const player = gameState.players[playerId];
    
    if (!player) {
      return { canStream: false, reason: 'Player not found' };
    }
    
    // Check if player is on Gaming Chair space
    // The position would depend on your board layout
    const position = player.position;
    const onGamingChair = position === 38; // Example position
    
    if (!onGamingChair) {
      return { canStream: false, reason: 'Must be on Gaming Chair space' };
    }
    
    // Check if player owns any properties
    if (player.properties.length === 0) {
      return { canStream: false, reason: 'You don\'t own any properties to stream' };
    }
    
    return { 
      canStream: true,
      properties: player.properties.map(
        propertyId => gameState.properties[propertyId]
      )
    };
  }
  
  /**
   * Stream a property (double its rent for 3 rounds)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @param {string} propertyId - ID of property to stream
   * @returns {Object} - Result of streaming
   */
  streamProperty(gameState, playerId, propertyId) {
    const checkResult = this.canStreamProperty(gameState, playerId);
    
    if (!checkResult.canStream) {
      return { success: false, reason: checkResult.reason };
    }
    
    const property = gameState.properties[propertyId];
    
    if (!property) {
      return { success: false, reason: 'Property not found' };
    }
    
    if (property.ownerId !== playerId) {
      return { success: false, reason: 'You don\'t own this property' };
    }
    
    // Add streaming effect to property
    const streamEffect = {
      type: 'DOUBLE_RENT',
      appliedBy: playerId,
      expiresAfterTurns: 3
    };
    
    this.propertyManager.addSpecialEffect(gameState, propertyId, streamEffect);
    
    return {
      success: true,
      message: `${property.name} is now being streamed - double rent for 3 rounds`,
      property
    };
  }
}

export default RuleEngine;