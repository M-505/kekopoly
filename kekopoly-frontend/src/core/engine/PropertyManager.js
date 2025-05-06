import { SPECIAL_EFFECT_TYPE } from '../models/types';

/**
 * PropertyManager handles all property-related operations in the game
 */
class PropertyManager {
  /**
   * Add a property to the game state
   * @param {Object} gameState - Current game state
   * @param {Object} propertyData - Property data to add
   * @returns {Object} - Added property data
   */
  addProperty(gameState, propertyData) {
    const propertyId = propertyData.propertyId || `property_${Date.now()}`;
    
    // Create default property object with provided data
    const defaultProperty = {
      propertyId,
      name: 'Unnamed Property',
      type: 'REGULAR',
      group: 'none',
      position: 0,
      ownerId: null,
      price: 100,
      rentBase: 10,
      rentCurrent: 10,
      mortgaged: false,
      engagements: 0,
      blueCheckmark: false,
      specialEffects: [],
      memeName: null
    };
    
    const property = { ...defaultProperty, ...propertyData };
    
    // Add to game state
    gameState.properties[propertyId] = property;
    
    return property;
  }
  
  /**
   * Update property owner
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property to update
   * @param {string|null} ownerId - ID of new owner, or null for bank
   * @returns {boolean} - Whether update was successful
   */
  updatePropertyOwner(gameState, propertyId, ownerId) {
    if (!gameState.properties[propertyId]) return false;
    
    gameState.properties[propertyId].ownerId = ownerId;
    
    // Reset engagements and blue checkmark when ownership changes
    if (ownerId === null) {
      gameState.properties[propertyId].engagements = 0;
      gameState.properties[propertyId].blueCheckmark = false;
      gameState.properties[propertyId].memeName = null;
    }
    
    // Update rent based on new ownership situation
    this.updatePropertyRent(gameState, propertyId);
    
    return true;
  }
  
  /**
   * Transfer a property between players
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property to transfer
   * @param {string} fromPlayerId - ID of current owner
   * @param {string} toPlayerId - ID of new owner
   * @returns {boolean} - Whether transfer was successful
   */
  transferProperty(gameState, propertyId, fromPlayerId, toPlayerId) {
    const property = gameState.properties[propertyId];
    
    if (!property || property.ownerId !== fromPlayerId) {
      return false;
    }
    
    // Update the property owner
    property.ownerId = toPlayerId;
    
    // Update player's property lists
    if (gameState.players[fromPlayerId]) {
      const fromPlayer = gameState.players[fromPlayerId];
      const index = fromPlayer.properties.indexOf(propertyId);
      if (index !== -1) {
        fromPlayer.properties.splice(index, 1);
      }
    }
    
    if (gameState.players[toPlayerId]) {
      const toPlayer = gameState.players[toPlayerId];
      if (!toPlayer.properties.includes(propertyId)) {
        toPlayer.properties.push(propertyId);
      }
    }
    
    // Update rent based on new ownership situation
    this.updatePropertyRent(gameState, propertyId);
    
    return true;
  }
  
  /**
   * Process rent payment
   * @param {Object} gameState - Current game state
   * @param {string} payerId - ID of player paying rent
   * @param {string} propertyId - ID of property landed on
   * @returns {Object} - Result of rent payment
   */
  processRentPayment(gameState, payerId, propertyId) {
    const property = gameState.properties[propertyId];
    
    if (!property || property.ownerId === null || property.ownerId === payerId) {
      return { success: false, reason: 'No rent due' };
    }
    
    if (property.mortgaged) {
      return { success: false, reason: 'Property is mortgaged' };
    }
    
    const payer = gameState.players[payerId];
    const owner = gameState.players[property.ownerId];
    
    if (!payer || !owner) {
      return { success: false, reason: 'Invalid players' };
    }
    
    // Calculate rent amount
    let rentAmount = property.rentCurrent;
    
    // Apply modifiers from special effects
    rentAmount = this.applyRentModifiers(gameState, property, rentAmount, payerId);
    
    // Player pays rent to owner
    if (payer.balance < rentAmount) {
      // Player can't afford rent - handle potential bankruptcy
      const result = this.handleInsufficientFunds(gameState, payerId, property.ownerId, rentAmount);
      return {
        success: result.success,
        reason: result.reason || 'Insufficient funds',
        propertyId,
        owner: property.ownerId,
        amountDue: rentAmount,
        amountPaid: result.amountPaid || 0,
        bankrupt: result.bankrupt || false
      };
    }
    
    // Process standard rent payment
    payer.balance -= rentAmount;
    owner.balance += rentAmount;
    
    return {
      success: true,
      propertyId,
      owner: property.ownerId,
      amountPaid: rentAmount
    };
  }
  
