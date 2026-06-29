package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestUsage_RecordAndSumWithinWindow(t *testing.T) {
	resetDB(t)
	ctx := context.Background()

	var uid int64
	if err := testPool.QueryRow(ctx,
		`insert into users (google_sub, email) values ('sub:u@x.com', 'u@x.com') returning id`).
		Scan(&uid); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	if err := recordUsage(ctx, testPool, uid, tokenUsage{Prompt: 10, Completion: 5}); err != nil {
		t.Fatalf("record 1: %v", err)
	}
	if err := recordUsage(ctx, testPool, uid, tokenUsage{Prompt: 3, Completion: 2}); err != nil {
		t.Fatalf("record 2: %v", err)
	}

	// A row older than the window must be excluded.
	if _, err := testPool.Exec(ctx,
		`insert into token_usage (user_id, prompt_tokens, completion_tokens, created_at)
		 values ($1, 100, 100, now() - interval '25 hours')`, uid); err != nil {
		t.Fatalf("seed old: %v", err)
	}

	total, err := usageSince(ctx, testPool, uid, time.Now().Add(-24*time.Hour))
	if err != nil {
		t.Fatalf("usageSince: %v", err)
	}
	if total != 20 {
		t.Fatalf("want 20 within window, got %d", total)
	}
}

func TestUsage_SurvivesConversationDelete(t *testing.T) {
	resetDB(t)
	ctx := context.Background()

	var uid int64
	if err := testPool.QueryRow(ctx,
		`insert into users (google_sub, email) values ('sub:u@x.com', 'u@x.com') returning id`).
		Scan(&uid); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	var cid int64
	if err := testPool.QueryRow(ctx,
		`insert into conversations (user_id) values ($1) returning id`, uid).Scan(&cid); err != nil {
		t.Fatalf("seed conversation: %v", err)
	}
	if err := recordUsage(ctx, testPool, uid, tokenUsage{Prompt: 7, Completion: 3}); err != nil {
		t.Fatalf("record: %v", err)
	}

	if _, err := testPool.Exec(ctx, `delete from conversations where id = $1`, cid); err != nil {
		t.Fatalf("delete conversation: %v", err)
	}

	total, err := usageSince(ctx, testPool, uid, time.Now().Add(-24*time.Hour))
	if err != nil {
		t.Fatalf("usageSince: %v", err)
	}
	if total != 10 {
		t.Fatalf("usage must survive conversation delete; want 10, got %d", total)
	}
}

func TestUsage_Endpoint(t *testing.T) {
	resetDB(t)
	mux := newTestMuxBudget(nil, 8192)
	ta, uid := signup(t, mux, "a@x.com")

	ctx := context.Background()
	if err := recordUsage(ctx, testPool, uid, tokenUsage{Prompt: 10, Completion: 5}); err != nil {
		t.Fatalf("record 1: %v", err)
	}
	if err := recordUsage(ctx, testPool, uid, tokenUsage{Prompt: 3, Completion: 2}); err != nil {
		t.Fatalf("record 2: %v", err)
	}
	// A row older than the 24h window must not count.
	if _, err := testPool.Exec(ctx,
		`insert into token_usage (user_id, prompt_tokens, completion_tokens, created_at)
		 values ($1, 100, 100, now() - interval '25 hours')`, uid); err != nil {
		t.Fatalf("seed old: %v", err)
	}

	rec := do(t, mux, http.MethodGet, "/api/usage", ta, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body)
	}
	var out struct {
		Used   int `json:"used"`
		Budget int `json:"budget"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Used != 20 {
		t.Fatalf("want used 20, got %d", out.Used)
	}
	if out.Budget != 8192 {
		t.Fatalf("want budget 8192, got %d", out.Budget)
	}
}

func TestUsage_Endpoint_RequiresAuth(t *testing.T) {
	resetDB(t)
	mux := newTestMuxBudget(nil, 8192)
	rec := do(t, mux, http.MethodGet, "/api/usage", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestSend_OwnerBypassesBudget(t *testing.T) {
	resetDB(t)
	client := fakeOpenRouter(t, http.StatusOK, deltaFrame("hi"), "data: [DONE]\n\n")
	auth := &Auth{pool: testPool, secret: testSecret, verify: fakeGoogleVerifier(), exchange: fakeGoogleExchanger()}
	chat := &Chat{pool: testPool, llm: client, systemPrompt: testSystemPrompt, tokenBudget: 1, ownerEmail: "owner@gmail.com"}
	mux := newMux(func(ctx context.Context) error { return Healthy(ctx, testPool) }, auth, chat)

	// Owner, already over budget → still allowed.
	ownerTok, ownerID := signup(t, mux, "owner@gmail.com")
	if err := recordUsage(context.Background(), testPool, ownerID, tokenUsage{Prompt: 50, Completion: 50}); err != nil {
		t.Fatalf("seed owner usage: %v", err)
	}
	ownerConv := createConversation(t, mux, ownerTok)
	if rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", ownerConv), ownerTok,
		map[string]string{"content": "hi"}); rec.Code == http.StatusTooManyRequests {
		t.Fatal("owner should bypass the daily budget, got 429")
	}

	// Non-owner, over budget → blocked.
	otherTok, otherID := signup(t, mux, "other@gmail.com")
	if err := recordUsage(context.Background(), testPool, otherID, tokenUsage{Prompt: 50, Completion: 50}); err != nil {
		t.Fatalf("seed other usage: %v", err)
	}
	otherConv := createConversation(t, mux, otherTok)
	if rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", otherConv), otherTok,
		map[string]string{"content": "hi"}); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("non-owner over budget should be 429, got %d", rec.Code)
	}
}
