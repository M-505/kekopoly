import { PLAYER_STATUS } from '../models/types';

/**
 * PlayerManager handles all player-related operations in the game
 */
class PlayerManager {
  /**
   * Add a new player to the game state
   * @param {Object} gameState - Current game state
   * @param {Object} playerData - Player data to add
   * @returns {Object} - Added player data
   */
  addPlayer(gameState, playerData) {
    const playerId = playerData.playerId || crypto.randomUUID?.() || Date.now().toString();
    
    // Create default player object with provided data
    const defaultPlayer = {
      playerId,
      userId: null,
      walletAddress: null,
      characterToken: null,
      position: 1, // Start position
      balance: 0, // Will be set to 2000 when game starts
      cards: [],
      shadowbanned: false,
      shadowbanRemainingTurns: 0,
      status: PLAYER_STATUS.ACTIVE,
      properties: [],
      netWorth: 0,
      doublesCount: 0
    };
    
    const player = { ...defaultPlayer, ...playerData };
    
    // Add to game state
    gameState.players[playerId] = player;
    
    return player;
  }
  
  /**
   * Remove a player from the game
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player to remove
   */
  removePlayer(gameState, playerId) {
    if (gameState.players[playerId]) {
      delete gameState.players[playerId];
      
      // Remove from turn order if present
      const index = gameState.turnOrder.indexOf(playerId);
      if (index !== -1) {
        gameState.turnOrder.splice(index, 1);
      }
      
      // If it was this player's turn, move to the next player
      if (gameState.currentTurn === playerId && gameState.turnOrder.length > 0) {
        const nextIndex = index % gameState.turnOrder.length;
        gameState.currentTurn = gameState.turnOrder[nextIndex];
      }
    }
  }
  
  /**
   * Update a player's position on the board
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player to update
   * @param {number} newPosition - New board position
   * @returns {boolean} - Whether update was successful
   */
  updatePosition(gameState, playerId, newPosition) {
    if (!gameState.players[playerId]) return false;
    
    gameState.players[playerId].position = newPosition;
    return true;
  }
  
  /**
   * Update a player's balance
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player to update
   * @param {number} amount - Amount to update
   * @param {string} operation - 'add', 'subtract', or 'set'
   * @returns {Object} - New balance info
   */
  updateBalance(gameState, playerId, amount, operation) {
    if (!gameState.players[playerId]) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    const player = gameState.players[playerId];
    const previousBalance = player.balance;
    
    if (operation === 'add') {
      player.balance += amount;
    } else if (operation === 'subtract') {
      player.balance -= amount;
      
      // Check if player is bankrupt
      if (player.balance < 0) {
        return this.handlePotentialBankruptcy(gameState, playerId, -player.balance);
      }
    } else if (operation === 'set') {
      player.balance = amount;
    }
    
    return {
      playerId,
      previousBalance,
      newBalance: player.balance,
      difference: player.balance - previousBalance
    };
  }
  
  /**
   * Handle a player who might go bankrupt
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @param {number} deficit - Amount player is short
   * @returns {Object} - Result of bankruptcy handling
   * @private
   */
  handlePotentialBankruptcy(gameState, playerId, deficit) {
    const player = gameState.players[playerId];
    
    // Calculate player's total assets
    const liquidatableValue = this.calculateLiquidatableAssets(gameState, playerId);
    
    if (liquidatableValue < deficit) {
      // Player is bankrupt - can't cover deficit even by liquidating everything
      return this.declareBankruptcy(gameState, playerId);
    } else {
      // Player can potentially cover by mortgaging or selling
      return {
        playerId,
        previousBalance: player.balance + deficit,
        newBalance: player.balance,
        difference: -deficit,
        potentialBankruptcy: true,
        liquidatableValue,
        needsToRaise: deficit
      };
    }
  }
  
  /**
   * Calculate how much a player could raise by liquidating assets
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {number} - Total liquidatable value
   * @private
   */
  calculateLiquidatableAssets(gameState, playerId) {
    const player = gameState.players[playerId];
    let totalValue = 0;
    
    // Add value from unmortgaged properties
    player.properties.forEach(propertyId => {
      const property = gameState.properties[propertyId];
      
      if (!property.mortgaged) {
        // Property can be mortgaged for half its value
        totalValue += property.price / 2;
      }
      
      // Add value from selling engagements
      if (property.engagements > 0) {
        const engagementCost = Math.floor(property.price * 0.6);
        const sellValue = Math.floor(engagementCost / 2);
        totalValue += property.engagements * sellValue;
      }
      
      // Add value from selling blue checkmark
      if (property.blueCheckmark) {
        const blueCheckmarkCost = Math.floor(property.price * 1.5);
        const sellValue = Math.floor(blueCheckmarkCost / 2);
        totalValue += sellValue;
      }
    });
    
    return totalValue;
  }
  
