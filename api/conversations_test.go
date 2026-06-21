package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// createConversation makes a conversation for the token's user and returns its id.
func createConversation(t *testing.T, mux http.Handler, token string) int64 {
	t.Helper()
	rec := do(t, mux, http.MethodPost, "/api/conversations", token, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create conversation: want 201, got %d", rec.Code)
	}
	var out struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out.ID
}

func TestConversations_ListScoped(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	ta, _ := signup(t, mux, "a@x.com")
	tb, _ := signup(t, mux, "b@x.com")
	createConversation(t, mux, ta)
	createConversation(t, mux, ta)
	createConversation(t, mux, tb)

	var listA, listB []map[string]any
	json.Unmarshal(do(t, mux, http.MethodGet, "/api/conversations", ta, nil).Body.Bytes(), &listA)
	json.Unmarshal(do(t, mux, http.MethodGet, "/api/conversations", tb, nil).Body.Bytes(), &listB)
	if len(listA) != 2 {
		t.Fatalf("A should see 2, got %d", len(listA))
	}
	if len(listB) != 1 {
		t.Fatalf("B should see 1, got %d", len(listB))
	}
}

func TestMessages_OwnedEmpty(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	ta, _ := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)
	rec := do(t, mux, http.MethodGet, fmt.Sprintf("/api/conversations/%d/messages", cid), ta, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Fatalf("want [], got %q", got)
	}
}

func TestMessages_BadID(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	ta, _ := signup(t, mux, "a@x.com")
	rec := do(t, mux, http.MethodGet, "/api/conversations/abc/messages", ta, nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestRename_OK(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	ta, _ := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)
	rec := do(t, mux, http.MethodPatch, fmt.Sprintf("/api/conversations/%d", cid), ta,
		map[string]string{"title": "My chat"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d", rec.Code)
	}
	list := do(t, mux, http.MethodGet, "/api/conversations", ta, nil)
	if !strings.Contains(list.Body.String(), "My chat") {
		t.Fatalf("title not updated: %s", list.Body)
	}
}

func TestDelete_CascadesMessages(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	ta, _ := signup(t, mux, "a@x.com")
	cid := createConversation(t, mux, ta)
	if _, err := testPool.Exec(context.Background(),
		`insert into messages (conversation_id, role, content) values ($1,'user','hi')`, cid); err != nil {
		t.Fatalf("insert msg: %v", err)
	}
	if rec := do(t, mux, http.MethodDelete, fmt.Sprintf("/api/conversations/%d", cid), ta, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: want 204, got %d", rec.Code)
	}
	var n int
	testPool.QueryRow(context.Background(),
		`select count(*) from messages where conversation_id=$1`, cid).Scan(&n)
	if n != 0 {
		t.Fatalf("messages should cascade, got %d", n)
	}
}

func TestIDOR_BlocksOtherUser(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	ta, _ := signup(t, mux, "a@x.com")
	tb, _ := signup(t, mux, "b@x.com")
	cid := createConversation(t, mux, ta)
	base := fmt.Sprintf("/api/conversations/%d", cid)

	if rec := do(t, mux, http.MethodGet, base+"/messages", tb, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("B read A messages: want 404, got %d", rec.Code)
	}
	if rec := do(t, mux, http.MethodPatch, base, tb, map[string]string{"title": "x"}); rec.Code != http.StatusNotFound {
		t.Fatalf("B rename A: want 404, got %d", rec.Code)
	}
	if rec := do(t, mux, http.MethodDelete, base, tb, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("B delete A: want 404, got %d", rec.Code)
	}
}
