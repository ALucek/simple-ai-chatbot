package main

import (
	"fmt"
	"net/http"
	"testing"
)

func TestRateLimit_ChatPerUser(t *testing.T) {
	resetDB(t)
	client := fakeOpenRouter(t, http.StatusOK, deltaFrame("hi"), "data: [DONE]\n\n")
	mux := newTestMux(client)
	ta, _ := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)

	var last int
	for i := 0; i < chatRateBurst+1; i++ {
		rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cid), ta,
			map[string]string{"content": "hi"})
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("want 429 after burst, got %d", last)
	}

	// A different user has their own bucket and is unaffected.
	tb, _ := signup(t, mux, "b@x.com")
	cidB := createConversation(t, mux, tb)
	rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cidB), tb,
		map[string]string{"content": "hi"})
	if rec.Code == http.StatusTooManyRequests {
		t.Fatalf("user b should have its own bucket, got %d", rec.Code)
	}
}
