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

func TestDSN_SocketHost(t *testing.T) {
	cfg := Config{
		DBUser:     "app",
		DBPassword: "secret",
		DBHost:     "/cloudsql/proj:region:inst",
		DBName:     "chat",
	}
	want := "postgres://app:secret@/chat?host=%2Fcloudsql%2Fproj%3Aregion%3Ainst"
	if got := dsn(cfg); got != want {
		t.Fatalf("want %q, got %q", want, got)
	}
}

func TestDSN_EscapesSpecialPassword(t *testing.T) {
	cfg := Config{
		DBUser:     "app",
		DBPassword: "p@s/w",
		DBHost:     "localhost",
		DBPort:     "5432",
		DBName:     "chat",
	}
	want := "postgres://app:p%40s%2Fw@localhost:5432/chat"
	if got := dsn(cfg); got != want {
		t.Fatalf("want %q, got %q", want, got)
	}
}
