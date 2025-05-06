import { CARD_TYPE, CARD_RARITY } from '../models/types';

/**
 * CardManager handles card deck management, drawing, and effect application
 */
class CardManager {
  /**
   * Initialize card decks with predefined cards
   * @param {Object} gameState - Current game state
   */
  initializeDecks(gameState) {
    // Initialize the decks with predefined cards
    gameState.decks = {
      meme: this.createMemeCards(),
      redpill: this.createRedpillCards(),
      eegi: this.createEEGICards()
    };
    
    // Shuffle each deck
    gameState.decks.meme = this.shuffleDeck(gameState.decks.meme);
    gameState.decks.redpill = this.shuffleDeck(gameState.decks.redpill);
    gameState.decks.eegi = this.shuffleDeck(gameState.decks.eegi);
    
    // Update cards remaining count
    gameState.cardsRemaining = {
      meme: gameState.decks.meme.length,
      redpill: gameState.decks.redpill.length,
      eegi: gameState.decks.eegi.length
    };
  }
  
  /**
   * Shuffle a deck of cards
   * @param {Array} deck - Deck to shuffle
   * @returns {Array} - Shuffled deck
   * @private
   */
  shuffleDeck(deck) {
    const shuffled = [...deck];
    
    // Fisher-Yates shuffle algorithm
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }
  
  /**
   * Create the meme card deck
   * @returns {Array} - Array of meme cards
   * @private
   */
  createMemeCards() {
    return [
      {
        cardId: 'meme_01',
        name: 'Viral Meme',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.RARE,
        effect: 'COLLECT_FROM_ALL',
        description: 'Collect 50 Kekels from each player',
        imageUrl: null,
        data: { amount: 50 }
      },
      {
        cardId: 'meme_02',
        name: 'Stonks',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.COMMON,
        effect: 'ADVANCE_TO_START',
        description: 'Advance to START and collect 200 Kekels',
        imageUrl: null,
        data: { collectAmount: 200 }
      },
      {
        cardId: 'meme_03',
        name: 'Wojak Panic',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.COMMON,
        effect: 'PAY_NEXT_PLAYER',
        description: 'Pay 50 Kekels to the next player',
        imageUrl: null,
        data: { amount: 50 }
      },
      {
        cardId: 'meme_04',
        name: 'Doge WOW',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.RARE,
        effect: 'COLLECT_FROM_PLAYER',
        description: 'Collect 200 Kekels from the previous player',
        imageUrl: null,
        data: { amount: 200, targetType: 'PREVIOUS' }
      },
      {
        cardId: 'meme_05',
        name: 'Chad Yes',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.RARE,
        effect: 'ADVANCE_TO_ANY_PROPERTY',
        description: 'Advance to any property and buy it if unowned',
        imageUrl: null
      },
      {
        cardId: 'meme_06',
        name: 'Pepe Sad',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.COMMON,
        effect: 'GO_BACK',
        description: 'Go back 3 spaces',
        imageUrl: null,
        data: { spaces: 3 }
      },
      {
        cardId: 'meme_07',
        name: 'Diamond Hands',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'PROPERTY_IMMUNITY',
        description: 'All your properties are immune to being stolen or devalued for 3 rounds',
        imageUrl: null,
        data: { rounds: 3 }
      },
      {
        cardId: 'meme_08',
        name: 'Paper Hands',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.COMMON,
        effect: 'FORCE_MORTGAGE',
        description: 'You must mortgage one property if possible',
        imageUrl: null
      },
      {
        cardId: 'meme_09',
        name: 'NFT Collection',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.RARE,
        effect: 'COLLECT_PER_PROPERTY',
        description: 'Collect 25 Kekels for each property you own',
        imageUrl: null,
        data: { amountPerProperty: 25 }
      },
      {
        cardId: 'meme_10',
        name: 'FOMO',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.COMMON,
        effect: 'MUST_BUY_NEXT',
        description: 'You must buy the next unowned property you land on',
        imageUrl: null
      },
      {
        cardId: 'meme_11',
        name: 'Galaxy Brain',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'TELEPORT',
        description: 'Choose any space on the board and teleport there',
        imageUrl: null
      },
      {
        cardId: 'meme_12',
        name: 'Bait and Switch',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.RARE,
        effect: 'SWAP_POSITION',
        description: 'Swap positions with any player',
        imageUrl: null
      },
      {
        cardId: 'meme_13',
        name: 'Ratio\'d',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.COMMON,
        effect: 'VOTE_FORFEIT',
        description: 'All players vote on a player who must forfeit 50 Kekels',
        imageUrl: null,
        data: { amount: 50 }
      },
      {
        cardId: 'meme_14',
        name: 'Copypasta',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.RARE,
        effect: 'COPY_LAST_CARD',
        description: 'Copy the effect of any card played in the last round',
        imageUrl: null
      },
      {
        cardId: 'meme_15',
        name: 'Shitposting',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.COMMON,
        effect: 'LOWEST_ROLL_PAYS',
        description: 'All players must roll a die - lowest number pays 50 Kekels to you',
        imageUrl: null,
        data: { amount: 50 }
      },
      {
        cardId: 'meme_16',
        name: 'Meme Review',
        type: CARD_TYPE.MEME,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'COLLECT_FOR_BUILDINGS',
        description: 'Collect 100 Kekels and an additional 25 for each Engagement/Blue Checkmark you own',
        imageUrl: null,
        data: { baseAmount: 100, amountPerBuilding: 25 }
      }
    ];
  }
  
