import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './gameSlice';
import playerReducer from './playerSlice';
import propertyReducer from './propertySlice';
import cardReducer from './cardSlice';
import authReducer from './authSlice';
import stateAdapterMiddleware from './middleware/stateAdapterMiddleware';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    game: gameReducer,
    players: playerReducer,
    properties: propertyReducer,
    cards: cardReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(stateAdapterMiddleware),
  devTools: true,
});

// Make store available globally for debugging
if (process.env.NODE_ENV !== 'production') {
  window.store = store;
}