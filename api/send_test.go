package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// fakeOpenRouter returns a client pointed at a server that responds with the given
// status; on 200 it emits the raw SSE frames in order.
func fakeOpenRouter(t *testing.T, status int, frames ...string) *openRouterClient {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		for _, f := range frames {
			fmt.Fprint(w, f)
		}
	}))
	t.Cleanup(srv.Close)
	return &openRouterClient{key: "test", model: "test", baseURL: srv.URL, http: srv.Client()}
}

// deltaFrame builds one OpenAI-style content delta SSE frame.
func deltaFrame(text string) string {
	return fmt.Sprintf("data: {\"choices\":[{\"delta\":{\"content\":%q}}]}\n\n", text)
}

func TestSend_StreamsAndPersists(t *testing.T) {
	resetDB(t)
	client := fakeOpenRouter(t, http.StatusOK,
		deltaFrame("Hello"), deltaFrame(" there"), "data: [DONE]\n\n")
	mux := newTestMux(client)
	ta, _ := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)

	rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cid), ta,
		map[string]string{"content": "hi"})
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if got := rec.Header().Get("X-Accel-Buffering"); got != "no" {
		t.Fatalf("want X-Accel-Buffering: no, got %q", got)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "event: delta") || !strings.Contains(body, `"text":"Hello"`) {
		t.Fatalf("missing delta frames: %s", body)
	}
	if !strings.Contains(body, "event: done") {
		t.Fatalf("missing done event: %s", body)
	}

	// Two rows persisted: user then assistant, assistant content concatenated.
	rows, err := testPool.Query(context.Background(),
		`select role, content from messages where conversation_id=$1 order by id`, cid)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()
	var got []llmMessage
	for rows.Next() {
		var m llmMessage
		rows.Scan(&m.Role, &m.Content)
		got = append(got, m)
	}
	if len(got) != 2 || got[0].Role != "user" || got[1].Role != "assistant" || got[1].Content != "Hello there" {
		t.Fatalf("unexpected messages: %+v", got)
	}
}

func TestSend_BumpsUpdatedAt(t *testing.T) {
	resetDB(t)
	client := fakeOpenRouter(t, http.StatusOK, deltaFrame("hi"), "data: [DONE]\n\n")
	mux := newTestMux(client)
	ta, _ := signup(t, mux, "a@x.com")
	first := createConversation(t, mux, ta)
	createConversation(t, mux, ta) // second, newer

	// Send to the OLDER conversation; it should jump to the top of the list.
	do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", first), ta,
		map[string]string{"content": "hi"})

	var list []struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(do(t, mux, http.MethodGet, "/api/conversations", ta, nil).Body.Bytes(), &list)
	if len(list) != 2 || list[0].ID != first {
		t.Fatalf("sent-to conversation should sort first, got %+v (want first=%d)", list, first)
	}
}

func TestSend_NotOwner(t *testing.T) {
	resetDB(t)
	client := fakeOpenRouter(t, http.StatusOK, deltaFrame("hi"), "data: [DONE]\n\n")
	mux := newTestMux(client)
	ta, _ := signup(t, mux, "a@x.com")
	tb, _ := signup(t, mux, "b@x.com")
	cid := createConversation(t, mux, ta)
	rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cid), tb,
		map[string]string{"content": "hi"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
}

func TestSend_EmptyContent(t *testing.T) {
	resetDB(t)
	mux := newTestMux(fakeOpenRouter(t, http.StatusOK))
	ta, _ := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)
	rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cid), ta,
		map[string]string{"content": ""})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestSend_BadID(t *testing.T) {
	resetDB(t)
	mux := newTestMux(fakeOpenRouter(t, http.StatusOK))
	ta, _ := signup(t, mux, "a@x.com")
	rec := do(t, mux, http.MethodPost, "/api/conversations/abc/messages", ta,
		map[string]string{"content": "hi"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestSend_UpstreamError(t *testing.T) {
	resetDB(t)
	client := fakeOpenRouter(t, http.StatusInternalServerError)
	mux := newTestMux(client)
	ta, _ := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)

	rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cid), ta,
		map[string]string{"content": "hi"})
	if !strings.Contains(rec.Body.String(), "event: error") {
		t.Fatalf("want error event, got %s", rec.Body)
	}
	// User message persisted; assistant NOT (persist only complete replies).
	var roles []string
	rows, _ := testPool.Query(context.Background(),
		`select role from messages where conversation_id=$1 order by id`, cid)
	defer rows.Close()
	for rows.Next() {
		var role string
		rows.Scan(&role)
		roles = append(roles, role)
	}
	if len(roles) != 1 || roles[0] != "user" {
		t.Fatalf("want only [user], got %v", roles)
	}
}

func TestSend_RecordsUsage(t *testing.T) {
	resetDB(t)
	client := fakeOpenRouter(t, http.StatusOK,
		deltaFrame("hi"),
		"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":6}}\n\n",
		"data: [DONE]\n\n")
	mux := newTestMux(client)
	ta, uid := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)

	rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cid), ta,
		map[string]string{"content": "hi"})
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}

	total, err := usageSince(context.Background(), testPool, uid, time.Now().Add(-24*time.Hour))
	if err != nil {
		t.Fatalf("usageSince: %v", err)
	}
	if total != 10 {
		t.Fatalf("want recorded usage 10, got %d", total)
	}
}

func TestSend_OverTokenBudget(t *testing.T) {
	resetDB(t)
	client := fakeOpenRouter(t, http.StatusOK, deltaFrame("hi"), "data: [DONE]\n\n")
	mux := newTestMuxBudget(client, 10)
	ta, uid := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)

	// Seed usage at/over the budget.
	if err := recordUsage(context.Background(), testPool, uid, tokenUsage{Prompt: 15, Completion: 10}); err != nil {
		t.Fatalf("seed usage: %v", err)
	}

	rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cid), ta,
		map[string]string{"content": "hi"})
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429 over budget, got %d", rec.Code)
	}
}

func TestSend_MessageTooLong(t *testing.T) {
	resetDB(t)
	mux := newTestMux(fakeOpenRouter(t, http.StatusOK))
	ta, _ := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)

	long := strings.Repeat("x", maxMessageChars+1)
	rec := do(t, mux, http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", cid), ta,
		map[string]string{"content": long})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}
