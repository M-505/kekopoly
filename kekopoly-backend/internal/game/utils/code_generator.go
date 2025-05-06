package utils

import (
	"crypto/rand"
	"math/big"
	"strings"
)

const (
	// CodeLength is the length of generated room codes
	CodeLength = 6

	// CodeCharset defines the characters used in room codes
	// Excluding similar-looking characters like 0, O, 1, I, etc.
	CodeCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
)

// GenerateRoomCode creates a random alphanumeric code for game rooms
func GenerateRoomCode() (string, error) {
	charsetLength := big.NewInt(int64(len(CodeCharset)))
	codeBuilder := strings.Builder{}
	codeBuilder.Grow(CodeLength)

	for i := 0; i < CodeLength; i++ {
		// Generate a random index within the charset
		randomIndex, err := rand.Int(rand.Reader, charsetLength)
		if err != nil {
			return "", err
		}

		// Append the character at the random index to the code
		codeBuilder.WriteByte(CodeCharset[randomIndex.Int64()])
	}

	return codeBuilder.String(), nil
}

// IsValidRoomCode checks if a room code is valid
func IsValidRoomCode(code string) bool {
	if len(code) != CodeLength {
		return false
	}

	// Check if all characters are in the charset
	for _, char := range code {
		if !strings.ContainsRune(CodeCharset, char) {
			return false
		}
	}

	return true
}