  /**
   * Apply rent modifiers from special effects
   * @param {Object} gameState - Current game state
   * @param {Object} property - Property object
   * @param {number} baseRent - Base rent amount
   * @param {string} payerId - ID of player paying rent
   * @returns {number} - Modified rent amount
   * @private
   */
  applyRentModifiers(gameState, property, baseRent, payerId) {
    let rentAmount = baseRent;
    
    // Check for special effects on the property
    property.specialEffects.forEach(effect => {
      if (effect.type === SPECIAL_EFFECT_TYPE.DOUBLE_RENT) {
        rentAmount *= 2;
      } else if (effect.type === SPECIAL_EFFECT_TYPE.HALF_RENT) {
        rentAmount = Math.floor(rentAmount / 2);
      }
    });
    
    // Check if payer is shadowbanned (which halves rent they pay)
    if (gameState.players[payerId]?.shadowbanned) {
      rentAmount = Math.floor(rentAmount / 2);
    }
    
    // Apply market condition modifiers
    if (gameState.marketCondition === 'BULL') {
      rentAmount = Math.floor(rentAmount * 1.1); // 10% increase
    } else if (gameState.marketCondition === 'CRASH') {
      rentAmount = Math.floor(rentAmount * 0.9); // 10% decrease
    }
    
    return rentAmount;
  }
  
  /**
   * Handle case where player doesn't have enough money for rent
   * @param {Object} gameState - Current game state
   * @param {string} payerId - ID of player who needs to pay
   * @param {string} receiverId - ID of player who should receive payment
   * @param {number} amount - Amount due
   * @returns {Object} - Result of handling
   * @private
   */
  handleInsufficientFunds(gameState, payerId, receiverId, amount) {
    const payer = gameState.players[payerId];
    
    // Calculate player's total assets
    const totalAssets = this.calculatePlayerAssets(gameState, payerId);
    
    if (totalAssets < amount) {
      // Player is bankrupt - give everything to receiver
      const availableAmount = payer.balance;
      payer.balance = 0;
      
      if (gameState.players[receiverId]) {
        gameState.players[receiverId].balance += availableAmount;
      }
      
      // Transfer all properties
      payer.properties.forEach(propId => {
        this.transferProperty(gameState, propId, payerId, receiverId);
      });
      
      // Mark player as bankrupt
      payer.status = 'BANKRUPT';
      
      return {
        success: false,
        reason: 'Bankruptcy',
        amountPaid: availableAmount,
        bankrupt: true
      };
    } else {
      // Player has enough assets but needs to mortgage or sell
      return {
        success: false,
        reason: 'Need to raise funds',
        amountDue: amount,
        availableAssets: totalAssets,
        needsToRaise: amount - payer.balance
      };
    }
  }
  
  /**
   * Calculate total asset value of a player
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {number} - Total value of assets
   * @private
   */
  calculatePlayerAssets(gameState, playerId) {
    const player = gameState.players[playerId];
    if (!player) return 0;
    
    let totalValue = player.balance;
    
    // Add value of properties and buildings
    player.properties.forEach(propertyId => {
      const property = gameState.properties[propertyId];
      if (!property) return;
      
      if (!property.mortgaged) {
        totalValue += property.price;
      } else {
        // Mortgaged properties are worth the mortgage value
        totalValue += Math.floor(property.price / 2);
      }
      
      // Add value of engagements
      if (property.engagements > 0) {
        // Each engagement costs approximately 60% of property value
        const engagementValue = Math.floor(property.price * 0.6);
        totalValue += property.engagements * engagementValue;
      }
      
      // Add value of blue checkmark
      if (property.blueCheckmark) {
        // Blue checkmark costs approximately 150% of property value
        const blueCheckmarkValue = Math.floor(property.price * 1.5);
        totalValue += blueCheckmarkValue;
      }
    });
    
    return totalValue;
  }
  
