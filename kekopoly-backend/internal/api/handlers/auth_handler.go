package handlers

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/kekopoly/backend/internal/api/middleware/auth"
	solanaauth "github.com/kekopoly/backend/internal/auth"
	"github.com/kekopoly/backend/internal/config"
)

// AuthHandler handles authentication-related requests
type AuthHandler struct {
	cfg       *config.Config
	logger    *zap.SugaredLogger
	validator *solanaauth.SolanaValidator
}

// NewAuthHandler creates a new AuthHandler
func NewAuthHandler(cfg *config.Config, logger *zap.SugaredLogger) *AuthHandler {
	handler := &AuthHandler{
		cfg:    cfg,
		logger: logger,
	}

	// Create validator if config is available
	if cfg != nil {
		var rpcURL string
		if cfg.Solana.RpcURL != "" {
			rpcURL = cfg.Solana.RpcURL
			logger.Infow("Initializing Solana validator with configured RPC URL", "url", rpcURL)
		} else {
			logger.Info("Initializing Solana validator with default mainnet RPC URL")
		}

		// Create validator
		handler.validator = solanaauth.NewSolanaValidator(rpcURL)

		// Set validator state based on config
		if cfg.Solana.DevMode {
			logger.Warn("Development mode enabled - signature validation will be bypassed")
			handler.validator.Disable()
		} else {
			logger.Info("Production mode - signature validation is enabled")
			handler.validator.Enable()
		}
	} else {
		// Create disabled validator if no config
		logger.Warn("No configuration provided - creating disabled validator")
		handler.validator = solanaauth.NewSolanaValidator("")
		handler.validator.Disable()
	}

	return handler
}

// RegisterRequest represents a user registration request
type RegisterRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Username string `json:"username" validate:"required,min=3,max=20"`
	Password string `json:"password" validate:"required,min=8"`
}

// LoginRequest represents a user login request
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// WalletConnectRequest represents a wallet connection request
type WalletConnectRequest struct {
	WalletAddress string `json:"walletAddress" validate:"required"`
	Signature     string `json:"signature" validate:"required"`
	Message       string `json:"message" validate:"required"`
	Format        string `json:"format,omitempty"`
}

// AuthResponse represents an authentication response
type AuthResponse struct {
	UserID        string `json:"userId"`
	Username      string `json:"username,omitempty"`
	Email         string `json:"email,omitempty"`
	WalletAddress string `json:"walletAddress,omitempty"`
	Token         string `json:"token"`
}

// Register handles user registration
func (h *AuthHandler) Register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// In a real implementation, we would:
	// 1. Check if user already exists
	// 2. Hash the password
	// 3. Store user in database

	// For this simplified implementation, we'll just generate a token
	userID := uuid.New().String()

	// Generate JWT token
	token, err := auth.GenerateJWT(userID, "", h.cfg.JWT.Secret, h.cfg.JWT.Expiration)
	if err != nil {
		h.logger.Errorf("Failed to generate JWT: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to generate token")
	}

	return c.JSON(http.StatusCreated, AuthResponse{
		UserID:   userID,
		Username: req.Username,
		Email:    req.Email,
		Token:    token,
	})
}

// Login handles user login
func (h *AuthHandler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// In a real implementation, we would:
	// 1. Retrieve user from database
	// 2. Verify password hash

	// For this simplified implementation, we'll just generate a token
	userID := uuid.New().String() // In a real implementation, this would be the actual user ID

	// Generate JWT token
	token, err := auth.GenerateJWT(userID, "", h.cfg.JWT.Secret, h.cfg.JWT.Expiration)
	if err != nil {
		h.logger.Errorf("Failed to generate JWT: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to generate token")
	}

	return c.JSON(http.StatusOK, AuthResponse{
		UserID: userID,
		Email:  req.Email,
		Token:  token,
	})
}

// WalletConnect handles wallet connection
func (h *AuthHandler) WalletConnect(c echo.Context) error {
	var req WalletConnectRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// Check if we should run in development mode
	var devMode bool
	if h.cfg != nil && h.cfg.Solana.DevMode {
		devMode = true
		h.logger.Warn("DEVELOPMENT MODE: Signature verification may be bypassed")
	}

	// If validator is nil, create an empty one and disable it
	if h.validator == nil {
		h.logger.Warn("Creating fallback validator in disabled state")
		h.validator = solanaauth.NewSolanaValidator("")
		h.validator.Disable()
	}

	// In dev mode, disable validation
	if devMode {
		h.validator.Disable()
	}

	// Get format from request
	format := req.Format
	if format == "" {
		// Get from query param or form value as fallback
		format = c.QueryParam("format")
		if format == "" && c.Request().PostFormValue("format") != "" {
			format = c.Request().PostFormValue("format")
		}
	}

	// Log attempt
	h.logger.Infow("Wallet connection attempt",
		"wallet", req.WalletAddress,
		"format", format,
		"validation_enabled", h.validator.IsEnabled())

	// Verify signature if validation is enabled
	valid, err := h.validator.VerifySignature(
		req.WalletAddress,
		req.Message,
		req.Signature,
		format,
	)

	// Handle validation errors
	if err != nil {
		h.logger.Errorf("Signature verification error: %v", err)
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid signature: "+err.Error())
	}

	// Handle invalid signatures
	if !valid {
		h.logger.Warnf("Invalid signature for wallet %s", req.WalletAddress)
		return echo.NewHTTPError(http.StatusUnauthorized, "Signature verification failed")
	}

	// Generate a user ID and JWT token
	userID := uuid.New().String()
	token, err := auth.GenerateJWT(userID, req.WalletAddress, h.cfg.JWT.Secret, h.cfg.JWT.Expiration)
	if err != nil {
		h.logger.Errorf("Failed to generate JWT: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to generate token")
	}

	// Log successful authentication
	h.logger.Infow("Wallet authenticated successfully",
		"wallet", req.WalletAddress,
		"userId", userID)

	return c.JSON(http.StatusOK, AuthResponse{
		UserID:        userID,
		WalletAddress: req.WalletAddress,
		Token:         token,
	})
}

// RefreshToken handles token refresh
func (h *AuthHandler) RefreshToken(c echo.Context) error {
	// Get user ID from context (set by JWT middleware)
	userID := c.Get("userID").(string)
	walletAddress := ""
	if addr, ok := c.Get("walletAddress").(string); ok {
		walletAddress = addr
	}

	// Generate new token
	token, err := auth.GenerateJWT(userID, walletAddress, h.cfg.JWT.Secret, h.cfg.JWT.Expiration)
	if err != nil {
		h.logger.Errorf("Failed to generate JWT: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to generate token")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"token": token,
	})
}

// Logout handles user logout
func (h *AuthHandler) Logout(c echo.Context) error {
	// In a real implementation, we would:
	// 1. Add the token to a blacklist
	// 2. Possibly invalidate any sessions

	// For this simplified implementation, we'll just return success
	return c.NoContent(http.StatusNoContent)
}
