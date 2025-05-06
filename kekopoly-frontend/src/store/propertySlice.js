import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  selectedProperty: null,
  propertyDetails: {},
};

const propertySlice = createSlice({
  name: 'properties',
  initialState,
  reducers: {
    setSelectedProperty: (state, action) => {
      state.selectedProperty = action.payload;
    },
    updatePropertyDetails: (state, action) => {
      state.propertyDetails[action.payload.id] = action.payload;
    },
  },
});

export const { setSelectedProperty, updatePropertyDetails } = propertySlice.actions;
export default propertySlice.reducer; 