  /**
   * Toggle mortgage status of a property
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property
   * @returns {Object} - Result of mortgage operation
   */
  toggleMortgage(gameState, propertyId) {
    const property = gameState.properties[propertyId];
    
    if (!property) {
      return { success: false, reason: 'Property not found' };
    }
    
    if (property.ownerId === null) {
      return { success: false, reason: 'Property not owned' };
    }
    
    const owner = gameState.players[property.ownerId];
    
    if (!owner) {
      return { success: false, reason: 'Owner not found' };
    }
    
    const mortgageValue = Math.floor(property.price / 2);
    
    if (!property.mortgaged) {
      // Mortgage the property
      property.mortgaged = true;
      owner.balance += mortgageValue;
      
      return {
        success: true,
        mortgaged: true,
        propertyId,
        mortgageValue,
        newBalance: owner.balance
      };
    } else {
      // Unmortgage the property - costs 10% interest
      const unmortgageCost = Math.floor(mortgageValue * 1.1);
      
      if (owner.balance < unmortgageCost) {
        return {
          success: false,
          reason: 'Insufficient funds to unmortgage',
          unmortgageCost,
          shortfall: unmortgageCost - owner.balance
        };
      }
      
      property.mortgaged = false;
      owner.balance -= unmortgageCost;
      
      return {
        success: true,
        mortgaged: false,
        propertyId,
        unmortgageCost,
        newBalance: owner.balance
      };
    }
  }
  
  /**
   * Add an engagement (house) to a property
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property
   * @returns {Object} - Result of adding engagement
   */
  addEngagement(gameState, propertyId) {
    const property = gameState.properties[propertyId];
    
    if (!property) {
      return { success: false, reason: 'Property not found' };
    }
    
    if (property.ownerId === null) {
      return { success: false, reason: 'Property not owned' };
    }
    
    if (property.type !== 'REGULAR') {
      return { success: false, reason: 'Cannot add engagements to this property type' };
    }
    
    if (property.engagements >= 4) {
      return { success: false, reason: 'Maximum engagements reached' };
    }
    
    if (property.blueCheckmark) {
      return { success: false, reason: 'Property already has a blue checkmark' };
    }
    
    if (property.mortgaged) {
      return { success: false, reason: 'Cannot build on mortgaged property' };
    }
    
    const owner = gameState.players[property.ownerId];
    
    // Check if player owns all properties in the group
    const propertiesInGroup = Object.values(gameState.properties).filter(
      p => p.group === property.group && p.type === 'REGULAR'
    );
    
    const ownsAll = propertiesInGroup.every(p => p.ownerId === property.ownerId);
    
    if (!ownsAll) {
      return { success: false, reason: 'Must own all properties in color group' };
    }
    
    // Check if engagements are balanced across the group
    const minEngagements = Math.min(...propertiesInGroup.map(p => p.engagements));
    if (property.engagements > minEngagements) {
      return { 
        success: false, 
        reason: 'Must build evenly across color group'
      };
    }
    
    // Calculate cost (approximately 60% of property price)
    const engagementCost = Math.floor(property.price * 0.6);
    
    if (owner.balance < engagementCost) {
      return {
        success: false,
        reason: 'Insufficient funds',
        cost: engagementCost,
        shortfall: engagementCost - owner.balance
      };
    }
    
    // Add the engagement
    property.engagements += 1;
    owner.balance -= engagementCost;
    
    // If this is the first engagement, set meme name (in a real implementation, 
    // this would be set by player input)
    if (property.engagements === 1 && !property.memeName) {
      property.memeName = `Meme for ${property.name}`;
    }
    
    // Update rent value
    this.updatePropertyRent(gameState, propertyId);
    
    return {
      success: true,
      propertyId,
      newEngagementLevel: property.engagements,
      cost: engagementCost,
      newBalance: owner.balance
    };
  }
  
