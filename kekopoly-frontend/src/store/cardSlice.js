import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  currentCard: null,
  chanceCards: [],
  communityChestCards: [],
};

const cardSlice = createSlice({
  name: 'cards',
  initialState,
  reducers: {
    setCurrentCard: (state, action) => {
      state.currentCard = action.payload;
    },
    shuffleCards: (state) => {
      // Implementation of Fisher-Yates shuffle
      const shuffle = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
        }
      };
      
      shuffle(state.chanceCards);
      shuffle(state.communityChestCards);
    },
  },
});

export const { setCurrentCard, shuffleCards } = cardSlice.actions;
export default cardSlice.reducer; 