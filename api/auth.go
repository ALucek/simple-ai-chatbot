package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Auth groups the auth handlers and middleware with their dependencies.
type Auth struct {
	pool   *pgxpool.Pool
	secret []byte
}

type ctxKey string

const userIDKey ctxKey = "userID"

const accessTokenTTL = 15 * time.Minute
const minPasswordLen = 8    // characters
const maxPasswordBytes = 72 // bcrypt ignores bytes past 72; reject rather than truncate

// lookupMX is a package-level seam so tests can stub DNS.
var lookupMX = net.DefaultResolver.LookupMX

var (
	errEmailInvalid       = errors.New("invalid email")
	errEmailUndeliverable = errors.New("email domain can't receive mail")
	errEmailUnverifiable  = errors.New("could not verify email")
)

const mxLookupTimeout = 3 * time.Second

// hashPassword returns a bcrypt hash of the plaintext password.
func hashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// checkPassword reports nil if plain matches the stored bcrypt hash.
func checkPassword(hash, plain string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
}

// mintAccessToken returns a signed HS256 JWT for the user.
func mintAccessToken(secret []byte, userID int64, now time.Time) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(accessTokenTTL)),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// parseAccessToken verifies the token (signature + expiry) with the signing
// algorithm pinned to HMAC, and returns the user id from the subject claim.
func parseAccessToken(secret []byte, tokenStr string) (int64, error) {
	claims := &jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		// Pin the algorithm: reject anything that is not HMAC (e.g. alg: none).
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return 0, err
	}
	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid subject: %w", err)
	}
	return userID, nil
}

// newRefreshToken returns a 32-byte cryptographically-random token, hex-encoded.
func newRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashToken returns the SHA-256 hex digest of a token.
func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// Middleware authenticates the access token and stores the user id in context.
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || raw == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing bearer token"})
			return
		}
		userID, err := parseAccessToken(a.secret, raw)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// userIDFromContext reads the authenticated user id set by Middleware.
func userIDFromContext(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(userIDKey).(int64)
	return id, ok
}

// dummyHash is compared against when the email is unknown
var dummyHash = mustHash("constant-time-placeholder")

func mustHash(plain string) string {
	h, err := hashPassword(plain)
	if err != nil {
		panic(err)
	}
	return h
}

// normalizeEmail lowercases and trims so email comparison is case-insensitive.
func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func newFamilyID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func checkEmailDeliverable(ctx context.Context, email string) error {
	addr, err := mail.ParseAddress(email)
	if err != nil {
		return errEmailInvalid
	}
	at := strings.LastIndex(addr.Address, "@")
	if at < 0 || at == len(addr.Address)-1 {
		return errEmailInvalid
	}
	domain := addr.Address[at+1:]

	ctx, cancel := context.WithTimeout(ctx, mxLookupTimeout)
	defer cancel()
	records, err := lookupMX(ctx, domain)
	if err != nil {
		return errEmailUnverifiable
	}
	if len(records) == 0 {
		return errEmailUndeliverable
	}
	return nil
}
