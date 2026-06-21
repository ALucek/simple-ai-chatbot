package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver "pgx" for goose
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

var testPool *pgxpool.Pool

var testSecret = []byte("test-secret-at-least-32-bytes-long-xx")

const testSystemPrompt = "You are a helpful assistant."

// TestMain spins up one Postgres container for the whole package, applies the
// migrations, then runs every test against it.
func TestMain(m *testing.M) {
	ctx := context.Background()

	ctr, err := tcpostgres.Run(ctx, "postgres:16",
		tcpostgres.WithDatabase("chat"),
		tcpostgres.WithUsername("app"),
		tcpostgres.WithPassword("secret"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second)),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "start postgres: %v\n", err)
		os.Exit(1)
	}

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		fmt.Fprintf(os.Stderr, "conn string: %v\n", err)
		os.Exit(1)
	}
	if err := migrate(dsn); err != nil {
		fmt.Fprintf(os.Stderr, "migrate: %v\n", err)
		os.Exit(1)
	}
	testPool, err = pgxpool.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "pool: %v\n", err)
		os.Exit(1)
	}

	code := m.Run()

	testPool.Close()
	_ = testcontainers.TerminateContainer(ctr)
	os.Exit(code)
}

// migrate applies the goose migrations via a temporary database/sql handle.
func migrate(dsn string) error {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	goose.SetDialect("postgres")
	return goose.Up(db, "migrations")
}

// resetDB clears all app tables; call at the top of each integration test.
func resetDB(t *testing.T) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`truncate users, refresh_tokens, conversations, messages restart identity cascade`)
	if err != nil {
		t.Fatalf("reset db: %v", err)
	}
}

// newTestMux builds the router against the test pool. client may be nil for
// tests that never reach the streaming handler.
func newTestMux(client *openRouterClient) *http.ServeMux {
	auth := &Auth{pool: testPool, secret: testSecret}
	chat := &Chat{pool: testPool, llm: client, systemPrompt: testSystemPrompt}
	check := func(ctx context.Context) error { return Healthy(ctx, testPool) }
	return newMux(check, auth, chat)
}

// signup registers a user through the mux and returns its access token and id.
func signup(t *testing.T, mux http.Handler, email string) (token string, userID int64) {
	t.Helper()
	rec := do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": email, "password": "password123"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("signup %s: want 201, got %d (%s)", email, rec.Code, rec.Body)
	}
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("signup decode: %v", err)
	}
	uid, err := parseAccessToken(testSecret, out.AccessToken)
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}
	return out.AccessToken, uid
}

// do sends a request through the mux; body is JSON-encoded when non-nil.
func do(t *testing.T, mux http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode body: %v", err)
		}
		r = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, r)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

// TestHarness_Boots proves the container, migrations, and pool are wired up.
func TestHarness_Boots(t *testing.T) {
	resetDB(t)
	var n int
	if err := testPool.QueryRow(context.Background(), "select count(*) from users").Scan(&n); err != nil {
		t.Fatalf("query: %v", err)
	}
	if n != 0 {
		t.Fatalf("want 0 users after reset, got %d", n)
	}
}