  /**
   * Create the redpill card deck
   * @returns {Array} - Array of redpill cards
   * @private
   */
  createRedpillCards() {
    return [
      {
        cardId: 'redpill_01',
        name: 'Based',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.RARE,
        effect: 'COLLECT_FROM_ALL',
        description: 'Collect 150 Kekels from all the players',
        imageUrl: null,
        data: { amount: 150 }
      },
      {
        cardId: 'redpill_02',
        name: 'Cringe',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.COMMON,
        effect: 'PAY_NEXT_PLAYER',
        description: 'Pay 150 Kekels to the next player',
        imageUrl: null,
        data: { amount: 150 }
      },
      {
        cardId: 'redpill_03',
        name: 'Server Maintenance',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.COMMON,
        effect: 'PAY_PER_ENGAGEMENT',
        description: 'Pay 40 Kekels for each Engagement you own',
        imageUrl: null,
        data: { amountPerEngagement: 40 }
      },
      {
        cardId: 'redpill_04',
        name: 'Doxx\'d',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.COMMON,
        effect: 'DOUBLE_RENT_AGAINST',
        description: 'Your position is revealed to all players who can charge you double rent for 2 rounds',
        imageUrl: null,
        data: { rounds: 2 }
      },
      {
        cardId: 'redpill_05',
        name: 'Crypto Whale',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'BUY_ANY_PROPERTY',
        description: 'Take ownership of any one property by paying twice its value to the owner',
        imageUrl: null,
        data: { multiplier: 2 }
      },
      {
        cardId: 'redpill_06',
        name: 'Shadowbanned',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.COMMON,
        effect: 'GO_TO_SHADOWBAN',
        description: 'Go directly to Shadowban',
        imageUrl: null
      },
      {
        cardId: 'redpill_07',
        name: 'Crypto Winter',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.RARE,
        effect: 'LOSE_HALF_KEKELS',
        description: 'Lose half your Kekels (rounded down)',
        imageUrl: null
      },
      {
        cardId: 'redpill_08',
        name: 'HODL',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.RARE,
        effect: 'DOUBLE_RENT',
        description: 'All your properties generate double rent for one round',
        imageUrl: null,
        data: { rounds: 1 }
      },
      {
        cardId: 'redpill_09',
        name: 'Trollface',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.COMMON,
        effect: 'FORCE_POSITION_SWAP',
        description: 'Force another player to swap positions with any player of your choice',
        imageUrl: null
      },
      {
        cardId: 'redpill_10',
        name: 'Ratio\'d',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.COMMON,
        effect: 'PAY_PERCENTAGE',
        description: 'Pay 10% of your Kekels to the player with the least amount',
        imageUrl: null,
        data: { percentage: 10 }
      },
      {
        cardId: 'redpill_11',
        name: 'Verification Check',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.RARE,
        effect: 'GET_OUT_OF_SHADOWBAN',
        description: 'Get out of Shadowban free card',
        imageUrl: null
      },
      {
        cardId: 'redpill_12',
        name: 'Airdrop',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.COMMON,
        effect: 'ROLL_COLLECT',
        description: 'Roll a die and collect that many x25 Kekels',
        imageUrl: null,
        data: { multiplier: 25 }
      },
      {
        cardId: 'redpill_13',
        name: 'Flash Crash',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'ALL_FORFEIT_PERCENTAGE',
        description: 'All players must forfeit 20% of their cash',
        imageUrl: null,
        data: { percentage: 20 }
      },
      {
        cardId: 'redpill_14',
        name: 'Exit Scam',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.RARE,
        effect: 'STEAL_AND_SHADOWBAN',
        description: 'Steal 50 Kekels from each player but go to Shadowban immediately',
        imageUrl: null,
        data: { amount: 50 }
      },
      {
        cardId: 'redpill_15',
        name: 'Token Unlock',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.COMMON,
        effect: 'COLLECT_FROM_ALL',
        description: 'Collect 50 Kekels from all the players',
        imageUrl: null,
        data: { amount: 50 }
      },
      {
        cardId: 'redpill_16',
        name: 'Rugpull',
        type: CARD_TYPE.REDPILL,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'FORCE_MORTGAGE',
        description: 'Force one player to mortgage one of their properties of your choice',
        imageUrl: null
      }
    ];
  }
  