  /**
   * Add a blue checkmark (hotel) to a property
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property
   * @returns {Object} - Result of adding blue checkmark
   */
  addBlueCheckmark(gameState, propertyId) {
    const property = gameState.properties[propertyId];
    
    if (!property) {
      return { success: false, reason: 'Property not found' };
    }
    
    if (property.ownerId === null) {
      return { success: false, reason: 'Property not owned' };
    }
    
    if (property.type !== 'REGULAR') {
      return { success: false, reason: 'Cannot add blue checkmark to this property type' };
    }
    
    if (property.engagements < 4) {
      return { success: false, reason: 'Need 4 engagements before adding blue checkmark' };
    }
    
    if (property.blueCheckmark) {
      return { success: false, reason: 'Property already has a blue checkmark' };
    }
    
    if (property.mortgaged) {
      return { success: false, reason: 'Cannot build on mortgaged property' };
    }
    
    const owner = gameState.players[property.ownerId];
    
    // Calculate cost (approximately 150% of property price)
    const blueCheckmarkCost = Math.floor(property.price * 1.5);
    
    if (owner.balance < blueCheckmarkCost) {
      return {
        success: false,
        reason: 'Insufficient funds',
        cost: blueCheckmarkCost,
        shortfall: blueCheckmarkCost - owner.balance
      };
    }
    
    // Add the blue checkmark
    property.blueCheckmark = true;
    property.engagements = 0; // Replace engagements with blue checkmark
    owner.balance -= blueCheckmarkCost;
    
    // Update rent value
    this.updatePropertyRent(gameState, propertyId);
    
    // Start Viral Trend special effect
    this.addSpecialEffect(gameState, propertyId, {
      type: SPECIAL_EFFECT_TYPE.VIRAL_TREND,
      appliedBy: property.ownerId,
      expiresAfterTurns: Object.keys(gameState.players).length, // One full round
      data: {
        paymentAmount: 10
      }
    });
    
    return {
      success: true,
      propertyId,
      cost: blueCheckmarkCost,
      newBalance: owner.balance
    };
  }
  
  /**
   * Remove an engagement from a property
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property
   * @returns {Object} - Result of removing engagement
   */
  removeEngagement(gameState, propertyId) {
    const property = gameState.properties[propertyId];
    
    if (!property) {
      return { success: false, reason: 'Property not found' };
    }
    
    if (property.ownerId === null) {
      return { success: false, reason: 'Property not owned' };
    }
    
    if (property.engagements <= 0) {
      return { success: false, reason: 'No engagements to remove' };
    }
    
    const owner = gameState.players[property.ownerId];
    
    // Check if engagements are balanced across the group
    const propertiesInGroup = Object.values(gameState.properties).filter(
      p => p.group === property.group && p.type === 'REGULAR' && p.ownerId === property.ownerId
    );
    
    const maxEngagements = Math.max(...propertiesInGroup.map(p => p.engagements));
    if (property.engagements < maxEngagements) {
      return { 
        success: false, 
        reason: 'Must sell evenly across color group'
      };
    }
    
    // Calculate sell value (half of cost - approximately 30% of property price)
    const engagementSellValue = Math.floor(property.price * 0.3);
    
    // Remove the engagement
    property.engagements -= 1;
    owner.balance += engagementSellValue;
    
    // Update rent value
    this.updatePropertyRent(gameState, propertyId);
    
    return {
      success: true,
      propertyId,
      newEngagementLevel: property.engagements,
      sellValue: engagementSellValue,
      newBalance: owner.balance
    };
  }
  
  /**
   * Remove a blue checkmark from a property
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property
   * @returns {Object} - Result of removing blue checkmark
   */
  removeBlueCheckmark(gameState, propertyId) {
    const property = gameState.properties[propertyId];
    
    if (!property) {
      return { success: false, reason: 'Property not found' };
    }
    
    if (property.ownerId === null) {
      return { success: false, reason: 'Property not owned' };
    }
    
    if (!property.blueCheckmark) {
      return { success: false, reason: 'No blue checkmark to remove' };
    }
    
    const owner = gameState.players[property.ownerId];
    
    // Calculate sell value (half of cost - approximately 75% of property price)
    const blueCheckmarkSellValue = Math.floor(property.price * 0.75);
    
    // Remove the blue checkmark and add back 4 engagements
    property.blueCheckmark = false;
    property.engagements = 4;
    owner.balance += blueCheckmarkSellValue;
    
    // Update rent value
    this.updatePropertyRent(gameState, propertyId);
    
    // Remove any viral trend effects
    property.specialEffects = property.specialEffects.filter(
      effect => effect.type !== SPECIAL_EFFECT_TYPE.VIRAL_TREND
    );
    
    return {
      success: true,
      propertyId,
      sellValue: blueCheckmarkSellValue,
      newBalance: owner.balance
    };
  }
  
