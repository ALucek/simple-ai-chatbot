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
	t.Setenv("OPENROUTER_API_KEY", "test-openrouter-key")
	t.Setenv("GOOGLE_CLIENT_ID", "test-client-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
	// Clear optional vars so a developer's .env can't leak into default assertions.
	for _, k := range []string{
		"OPENROUTER_MODEL", "SYSTEM_PROMPT", "ALLOWED_ORIGIN", "OPENROUTER_BASE_URL",
		"LOG_LEVEL", "DATABASE_URL", "TOKEN_BUDGET_DAILY", "OWNER_EMAIL",
		"GOOGLE_AUTH_FAKE", "SIGNUP_OPEN",
	} {
		t.Setenv(k, "")
	}
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

func TestLoadConfig_OpenRouterBaseURLDefault(t *testing.T) {
	setAllEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.OpenRouterBaseURL != openRouterURL {
		t.Fatalf("want default %q, got %q", openRouterURL, cfg.OpenRouterBaseURL)
	}
}

func TestLoadConfig_OpenRouterBaseURLOverride(t *testing.T) {
	setAllEnv(t)
	t.Setenv("OPENROUTER_BASE_URL", "http://localhost:8090")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.OpenRouterBaseURL != "http://localhost:8090" {
		t.Fatalf("want override, got %q", cfg.OpenRouterBaseURL)
	}
}

func TestLoadConfig_LogLevelDefault(t *testing.T) {
	setAllEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.LogLevel != "info" {
		t.Fatalf("want default \"info\", got %q", cfg.LogLevel)
	}
}

func TestLoadConfig_RejectsShortJWTSecret(t *testing.T) {
	setAllEnv(t)
	t.Setenv("JWT_SECRET", "too-short")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected an error for a short JWT_SECRET, got nil")
	}
}

func TestLoadConfig_RequiresGoogleClientID(t *testing.T) {
	setAllEnv(t)
	t.Setenv("GOOGLE_CLIENT_ID", "")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected an error for missing GOOGLE_CLIENT_ID, got nil")
	}
}

func TestLoadConfig_RequiresGoogleClientSecret(t *testing.T) {
	setAllEnv(t)
	t.Setenv("GOOGLE_CLIENT_SECRET", "")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected an error for missing GOOGLE_CLIENT_SECRET, got nil")
	}
}

func TestLoadConfig_FakeAuthSkipsClientSecret(t *testing.T) {
	setAllEnv(t)
	t.Setenv("GOOGLE_CLIENT_SECRET", "")
	t.Setenv("GOOGLE_AUTH_FAKE", "1")
	if _, err := LoadConfig(); err != nil {
		t.Fatalf("fake auth should not require the secret, got %v", err)
	}
}

func TestLoadConfig_SignupsClosedByDefault(t *testing.T) {
	setAllEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.SignupOpen {
		t.Fatal("signups should be closed by default")
	}
}

func TestLoadConfig_SignupsOpenWhenSet(t *testing.T) {
	setAllEnv(t)
	t.Setenv("SIGNUP_OPEN", "true")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if !cfg.SignupOpen {
		t.Fatal("signups should be open when SIGNUP_OPEN=true")
	}
}

func TestLoadConfig_FakeAuthRejectedUnderTLS(t *testing.T) {
	setAllEnv(t)
	t.Setenv("GOOGLE_AUTH_FAKE", "1")
	t.Setenv("ALLOWED_ORIGIN", "https://chat.lucek.ai")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected an error for fake auth under https, got nil")
	}
}

func TestLoadConfig_FakeAuthAllowedLocally(t *testing.T) {
	setAllEnv(t)
	t.Setenv("GOOGLE_AUTH_FAKE", "1")
	t.Setenv("ALLOWED_ORIGIN", "http://localhost:3000")
	if _, err := LoadConfig(); err != nil {
		t.Fatalf("fake auth under http should be allowed, got %v", err)
	}
}

func TestLoadConfig_OwnerAndFakeDefaults(t *testing.T) {
	setAllEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.GoogleClientID != "test-client-id" || cfg.OwnerEmail != "" || cfg.GoogleAuthFake {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestGetenvInt(t *testing.T) {
	t.Setenv("X_BUDGET", "1234")
	if got := getenvInt("X_BUDGET", 8192); got != 1234 {
		t.Fatalf("set: want 1234, got %d", got)
	}
	t.Setenv("X_BUDGET", "")
	if got := getenvInt("X_BUDGET", 8192); got != 8192 {
		t.Fatalf("empty: want default 8192, got %d", got)
	}
	t.Setenv("X_BUDGET", "-5")
	if got := getenvInt("X_BUDGET", 8192); got != 8192 {
		t.Fatalf("negative: want default 8192, got %d", got)
	}
	t.Setenv("X_BUDGET", "notanumber")
	if got := getenvInt("X_BUDGET", 8192); got != 8192 {
		t.Fatalf("unparseable: want default 8192, got %d", got)
	}
}
