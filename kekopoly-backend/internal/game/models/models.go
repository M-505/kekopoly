package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Game represents a game session
type Game struct {
	ID                            primitive.ObjectID `bson:"_id,omitempty" json:"gameId"`
	Code                          string             `bson:"code" json:"code"` // Alphanumeric room code
	Name                          string             `bson:"name" json:"name"`
	Status                        GameStatus         `bson:"status" json:"status"`
	CreatedAt                     time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt                     time.Time          `bson:"updatedAt" json:"updatedAt"`
	Players                       []Player           `bson:"players" json:"players"`
	HostID                        string             `bson:"hostId" json:"hostId"`         // Explicit host designation
	MaxPlayers                    int                `bson:"maxPlayers" json:"maxPlayers"` // Maximum number of players allowed
	CurrentTurn                   string             `bson:"currentTurn" json:"currentTurn"`
	TurnOrder                     []string           `bson:"turnOrder" json:"turnOrder"`
	BoardState                    BoardState         `bson:"boardState" json:"boardState"`
	LastActivity                  time.Time          `bson:"lastActivity" json:"lastActivity"`
	MarketCondition               MarketCondition    `bson:"marketCondition" json:"marketCondition"`
	MarketConditionRemainingTurns int                `bson:"marketConditionRemainingTurns" json:"marketConditionRemainingTurns"`
	WinnerID                      string             `bson:"winnerId,omitempty" json:"winnerId,omitempty"`
	SettlementStatus              SettlementStatus   `bson:"settlementStatus" json:"settlementStatus"`
}

// BoardState represents the current state of the game board
type BoardState struct {
	Properties     []Property `bson:"properties" json:"properties"`
	CardsRemaining CardCount  `bson:"cardsRemaining" json:"cardsRemaining"`
}

// CardCount represents the count of different card types remaining
type CardCount struct {
	Meme    int `bson:"meme" json:"meme"`
	Redpill int `bson:"redpill" json:"redpill"`
	Eegi    int `bson:"eegi" json:"eegi"`
}

// Player represents a player in the game
type Player struct {
	ID                      string       `bson:"playerId" json:"playerId"`
	UserID                  string       `bson:"userId" json:"userId"`
	WalletAddress           string       `bson:"walletAddress" json:"walletAddress"`
	WalletSignature         string       `bson:"walletSignature" json:"walletSignature"`
	CharacterToken          string       `bson:"characterToken" json:"characterToken"`
	Position                int          `bson:"position" json:"position"`
	Balance                 int          `bson:"balance" json:"balance"`
	Cards                   []Card       `bson:"cards" json:"cards"`
	Shadowbanned            bool         `bson:"shadowbanned" json:"shadowbanned"`
	ShadowbanRemainingTurns int          `bson:"shadowbanRemainingTurns" json:"shadowbanRemainingTurns"`
	Status                  PlayerStatus `bson:"status" json:"status"`
	DisconnectedAt          *time.Time   `bson:"disconnectedAt,omitempty" json:"disconnectedAt,omitempty"`
	Properties              []string     `bson:"properties" json:"properties"`
	InitialDeposit          int          `bson:"initialDeposit" json:"initialDeposit"`
	NetWorth                int          `bson:"netWorth" json:"netWorth"`
	// WebSocket session ID is not stored in the database
	SessionID string `bson:"-" json:"sessionId,omitempty"`
	// --- Jail fields ---
	InJail    bool `bson:"inJail" json:"inJail"`
	JailTurns int  `bson:"jailTurns" json:"jailTurns"`
}

// Property represents a property on the game board
type Property struct {
	ID             string          `bson:"propertyId" json:"propertyId"`
	Name           string          `bson:"name" json:"name"`
	Type           PropertyType    `bson:"type" json:"type"`
	Group          string          `bson:"group" json:"group"`
	Position       int             `bson:"position" json:"position"`
	OwnerID        string          `bson:"ownerId,omitempty" json:"ownerId,omitempty"`
	Price          int             `bson:"price" json:"price"`
	RentBase       int             `bson:"rentBase" json:"rentBase"`
	RentCurrent    int             `bson:"rentCurrent" json:"rentCurrent"`
	Mortgaged      bool            `bson:"mortgaged" json:"mortgaged"`
	Engagements    int             `bson:"engagements" json:"engagements"`
	BlueCheckmark  bool            `bson:"blueCheckmark" json:"blueCheckmark"`
	SpecialEffects []SpecialEffect `bson:"specialEffects,omitempty" json:"specialEffects,omitempty"`
	MemeName       string          `bson:"memeName,omitempty" json:"memeName,omitempty"`
}

// SpecialEffect represents a special effect applied to a property
type SpecialEffect struct {
	Type              string `bson:"type" json:"type"`
	AppliedBy         string `bson:"appliedBy" json:"appliedBy"`
	ExpiresAfterTurns int    `bson:"expiresAfterTurns" json:"expiresAfterTurns"`
}

// Card represents a card in the game
type Card struct {
	ID          string     `bson:"cardId" json:"cardId"`
	Name        string     `bson:"name" json:"name"`
	Type        CardType   `bson:"type" json:"type"`
	Rarity      CardRarity `bson:"rarity" json:"rarity"`
	Effect      string     `bson:"effect" json:"effect"`
	Description string     `bson:"description" json:"description"`
	ImageURL    string     `bson:"imageUrl" json:"imageUrl"`
}

