// Logger utility to control console output
const DEBUG_MODE = false; // Set to false to disable console logs for production

/**
 * Controlled logging function that only outputs when DEBUG_MODE is true
 * @param {string} category - The log category (e.g., 'SOCKET', 'GAME', 'POSITION')
 * @param {string} message - The log message
 * @param {any} data - Optional data to log
 */
export const log = (category, message, data) => {
  if (DEBUG_MODE) {
    if (data !== undefined) {
      console.log(`[${category}] ${message}`, data);
    } else {
      console.log(`[${category}] ${message}`);
    }
  }
};

/**
 * Error logging - always shown regardless of DEBUG_MODE
 * @param {string} category - The log category
 * @param {string} message - The error message
 * @param {any} error - Optional error object
 */
export const logError = (category, message, error) => {
  if (error !== undefined) {
    console.error(`[${category}] ${message}`, error);
  } else {
    console.error(`[${category}] ${message}`);
  }
};

/**
 * Warning logging - always shown regardless of DEBUG_MODE
 * @param {string} category - The log category
 * @param {string} message - The warning message
 * @param {any} data - Optional data
 */
export const logWarning = (category, message, data) => {
  if (data !== undefined) {
    console.warn(`[${category}] ${message}`, data);
  } else {
    console.warn(`[${category}] ${message}`);
  }
};

export default {
  log,
  logError,
  logWarning
};
