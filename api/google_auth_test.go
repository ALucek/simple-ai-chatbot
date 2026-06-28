package main

import (
	"context"
	"net/http"
	"testing"
)

func TestFakeGoogleVerifier_ParsesSentinel(t *testing.T) {
	v := fakeGoogleVerifier()
	c, err := v(context.Background(), "e2e:alice@gmail.com")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if c.Email != "alice@gmail.com" || !c.EmailVerified || c.Sub == "" {
		t.Fatalf("unexpected claims: %+v", c)
	}
}

func TestFakeGoogleVerifier_RejectsNonSentinel(t *testing.T) {
	v := fakeGoogleVerifier()
	if _, err := v(context.Background(), "not-a-sentinel"); err == nil {
		t.Fatal("expected error for a non-sentinel token, got nil")
	}
}

func TestSelectGoogleVerifier_PicksFakeWhenEnabled(t *testing.T) {
	cfg := Config{GoogleAuthFake: true}
	if _, err := selectGoogleVerifier(cfg)(context.Background(), "e2e:bob@gmail.com"); err != nil {
		t.Fatalf("fake verifier should accept sentinel: %v", err)
	}
}

func TestGoogle_NewUserIssuesTokens(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/google", "",
		map[string]string{"id_token": "e2e:newuser@gmail.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body)
	}
	var n int
	testPool.QueryRow(context.Background(),
		`select count(*) from users where email = 'newuser@gmail.com'`).Scan(&n)
	if n != 1 {
		t.Fatalf("want 1 user, got %d", n)
	}
}

func TestGoogle_ReturningUserUpdatesEmail(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"id_token": "e2e:same@gmail.com"})
	rec := do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"id_token": "e2e:same@gmail.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body)
	}
	var n int
	testPool.QueryRow(context.Background(), `select count(*) from users`).Scan(&n)
	if n != 1 {
		t.Fatalf("want 1 user after re-login, got %d", n)
	}
}

func TestGoogle_RejectsBadToken(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"id_token": "garbage"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d (%s)", rec.Code, rec.Body)
	}
}
