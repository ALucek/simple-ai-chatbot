package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

const refreshTokenTTL = 30 * 24 * time.Hour

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *Auth) Signup(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if !decodeJSON(w, r, &c) {
		return
	}
	if c.Email == "" || c.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email and password required"})
		return
	}
	c.Email = normalizeEmail(c.Email)
	if len(c.Password) > maxPasswordBytes {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password too long"})
		return
	}
	if len(c.Password) < minPasswordLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password too short"})
		return
	}
	hash, err := hashPassword(c.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not hash password"})
		return
	}
	var userID int64
	err = a.pool.QueryRow(r.Context(),
		`insert into users (email, password_hash) values ($1, $2) returning id`,
		c.Email, hash).Scan(&userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			writeJSON(w, http.StatusConflict, map[string]string{"error": "email already registered"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create user"})
		return
	}
	a.issueTokens(w, r, userID, http.StatusCreated)
}

func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if !decodeJSON(w, r, &c) {
		return
	}
	c.Email = normalizeEmail(c.Email)
	var userID int64
	var hash string
	err := a.pool.QueryRow(r.Context(),
		`select id, password_hash from users where email = $1`, c.Email).Scan(&userID, &hash)
	if err != nil {
		hash = dummyHash // compare anyway, so timing doesn't reveal existence
	}
	if checkPassword(hash, c.Password) != nil || err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid email or password"})
		return
	}
	a.issueTokens(w, r, userID, http.StatusOK)
}

func (a *Auth) Refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.RefreshToken == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "refresh_token required"})
		return
	}
	var userID int64
	err := a.pool.QueryRow(r.Context(),
		`select user_id from refresh_tokens
		 where token_hash = $1 and not revoked and expires_at > now()`,
		hashToken(body.RefreshToken)).Scan(&userID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid refresh token"})
		return
	}
	access, err := mintAccessToken(a.secret, userID, time.Now())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not mint token"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"access_token": access})
}

func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err == nil && body.RefreshToken != "" {
		_, _ = a.pool.Exec(r.Context(),
			`update refresh_tokens set revoked = true where token_hash = $1`,
			hashToken(body.RefreshToken))
	}
	w.WriteHeader(http.StatusNoContent) // idempotent: always 204
}

func (a *Auth) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}
	var email string
	if err := a.pool.QueryRow(r.Context(),
		`select email from users where id = $1`, userID).Scan(&email); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unknown user"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": userID, "email": email})
}

// issueTokens mints an access token, stores a new (hashed) refresh token, writes both.
func (a *Auth) issueTokens(w http.ResponseWriter, r *http.Request, userID int64, status int) {
	access, err := mintAccessToken(a.secret, userID, time.Now())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not mint token"})
		return
	}
	raw, err := newRefreshToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create refresh token"})
		return
	}
	_, err = a.pool.Exec(r.Context(),
		`insert into refresh_tokens (token_hash, user_id, expires_at) values ($1, $2, $3)`,
		hashToken(raw), userID, time.Now().Add(refreshTokenTTL))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not store refresh token"})
		return
	}
	writeJSON(w, status, map[string]string{"access_token": access, "refresh_token": raw})
}
