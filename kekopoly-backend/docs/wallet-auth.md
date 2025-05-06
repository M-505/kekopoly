# Solana Wallet Authentication

This document explains how to configure and use Solana wallet authentication in the Kekopoly backend.

## Overview

The system supports authentication using Solana wallet signatures. When a user wants to authenticate:

1. The frontend generates a message with the wallet address and timestamp
2. The user signs this message using their wallet
3. The signature, message, and wallet address are sent to the backend
4. The backend verifies the signature matches the message and wallet address
5. If valid, a JWT token is issued that includes the wallet address

## Development Mode

For development purposes, signature verification can be bypassed:

- In the current implementation, development mode is enabled by default
- When in development mode, all wallet signatures are accepted without verification
- This allows testing without requiring real wallet signatures

## Configuration

Configure Solana authentication in your `config.yaml` file:

```yaml
solana:
  rpc_url: "https://api.mainnet-beta.solana.com"  # Solana RPC endpoint
  network: "mainnet"                             # Network (mainnet, testnet, devnet)
  dev_mode: true                                 # Set to false in production
```

## API Endpoint

### POST /api/v1/auth/wallet-connect

Authenticates a user using their Solana wallet.

#### Request Body

```json
{
  "walletAddress": "sYP4gSrLd8GZLkTD1qPeSXg52iG6PFndnX7v9i2Y9dT",
  "signature": "df839b8400f74c28bf08c782de6b221661366c3fbd311e09e5a2628a938035a20edef9bef67f2e7a47eeb16e9524a4cf46c840f7cff3b6f2d7d0fbe10773b700",
  "message": "Login to Kekopoly with wallet sYP4gSrLd8GZLkTD1qPeSXg52iG6PFndnX7v9i2Y9dT at 2025-04-30T12:41:30.786Z",
  "format": "hex"
}
```

- `walletAddress`: The Solana wallet address
- `signature`: The signature of the message, signed by the wallet
- `message`: The message that was signed
- `format`: (Optional) The format of the signature - "hex", "base64", or "buffer"

#### Response

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "walletAddress": "sYP4gSrLd8GZLkTD1qPeSXg52iG6PFndnX7v9i2Y9dT",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Implementing in Production

To properly implement wallet signature verification in production:

1. Set `dev_mode: false` in your configuration
2. Ensure the Solana validator is properly initialized
3. Make sure all required Go modules are installed:
   ```
   go get github.com/gagliardetto/solana-go
   go mod tidy
   ```
4. Use a reliable Solana RPC endpoint in your configuration

## Troubleshooting

If you encounter issues with signature verification:

1. Check the logs for detailed error messages
2. Verify the signature format (hex, base64, buffer)
3. Ensure the wallet address is a valid Solana public key
4. Confirm the message hasn't been modified between signing and verification 