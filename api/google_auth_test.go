package main

import (
	"context"
	"net/http"
	"net/http/httptest"
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

func TestFakeGoogleExchanger_Passthrough(t *testing.T) {
	id, err := fakeGoogleExchanger()(context.Background(), "e2e:a@gmail.com")
	if err != nil || id != "e2e:a@gmail.com" {
		t.Fatalf("got %q, %v", id, err)
	}
}

func TestRealGoogleExchanger_ParsesIDToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id_token":"the-id-token"}`))
	}))
	defer srv.Close()
	prev := googleTokenURL
	googleTokenURL = srv.URL
	defer func() { googleTokenURL = prev }()

	id, err := realGoogleExchanger("cid", "secret")(context.Background(), "auth-code")
	if err != nil || id != "the-id-token" {
		t.Fatalf("got %q, %v", id, err)
	}
}

func TestGoogle_RejectsMissingCode(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"code": ""})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d (%s)", rec.Code, rec.Body)
	}
}

func TestGoogle_NewUserIssuesTokens(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/google", "",
		map[string]string{"code": "e2e:newuser@gmail.com"})
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
	do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"code": "e2e:same@gmail.com"})
	rec := do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"code": "e2e:same@gmail.com"})
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
	rec := do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"code": "garbage"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d (%s)", rec.Code, rec.Body)
	}
}

func TestGoogle_SignupsClosedRejectsNewUser(t *testing.T) {
	resetDB(t)
	auth := &Auth{pool: testPool, secret: testSecret, verify: fakeGoogleVerifier(), exchange: fakeGoogleExchanger(), signupOpen: false}
	chat := &Chat{pool: testPool, systemPrompt: testSystemPrompt, tokenBudget: testTokenBudget}
	mux := newMux(func(ctx context.Context) error { return Healthy(ctx, testPool) }, auth, chat)

	rec := do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"code": "e2e:newbie@gmail.com"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403 for a new user with signups closed, got %d (%s)", rec.Code, rec.Body)
	}
}

func TestGoogle_SignupsClosedAllowsExistingUser(t *testing.T) {
	resetDB(t)
	if _, err := testPool.Exec(context.Background(),
		`insert into users (google_sub, email) values ($1, $2)`,
		"e2e:existing@gmail.com", "existing@gmail.com"); err != nil {
		t.Fatalf("seed: %v", err)
	}
	auth := &Auth{pool: testPool, secret: testSecret, verify: fakeGoogleVerifier(), exchange: fakeGoogleExchanger(), signupOpen: false}
	chat := &Chat{pool: testPool, systemPrompt: testSystemPrompt, tokenBudget: testTokenBudget}
	mux := newMux(func(ctx context.Context) error { return Healthy(ctx, testPool) }, auth, chat)

	rec := do(t, mux, http.MethodPost, "/api/google", "", map[string]string{"code": "e2e:existing@gmail.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("existing user should sign in even when closed, got %d (%s)", rec.Code, rec.Body)
	}
}
