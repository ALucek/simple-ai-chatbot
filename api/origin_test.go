package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func originTestHandler() (http.Handler, *bool) {
	called := false
	h := withOriginCheck("https://chat.lucek.ai",
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}))
	return h, &called
}

func TestOriginCheck_AllowsMatchingPost(t *testing.T) {
	h, called := originTestHandler()
	r := httptest.NewRequest(http.MethodPost, "/api/refresh", nil)
	r.Header.Set("Origin", "https://chat.lucek.ai")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK || !*called {
		t.Fatalf("matching origin should pass; code=%d called=%v", rec.Code, *called)
	}
}

func TestOriginCheck_BlocksMismatchedPost(t *testing.T) {
	h, called := originTestHandler()
	r := httptest.NewRequest(http.MethodPost, "/api/refresh", nil)
	r.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusForbidden || *called {
		t.Fatalf("mismatched origin should 403 and not call handler; code=%d called=%v", rec.Code, *called)
	}
}

func TestOriginCheck_AllowsAbsentOrigin(t *testing.T) {
	h, called := originTestHandler()
	r := httptest.NewRequest(http.MethodPost, "/api/refresh", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK || !*called {
		t.Fatalf("absent origin should pass; code=%d called=%v", rec.Code, *called)
	}
}

func TestOriginCheck_IgnoresSafeMethods(t *testing.T) {
	for _, m := range []string{http.MethodGet, http.MethodOptions} {
		h, called := originTestHandler()
		r := httptest.NewRequest(m, "/api/conversations", nil)
		r.Header.Set("Origin", "https://evil.example")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if rec.Code != http.StatusOK || !*called {
			t.Fatalf("%s should bypass origin check; code=%d called=%v", m, rec.Code, *called)
		}
	}
}
