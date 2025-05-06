package config

import (
	"github.com/spf13/viper"
)

// Config holds all configuration for the application
type Config struct {
	Server  ServerConfig  `mapstructure:"server"`
	MongoDB MongoDBConfig `mapstructure:"mongodb"`
	Redis   RedisConfig   `mapstructure:"redis"`
	JWT     JWTConfig     `mapstructure:"jwt"`
	Game    GameConfig    `mapstructure:"game"`
	Solana  SolanaConfig  `mapstructure:"solana"`
}

// ServerConfig holds server-specific configuration
type ServerConfig struct {
	Port         int    `mapstructure:"port"`
	Host         string `mapstructure:"host"`
	ReadTimeout  int    `mapstructure:"read_timeout"`
	WriteTimeout int    `mapstructure:"write_timeout"`
}

// MongoDBConfig holds MongoDB connection configuration
type MongoDBConfig struct {
	URI        string `mapstructure:"uri"`
	Database   string `mapstructure:"database"`
	GamesColl  string `mapstructure:"games_collection"`
	PlayerColl string `mapstructure:"player_collection"`
	PropColl   string `mapstructure:"property_collection"`
	CardColl   string `mapstructure:"card_collection"`
	TxColl     string `mapstructure:"transaction_collection"`
}

// RedisConfig holds Redis connection configuration
type RedisConfig struct {
	URI      string `mapstructure:"uri"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
}

// JWTConfig holds JWT configuration
type JWTConfig struct {
	Secret     string `mapstructure:"secret"`
	Expiration int    `mapstructure:"expiration"` // in hours
}

// GameConfig holds game-specific configuration
type GameConfig struct {
	DisconnectionTimeout   int `mapstructure:"disconnection_timeout"` // in seconds
	MaxPlayers             int `mapstructure:"max_players"`
	InitialBalance         int `mapstructure:"initial_balance"`
	TurnTimeout            int `mapstructure:"turn_timeout"` // in seconds
	CardDeckSize           int `mapstructure:"card_deck_size"`
	MinimumPlayersToStart  int `mapstructure:"minimum_players_to_start"`
	IdleGameExpiryDuration int `mapstructure:"idle_game_expiry"` // in hours
}

// SolanaConfig holds Solana blockchain configuration
type SolanaConfig struct {
	RpcURL  string `mapstructure:"rpc_url"`
	Network string `mapstructure:"network"`
	DevMode bool   `mapstructure:"dev_mode"`
}

// Load reads configuration from a file or environment variables
func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")
	viper.AddConfigPath("/etc/kekopoly-backend")

	// Environment variables
	viper.AutomaticEnv()

	// Set defaults
	setDefaults()

	// Read the config file
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
		// Config file not found; we'll just use environment and defaults
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}

// setDefaults sets default values for configuration
func setDefaults() {
	// Server defaults
	viper.SetDefault("server.port", 8080)
	viper.SetDefault("server.host", "0.0.0.0")
	viper.SetDefault("server.read_timeout", 15)
	viper.SetDefault("server.write_timeout", 15)

	// MongoDB defaults
	viper.SetDefault("mongodb.uri", "mongodb://localhost:27017")
	viper.SetDefault("mongodb.database", "kekopoly")
	viper.SetDefault("mongodb.games_collection", "games")
	viper.SetDefault("mongodb.player_collection", "players")
	viper.SetDefault("mongodb.property_collection", "properties")
	viper.SetDefault("mongodb.card_collection", "cards")
	viper.SetDefault("mongodb.transaction_collection", "transactions")

	// Redis defaults
	viper.SetDefault("redis.uri", "localhost:6379")
	viper.SetDefault("redis.password", "")
	viper.SetDefault("redis.db", 0)

	// JWT defaults
	viper.SetDefault("jwt.secret", "replace-with-secure-secret")
	viper.SetDefault("jwt.expiration", 24)

	// Game defaults
	viper.SetDefault("game.disconnection_timeout", 180) // 3 minutes
	viper.SetDefault("game.max_players", 6)
	viper.SetDefault("game.initial_balance", 1500)
	viper.SetDefault("game.turn_timeout", 120)
	viper.SetDefault("game.card_deck_size", 16)
	viper.SetDefault("game.minimum_players_to_start", 2)
	viper.SetDefault("game.idle_game_expiry", 24)

	// Solana defaults
	viper.SetDefault("solana.rpc_url", "") // Empty means use the default mainnet
	viper.SetDefault("solana.network", "mainnet")
	viper.SetDefault("solana.dev_mode", false) // Default to dev mode for easier development
}
