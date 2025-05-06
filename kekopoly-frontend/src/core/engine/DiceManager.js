/**
 * DiceManager handles dice rolling mechanics
 */
class DiceManager {
  /**
   * Roll a single die (1-6)
   * @returns {number} - Die result (1-6)
   */
  rollDie() {
    return Math.floor(Math.random() * 6) + 1;
  }
  
  /**
   * Roll two dice
   * @returns {number[]} - Array of two dice results
   */
  rollDice() {
    return [this.rollDie(), this.rollDie()];
  }
  
  /**
   * Check if dice roll is doubles
   * @param {number[]} diceRoll - Array of dice values
   * @returns {boolean} - Whether roll is doubles
   */
  isDoubles(diceRoll) {
    return diceRoll[0] === diceRoll[1];
  }
  
  /**
   * Get the sum of dice values
   * @param {number[]} diceRoll - Array of dice values
   * @returns {number} - Sum of dice values
   */
  getDiceTotal(diceRoll) {
    return diceRoll[0] + diceRoll[1];
  }
  
  /**
   * Perform a roll with the given dice count
   * @param {number} count - Number of dice to roll
   * @returns {number[]} - Array of dice results
   */
  rollMultiple(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(this.rollDie());
    }
    return results;
  }
  
  /**
   * Roll a die for each player
   * @param {Object} gameState - Current game state
   * @returns {Object} - Map of player IDs to roll results
   */
  rollForAllPlayers(gameState) {
    const results = {};
    
    Object.keys(gameState.players).forEach(playerId => {
      results[playerId] = this.rollDie();
    });
    
    return results;
  }
  
  /**
   * Determine turn order based on rolls
   * @param {Object} gameState - Current game state
   * @returns {string[]} - Array of player IDs in turn order
   */
  determineInitialTurnOrder(gameState) {
    // Roll for each player
    const playerRolls = [];
    
    Object.keys(gameState.players).forEach(playerId => {
      const roll = this.rollDice();
      const total = roll[0] + roll[1];
      
      playerRolls.push({
        playerId,
        roll,
        total
      });
    });
    
    // Sort by highest roll
    playerRolls.sort((a, b) => {
      // Sort by total first
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      
      // If tied, check for doubles
      const aIsDoubles = a.roll[0] === a.roll[1];
      const bIsDoubles = b.roll[0] === b.roll[1];
      
      if (aIsDoubles && !bIsDoubles) return -1;
      if (!aIsDoubles && bIsDoubles) return 1;
      
      // If still tied, use random order
      return Math.random() - 0.5;
    });
    
    // Return the turn order
    return playerRolls.map(pr => pr.playerId);
  }
}

export default DiceManager;