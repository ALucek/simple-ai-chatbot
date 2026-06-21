package main

import (
	"fmt"
	"os"
)

// Config holds everything the app needs to run, read once from the environment.
type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	Port       string
	JWTSecret  string
}

// LoadConfig reads the required settings from the environment.
func LoadConfig() (Config, error) {
	cfg := Config{
		DBHost:     os.Getenv("DB_HOST"),
		DBPort:     os.Getenv("DB_PORT"),
		DBUser:     os.Getenv("DB_USER"),
		DBPassword: os.Getenv("DB_PASSWORD"),
		DBName:     os.Getenv("DB_NAME"),
		Port:       os.Getenv("PORT"),
		JWTSecret:  os.Getenv("JWT_SECRET"),
	}

	required := []struct{ name, value string }{
		{"DB_HOST", cfg.DBHost},
		{"DB_PORT", cfg.DBPort},
		{"DB_USER", cfg.DBUser},
		{"DB_PASSWORD", cfg.DBPassword},
		{"DB_NAME", cfg.DBName},
		{"PORT", cfg.Port},
		{"JWT_SECRET", cfg.JWTSecret},
	}
	for _, r := range required {
		if r.value == "" {
			return Config{}, fmt.Errorf("missing required env var: %s", r.name)
		}
	}
	return cfg, nil
}
