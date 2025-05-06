package main

import (
	"fmt"
	"log"

	"github.com/kekopoly/backend/internal/auth"
)

func main() {
	fmt.Println("Testing Solana validator initialization...")

	// Test with empty URL (should default to mainnet)
	validator := auth.NewSolanaValidator("")
	if validator == nil {
		log.Fatal("Failed to create validator with empty URL")
	}
	fmt.Println("Validator created successfully with empty URL")

	// Test with explicit mainnet URL
	validator = auth.NewSolanaValidator("https://api.mainnet-beta.solana.com")
	if validator == nil {
		log.Fatal("Failed to create validator with mainnet URL")
	}
	fmt.Println("Validator created successfully with mainnet URL")

	// Test signature verification with sample data
	const wallet = "sYP4gSrLd8GZLkTD1qPeSXg52iG6PFndnX7v9i2Y9dT"
	const message = "Test message"
	const signature = "df839b8400f74c28bf08c782de6b221661366c3fbd311e09e5a2628a938035a20edef9bef67f2e7a47eeb16e9524a4cf46c840f7cff3b6f2d7d0fbe10773b700"

	valid, err := validator.VerifySignature(wallet, message, signature, "hex")
	if err != nil {
		fmt.Printf("Verification error: %v\n", err)
	} else {
		fmt.Printf("Signature verification result: %v\n", valid)
	}

	fmt.Println("Test completed")
}
