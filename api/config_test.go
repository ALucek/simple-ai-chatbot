package main

import "testing"

func setAllEnv(t *testing.T) {
	t.Setenv("DB_HOST", "localhost")
	t.Setenv("DB_PORT", "5432")
	t.Setenv("DB_USER", "app")
	t.Setenv("DB_PASSWORD", "devpassword")
	t.Setenv("DB_NAME", "chat")
	t.Setenv("PORT", "8080")
	t.Setenv("JWT_SECRET", "test-secret-at-least-32-bytes-long-xx")
}

func TestLoadConfig_HasJWTSecret(t *testing.T) {
	setAllEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.JWTSecret != "test-secret-at-least-32-bytes-long-xx" {
		t.Fatalf("JWTSecret not populated: %q", cfg.JWTSecret)
	}
}

func TestLoadConfig_AllPresent(t *testing.T) {
	setAllEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.DBHost != "localhost" || cfg.Port != "8080" {
		t.Fatalf("config not populated correctly: %+v", cfg)
	}
}

func TestLoadConfig_MissingKey(t *testing.T) {
	setAllEnv(t)
	t.Setenv("PORT", "") // simulate a missing required var
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected an error for missing PORT, got nil")
	}
}
