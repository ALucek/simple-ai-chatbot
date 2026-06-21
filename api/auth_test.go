package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

func TestPasswordHashAndCheck(t *testing.T) {
	hash, err := hashPassword("password123")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == "password123" {
		t.Fatal("hash must not equal plaintext")
	}
	if err := checkPassword(hash, "password123"); err != nil {
		t.Fatalf("correct password should verify: %v", err)
	}
	if err := checkPassword(hash, "wrong"); err == nil {
		t.Fatal("wrong password should fail")
	}
}

func TestAccessTokenRoundTrip(t *testing.T) {
	secret := []byte("test-secret-key-at-least-32-bytes!!")
	tok, err := mintAccessToken(secret, 42, time.Now())
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	uid, err := parseAccessToken(secret, tok)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if uid != 42 {
		t.Fatalf("want user 42, got %d", uid)
	}
}

func TestAccessTokenTampered(t *testing.T) {
	secret := []byte("test-secret-key-at-least-32-bytes!!")
	tok, _ := mintAccessToken(secret, 1, time.Now())
	if _, err := parseAccessToken(secret, tok+"x"); err == nil {
		t.Fatal("tampered token must fail")
	}
}

func TestAccessTokenWrongSecret(t *testing.T) {
	tok, _ := mintAccessToken([]byte("secret-one-aaaaaaaaaaaaaaaaaaaaaaaa"), 1, time.Now())
	if _, err := parseAccessToken([]byte("secret-two-bbbbbbbbbbbbbbbbbbbbbbbb"), tok); err == nil {
		t.Fatal("wrong secret must fail")
	}
}

func TestAccessTokenExpired(t *testing.T) {
	secret := []byte("test-secret-key-at-least-32-bytes!!")
	// mint as if an hour ago: exp = (now-1h)+15m, already in the past
	tok, _ := mintAccessToken(secret, 1, time.Now().Add(-time.Hour))
	if _, err := parseAccessToken(secret, tok); err == nil {
		t.Fatal("expired token must fail")
	}
}

func TestAccessTokenAlgNoneRejected(t *testing.T) {
	secret := []byte("test-secret-key-at-least-32-bytes!!")
	claims := jwt.RegisteredClaims{Subject: "1", ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}
	unsigned := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	str, _ := unsigned.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if _, err := parseAccessToken(secret, str); err == nil {
		t.Fatal("alg=none token must be rejected")
	}
}

func TestRefreshTokenHashing(t *testing.T) {
	raw, err := newRefreshToken()
	if err != nil {
		t.Fatalf("newRefreshToken: %v", err)
	}
	if len(raw) != 64 {
		t.Fatalf("want 64 hex chars, got %d", len(raw))
	}
	if hashToken(raw) != hashToken(raw) {
		t.Fatal("hash must be deterministic")
	}
	if hashToken(raw) == raw {
		t.Fatal("hash must not equal the raw token")
	}
}

func TestRefreshTokensUnique(t *testing.T) {
	a, _ := newRefreshToken()
	b, _ := newRefreshToken()
	if a == b {
		t.Fatal("two generated tokens must differ")
	}
}

func mustMint(secret []byte, uid int64, at time.Time) string {
	s, _ := mintAccessToken(secret, uid, at)
	return s
}

func TestMiddlewareValidToken(t *testing.T) {
	secret := []byte("test-secret-key-at-least-32-bytes!!")
	a := &Auth{secret: secret} // nil pool: middleware does no DB work
	tok := mustMint(secret, 7, time.Now())

	var gotID int64
	var gotOK bool
	protected := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID, gotOK = userIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	a.Middleware(protected).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if !gotOK || gotID != 7 {
		t.Fatalf("want userID 7 in context, got %d (ok=%v)", gotID, gotOK)
	}
}

func TestMiddlewareRejects(t *testing.T) {
	secret := []byte("test-secret-key-at-least-32-bytes!!")
	a := &Auth{secret: secret}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })

	cases := map[string]string{
		"missing": "",
		"garbage": "Bearer not-a-jwt",
		"expired": "Bearer " + mustMint(secret, 1, time.Now().Add(-time.Hour)),
	}
	for name, header := range cases {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			rec := httptest.NewRecorder()
			a.Middleware(next).ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("%s: want 401, got %d", name, rec.Code)
			}
		})
	}
}
