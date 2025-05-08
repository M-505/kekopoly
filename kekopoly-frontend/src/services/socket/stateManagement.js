/**
 * State Management
 * 
 * This module contains methods for managing socket connection state,
 * including saving and loading state from memory and localStorage.
 */

import { log, logWarning } from '../../utils/logger';

/**
 * Saves a state value to memory and optionally to localStorage
 * @param {string} key - The state key
 * @param {any} value - The state value
 */
export function saveState(key, value) {
  this.connectionState[key] = value;

  // Also save critical connection data to localStorage for recovery
  if (['gameId', 'playerId', 'sessionId', 'token'].includes(key)) {
    try {
      localStorage.setItem(`kekopoly_${key}`, value);
    } catch (e) {
      logWarning('STATE', `Failed to save ${key} to localStorage:`, e);
    }
  }
}

/**
 * Loads a state value from memory or localStorage
 * @param {string} key - The state key
 * @param {any} defaultValue - The default value if not found
 * @returns {any} - The state value
 */
export function loadState(key, defaultValue = null) {
  // First try to get from memory state
  if (this.connectionState.hasOwnProperty(key)) {
    return this.connectionState[key];
  }

  // Then try localStorage for critical connection data
  if (['gameId', 'playerId', 'sessionId', 'token'].includes(key)) {
    try {
      const value = localStorage.getItem(`kekopoly_${key}`);
      if (value !== null) {
        return value;
      }
    } catch (e) {
      logWarning('STATE', `Failed to load ${key} from localStorage:`, e);
    }
  }

  return defaultValue;
}
