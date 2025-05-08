/**
 * API Utilities for making authenticated requests
 */

/**
 * Helper function to safely access the Redux store
 * @returns {any} The Redux store or null if not available
 */
const getReduxStore = () => {
  // @ts-ignore - window.store is set in our app
  if (typeof window !== 'undefined' && window.store) {
    // @ts-ignore - window.store is set in our app
    return window.store;
  }
  return null;
};

/**
 * Get the authentication token from Redux store or localStorage
 * @returns {string|null} The formatted authentication token or null if not available
 */
export const getAuthToken = () => {
  // Try to get token from Redux store first
  let token = null;

  // If Redux store is available, get token from there
  const store = getReduxStore();
  if (store && store.getState && store.getState().auth && store.getState().auth.token) {
    token = store.getState().auth.token;
  }

  // If token not found in Redux, try localStorage
  if (!token) {
    const storedToken = localStorage.getItem('kekopoly_token');
    if (storedToken) {
      token = storedToken;
    }
  }

  // Ensure token is properly formatted with 'Bearer ' prefix
  if (token && !token.startsWith('Bearer ')) {
    token = `Bearer ${token}`;
  }

  return token;
};

/**
 * Make an authenticated API request
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
export const apiRequest = async (url, options = {}) => {
  const token = getAuthToken();

  if (!token) {
    console.error('No authentication token available for API request');
    throw new Error('Authentication required');
  }

  // Set up headers with authentication
  const headers = {
    'Authorization': token,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  // Make the request with authentication header
  const response = await fetch(url, {
    ...options,
    headers
  });

  // Handle authentication errors
  if (response.status === 401) {
    console.error('Authentication failed for API request:', url);

    // Try to refresh the token from localStorage
    const refreshedToken = localStorage.getItem('kekopoly_token');
    if (refreshedToken && refreshedToken !== token) {
      // console.log('Found different token in localStorage, retrying request with new token');

      // Update Redux store with the new token if available
      const store = getReduxStore();
      if (store && store.dispatch) {
        store.dispatch({ type: 'auth/setToken', payload: refreshedToken });
      }

      // Retry the request with the new token
      const retryHeaders = {
        'Authorization': refreshedToken.startsWith('Bearer ') ? refreshedToken : `Bearer ${refreshedToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      const retryResponse = await fetch(url, {
        ...options,
        headers: retryHeaders
      });

      if (retryResponse.ok) {
        // console.log('Request succeeded with refreshed token');
        return retryResponse;
      }
    }

    throw new Error('Authentication required');
  }

  // Handle other errors
  if (!response.ok) {
    console.error(`API request failed with status ${response.status}:`, url);
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response;
};

/**
 * Make a GET request to the API
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} The parsed JSON response
 */
export const apiGet = async (url, options = {}) => {
  const response = await apiRequest(url, {
    method: 'GET',
    ...options
  });

  return await response.json();
};

/**
 * Make a POST request to the API
 * @param {string} url - The API endpoint URL
 * @param {Object} data - The data to send in the request body
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} The parsed JSON response
 */
export const apiPost = async (url, data, options = {}) => {
  const response = await apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(data),
    ...options
  });

  return await response.json();
};

/**
 * Make a PUT request to the API
 * @param {string} url - The API endpoint URL
 * @param {Object} data - The data to send in the request body
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} The parsed JSON response
 */
export const apiPut = async (url, data, options = {}) => {
  const response = await apiRequest(url, {
    method: 'PUT',
    body: JSON.stringify(data),
    ...options
  });

  return await response.json();
};

/**
 * Make a DELETE request to the API
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} The parsed JSON response
 */
export const apiDelete = async (url, options = {}) => {
  const response = await apiRequest(url, {
    method: 'DELETE',
    ...options
  });

  return await response.json();
};
