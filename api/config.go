package main

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds everything the app needs to run, read once from the environment.
type Config struct {
	DBHost            string
	DBPort            string
	DBUser            string
	DBPassword        string
	DBName            string
	Port              string
	JWTSecret         string
	OpenRouterKey     string
	Model             string
	SystemPrompt      string
	AllowedOrigin     string
	OpenRouterBaseURL string
	DatabaseURL       string
	LogLevel          string
	TokenBudgetDaily  int
}

// LoadConfig reads the required settings from the environment.
func LoadConfig() (Config, error) {
	cfg := Config{
		DBHost:            os.Getenv("DB_HOST"),
		DBPort:            os.Getenv("DB_PORT"),
		DBUser:            os.Getenv("DB_USER"),
		DBPassword:        os.Getenv("DB_PASSWORD"),
		DBName:            os.Getenv("DB_NAME"),
		Port:              os.Getenv("PORT"),
		JWTSecret:         os.Getenv("JWT_SECRET"),
		OpenRouterKey:     os.Getenv("OPENROUTER_API_KEY"),
		Model:             getenvDefault("OPENROUTER_MODEL", "openrouter/free"),
		SystemPrompt:      getenvDefault("SYSTEM_PROMPT", "You are a helpful assistant."),
		AllowedOrigin:     getenvDefault("ALLOWED_ORIGIN", "http://localhost:3000"),
		OpenRouterBaseURL: getenvDefault("OPENROUTER_BASE_URL", openRouterURL),
		LogLevel:          getenvDefault("LOG_LEVEL", "info"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		TokenBudgetDaily:  getenvInt("TOKEN_BUDGET_DAILY", 8192),
	}

	required := []struct{ name, value string }{
		{"DB_HOST", cfg.DBHost},
		{"DB_PORT", cfg.DBPort},
		{"DB_USER", cfg.DBUser},
		{"DB_PASSWORD", cfg.DBPassword},
		{"DB_NAME", cfg.DBName},
		{"PORT", cfg.Port},
		{"JWT_SECRET", cfg.JWTSecret},
		{"OPENROUTER_API_KEY", cfg.OpenRouterKey},
	}
	for _, r := range required {
		if r.value == "" {
			return Config{}, fmt.Errorf("missing required env var: %s", r.name)
		}
	}

	// JWT_SECRET signs every session token. Require a meaningful key length so a
	// weak or truncated value (e.g. an empty/misconfigured secret injection)
	// can't slip through and leave tokens forgeable — fail loud at startup.
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET must be at least 32 characters, got %d", len(cfg.JWTSecret))
	}

	return cfg, nil
}

// getenvDefault returns the env var if set, otherwise def.
func getenvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// getenvInt returns the env var parsed as a positive int, otherwise def.
func getenvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}
