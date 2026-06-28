package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// googleLogin signs in via POST /api/google and returns the issued refresh token.
func googleLogin(t *testing.T, mux http.Handler, email string) string {
	t.Helper()
	return refreshTokenOf(t, do(t, mux, http.MethodPost, "/api/google", "",
		map[string]string{"id_token": "e2e:" + email}))
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
	r0 := googleLogin(t, mux, "r@x.com")

	if rr := do(t, mux, http.MethodPost, "/api/refresh", "",
		map[string]string{"refresh_token": r0}); rr.Code != http.StatusOK {
		t.Fatalf("refresh: want 200, got %d", rr.Code)
	}
	if lo := do(t, mux, http.MethodPost, "/api/logout", "",
		map[string]string{"refresh_token": r0}); lo.Code != http.StatusNoContent {
		t.Fatalf("logout: want 204, got %d", lo.Code)
	}
	if rr2 := do(t, mux, http.MethodPost, "/api/refresh", "",
		map[string]string{"refresh_token": r0}); rr2.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout: want 401, got %d", rr2.Code)
	}
}

func TestGoogle_StoresFamilyID(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	googleLogin(t, mux, "fam@x.com")
	var family string
	if err := testPool.QueryRow(context.Background(),
		`select family_id from refresh_tokens limit 1`).Scan(&family); err != nil {
		t.Fatalf("query family_id: %v", err)
	}
	if family == "" {
		t.Fatal("family_id must be set on a new refresh token")
	}
}

func TestRefresh_RotatesToken(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	r0 := googleLogin(t, mux, "rot@x.com")

	rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0})
	if rr.Code != http.StatusOK {
		t.Fatalf("refresh: want 200, got %d", rr.Code)
	}
	r1 := refreshTokenOf(t, rr)
	if r1 == "" || r1 == r0 {
		t.Fatalf("refresh must return a new refresh token, got %q (old %q)", r1, r0)
	}
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
	// Two sign-ins of the same user → two refresh-token families.
	r0 := googleLogin(t, mux, "reuse@x.com")
	rB := googleLogin(t, mux, "reuse@x.com")

	r1 := refreshTokenOf(t, do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0}))
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("replay: want 401, got %d", rr.Code)
	}
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r1}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("family sibling after reuse: want 401, got %d", rr.Code)
	}
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": rB}); rr.Code != http.StatusOK {
		t.Fatalf("other family after reuse: want 200, got %d", rr.Code)
	}
}

func TestLogout_DeletesWithoutRevokingOthers(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	r0 := googleLogin(t, mux, "lo@x.com")
	rB := googleLogin(t, mux, "lo@x.com")

	if lo := do(t, mux, http.MethodPost, "/api/logout", "", map[string]string{"refresh_token": r0}); lo.Code != http.StatusNoContent {
		t.Fatalf("logout: want 204, got %d", lo.Code)
	}
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": r0}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout: want 401, got %d", rr.Code)
	}
	if rr := do(t, mux, http.MethodPost, "/api/refresh", "", map[string]string{"refresh_token": rB}); rr.Code != http.StatusOK {
		t.Fatalf("other session after logout: want 200, got %d", rr.Code)
	}
}
