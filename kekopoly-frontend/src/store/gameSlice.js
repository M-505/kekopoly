import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { boardSpaces } from '../config/boardConfig';

// Async thunks
export const addPlayerAsync = createAsyncThunk(
  'game/addPlayerAsync',
  async (playerData) => {
    // Simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(playerData);
      }, 500);
    });
  }
);

export const startGameAsync = createAsyncThunk(
  'game/startGameAsync',
  async () => {
    // Simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 500);
    });
  }
);

const initialState = {
  players: [],
  currentPlayerIndex: 0,
  diceRoll: [1, 1],
  diceRolled: false,
  properties: [],
  gameMessages: [],
  consecutiveDoubles: 0,
  board: boardSpaces,
  gameStarted: false,
  gamePhase: 'setup', // setup, playing, ended
  roomCode: null,
  hostId: null,
  loading: false,
  error: null,
  lastRoll: { dice: [1, 1], isDoubles: false, playerId: null, timestamp: Date.now() },
  maxPlayers: 6, // Default max players
  gameInfo: {}, // Game info from server
  isRolling: false, // Add isRolling state
  gameStartedTimestamp: null, // Timestamp when the game started
  turnConfirmed: false, // Flag to track if the current turn has been confirmed by the server
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    // Sync game state with slices/gameSlice.js
    setGameStarted: (state, action) => {
      state.gameStarted = action.payload;
      // If the game is starting, set the timestamp
      if (action.payload === true && !state.gameStartedTimestamp) {
        state.gameStartedTimestamp = Date.now();
      }
    },
    setGamePhase: (state, action) => {
      state.gamePhase = action.payload;
      // If the game is entering playing phase, set the timestamp
      if (action.payload === 'playing' && !state.gameStartedTimestamp) {
        state.gameStartedTimestamp = Date.now();
      }
    },
    // Sync with game status from server
    syncGameStatus: (state, action) => {
      if (action.payload === 'ACTIVE') {
        state.gameStarted = true;
        // If the game is becoming active, set the timestamp
        if (!state.gameStartedTimestamp) {
          state.gameStartedTimestamp = Date.now();
        }
      }
    },
    // Set the game started timestamp explicitly
    setGameStartedTimestamp: (state, action) => {
      state.gameStartedTimestamp = action.payload;
    },
    // Force update the turn state (used for synchronization)
    forceTurnUpdate: (state, action) => {
      state.currentPlayer = action.payload;
      state.turnConfirmed = true;
    },
    addPlayer: (state, action) => {
      state.players.push({
        id: action.payload.id,
        name: action.payload.name,
        token: action.payload.token || action.payload.characterToken || ':)',
        color: action.payload.color || 'green.500',
        position: 1, // Start at position 1 (START)
        balance: 1500,
        properties: [],
        inJail: false,
        jailTurns: 0,
        isReady: false,
        isHost: action.payload.isHost || false,
        walletAddress: action.payload.walletAddress,
        kekels: {
          k100: 2,
          k50: 5,
          k10: 10,
        },
      });

      // Log player added for debugging
      console.log(`[GAME_SLICE] Player added:`, state.players[state.players.length - 1]);
    },
    removePlayer: (state, action) => {
      state.players = state.players.filter(player => player.id !== action.payload);
    },
    setCurrentPlayer: (state, action) => {
      state.currentPlayer = action.payload;
    },
    movePlayer: (state, action) => {
      const { playerId, newPosition, oldPosition, diceValues, timestamp } = action.payload;
      const playerIndex = state.players.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        state.players[playerIndex].position = newPosition;

        // Import the board spaces data to get property names
        const { configBoardSpaces } = require('../core/models/boardConfig');

        // Get property names for the positions
        const getSpaceName = (position) => {
          const space = configBoardSpaces.find(s => s.id === position);
          return space ? space.name : `Space ${position}`;
        };

        const fromSpaceName = getSpaceName(oldPosition);
        const toSpaceName = getSpaceName(newPosition);

        // Use provided timestamp or generate a new one
        const messageTimestamp = timestamp || Date.now();

        // Add movement notification with property names
        state.gameMessages.unshift({
          type: 'MOVEMENT',
          playerId,
          content: `${state.players[playerIndex].name} moved from ${fromSpaceName} to ${toSpaceName}`,
          data: {
            from: oldPosition,
            fromName: fromSpaceName,
            to: newPosition,
            toName: toSpaceName
          },
          timestamp: messageTimestamp
        });

        // If diceValues are present, add a ROLL_RESULT message as well
        if (diceValues && diceValues.length === 2) {
          // Check if both dice values are valid numbers
          const dice1 = typeof diceValues[0] === 'number' ? diceValues[0] : 0;
          const dice2 = typeof diceValues[1] === 'number' ? diceValues[1] : 0;

          // Store the dice values with timestamp in the lastRoll state
          // This helps track which dice roll caused this movement
          state.lastRoll = {
            dice: [dice1, dice2],
            playerId,
            timestamp: messageTimestamp
          };

          state.gameMessages.unshift({
            type: 'ROLL_RESULT',
            playerId,
            content: `${state.players[playerIndex].name} rolled ${dice1} and ${dice2}`,
            dice: [dice1, dice2],
            timestamp: messageTimestamp
          });
        }
      }
    },
    updatePlayerBalance: (state, action) => {
      const player = state.players.find(p => p.id === action.payload.playerId);
      if (player) {
        player.balance += action.payload.amount;
      }
    },
    buyProperty: (state, action) => {
      const { playerId, propertyId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      const property = state.board.find(p => p.id === propertyId);

      if (player && property && !property.owner) {
        player.balance -= property.price;
        player.properties.push(propertyId);
        property.owner = playerId;
      }
    },
    mortgageProperty: (state, action) => {
      const { playerId, propertyId } = action.payload;
      const property = state.board.find(p => p.id === propertyId);

      if (property && property.owner === playerId) {
        property.mortgaged = true;
        const player = state.players.find(p => p.id === playerId);
        if (player) {
          player.balance += property.mortgageValue;
        }
      }
    },
    unmortgageProperty: (state, action) => {
      const { playerId, propertyId } = action.payload;
      const property = state.board.find(p => p.id === propertyId);

      if (property && property.owner === playerId) {
        property.mortgaged = false;
        const player = state.players.find(p => p.id === playerId);
        if (player) {
          player.balance -= property.mortgageValue * 1.1; // 10% interest
        }
      }
    },
    setPlayerReady: (state, action) => {
      const { playerId, isReady } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (player) {
        player.isReady = isReady;
      }
    },
    setRoomCode: (state, action) => {
      state.roomCode = action.payload;
    },
    setHost: (state, action) => {
      if (state.hostId !== action.payload) {
        state.hostId = action.payload;
      }
    },
    endGame: (state) => {
      state.gameStarted = false;
      state.gamePhase = 'ended';
    },
    updateDiceRoll: (state, action) => {
      // Support both old and new parameter formats
      const diceValues = action.payload.diceValues || action.payload.dice || [1, 1];
      const playerId = action.payload.playerId;

      // Use provided timestamp or generate a new one
      const timestamp = action.payload.timestamp || Date.now();

      console.log('[DICE_REDUX] Updating dice roll with values:', diceValues, 'timestamp:', timestamp);

      // Update the dice roll state with timestamp
      state.diceRoll = diceValues;
      state.diceRolled = true;
      state.lastRoll = {
        dice: diceValues,
        playerId,
        timestamp
      };

      // Set isRolling to false to ensure UI updates
      state.isRolling = false;

      // Check for doubles
      const isDoubles = action.payload.isDoubles !== undefined ?
                        action.payload.isDoubles :
                        (diceValues[0] === diceValues[1]);

      // Find the player who rolled
      let rollingPlayer;
      if (playerId) {
        rollingPlayer = state.players.find(p => p.id === playerId);
      } else {
        // If no playerId provided, use current player
        const currentPlayerIndex = state.players.findIndex(p => p.id === state.currentPlayer);
        if (currentPlayerIndex !== -1) {
          rollingPlayer = state.players[currentPlayerIndex];
        }
      }

      if (!rollingPlayer) {
        console.warn('[DICE_REDUX] Could not find player for dice roll');
        return;
      }

      console.log('[DICE_REDUX] Player rolling:', rollingPlayer.name, 'isDoubles:', isDoubles);

      if (isDoubles) {
        state.consecutiveDoubles += 1;

        // Add doubles notification
        state.gameMessages.unshift({
          type: 'DOUBLES',
          playerId: rollingPlayer.id,
          content: `${rollingPlayer.name} rolled doubles!`,
          data: {
            dice: diceValues,
            consecutiveDoubles: state.consecutiveDoubles
          },
          timestamp
        });

        // Check if player should go to jail (3 consecutive doubles)
        if (state.consecutiveDoubles >= 3) {
          // Set player position to jail (position 10)
          rollingPlayer.position = 10;
          rollingPlayer.inJail = true;

          // Add jail notification
          state.gameMessages.unshift({
            type: 'JAIL',
            playerId: rollingPlayer.id,
            content: `${rollingPlayer.name} was sent to jail for rolling 3 consecutive doubles!`,
            timestamp
          });

          // Reset consecutive doubles
          state.consecutiveDoubles = 0;
        }
      } else {
        // Reset consecutive doubles if not doubles
        state.consecutiveDoubles = 0;
      }

      // Add a roll result message if not already added elsewhere
      if (!action.payload.skipMessage) {
        state.gameMessages.unshift({
          type: 'ROLL_RESULT',
          playerId: rollingPlayer.id,
          content: `${rollingPlayer.name} rolled ${diceValues[0]} and ${diceValues[1]}`,
          dice: diceValues,
          timestamp
        });
      }
    },
    releaseFromJail: (state, action) => {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (player) {
        player.inJail = false;
        player.jailTurns = 0;

        // Add message to game log
        state.gameMessages.push({
          id: Date.now(),
          type: 'jail-release',
          playerId
        });
      }
    },
    decrementJailTurns: (state, action) => {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (player && player.inJail && player.jailTurns > 0) {
        player.jailTurns -= 1;

        // Auto-release if turns are up
        if (player.jailTurns === 0) {
          player.inJail = false;

          // Add message to game log
          state.gameMessages.push({
            id: Date.now(),
            type: 'jail-release',
            playerId,
            reason: 'time-served'
          });
        }
      }
    },
    addGameMessage: (state, action) => {
      state.gameMessages.push({
        id: Date.now(),
        ...action.payload
      });
    },
    clearGameMessages: (state) => {
      state.gameMessages = [];
    },
    setMaxPlayers: (state, action) => {
      state.maxPlayers = action.payload;
    },
    setGameInfo: (state, action) => {
      state.gameInfo = action.payload;
    },
    endTurn: (state) => {
      state.diceRolled = false;
      const currentIndex = state.players.findIndex(p => p.id === state.currentPlayer);
      if (currentIndex === -1) return; // Defensive

      const isDoubles = state.diceRoll[0] === state.diceRoll[1];
      const currentPlayer = state.players[currentIndex];

      if (!isDoubles || (currentPlayer && currentPlayer.inJail)) {
        // Advance to next player
        const nextIndex = (currentIndex + 1) % state.players.length;
        const nextPlayer = state.players[nextIndex];
        if (nextPlayer) {
          state.currentPlayer = nextPlayer.id;
          state.gameMessages.unshift({
            type: 'TURN_CHANGE',
            playerId: nextPlayer.id,
            content: `It's now ${nextPlayer.name}'s turn`,
            timestamp: Date.now()
          });
        }
      } else {
        // If doubles, same player gets another turn
        state.gameMessages.unshift({
          type: 'EXTRA_TURN',
          playerId: currentPlayer.id,
          content: `${currentPlayer.name} rolled doubles and gets another turn!`,
          timestamp: Date.now()
        });
      }
    },
    setPlayers: {
      reducer: (state, action) => {
        state.players = action.payload;
      },
      prepare: (players, isSync = false) => {
        return {
          payload: players,
          meta: { isSync }
        };
      }
    },
    setIsRolling: (state, action) => {
      state.isRolling = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Add Player
      .addCase(addPlayerAsync.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addPlayerAsync.fulfilled, (state, action) => {
        state.players.push(action.payload);
        state.loading = false;
      })
      .addCase(addPlayerAsync.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // Start Game
      .addCase(startGameAsync.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(startGameAsync.fulfilled, (state) => {
        state.gameStarted = true;
        state.gamePhase = 'playing';
        state.loading = false;
      })
      .addCase(startGameAsync.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

// Export actions
export const {
  setGameStarted,
  setGamePhase,
  syncGameStatus,
  setGameStartedTimestamp,
  forceTurnUpdate,
  addPlayer,
  removePlayer,
  setCurrentPlayer,
  movePlayer,
  updatePlayerBalance,
  buyProperty,
  mortgageProperty,
  unmortgageProperty,
  setPlayerReady,
  setRoomCode,
  setHost,
  endGame,
  updateDiceRoll,
  releaseFromJail,
  decrementJailTurns,
  addGameMessage,
  clearGameMessages,
  setMaxPlayers,
  setGameInfo,
  endTurn,
  setPlayers,
  setIsRolling
} = gameSlice.actions;

// Export reducer
export default gameSlice.reducer;