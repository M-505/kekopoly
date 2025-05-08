import { createSlice } from '@reduxjs/toolkit';
import { connectAndSignWithPhantom } from '../utils/solanaUtils';

// Check if token exists in localStorage
const storedToken = localStorage.getItem('kekopoly_token');

// Ensure the token is properly formatted with 'Bearer ' prefix
const formattedToken = storedToken 
  ? (storedToken.startsWith('Bearer ') ? storedToken : `Bearer ${storedToken}`)
  : null;

const initialState = {
  isAuthenticated: !!storedToken,
  token: formattedToken,
  user: storedToken ? JSON.parse(localStorage.getItem('kekopoly_user') || '{}') : null,
  error: null,
  loading: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    connectStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    connectSuccess: (state, action) => {
      state.isAuthenticated = true;
      
      // Make sure token is properly formatted (if it's not prefixed with Bearer, add it)
      const token = action.payload.token.startsWith('Bearer ') 
        ? action.payload.token 
        : `Bearer ${action.payload.token}`;
      
      state.token = token;
      state.user = action.payload.user;
      state.loading = false;
      state.error = null;
      
      // Store token and user in localStorage
      localStorage.setItem('kekopoly_token', token);
      localStorage.setItem('kekopoly_user', JSON.stringify(action.payload.user));
      
      // console.log('Token saved to Redux and localStorage:', token.substring(0, 30) + '...');
    },
    connectFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
    disconnect: (state) => {
      state.isAuthenticated = false;
      state.token = null;
      state.user = null;
      
      // Remove token and user from localStorage
      localStorage.removeItem('kekopoly_token');
      localStorage.removeItem('kekopoly_user');
    },
  },
});

export const { connectStart, connectSuccess, connectFailure, disconnect } = authSlice.actions;

// Try authenticating with a specific signature format
const tryAuthenticate = async (payload) => {
  // console.log('Trying authentication with payload:', { ...payload, signature: payload.signature.substring(0, 20) + '...' });
  
  const response = await fetch('/api/v1/auth/wallet-connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Authentication failed (${response.status}): ${errorData.message || errorData.error || response.statusText}`);
  }
  
  return await response.json();
};

// Phantom wallet connection function
export const connectPhantomWallet = () => async (dispatch) => {
  dispatch(connectStart());
  
  try {
    // Use our utility to connect and sign with Phantom
    const { walletAddress, signature, messageToSign } = await connectAndSignWithPhantom();
    
    // console.log('Successfully connected to wallet and signed message');
    
    // Try different signature formats, starting with hex (most common in blockchain)
    const formats = [
      { name: 'hex', value: signature.hex },
      { name: 'base64', value: signature.base64 },
      // Try raw buffer encoding as a last resort
      { name: 'buffer', value: JSON.stringify(Array.from(signature.bytes)) }
    ];
    
    let authResult = null;
    let lastError = null;
    
    // Try each format until one works
    for (const format of formats) {
      const payload = {
        walletAddress,
        signature: format.value,
        message: messageToSign,
        network: 'mainnet',
        format: format.name // Hint to backend about signature format
      };
      
      try {
        authResult = await tryAuthenticate(payload);
        // console.log(`Successfully authenticated with ${format.name} signature`);
        break; // Exit loop on success
      } catch (error) {
        console.warn(`Failed to authenticate with ${format.name} signature:`, error.message);
        lastError = error;
        // Continue to next format
      }
    }
    
    // If all formats failed, throw the last error
    if (!authResult) {
      throw lastError || new Error('All signature formats failed');
    }
    
    // Check if we got a token
    if (!authResult.token) {
      throw new Error('No token received from server');
    }
    
    // Log token for debugging
    // console.log('Received token:', authResult.token.substring(0, 20) + '...');
    
    // Store token and user info
    dispatch(connectSuccess({
      token: authResult.token,
      user: {
        walletAddress,
        ...(authResult.user || {})
      },
    }));
    
    return true;
  } catch (error) {
    console.error('Wallet connection error:', error);
    
    // Provide more helpful error message based on the specific error
    let errorMessage = error.message || 'Failed to connect wallet';
    
    // Special case for specific error types
    if (errorMessage.includes('Authentication failed (500)')) {
      errorMessage = 'Server error: The authentication service is currently unavailable. Please try again later.';
    } else if (errorMessage.includes('validator not registered')) {
      errorMessage = 'The backend cannot validate Solana signatures. Please contact support.';
    }
    
    dispatch(connectFailure(errorMessage));
    return false;
  }
};

// Phantom wallet disconnect function
export const disconnectPhantomWallet = () => async (dispatch) => {
  try {
    const { solana } = window;
    
    if (solana?.isPhantom) {
      await solana.disconnect();
    }
    
    dispatch(disconnect());
    return true;
  } catch (error) {
    console.error('Wallet disconnect error:', error);
    return false;
  }
};

export default authSlice.reducer; 