  /**
   * Declare a player bankrupt
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of bankrupt player
   * @returns {Object} - Bankruptcy result
   */
  declareBankruptcy(gameState, playerId) {
    const player = gameState.players[playerId];
    player.status = PLAYER_STATUS.BANKRUPT;
    player.balance = 0;
    
    // Transfer all properties to the bank (or to a creditor if implemented)
    player.properties.forEach(propertyId => {
      const property = gameState.properties[propertyId];
      property.ownerId = null;
      property.engagements = 0;
      property.blueCheckmark = false;
      property.mortgaged = false;
      property.rentCurrent = property.rentBase;
    });
    
    // Clear player's properties
    player.properties = [];
    
    return {
      playerId,
      previousBalance: player.balance,
      newBalance: 0,
      difference: -player.balance,
      bankrupt: true
    };
  }
  
  /**
   * Send a player to Shadowban (jail)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {boolean} - Whether operation was successful
   */
  sendToShadowban(gameState, playerId) {
    if (!gameState.players[playerId]) return false;
    
    const player = gameState.players[playerId];
    player.shadowbanned = true;
    player.shadowbanRemainingTurns = 3;
    
    // Move player to the Shadowban position (typically position 10)
    player.position = 10;
    
    return true;
  }
  
  /**
   * Release a player from Shadowban
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {boolean} - Whether operation was successful
   */
  releaseFromShadowban(gameState, playerId) {
    if (!gameState.players[playerId]) return false;
    
    const player = gameState.players[playerId];
    player.shadowbanned = false;
    player.shadowbanRemainingTurns = 0;
    
    return true;
  }
  
  /**
   * Add a property to a player's portfolio
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @param {string} propertyId - ID of property
   * @returns {boolean} - Whether operation was successful
   */
  addProperty(gameState, playerId, propertyId) {
    if (!gameState.players[playerId]) return false;
    
    const player = gameState.players[playerId];
    
    if (!player.properties.includes(propertyId)) {
      player.properties.push(propertyId);
    }
    
    return true;
  }
  
  /**
   * Remove a property from a player's portfolio
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @param {string} propertyId - ID of property
   * @returns {boolean} - Whether operation was successful
   */
  removeProperty(gameState, playerId, propertyId) {
    if (!gameState.players[playerId]) return false;
    
    const player = gameState.players[playerId];
    const index = player.properties.indexOf(propertyId);
    
    if (index !== -1) {
      player.properties.splice(index, 1);
      return true;
    }
    
    return false;
  }
  
  /**
   * Transfer Kekels between players
   * @param {Object} gameState - Current game state
   * @param {string} fromPlayerId - ID of sending player
   * @param {string} toPlayerId - ID of receiving player
   * @param {number} amount - Amount to transfer
   * @returns {Object} - Transfer result
   */
  transferKekels(gameState, fromPlayerId, toPlayerId, amount) {
    if (!gameState.players[fromPlayerId] || !gameState.players[toPlayerId]) {
      throw new Error('One or both players not found');
    }
    
    if (amount <= 0) {
      throw new Error('Transfer amount must be positive');
    }
    
    const fromPlayer = gameState.players[fromPlayerId];
    const toPlayer = gameState.players[toPlayerId];
    
    if (fromPlayer.balance < amount) {
      return this.handlePotentialBankruptcy(gameState, fromPlayerId, amount - fromPlayer.balance);
    }
    
    // Perform the transfer
    fromPlayer.balance -= amount;
    toPlayer.balance += amount;
    
    return {
      fromPlayerId,
      toPlayerId,
      amount,
      fromBalance: fromPlayer.balance,
      toBalance: toPlayer.balance,
      success: true
    };
  }
  
  /**
   * Check if a player owns all properties in a color group
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @param {string} colorGroup - Color group to check
   * @returns {boolean} - Whether player owns the whole group
   */
  ownsColorGroup(gameState, playerId, colorGroup) {
    if (!gameState.players[playerId]) return false;
    
    // Find all properties in this color group
    const propertiesInGroup = Object.values(gameState.properties).filter(
      property => property.group === colorGroup && property.type === 'REGULAR'
    );
    
    // Check if player owns all of them
    return propertiesInGroup.every(property => property.ownerId === playerId);
  }
  
  /**
   * Get all properties owned by a player
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Array} - Array of property objects
   */
  getPlayerProperties(gameState, playerId) {
    if (!gameState.players[playerId]) return [];
    
    return gameState.players[playerId].properties.map(
      propertyId => gameState.properties[propertyId]
    );
  }
  
  /**
   * Get all color groups a player has monopoly on
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Array} - Array of color group names
   */
  getPlayerMonopolies(gameState, playerId) {
    if (!gameState.players[playerId]) return [];
    
    // Get unique color groups
    const allColorGroups = [...new Set(
      Object.values(gameState.properties)
        .filter(property => property.type === 'REGULAR')
        .map(property => property.group)
    )];
    
    // Filter to only those the player has monopoly on
    return allColorGroups.filter(group => 
      this.ownsColorGroup(gameState, playerId, group)
    );
  }
}

export default PlayerManager;