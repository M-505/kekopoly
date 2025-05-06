package auth

import (
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

// SolanaValidator handles Solana signature validation
type SolanaValidator struct {
	client  *rpc.Client
	rpcURL  string
	enabled bool
	mu      sync.RWMutex // For thread-safe operations
}

// NewSolanaValidator creates a new SolanaValidator
func NewSolanaValidator(rpcURL string) *SolanaValidator {
	// If no RPC URL is provided, use mainnet
	if rpcURL == "" {
		rpcURL = rpc.MainNetBeta_RPC
	}

	// Create the validator with enabled state
	validator := &SolanaValidator{
		rpcURL:  rpcURL,
		enabled: true,
	}

	// Initialize the client
	validator.client = rpc.New(rpcURL)

	return validator
}

// IsEnabled returns whether validation is enabled
func (v *SolanaValidator) IsEnabled() bool {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.enabled
}

// Enable enables validation
func (v *SolanaValidator) Enable() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.enabled = true
}

// Disable disables validation
func (v *SolanaValidator) Disable() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.enabled = false
}

// VerifySignature verifies a Solana signature
// Returns true if valid, false if invalid
func (v *SolanaValidator) VerifySignature(walletAddress, message, signature string, format string) (bool, error) {
	// Check if validation is enabled
	v.mu.RLock()
	if !v.enabled {
		v.mu.RUnlock()
		return true, nil // Always return true if validation is disabled
	}
	v.mu.RUnlock()

	// Ensure validator is properly initialized
	if v.client == nil {
		return false, errors.New("solana validator client not initialized")
	}

	// Parse wallet public key
	pubKey, err := solana.PublicKeyFromBase58(walletAddress)
	if err != nil {
		return false, fmt.Errorf("invalid wallet address: %w", err)
	}

	// Convert signature from provided format to bytes
	var signatureBytes []byte
	switch strings.ToLower(format) {
	case "hex":
		signatureBytes, err = hex.DecodeString(signature)
		if err != nil {
			return false, fmt.Errorf("invalid hex signature: %w", err)
		}
	case "base64":
		signatureBytes, err = base64.StdEncoding.DecodeString(signature)
		if err != nil {
			return false, fmt.Errorf("invalid base64 signature: %w", err)
		}
	case "buffer":
		// Try to parse a JSON array of bytes
		// This is a fallback for when the signature is sent as a JSON array of numbers
		signatureBytes, err = parseBufferSignature(signature)
		if err != nil {
			return false, fmt.Errorf("invalid buffer signature: %w", err)
		}
	default:
		// Try all formats if none specified
		if tempBytes, tempErr := hex.DecodeString(signature); tempErr == nil {
			signatureBytes = tempBytes
		} else if tempBytes, tempErr := base64.StdEncoding.DecodeString(signature); tempErr == nil {
			signatureBytes = tempBytes
		} else {
			signatureBytes, err = parseBufferSignature(signature)
			if err != nil {
				return false, fmt.Errorf("could not parse signature in any format: %w", err)
			}
		}
	}

	// Ensure we have the right signature length
	if len(signatureBytes) != 64 {
		return false, fmt.Errorf("invalid signature length: got %d, want 64", len(signatureBytes))
	}

	// Create Solana signature
	var solanaSig solana.Signature
	copy(solanaSig[:], signatureBytes)

	// Verify the signature
	messageBytes := []byte(message)
	return solanaSig.Verify(pubKey, messageBytes), nil
}

// Helper to parse signature from buffer format (JSON array of numbers)
func parseBufferSignature(bufferStr string) ([]byte, error) {
	// Remove brackets and all whitespace
	bufferStr = strings.Trim(bufferStr, "[]")
	bufferStr = strings.ReplaceAll(bufferStr, " ", "")
	bufferStr = strings.ReplaceAll(bufferStr, "\n", "")
	bufferStr = strings.ReplaceAll(bufferStr, "\t", "")

	// Split by commas
	parts := strings.Split(bufferStr, ",")
	if len(parts) != 64 {
		return nil, errors.New("buffer signature must have 64 bytes")
	}

	// Convert each part to a byte
	result := make([]byte, len(parts))
	for i, part := range parts {
		var b byte
		_, err := fmt.Sscanf(part, "%d", &b)
		if err != nil {
			return nil, fmt.Errorf("invalid byte at position %d: %w", i, err)
		}
		result[i] = b
	}

	return result, nil
}