  /**
   * Create the EEGI card deck
   * @returns {Array} - Array of EEGI cards
   * @private
   */
  createEEGICards() {
    return [
      {
        cardId: 'eegi_01',
        name: 'AI Generated',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.COMMON,
        effect: 'MOVE_RANDOM',
        description: 'Move to a random space on the board',
        imageUrl: null
      },
      {
        cardId: 'eegi_02',
        name: 'Neural Network',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.RARE,
        effect: 'COLLECT_PER_PROPERTY_FROM_ALL',
        description: 'Collect 10 Kekels from each player for each property you own',
        imageUrl: null,
        data: { amountPerProperty: 10 }
      },
      {
        cardId: 'eegi_03',
        name: 'Prompt Engineering',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.RARE,
        effect: 'MOVE_TO_ANY_SPACE',
        description: 'Choose any space on the board and move there',
        imageUrl: null
      },
      {
        cardId: 'eegi_04',
        name: 'GPT Hallucination',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.COMMON,
        effect: 'PAY_NEXT_PLAYER',
        description: 'Pay 100 Kekels to the next player',
        imageUrl: null,
        data: { amount: 100 }
      },
      {
        cardId: 'eegi_05',
        name: 'LLM Genius',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.RARE,
        effect: 'COLLECT_FROM_PLAYER',
        description: 'Collect 200 Kekels from the previous player',
        imageUrl: null,
        data: { amount: 200, targetType: 'PREVIOUS' }
      },
      {
        cardId: 'eegi_06',
        name: 'Token Limit',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.COMMON,
        effect: 'PAY_PER_PROPERTY',
        description: 'Pay 10 Kekels per property you own',
        imageUrl: null,
        data: { amountPerProperty: 10 }
      },
      {
        cardId: 'eegi_07',
        name: 'Stable Diffusion',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'FREEZE_PLAYERS',
        description: 'All players\' tokens freeze in place for one round',
        imageUrl: null,
        data: { rounds: 1 }
      },
      {
        cardId: 'eegi_08',
        name: 'Transformer',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.RARE,
        effect: 'EXCHANGE_PROPERTY',
        description: 'Exchange one property with any player',
        imageUrl: null
      },
      {
        cardId: 'eegi_09',
        name: 'Fine-Tuning',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.COMMON,
        effect: 'FREE_ENGAGEMENT',
        description: 'Add one Engagement to any property you own for free',
        imageUrl: null
      },
      {
        cardId: 'eegi_10',
        name: 'Generative Art',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.RARE,
        effect: 'BUY_ANY_PROPERTY_DISCOUNT',
        description: 'Go to any property and buy it at 75% of its listed price',
        imageUrl: null,
        data: { priceMultiplier: 0.75 }
      },
      {
        cardId: 'eegi_11',
        name: 'Zero-shot Learning',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.RARE,
        effect: 'GET_OUT_OF_SHADOWBAN',
        description: 'Get out of Shadowban free',
        imageUrl: null
      },
      {
        cardId: 'eegi_12',
        name: 'Multimodal',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.COMMON,
        effect: 'ROLL_COLLECT',
        description: 'Roll again and collect 20 Kekels for each dot shown',
        imageUrl: null,
        data: { amountPerDot: 20 }
      },
      {
        cardId: 'eegi_13',
        name: 'Model Collapse',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'REMOVE_ALL_ENGAGEMENTS',
        description: 'All players must remove one Engagement from each of their properties',
        imageUrl: null
      },
      {
        cardId: 'eegi_14',
        name: 'Training Data',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.COMMON,
        effect: 'VIEW_CARDS',
        description: 'View the top 3 cards from any deck',
        imageUrl: null,
        data: { count: 3 }
      },
      {
        cardId: 'eegi_15',
        name: 'AGI Breakthrough',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.LEGENDARY,
        effect: 'COLLECT_ALL_RENT',
        description: 'Collect rent from all properties as if you owned them for one round',
        imageUrl: null,
        data: { rounds: 1 }
      },
      {
        cardId: 'eegi_16',
        name: 'Superintelligence',
        type: CARD_TYPE.EEGI,
        rarity: CARD_RARITY.RARE,
        effect: 'STEAL_CARD',
        description: 'Look at all cards in any player\'s hand and take one',
        imageUrl: null
      }
    ];
  }
  
