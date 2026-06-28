package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"google.golang.org/api/idtoken"
)

// googleClaims is the subset of a verified Google ID token we use.
type googleClaims struct {
	Sub           string
	Email         string
	EmailVerified bool
}

// googleVerifier verifies a Google ID token and returns its claims.
type googleVerifier func(ctx context.Context, idToken string) (googleClaims, error)

// realGoogleVerifier validates the token against Google's keys with clientID as the audience.
func realGoogleVerifier(clientID string) googleVerifier {
	return func(ctx context.Context, idToken string) (googleClaims, error) {
		p, err := idtoken.Validate(ctx, idToken, clientID)
		if err != nil {
			return googleClaims{}, err
		}
		c := googleClaims{Sub: p.Subject}
		if e, ok := p.Claims["email"].(string); ok {
			c.Email = e
		}
		if v, ok := p.Claims["email_verified"].(bool); ok {
			c.EmailVerified = v
		}
		return c, nil
	}
}

// fakeGoogleVerifier accepts sentinel "e2e:<email>" tokens. Test-only.
func fakeGoogleVerifier() googleVerifier {
	return func(_ context.Context, idToken string) (googleClaims, error) {
		email, ok := strings.CutPrefix(idToken, "e2e:")
		if !ok || email == "" {
			return googleClaims{}, errors.New("fake verifier: expected e2e:<email>")
		}
		return googleClaims{Sub: "e2e:" + email, Email: email, EmailVerified: true}, nil
	}
}

// selectGoogleVerifier returns the fake verifier when GOOGLE_AUTH_FAKE is set, else the real one.
func selectGoogleVerifier(cfg Config) googleVerifier {
	if cfg.GoogleAuthFake {
		slog.Warn("GOOGLE_AUTH_FAKE enabled: accepting fake e2e tokens — never use in production")
		return fakeGoogleVerifier()
	}
	return realGoogleVerifier(cfg.GoogleClientID)
}

// Google verifies a Google ID token, upserts the user, and issues a session.
func (a *Auth) Google(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDToken string `json:"id_token"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.IDToken == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id_token required"})
		return
	}
	claims, err := a.verify(r.Context(), body.IDToken)
	if err != nil || !claims.EmailVerified || claims.Email == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid google token"})
		return
	}
	var userID int64
	err = a.pool.QueryRow(r.Context(),
		`insert into users (google_sub, email) values ($1, $2)
		 on conflict (google_sub) do update set email = excluded.email
		 returning id`, claims.Sub, normalizeEmail(claims.Email)).Scan(&userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create user"})
		return
	}
	family, err := newFamilyID()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not start session"})
		return
	}
	a.issueTokens(w, r, userID, family, http.StatusOK)
}
