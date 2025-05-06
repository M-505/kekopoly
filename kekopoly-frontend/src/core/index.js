import GameEngine from './engine/GameEngine';
import PlayerManager from './engine/PlayerManager';
import PropertyManager from './engine/PropertyManager';
import CardManager from './engine/CardManager';
import DiceManager from './engine/DiceManager';
import RuleEngine from './engine/RuleEngine';
import * as Types from './models/types';

/**
 * Create and initialize a new Kekopoly game engine instance
 * @param {Object} config - Game configuration (optional)
 * @returns {Object} - Game engine instance and manager components
 */
export const createGameEngine = (config = {}) => {
  // Create manager instances
  const playerManager = new PlayerManager();
  const propertyManager = new PropertyManager();
  const cardManager = new CardManager();
  const diceManager = new DiceManager();
  
  // RuleEngine depends on other managers
  const ruleEngine = new RuleEngine({
    propertyManager,
    playerManager,
    diceManager
  });
  
  // GameEngine orchestrates all managers
  const gameEngine = new GameEngine({
    propertyManager,
    playerManager,
    cardManager,
    diceManager,
    ruleEngine
  });
  
  return {
    engine: gameEngine,
    playerManager,
    propertyManager,
    cardManager,
    diceManager,
    ruleEngine
  };
};

// Export all components directly
export {
  GameEngine,
  PlayerManager,
  PropertyManager,
  CardManager,
  DiceManager,
  RuleEngine,
  Types
};

// Default export for convenience
export default createGameEngine;