package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func fixedClock(t time.Time) func() time.Time { return func() time.Time { return t } }

func TestLimiter_AllowsBurstThenBlocks(t *testing.T) {
	now := time.Now()
	l := &limiter{buckets: map[string]*bucket{}, rate: 1, burst: 3, now: fixedClock(now)}
	for i := 0; i < 3; i++ {
		if ok, _ := l.allow("k"); !ok {
			t.Fatalf("request %d should be allowed", i)
		}
	}
	ok, retry := l.allow("k")
	if ok {
		t.Fatal("4th request should be blocked")
	}
	if retry <= 0 {
		t.Fatalf("want positive Retry-After, got %v", retry)
	}
}

func TestLimiter_RefillsOverTime(t *testing.T) {
	now := time.Now()
	clock := now
	l := &limiter{buckets: map[string]*bucket{}, rate: 1, burst: 1, now: func() time.Time { return clock }}
	if ok, _ := l.allow("k"); !ok {
		t.Fatal("first should be allowed")
	}
	if ok, _ := l.allow("k"); ok {
		t.Fatal("second should be blocked (bucket empty)")
	}
	clock = now.Add(2 * time.Second) // refills past 1 token, capped at burst
	if ok, _ := l.allow("k"); !ok {
		t.Fatal("should be allowed after refill")
	}
}

func TestLimiter_PerKeyIsolation(t *testing.T) {
	now := time.Now()
	l := &limiter{buckets: map[string]*bucket{}, rate: 1, burst: 1, now: fixedClock(now)}
	l.allow("a")
	if ok, _ := l.allow("b"); !ok {
		t.Fatal("key b has its own bucket")
	}
}

func TestLimiter_EvictsIdleKeys(t *testing.T) {
	now := time.Now()
	clock := now
	l := &limiter{
		buckets: map[string]*bucket{}, rate: 1, burst: 1,
		now: func() time.Time { return clock }, idleTTL: time.Minute,
	}
	l.allow("k")
	clock = now.Add(2 * time.Minute)
	l.evict()
	if len(l.buckets) != 0 {
		t.Fatalf("idle key should be evicted, have %d", len(l.buckets))
	}
}

func TestLimiter_Middleware429WithRetryAfter(t *testing.T) {
	now := time.Now()
	l := &limiter{buckets: map[string]*bucket{}, rate: 1, burst: 1, now: fixedClock(now)}
	h := l.middleware(func(*http.Request) string { return "k" })(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))

	rec1 := httptest.NewRecorder()
	h.ServeHTTP(rec1, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec1.Code != http.StatusOK {
		t.Fatalf("first want 200, got %d", rec1.Code)
	}
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("second want 429, got %d", rec2.Code)
	}
	if rec2.Header().Get("Retry-After") == "" {
		t.Fatal("missing Retry-After header")
	}
}