  /**
   * Draw a card from a specified deck
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player drawing the card
   * @param {string} deckType - Type of deck to draw from
   * @returns {Object} - Result of drawing card
   */
  drawCard(gameState, playerId, deckType) {
    if (!gameState.players[playerId]) {
      return { success: false, reason: 'Player not found' };
    }
    
    if (!gameState.decks[deckType] || gameState.decks[deckType].length === 0) {
      return { success: false, reason: 'Deck empty or not found' };
    }
    
    const player = gameState.players[playerId];
    
    // Check if player already has max cards (3)
    if (player.cards.length >= 3) {
      return { 
        success: false, 
        reason: 'Player already has maximum cards',
        mustDiscard: true
      };
    }
    
    // Draw the top card
    const drawnCard = gameState.decks[deckType].shift();
    
    // Update cards remaining count
    gameState.cardsRemaining[deckType] = gameState.decks[deckType].length;
    
    // Add card to player's hand
    player.cards.push(drawnCard);
    
    return {
      success: true,
      deckType,
      card: drawnCard
    };
  }
  
  /**
   * Draw an initial card (for game start)
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Card draw result
   */
  drawInitialCard(gameState, playerId) {
    if (!gameState.players[playerId]) {
      return { success: false, reason: 'Player not found' };
    }
    
    // For initial cards, we draw a Common card from any deck
    // First, collect all Common cards from all decks
    const commonCards = [
      ...gameState.decks.meme.filter(card => card.rarity === CARD_RARITY.COMMON),
      ...gameState.decks.redpill.filter(card => card.rarity === CARD_RARITY.COMMON),
      ...gameState.decks.eegi.filter(card => card.rarity === CARD_RARITY.COMMON)
    ];
    
    if (commonCards.length === 0) {
      return { success: false, reason: 'No common cards available' };
    }
    
    // Select a random common card
    const randomIndex = Math.floor(Math.random() * commonCards.length);
    const drawnCard = commonCards[randomIndex];
    
    // Remove the card from its original deck
    const deckType = drawnCard.type.toLowerCase();
    const cardIndex = gameState.decks[deckType].findIndex(card => card.cardId === drawnCard.cardId);
    
    if (cardIndex !== -1) {
      gameState.decks[deckType].splice(cardIndex, 1);
      gameState.cardsRemaining[deckType] = gameState.decks[deckType].length;
    }
    
    // Add card to player's hand
    gameState.players[playerId].cards.push(drawnCard);
    
    return {
      success: true,
      deckType: drawnCard.type,
      card: drawnCard
    };
  }
  
