/**
 * Core type definitions for Kekopoly game
 */

/**
 * @typedef {Object} Player
 * @property {string} playerId - Unique identifier for the player
 * @property {string} userId - Associated user account ID
 * @property {string} walletAddress - Player's Solana wallet address
 * @property {string} characterToken - Player's chosen meme character
 * @property {number} position - Current position on the board (0-39)
 * @property {number} balance - Current balance in Kekels
 * @property {Card[]} cards - Cards in player's hand
 * @property {boolean} shadowbanned - Whether player is in Shadowban (jail)
 * @property {number} shadowbanRemainingTurns - Turns remaining in Shadowban
 * @property {string} status - Player status (ACTIVE, DISCONNECTED, BANKRUPT, FORFEITED)
 * @property {string[]} properties - IDs of properties owned by player
 * @property {number} netWorth - Total value of player (balance + property assets)
 */

/**
 * @typedef {Object} Property
 * @property {string} propertyId - Unique identifier for the property
 * @property {string} name - Name of the property
 * @property {string} type - Property type (REGULAR, TRANSIT, UTILITY, SPECIAL)
 * @property {string} group - Color group or category 
 * @property {number} position - Position on the board (0-39)
 * @property {string|null} ownerId - ID of player who owns this property, or null
 * @property {number} price - Purchase price
 * @property {number} rentBase - Base rent amount
 * @property {number} rentCurrent - Current rent amount (after multipliers)
 * @property {boolean} mortgaged - Whether property is mortgaged
 * @property {number} engagements - Number of engagements (houses) built (0-4)
 * @property {boolean} blueCheckmark - Whether property has a blue checkmark (hotel)
 * @property {SpecialEffect[]} specialEffects - Special effects applied to this property
 * @property {string|null} memeName - Name of the meme for this property (set when first engagement is built)
 */

/**
 * @typedef {Object} SpecialEffect
 * @property {string} type - Effect type (e.g., "STREAM", "HOST", "VIRAL_TREND")
 * @property {string} appliedBy - ID of player who applied the effect
 * @property {number} expiresAfterTurns - Number of turns until effect expires
 * @property {any} data - Any additional data for the effect
 */

/**
 * @typedef {Object} Card
 * @property {string} cardId - Unique identifier for the card
 * @property {string} name - Name of the card
 * @property {string} type - Card type (MEME, REDPILL, EEGI)
 * @property {string} rarity - Card rarity (COMMON, RARE, LEGENDARY)
 * @property {string} effect - Code for the card effect
 * @property {string} description - Human-readable description
 */

/**
 * @typedef {Object} GameState
 * @property {string} gameId - Unique identifier for the game
 * @property {string} status - Game status (LOBBY, ACTIVE, PAUSED, COMPLETED)
 * @property {Object.<string, Player>} players - Map of player ID to player object
 * @property {string} currentTurn - ID of player whose turn it is
 * @property {string[]} turnOrder - Order of player turns
 * @property {Object.<string, Property>} properties - Map of property ID to property object
 * @property {Object} decks - Card decks
 * @property {Card[]} decks.meme - Meme card deck
 * @property {Card[]} decks.redpill - Redpill card deck
 * @property {Card[]} decks.eegi - EEGI card deck
 * @property {Object} cardsRemaining - Number of cards remaining in each deck
 * @property {string} marketCondition - Market condition (NORMAL, BULL, CRASH)
 * @property {number} marketConditionRemainingTurns - Turns remaining for market condition
 * @property {number[]} lastDiceRoll - Last dice roll values
 * @property {boolean} isRolling - Whether dice are currently rolling
 * @property {number} turnPhase - Current phase of the turn (0-5)
 * @property {any} pendingAction - Any pending action that needs resolution
 */

export const GAME_STATUS = {
  LOBBY: 'LOBBY',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED'
};

export const PLAYER_STATUS = {
  ACTIVE: 'ACTIVE',
  DISCONNECTED: 'DISCONNECTED',
  BANKRUPT: 'BANKRUPT',
  FORFEITED: 'FORFEITED'
};

export const PROPERTY_TYPE = {
  REGULAR: 'REGULAR',
  TRANSIT: 'TRANSIT',
  UTILITY: 'UTILITY',
  SPECIAL: 'SPECIAL'
};

export const CARD_TYPE = {
  MEME: 'MEME',
  REDPILL: 'REDPILL',
  EEGI: 'EEGI'
};

export const CARD_RARITY = {
  COMMON: 'COMMON',
  RARE: 'RARE',
  LEGENDARY: 'LEGENDARY'
};

export const MARKET_CONDITION = {
  NORMAL: 'NORMAL',
  BULL: 'BULL',
  CRASH: 'CRASH'
};

export const TURN_PHASE = {
  MEMECONOMY: 0,
  MOVEMENT: 1,
  ACTION: 2,
  TRADING: 3,
  BUILDING: 4,
  CARD_PLAY: 5
};

export const SPECIAL_EFFECT_TYPE = {
  STREAM: 'STREAM',
  HOST: 'HOST', 
  VIRAL_TREND: 'VIRAL_TREND',
  IMMUNITY: 'IMMUNITY',
  DOUBLE_RENT: 'DOUBLE_RENT',
  HALF_RENT: 'HALF_RENT'
};