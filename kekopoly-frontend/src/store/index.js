import { configureStore } from '@reduxjs/toolkit';
import thunk from 'redux-thunk';
import gameReducer from './gameSlice';
import authReducer from './authSlice';
import playerReducer from './playerSlice';
import propertyReducer from './propertySlice';
import cardReducer from './cardSlice';

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
    }).concat(thunk),
  devTools: true,
});

export default store;