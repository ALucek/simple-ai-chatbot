package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSignup_IssuesTokens(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "a@x.com", "password": "password123"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d", rec.Code)
	}
	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.AccessToken == "" || out.RefreshToken == "" {
		t.Fatalf("missing tokens: %+v", out)
	}
}

func TestSignup_DuplicateEmail(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	body := map[string]string{"email": "dup@x.com", "password": "password123"}
	do(t, mux, http.MethodPost, "/api/signup", "", body)
	rec := do(t, mux, http.MethodPost, "/api/signup", "", body)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d", rec.Code)
	}
}

func TestLogin_OK(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "l@x.com", "password": "password123"})
	rec := do(t, mux, http.MethodPost, "/api/login", "",
		map[string]string{"email": "l@x.com", "password": "password123"})
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "w@x.com", "password": "password123"})
	rec := do(t, mux, http.MethodPost, "/api/login", "",
		map[string]string{"email": "w@x.com", "password": "wrong"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestLogin_UnknownEmail(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/login", "",
		map[string]string{"email": "nobody@x.com", "password": "password123"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestMe_ReturnsUser(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	token, uid := signup(t, mux, "me@x.com")
	rec := do(t, mux, http.MethodGet, "/api/me", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var out struct {
		ID    int64  `json:"id"`
		Email string `json:"email"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.ID != uid || out.Email != "me@x.com" {
		t.Fatalf("unexpected user: %+v", out)
	}
}

func TestMe_NoToken(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodGet, "/api/me", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestRefresh_Then_LogoutRevokes(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "r@x.com", "password": "password123"})
	var tok struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &tok); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if rr := do(t, mux, http.MethodPost, "/api/refresh", "",
		map[string]string{"refresh_token": tok.RefreshToken}); rr.Code != http.StatusOK {
		t.Fatalf("refresh: want 200, got %d", rr.Code)
	}
	if lo := do(t, mux, http.MethodPost, "/api/logout", "",
		map[string]string{"refresh_token": tok.RefreshToken}); lo.Code != http.StatusNoContent {
		t.Fatalf("logout: want 204, got %d", lo.Code)
	}
	if rr2 := do(t, mux, http.MethodPost, "/api/refresh", "",
		map[string]string{"refresh_token": tok.RefreshToken}); rr2.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout: want 401, got %d", rr2.Code)
	}
}

func TestSignup_PasswordTooShort(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "short@x.com", "password": "abc123"}) // 6 chars
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d (%s)", rec.Code, rec.Body)
	}
}

func TestSignup_PasswordTooLong(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	long := strings.Repeat("a", 73) // 73 bytes, over bcrypt's 72-byte limit
	rec := do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "long@x.com", "password": long})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d (%s)", rec.Code, rec.Body)
	}
}

func TestLogin_GenericErrorIdentical(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "known@x.com", "password": "password123"})

	unknown := do(t, mux, http.MethodPost, "/api/login", "",
		map[string]string{"email": "nobody@x.com", "password": "password123"})
	wrong := do(t, mux, http.MethodPost, "/api/login", "",
		map[string]string{"email": "known@x.com", "password": "wrongpassword"})

	if unknown.Code != http.StatusUnauthorized || wrong.Code != http.StatusUnauthorized {
		t.Fatalf("want both 401, got unknown=%d wrong=%d", unknown.Code, wrong.Code)
	}
	if unknown.Body.String() != wrong.Body.String() {
		t.Fatalf("bodies differ:\n unknown=%s\n wrong=%s", unknown.Body, wrong.Body)
	}
}

func TestSignup_Login_CaseInsensitive(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	if rec := do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "User@X.com", "password": "password123"}); rec.Code != http.StatusCreated {
		t.Fatalf("signup: want 201, got %d", rec.Code)
	}
	// login with different casing must succeed
	if rec := do(t, mux, http.MethodPost, "/api/login", "",
		map[string]string{"email": "user@x.com", "password": "password123"}); rec.Code != http.StatusOK {
		t.Fatalf("login lowercase: want 200, got %d (%s)", rec.Code, rec.Body)
	}
}

func TestSignup_CaseInsensitiveDuplicate(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "Dup@X.com", "password": "password123"})
	rec := do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "dup@x.com", "password": "password123"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d (%s)", rec.Code, rec.Body)
	}
}

func TestSignup_StoresFamilyID(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	signup(t, mux, "fam@x.com")
	var family string
	if err := testPool.QueryRow(context.Background(),
		`select family_id from refresh_tokens limit 1`).Scan(&family); err != nil {
		t.Fatalf("query family_id: %v", err)
	}
	if family == "" {
		t.Fatal("family_id must be set on a new refresh token")
	}
}

func refreshTokenOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var out struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode refresh_token: %v", err)
	}
	return out.RefreshToken
}

func TestRefresh_RotatesToken(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	r0 := refreshTokenOf(t, do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "rot@x.com", "password": "password123"}))

	rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0})
	if rr.Code != http.StatusOK {
		t.Fatalf("refresh: want 200, got %d", rr.Code)
	}
	r1 := refreshTokenOf(t, rr)
	if r1 == "" || r1 == r0 {
		t.Fatalf("refresh must return a new refresh token, got %q (old %q)", r1, r0)
	}
	// new token works; replaying the rotated old one is rejected
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r1}); rr.Code != http.StatusOK {
		t.Fatalf("new token: want 200, got %d", rr.Code)
	}
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("old token reuse: want 401, got %d", rr.Code)
	}
}

func TestRefresh_ReuseRevokesFamilyOnly(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	// login A (family 1)
	r0 := refreshTokenOf(t, do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "reuse@x.com", "password": "password123"}))
	// login B (family 2) — separate login of the same user
	rB := refreshTokenOf(t, do(t, mux, http.MethodPost, "/api/login", "",
		map[string]string{"email": "reuse@x.com", "password": "password123"}))

	// rotate family 1: r0 -> r1
	r1 := refreshTokenOf(t, do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0}))
	// replay the rotated r0 -> theft: 401 and family 1 revoked
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("replay: want 401, got %d", rr.Code)
	}
	// r1 (same family) is now dead
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r1}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("family sibling after reuse: want 401, got %d", rr.Code)
	}
	// rB (different family) survives
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": rB}); rr.Code != http.StatusOK {
		t.Fatalf("other family after reuse: want 200, got %d", rr.Code)
	}
}

func TestLogout_DeletesWithoutRevokingOthers(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	r0 := refreshTokenOf(t, do(t, mux, http.MethodPost, "/api/signup", "",
		map[string]string{"email": "lo@x.com", "password": "password123"}))
	rB := refreshTokenOf(t, do(t, mux, http.MethodPost, "/api/login", "",
		map[string]string{"email": "lo@x.com", "password": "password123"}))

	if lo := do(t, mux, http.MethodPost, "/api/logout", "", map[string]string{"refresh_token": r0}); lo.Code != http.StatusNoContent {
		t.Fatalf("logout: want 204, got %d", lo.Code)
	}
	// logged-out token: plain 401, not a reuse alarm
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout: want 401, got %d", rr.Code)
	}
	// the other login still works (logout didn't revoke a family)
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": rB}); rr.Code != http.StatusOK {
		t.Fatalf("other session after logout: want 200, got %d", rr.Code)
	}
}