// Transaction represents a financial transaction in the game
type Transaction struct {
	ID            string          `bson:"transactionId" json:"transactionId"`
	GameID        string          `bson:"gameId" json:"gameId"`
	Type          TransactionType `bson:"type" json:"type"`
	FromPlayerID  string          `bson:"fromPlayerId,omitempty" json:"fromPlayerId,omitempty"`
	ToPlayerID    string          `bson:"toPlayerId,omitempty" json:"toPlayerId,omitempty"`
	Amount        int             `bson:"amount" json:"amount"`
	PropertyID    string          `bson:"propertyId,omitempty" json:"propertyId,omitempty"`
	CardID        string          `bson:"cardId,omitempty" json:"cardId,omitempty"`
	Timestamp     time.Time       `bson:"timestamp" json:"timestamp"`
	OnChainStatus OnChainStatus   `bson:"onChainStatus" json:"onChainStatus"`
	OnChainTxID   string          `bson:"onChainTxId,omitempty" json:"onChainTxId,omitempty"`
	Signature     string          `bson:"signature,omitempty" json:"signature,omitempty"`
}

// GameAction represents an action in the game
type GameAction struct {
	Type      ActionType  `json:"type"`
	PlayerID  string      `json:"playerId"`
	GameID    string      `json:"gameId"`
	Payload   interface{} `json:"payload,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

// GameStatus represents the status of a game
type GameStatus string

const (
	GameStatusLobby     GameStatus = "LOBBY"
	GameStatusActive    GameStatus = "ACTIVE"
	GameStatusPaused    GameStatus = "PAUSED"
	GameStatusCompleted GameStatus = "COMPLETED"
	GameStatusAbandoned GameStatus = "ABANDONED"
)

// PlayerStatus represents the status of a player
type PlayerStatus string

const (
	PlayerStatusActive       PlayerStatus = "ACTIVE"
	PlayerStatusDisconnected PlayerStatus = "DISCONNECTED"
	PlayerStatusBankrupt     PlayerStatus = "BANKRUPT"
	PlayerStatusForfeited    PlayerStatus = "FORFEITED"
)

// PropertyType represents the type of a property
type PropertyType string

const (
	PropertyTypeRegular PropertyType = "REGULAR"
	PropertyTypeTransit PropertyType = "TRANSIT"
	PropertyTypeUtility PropertyType = "UTILITY"
	PropertyTypeSpecial PropertyType = "SPECIAL"
)

// CardType represents the type of a card
type CardType string

const (
	CardTypeMeme    CardType = "MEME"
	CardTypeRedpill CardType = "REDPILL"
	CardTypeEegi    CardType = "EEGI"
)

// CardRarity represents the rarity of a card
type CardRarity string

const (
	CardRarityCommon    CardRarity = "COMMON"
	CardRarityRare      CardRarity = "RARE"
	CardRarityLegendary CardRarity = "LEGENDARY"
)

// MarketCondition represents the market condition in the game
type MarketCondition string

const (
	MarketConditionNormal MarketCondition = "NORMAL"
	MarketConditionBull   MarketCondition = "BULL"
	MarketConditionCrash  MarketCondition = "CRASH"
)

// SettlementStatus represents the status of a game settlement
type SettlementStatus string

const (
	SettlementStatusPending    SettlementStatus = "PENDING"
	SettlementStatusInProgress SettlementStatus = "IN_PROGRESS"
	SettlementStatusCompleted  SettlementStatus = "COMPLETED"
	SettlementStatusFailed     SettlementStatus = "FAILED"
)

// TransactionType represents the type of a transaction
type TransactionType string

const (
	TransactionTypePurchase       TransactionType = "PURCHASE"
	TransactionTypeRent           TransactionType = "RENT"
	TransactionTypeCardEffect     TransactionType = "CARD_EFFECT"
	TransactionTypeSalary         TransactionType = "SALARY"
	TransactionTypePenalty        TransactionType = "PENALTY"
	TransactionTypeGameSettlement TransactionType = "GAME_SETTLEMENT"
	TransactionTypeDeposit        TransactionType = "DEPOSIT"
)

// OnChainStatus represents the status of an on-chain transaction
type OnChainStatus string

const (
	OnChainStatusPending   OnChainStatus = "PENDING"
	OnChainStatusCompleted OnChainStatus = "COMPLETED"
	OnChainStatusFailed    OnChainStatus = "FAILED"
)

// ActionType represents the type of a game action
type ActionType string

const (
	ActionTypeRollDice           ActionType = "ROLL_DICE"
	ActionTypeBuyProperty        ActionType = "BUY_PROPERTY"
	ActionTypePayRent            ActionType = "PAY_RENT"
	ActionTypeDrawCard           ActionType = "DRAW_CARD"
	ActionTypeUseCard            ActionType = "USE_CARD"
	ActionTypeMortgageProperty   ActionType = "MORTGAGE_PROPERTY"
	ActionTypeUnmortgageProperty ActionType = "UNMORTGAGE_PROPERTY"
	ActionTypeBuildEngagement    ActionType = "BUILD_ENGAGEMENT"
	ActionTypeBuildCheckmark     ActionType = "BUILD_CHECKMARK"
	ActionTypeEndTurn            ActionType = "END_TURN"
	ActionTypeTrade              ActionType = "TRADE"
	ActionTypeSpecial            ActionType = "SPECIAL"
)
