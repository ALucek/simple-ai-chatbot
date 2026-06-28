package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWithCORS_SetsHeadersAndCallsThrough(t *testing.T) {
	called := false
	h := withCORS("http://localhost:3000", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/me", nil))

	if !called {
		t.Fatal("wrapped handler should be called for non-preflight requests")
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("allow-origin: want http://localhost:3000, got %q", got)
	}
}

func TestWithCORS_PreflightShortCircuits(t *testing.T) {
	called := false
	h := withCORS("http://localhost:3000", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodOptions, "/api/google", nil))

	if called {
		t.Fatal("preflight OPTIONS must not reach the wrapped handler")
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight: want 204, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != "Authorization, Content-Type" {
		t.Fatalf("allow-headers: got %q", got)
	}
}
