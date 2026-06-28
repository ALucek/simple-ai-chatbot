package main

import (
	"encoding/json"
	"net/http"
	"time"
)

const refreshTokenTTL = 30 * 24 * time.Hour

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
	h := hashToken(body.RefreshToken)

	// Claim: authorize and consume the token
	var userID int64
	var familyID string
	err := a.pool.QueryRow(r.Context(),
		`update refresh_tokens set revoked = true
		 where token_hash = $1 and not revoked and expires_at > now()
		 returning user_id, family_id`, h).Scan(&userID, &familyID)
	if err != nil {
		// Not claimable. treat as theft and revoke its whole family.
		var reusedFamily string
		if a.pool.QueryRow(r.Context(),
			`select family_id from refresh_tokens where token_hash = $1 and revoked`, h).
			Scan(&reusedFamily) == nil {
			_, _ = a.pool.Exec(r.Context(),
				`update refresh_tokens set revoked = true where family_id = $1`, reusedFamily)
		}
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid refresh token"})
		return
	}

	// Rotate: issue a fresh access + refresh token in the same family.
	a.issueTokens(w, r, userID, familyID, http.StatusOK)
}

func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err == nil && body.RefreshToken != "" {
		_, _ = a.pool.Exec(r.Context(),
			`delete from refresh_tokens where token_hash = $1`,
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
func (a *Auth) issueTokens(w http.ResponseWriter, r *http.Request, userID int64, familyID string, status int) {
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
		`insert into refresh_tokens (token_hash, user_id, family_id, expires_at) values ($1, $2, $3, $4)`,
		hashToken(raw), userID, familyID, time.Now().Add(refreshTokenTTL))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not store refresh token"})
		return
	}
	writeJSON(w, status, map[string]string{"access_token": access, "refresh_token": raw})
}
