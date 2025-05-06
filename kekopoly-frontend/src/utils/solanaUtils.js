/**
 * Utility functions for Solana wallet interactions
 */

/**
 * Signs a message with the given Solana wallet
 * @param {Object} wallet - The Solana wallet object (e.g., window.solana)
 * @param {string} message - The message to sign
 * @returns {Promise<Object>} The signature data in multiple formats
 */
export const signMessageWithSolana = async (wallet, message) => {
  if (!wallet) {
    throw new Error('No Solana wallet provided');
  }
  
  if (!wallet.isPhantom) {
    throw new Error('Wallet does not appear to be Phantom wallet');
  }
  
  // Encode message to bytes
  const messageBytes = new TextEncoder().encode(message);
  
  // Request signature from wallet
  const signatureData = await wallet.signMessage(messageBytes, 'utf8');
  
  // Original signature bytes
  const signatureBytes = new Uint8Array(signatureData.signature);
  
  // Convert to various formats
  const base64Signature = btoa(
    Array.from(signatureBytes)
      .map(byte => String.fromCharCode(byte))
      .join('')
  );
  
  const hexSignature = Array.from(signatureBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return {
    signature: signatureData.signature, // Original ArrayBuffer
    bytes: signatureBytes, // Uint8Array
    base64: base64Signature,
    hex: hexSignature,
    message,
    wallet: wallet.publicKey.toString()
  };
};

/**
 * Connects to Phantom wallet and signs a message
 * @param {string} message - The message to sign
 * @returns {Promise<Object>} Connection and signature data
 */
export const connectAndSignWithPhantom = async (message) => {
  const { solana } = window;
  
  if (!solana?.isPhantom) {
    throw new Error('Phantom wallet is not installed. Please install it from https://phantom.app/');
  }
  
  // Connect to wallet
  const connectResponse = await solana.connect();
  const walletAddress = connectResponse.publicKey.toString();
  
  // Create message if not provided
  const messageToSign = message || `Login to Kekopoly with wallet ${walletAddress} at ${new Date().toISOString()}`;
  
  // Sign the message
  const signatureData = await signMessageWithSolana(solana, messageToSign);
  
  return {
    walletAddress,
    messageToSign,
    signature: signatureData,
    network: 'mainnet'
  };
}; 