  /**
   * Update property rent based on current state
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property
   * @returns {number} - New rent value
   */
  updatePropertyRent(gameState, propertyId) {
    const property = gameState.properties[propertyId];
    
    if (!property) return 0;
    
    // Start with base rent
    let rent = property.rentBase;
    
    // If mortgaged, no rent
    if (property.mortgaged) {
      property.rentCurrent = 0;
      return 0;
    }
    
    // If unowned, just use base rent
    if (property.ownerId === null) {
      property.rentCurrent = rent;
      return rent;
    }
    
    // Handle different property types
    if (property.type === 'REGULAR') {
      // Apply rent based on engagements per the game rules
      if (property.blueCheckmark) {
        rent = property.rentBase * 70; // Blue Checkmark
      } else if (property.engagements === 4) {
        rent = property.rentBase * 45; // Four engagements
      } else if (property.engagements === 3) {
        rent = property.rentBase * 30; // Three engagements
      } else if (property.engagements === 2) {
        rent = property.rentBase * 15; // Two engagements
      } else if (property.engagements === 1) {
        rent = property.rentBase * 5; // One engagement
      }
      
      // Check for color group ownership (3x multiplier)
      if (this.isColorGroupMonopoly(gameState, property.ownerId, property.group)) {
        if (!property.blueCheckmark && property.engagements === 0) {
          rent *= 3; // Only apply to base rent
        }
      }
    } else if (property.type === 'TRANSIT') {
      // Transit properties - rent based on how many the player owns
      const owner = gameState.players[property.ownerId];
      const transitCount = Object.values(gameState.properties).filter(
        p => p.type === 'TRANSIT' && p.ownerId === property.ownerId
      ).length;
      
      // Progressive rent based on transit count
      if (transitCount === 1) rent = 25;
      else if (transitCount === 2) rent = 50;
      else if (transitCount === 3) rent = 100;
      else if (transitCount === 4) rent = 200;
    } else if (property.type === 'UTILITY') {
      // Utility properties - rent based on utility count and last dice roll
      const owner = gameState.players[property.ownerId];
      const utilityCount = Object.values(gameState.properties).filter(
        p => p.type === 'UTILITY' && p.ownerId === property.ownerId
      ).length;
      
      // Calculate dice sum
      const diceSum = gameState.lastDiceRoll ? 
        gameState.lastDiceRoll[0] + gameState.lastDiceRoll[1] : 7; // Default to 7
      
      // Rent is dice roll times a multiplier
      if (utilityCount === 1) rent = diceSum * 4;
      else if (utilityCount === 2) rent = diceSum * 10;
    }
    
    // Save and return the calculated rent
    property.rentCurrent = rent;
    return rent;
  }
  
  /**
   * Check if player has a monopoly on a color group
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @param {string} colorGroup - Color group to check
   * @returns {boolean} - Whether player has monopoly
   * @private
   */
  isColorGroupMonopoly(gameState, playerId, colorGroup) {
    const propertiesInGroup = Object.values(gameState.properties).filter(
      p => p.group === colorGroup && p.type === 'REGULAR'
    );
    
    return propertiesInGroup.every(p => p.ownerId === playerId);
  }
  
  /**
   * Add a special effect to a property
   * @param {Object} gameState - Current game state
   * @param {string} propertyId - ID of property
   * @param {Object} effect - Special effect object
   * @returns {boolean} - Whether effect was added
   */
  addSpecialEffect(gameState, propertyId, effect) {
    const property = gameState.properties[propertyId];
    
    if (!property) return false;
    
    property.specialEffects.push(effect);
    return true;
  }
  
  /**
   * Update special effects, removing expired ones
   * @param {Object} gameState - Current game state
   */
  updateSpecialEffects(gameState) {
    Object.values(gameState.properties).forEach(property => {
      property.specialEffects = property.specialEffects.filter(effect => {
        if (effect.expiresAfterTurns !== undefined) {
          effect.expiresAfterTurns--;
          return effect.expiresAfterTurns > 0;
        }
        return true; // Keep effects with no expiration
      });
    });
  }
  
  /**
   * Get all properties owned by a player
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Array} - Array of property objects
   */
  getPlayerProperties(gameState, playerId) {
    return Object.values(gameState.properties).filter(
      property => property.ownerId === playerId
    );
  }
  
  /**
   * Get all properties in a specific color group
   * @param {Object} gameState - Current game state
   * @param {string} colorGroup - Color group to filter by
   * @returns {Array} - Array of property objects
   */
  getPropertiesByColorGroup(gameState, colorGroup) {
    return Object.values(gameState.properties).filter(
      property => property.group === colorGroup && property.type === 'REGULAR'
    );
  }
}

export default PropertyManager;