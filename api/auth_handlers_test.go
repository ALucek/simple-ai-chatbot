package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// googleLogin signs in via POST /api/google and returns the issued refresh token from Set-Cookie.
func googleLogin(t *testing.T, mux http.Handler, email string) string {
	t.Helper()
	return refreshCookieOf(t, do(t, mux, http.MethodPost, "/api/google", "",
		map[string]string{"code": "e2e:" + email}))
}

// refreshCookieOf returns the refresh_token value from a response's Set-Cookie.
func refreshCookieOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == refreshCookieName {
			return c.Value
		}
	}
	t.Fatal("no refresh_token cookie in response")
	return ""
}

// doCookie sends method+path carrying a refresh_token cookie.
func doCookie(t *testing.T, mux http.Handler, method, path, refreshToken string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	if refreshToken != "" {
		req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: refreshToken})
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
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

func TestRefresh_IssuedAsHttpOnlyCookie(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	rec := do(t, mux, http.MethodPost, "/api/google", "",
		map[string]string{"code": "e2e:cookie@x.com"})

	var c *http.Cookie
	for _, ck := range rec.Result().Cookies() {
		if ck.Name == refreshCookieName {
			c = ck
		}
	}
	if c == nil {
		t.Fatal("no refresh_token cookie on login")
	}
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteStrictMode || c.Path != "/api" {
		t.Fatalf("wrong cookie attrs: %+v", c)
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("refresh_token")) {
		t.Fatal("login response body leaked the refresh token")
	}
}

func TestRefresh_Then_LogoutRevokes(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	r0 := googleLogin(t, mux, "r@x.com")

	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", r0); rr.Code != http.StatusOK {
		t.Fatalf("refresh: want 200, got %d", rr.Code)
	}
	if lo := doCookie(t, mux, http.MethodPost, "/api/logout", r0); lo.Code != http.StatusNoContent {
		t.Fatalf("logout: want 204, got %d", lo.Code)
	}
	if rr2 := doCookie(t, mux, http.MethodPost, "/api/refresh", r0); rr2.Code != http.StatusUnauthorized {
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

	rr := doCookie(t, mux, http.MethodPost, "/api/refresh", r0)
	if rr.Code != http.StatusOK {
		t.Fatalf("refresh: want 200, got %d", rr.Code)
	}
	r1 := refreshCookieOf(t, rr)
	if r1 == "" || r1 == r0 {
		t.Fatalf("refresh must rotate the token, got %q (old %q)", r1, r0)
	}
	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", r1); rr.Code != http.StatusOK {
		t.Fatalf("new token: want 200, got %d", rr.Code)
	}
	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", r0); rr.Code != http.StatusUnauthorized {
		t.Fatalf("old token reuse: want 401, got %d", rr.Code)
	}
}

func TestRefresh_ReuseRevokesFamilyOnly(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	// Two sign-ins of the same user → two refresh-token families.
	r0 := googleLogin(t, mux, "reuse@x.com")
	rB := googleLogin(t, mux, "reuse@x.com")

	r1 := refreshCookieOf(t, doCookie(t, mux, http.MethodPost, "/api/refresh", r0))
	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", r0); rr.Code != http.StatusUnauthorized {
		t.Fatalf("replay: want 401, got %d", rr.Code)
	}
	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", r1); rr.Code != http.StatusUnauthorized {
		t.Fatalf("family sibling after reuse: want 401, got %d", rr.Code)
	}
	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", rB); rr.Code != http.StatusOK {
		t.Fatalf("other family after reuse: want 200, got %d", rr.Code)
	}
}

func TestRefresh_PurgesExpiredTokens(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	r0 := googleLogin(t, mux, "purge@x.com")

	var uid int64
	if err := testPool.QueryRow(context.Background(),
		`select id from users limit 1`).Scan(&uid); err != nil {
		t.Fatalf("user id: %v", err)
	}
	// Seed an already-expired refresh token row.
	if _, err := testPool.Exec(context.Background(),
		`insert into refresh_tokens (token_hash, user_id, family_id, expires_at)
		 values ($1, $2, $3, now() - interval '1 hour')`,
		hashToken("stale"), uid, "stale-family"); err != nil {
		t.Fatalf("seed expired token: %v", err)
	}

	// A successful refresh should sweep expired rows.
	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", r0); rr.Code != http.StatusOK {
		t.Fatalf("refresh: want 200, got %d", rr.Code)
	}

	var expired int
	if err := testPool.QueryRow(context.Background(),
		`select count(*) from refresh_tokens where expires_at < now()`).Scan(&expired); err != nil {
		t.Fatalf("count expired: %v", err)
	}
	if expired != 0 {
		t.Fatalf("want 0 expired tokens after refresh, got %d", expired)
	}
}

func TestLogout_DeletesWithoutRevokingOthers(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	r0 := googleLogin(t, mux, "lo@x.com")
	rB := googleLogin(t, mux, "lo@x.com")

	if lo := doCookie(t, mux, http.MethodPost, "/api/logout", r0); lo.Code != http.StatusNoContent {
		t.Fatalf("logout: want 204, got %d", lo.Code)
	}
	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", r0); rr.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout: want 401, got %d", rr.Code)
	}
	if rr := doCookie(t, mux, http.MethodPost, "/api/refresh", rB); rr.Code != http.StatusOK {
		t.Fatalf("other session after logout: want 200, got %d", rr.Code)
	}
}