  /**
   * Play a card from a player's hand
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player playing the card
   * @param {string} cardId - ID of card to play
   * @param {Object} options - Additional options for card effect
   * @returns {Object} - Result of playing card
   */
  playCard(gameState, playerId, cardId, options = {}) {
    const player = gameState.players[playerId];
    
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }
    
    // Find the card in player's hand
    const cardIndex = player.cards.findIndex(card => card.cardId === cardId);
    
    if (cardIndex === -1) {
      return { success: false, reason: 'Card not found in player\'s hand' };
    }
    
    const card = player.cards[cardIndex];
    
    // Apply the card effect
    const effectResult = this.applyCardEffect(gameState, playerId, card, options);
    
    // Remove the card from player's hand
    player.cards.splice(cardIndex, 1);
    
    // Add the card to a discard pile (not implemented yet)
    // gameState.discardPile.push(card);
    
    return {
      success: true,
      card,
      effectResult
    };
  }
  
  /**
   * Apply a card's effect
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player playing the card
   * @param {Object} card - Card being played
   * @param {Object} options - Additional options for card effect
   * @returns {Object} - Result of applying effect
   * @private
   */
  applyCardEffect(gameState, playerId, card, options) {
    const player = gameState.players[playerId];
    
    // Handle different card effects
    switch (card.effect) {
      case 'COLLECT_FROM_ALL': {
        const amount = card.data.amount;
        let totalCollected = 0;
        
        // Collect from all other players
        Object.keys(gameState.players).forEach(otherPlayerId => {
          if (otherPlayerId !== playerId) {
            const otherPlayer = gameState.players[otherPlayerId];
            
            // Determine how much player can pay
            const amountToPay = Math.min(amount, otherPlayer.balance);
            
            if (amountToPay > 0) {
              otherPlayer.balance -= amountToPay;
              totalCollected += amountToPay;
            }
          }
        });
        
        // Add collected amount to player's balance
        player.balance += totalCollected;
        
        return {
          effect: card.effect,
          amountCollected: totalCollected
        };
      }
      
      case 'ADVANCE_TO_START': {
        // Move player to START (position 0)
        const oldPosition = player.position;
        player.position = 0;
        
        // Collect specified amount
        const amount = card.data.collectAmount;
        player.balance += amount;
        
        return {
          effect: card.effect,
          oldPosition,
          newPosition: 0,
          amountCollected: amount
        };
      }
      
      case 'PAY_NEXT_PLAYER': {
        const amount = Math.min(card.data.amount, player.balance);
        
        // Find the next player in turn order
        const currentIndex = gameState.turnOrder.indexOf(playerId);
        const nextIndex = (currentIndex + 1) % gameState.turnOrder.length;
        const nextPlayerId = gameState.turnOrder[nextIndex];
        
        // Pay the next player
        player.balance -= amount;
        gameState.players[nextPlayerId].balance += amount;
        
        return {
          effect: card.effect,
          amountPaid: amount,
          recipient: nextPlayerId
        };
      }
      
      case 'COLLECT_FROM_PLAYER': {
        const amount = card.data.amount;
        const targetType = card.data.targetType;
        
        // Determine target player
        let targetPlayerId;
        
        if (targetType === 'PREVIOUS') {
          // Find the previous player in turn order
          const currentIndex = gameState.turnOrder.indexOf(playerId);
          const prevIndex = (currentIndex - 1 + gameState.turnOrder.length) % gameState.turnOrder.length;
          targetPlayerId = gameState.turnOrder[prevIndex];
        } else if (options.targetPlayerId) {
          // Use specified target from options
          targetPlayerId = options.targetPlayerId;
        } else {
          return { 
            effect: card.effect, 
            error: 'No target player specified',
            requiresTarget: true 
          };
        }
        
        const targetPlayer = gameState.players[targetPlayerId];
        
        if (!targetPlayer) {
          return {
            effect: card.effect,
            error: 'Target player not found'
          };
        }
        
        // Determine how much player can pay
        const amountToCollect = Math.min(amount, targetPlayer.balance);
        
        // Transfer the money
        targetPlayer.balance -= amountToCollect;
        player.balance += amountToCollect;
        
        return {
          effect: card.effect,
          amountCollected: amountToCollect,
          fromPlayer: targetPlayerId
        };
      }
      
      // Additional card effects would be implemented here
      // For brevity, not all 48 card effects are implemented in this example
      
      default:
        return {
          effect: card.effect,
          message: 'Effect not implemented yet',
          requiresImplementation: true
        };
    }
  }
  
  /**
   * Remove a card from a player's hand
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @param {string} cardId - ID of card to remove
   * @returns {boolean} - Whether card was removed
   */
  removeCardFromPlayer(gameState, playerId, cardId) {
    const player = gameState.players[playerId];
    
    if (!player) return false;
    
    const cardIndex = player.cards.findIndex(card => card.cardId === cardId);
    
    if (cardIndex === -1) return false;
    
    player.cards.splice(cardIndex, 1);
    return true;
  }
  
  /**
   * Get cards in a player's hand
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Array} - Array of cards in player's hand
   */
  getPlayerCards(gameState, playerId) {
    return gameState.players[playerId]?.cards || [];
  }
  
  /**
   * Get a count of cards by rarity in player's hand
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Object} - Counts by rarity
   */
  getPlayerCardCounts(gameState, playerId) {
    const cards = this.getPlayerCards(gameState, playerId);
    
    return {
      total: cards.length,
      common: cards.filter(card => card.rarity === CARD_RARITY.COMMON).length,
      rare: cards.filter(card => card.rarity === CARD_RARITY.RARE).length,
      legendary: cards.filter(card => card.rarity === CARD_RARITY.LEGENDARY).length
    };
  }
  
  /**
   * Check if a player can create a card combo
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player
   * @returns {Array} - Possible card combos
   */
  checkForCardCombos(gameState, playerId) {
    const cards = this.getPlayerCards(gameState, playerId);
    const combos = [];
    
    // Example: Three cards of the same type
    const cardTypes = {};
    cards.forEach(card => {
      cardTypes[card.type] = (cardTypes[card.type] || 0) + 1;
    });
    
    for (const type in cardTypes) {
      if (cardTypes[type] >= 3) {
        combos.push({
          type: 'TRIPLE_TYPE',
          cardType: type,
          description: `Three ${type} cards can be combined for a powerful effect`
        });
      }
    }
    
    // Example: Cards with ascending rarity
    const hasCommon = cards.some(card => card.rarity === CARD_RARITY.COMMON);
    const hasRare = cards.some(card => card.rarity === CARD_RARITY.RARE);
    const hasLegendary = cards.some(card => card.rarity === CARD_RARITY.LEGENDARY);
    
    if (hasCommon && hasRare && hasLegendary) {
      combos.push({
        type: 'ASCENDING_RARITY',
        description: 'One of each rarity can create a special combo'
      });
    }
    
    return combos;
  }
}

export default CardManager;