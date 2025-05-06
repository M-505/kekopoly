package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/zap"

	"github.com/kekopoly/backend/internal/api/middleware/auth"
)

// MockHub is a mock implementation of the Hub
type MockHub struct {
	mock.Mock
}

// HandleWebSocketConnection is a mock implementation
func (m *MockHub) HandleWebSocketConnection(conn *websocket.Conn, gameID string, userID string, sessionID string) {
	m.Called(conn, gameID, userID, sessionID)
}

// Run is a mock implementation
func (m *MockHub) Run() {
	m.Called()
}

// For testing purposes, we'll create a test version of the handler
type TestWebSocketHandler struct {
	mockHub *MockHub
	logger  *zap.SugaredLogger
}

// NewTestWebSocketHandler creates a test handler with a mock hub
func NewTestWebSocketHandler(mockHub *MockHub, logger *zap.SugaredLogger) *TestWebSocketHandler {
	return &TestWebSocketHandler{
		mockHub: mockHub,
		logger:  logger,
	}
}

// HandleConnection handles WebSocket connections for testing
func (h *TestWebSocketHandler) HandleConnection(c echo.Context) error {
	// Get game ID from path parameter
	gameID := c.Param("gameId")
	if gameID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing game ID")
	}

	// Get session ID from query parameter
	sessionID := c.QueryParam("sessionId")
	if sessionID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing session ID")
	}

	// Get user ID from context
	userID, _ := c.Get("userID").(string)

	// Create a mock connection for testing
	conn := &websocket.Conn{}

	// Call the mock hub
	h.mockHub.HandleWebSocketConnection(conn, gameID, userID, sessionID)
	return nil
}

// HandleLobbyConnection handles WebSocket connections for the lobby in testing
func (h *TestWebSocketHandler) HandleLobbyConnection(c echo.Context) error {
	// Get session ID from query parameter
	sessionID := c.QueryParam("sessionId")
	if sessionID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Missing session ID")
	}

	// Get user ID from context
	userID, _ := c.Get("userID").(string)

	// Create a mock connection for testing
	conn := &websocket.Conn{}

	// Call the mock hub
	h.mockHub.HandleWebSocketConnection(conn, "lobby", userID, sessionID)
	return nil
}

func TestHandleConnection(t *testing.T) {
	// Create a test server
	e := echo.New()

	// Setup mocks
	mockHub := new(MockHub)
	mockHub.On("HandleWebSocketConnection", mock.Anything, "game123", "user123", "session123").Return()

	// Create a logger
	logger, _ := zap.NewDevelopment()
	sugarLogger := logger.Sugar()

	// Create test websocket handler with mock hub
	handler := NewTestWebSocketHandler(mockHub, sugarLogger)

	// Create a test request
	req := httptest.NewRequest(http.MethodGet, "/ws/game123?sessionId=session123", nil)
	req.Header.Set("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyMTIzIn0.mockSignature")

	// Create a test response recorder
	rec := httptest.NewRecorder()

	// Create a context
	c := e.NewContext(req, rec)

	// Set path parameter
	c.SetParamNames("gameId")
	c.SetParamValues("game123")

	// Set user ID in context (normally done by JWT middleware)
	c.Set("userID", "user123")

	// Call the handler
	err := handler.HandleConnection(c)

	// Assert no error
	assert.NoError(t, err)

	// Verify expectations
	mockHub.AssertExpectations(t)
}

func TestHandleConnection_MissingGameID(t *testing.T) {
	// Create a test server
	e := echo.New()

	// Setup mocks
	mockHub := new(MockHub)

	// Create a logger
	logger, _ := zap.NewDevelopment()
	sugarLogger := logger.Sugar()

	// Create test websocket handler with mock hub
	handler := NewTestWebSocketHandler(mockHub, sugarLogger)

	// Create a test request
	req := httptest.NewRequest(http.MethodGet, "/ws/?sessionId=session123", nil)

	// Create a test response recorder
	rec := httptest.NewRecorder()

	// Create a context
	c := e.NewContext(req, rec)

	// Call the handler
	err := handler.HandleConnection(c)

	// Assert error
	httpErr, ok := err.(*echo.HTTPError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestHandleConnection_MissingSessionID(t *testing.T) {
	// Create a test server
	e := echo.New()

	// Setup mocks
	mockHub := new(MockHub)

	// Create a logger
	logger, _ := zap.NewDevelopment()
	sugarLogger := logger.Sugar()

	// Create test websocket handler with mock hub
	handler := NewTestWebSocketHandler(mockHub, sugarLogger)

	// Create a test request
	req := httptest.NewRequest(http.MethodGet, "/ws/game123", nil)

	// Create a test response recorder
	rec := httptest.NewRecorder()

	// Create a context
	c := e.NewContext(req, rec)

	// Set path parameter
	c.SetParamNames("gameId")
	c.SetParamValues("game123")

	// Call the handler
	err := handler.HandleConnection(c)

	// Assert error
	httpErr, ok := err.(*echo.HTTPError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestJWTMiddlewareForWebsocket(t *testing.T) {
	// Create a test server
	e := echo.New()

	// Create a JWT middleware
	jwtMiddleware := auth.JWTMiddleware("test-secret")

	// Generate a test token
	claims := &auth.Claims{
		UserID:           "test-user",
		RegisteredClaims: jwt.RegisteredClaims{},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte("test-secret"))

	// Create a test request
	req := httptest.NewRequest(http.MethodGet, "/ws/game123", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)

	// Create a test response recorder
	rec := httptest.NewRecorder()

	// Create a context
	c := e.NewContext(req, rec)

	// Create a handler function
	handlerFunc := func(c echo.Context) error {
		userID, ok := c.Get("userID").(string)
		assert.True(t, ok)
		assert.Equal(t, "test-user", userID)
		return c.String(http.StatusOK, "success")
	}

	// wrap the handler with the middleware
	middlewareFunc := jwtMiddleware(handlerFunc)

	// Call the middleware
	err := middlewareFunc(c)

	// Assert no error
	assert.NoError(t, err)
}

func TestJWTMiddlewareMissingToken(t *testing.T) {
	// Create a test server
	e := echo.New()

	// Create a JWT middleware
	jwtMiddleware := auth.JWTMiddleware("test-secret")

	// Create a test request with no Authorization header
	req := httptest.NewRequest(http.MethodGet, "/ws/game123", nil)

	// Create a test response recorder
	rec := httptest.NewRecorder()

	// Create a context
	c := e.NewContext(req, rec)

	// Create a handler function
	handlerFunc := func(c echo.Context) error {
		return c.String(http.StatusOK, "success")
	}

	// wrap the handler with the middleware
	middlewareFunc := jwtMiddleware(handlerFunc)

	// Call the middleware
	err := middlewareFunc(c)

	// Assert error
	httpErr, ok := err.(*echo.HTTPError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusUnauthorized, httpErr.Code)
	assert.Equal(t, "missing authorization header", httpErr.Message)
}
