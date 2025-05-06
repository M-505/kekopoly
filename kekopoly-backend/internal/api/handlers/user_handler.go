package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
)

// UserHandler handles user-related requests
type UserHandler struct {
	logger *zap.SugaredLogger
}

// NewUserHandler creates a new UserHandler
func NewUserHandler(logger *zap.SugaredLogger) *UserHandler {
	return &UserHandler{
		logger: logger,
	}
}

// UserProfileResponse represents a user profile response
type UserProfileResponse struct {
	UserID        string `json:"userId"`
	Username      string `json:"username"`
	Email         string `json:"email"`
	WalletAddress string `json:"walletAddress,omitempty"`
	AvatarURL     string `json:"avatarUrl,omitempty"`
}

// UpdateProfileRequest represents a profile update request
type UpdateProfileRequest struct {
	Username  string `json:"username,omitempty" validate:"omitempty,min=3,max=20"`
	AvatarURL string `json:"avatarUrl,omitempty"`
}

// WalletInfo represents wallet information
type WalletInfo struct {
	Address     string `json:"address"`
	IsVerified  bool   `json:"isVerified"`
	Balance     string `json:"balance,omitempty"`
	TokenName   string `json:"tokenName"`
	TokenSymbol string `json:"tokenSymbol"`
}

// GetProfile gets the user's profile
func (h *UserHandler) GetProfile(c echo.Context) error {
	// Get user ID from context (set by JWT middleware)
	userID := c.Get("userID").(string)

	// In a real implementation, we would fetch user profile from database
	// For this simplified implementation, we'll just return mock data
	return c.JSON(http.StatusOK, UserProfileResponse{
		UserID:        userID,
		Username:      "player_" + userID[:6],
		Email:         "user@example.com",
		WalletAddress: c.Get("walletAddress").(string),
	})
}

// UpdateProfile updates the user's profile
func (h *UserHandler) UpdateProfile(c echo.Context) error {
	// Get user ID from context (set by JWT middleware)
	userID := c.Get("userID").(string)

	var req UpdateProfileRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// In a real implementation, we would update user profile in database
	// For this simplified implementation, we'll just return success
	h.logger.Infof("User %s updated profile", userID)

	return c.NoContent(http.StatusNoContent)
}

// GetWallet gets the user's wallet information
func (h *UserHandler) GetWallet(c echo.Context) error {
	// Get wallet address from context (set by JWT middleware)
	walletAddress, ok := c.Get("walletAddress").(string)
	if !ok || walletAddress == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "No wallet connected")
	}

	// In a real implementation, we would fetch wallet info from blockchain
	// For this simplified implementation, we'll just return mock data
	return c.JSON(http.StatusOK, WalletInfo{
		Address:     walletAddress,
		IsVerified:  true,
		Balance:     "1000",
		TokenName:   "Kekels Meme Token",
		TokenSymbol: "KMT",
	})
}

// VerifyWalletRequest represents a wallet verification request
type VerifyWalletRequest struct {
	Signature string `json:"signature" validate:"required"`
	Message   string `json:"message" validate:"required"`
}

// VerifyWallet verifies the user's wallet
func (h *UserHandler) VerifyWallet(c echo.Context) error {
	// Get wallet address from context (set by JWT middleware)
	walletAddress, ok := c.Get("walletAddress").(string)
	if !ok || walletAddress == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "No wallet connected")
	}

	var req VerifyWalletRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// In a real implementation, we would verify the signature against the wallet address
	// For this simplified implementation, we'll just return success
	h.logger.Infof("Wallet %s verified", walletAddress)

	return c.NoContent(http.StatusNoContent)
}
