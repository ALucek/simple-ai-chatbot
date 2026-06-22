package main

import "testing"

func TestDSN_BuildsFromParts(t *testing.T) {
	cfg := Config{
		DBUser:     "app",
		DBPassword: "secret",
		DBHost:     "localhost",
		DBPort:     "5432",
		DBName:     "chat",
	}
	want := "postgres://app:secret@localhost:5432/chat"
	if got := dsn(cfg); got != want {
		t.Fatalf("want %q, got %q", want, got)
	}
}

func TestDSN_DatabaseURLOverride(t *testing.T) {
	cfg := Config{
		DBUser:      "app",
		DBPassword:  "secret",
		DBHost:      "localhost",
		DBPort:      "5432",
		DBName:      "chat",
		DatabaseURL: "postgres://u:p@/chat?host=/cloudsql/proj:region:inst",
	}
	if got := dsn(cfg); got != cfg.DatabaseURL {
		t.Fatalf("want override %q, got %q", cfg.DatabaseURL, got)
	}
}
