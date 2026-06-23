package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWithRequestID_GeneratesWhenAbsent(t *testing.T) {
	var got string
	h := withRequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = requestIDFromContext(r.Context())
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if len(got) != 32 {
		t.Fatalf("want a 32-char generated id, got %q", got)
	}
	if rec.Header().Get(requestIDHeader) != got {
		t.Fatalf("response header %q != context id %q", rec.Header().Get(requestIDHeader), got)
	}
}

func TestWithRequestID_HonorsInbound(t *testing.T) {
	var got string
	h := withRequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = requestIDFromContext(r.Context())
	}))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(requestIDHeader, "abc123")
	h.ServeHTTP(rec, req)

	if got != "abc123" {
		t.Fatalf("want inbound id reused, got %q", got)
	}
	if rec.Header().Get(requestIDHeader) != "abc123" {
		t.Fatalf("want inbound id echoed, got %q", rec.Header().Get(requestIDHeader))
	}
}
