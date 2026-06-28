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

func TestConversations_Paginated(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	ta, _ := signup(t, mux, "p@x.com")
	for i := 0; i < 3; i++ {
		createConversation(t, mux, ta)
	}

	// limit caps the page; offset walks further back.
	var page, rest []map[string]any
	json.Unmarshal(do(t, mux, http.MethodGet, "/api/conversations?limit=2", ta, nil).Body.Bytes(), &page)
	json.Unmarshal(do(t, mux, http.MethodGet, "/api/conversations?limit=2&offset=2", ta, nil).Body.Bytes(), &rest)
	if len(page) != 2 {
		t.Fatalf("first page: want 2, got %d", len(page))
	}
	if len(rest) != 1 {
		t.Fatalf("second page: want 1, got %d", len(rest))
	}
	if page[0]["id"] == rest[0]["id"] {
		t.Fatal("pages overlap")
	}
}

// seedMessages inserts n user messages into a conversation and returns their ids (ascending).
func seedMessages(t *testing.T, cid int64, n int) []int64 {
	t.Helper()
	ids := make([]int64, 0, n)
	for i := 0; i < n; i++ {
		var mid int64
		if err := testPool.QueryRow(context.Background(),
			`insert into messages (conversation_id, role, content) values ($1,'user',$2) returning id`,
			cid, fmt.Sprintf("m%d", i)).Scan(&mid); err != nil {
			t.Fatalf("seed message: %v", err)
		}
		ids = append(ids, mid)
	}
	return ids
}

func TestMessages_KeysetPagination(t *testing.T) {
	resetDB(t)
	mux := newTestMux(nil)
	ta, _ := signup(t, mux, "k@x.com")
	cid := createConversation(t, mux, ta)
	ids := seedMessages(t, cid, 5) // ascending ids

	decode := func(path string) []message {
		var out []message
		json.Unmarshal(do(t, mux, http.MethodGet, path, ta, nil).Body.Bytes(), &out)
		return out
	}

	// Newest page (limit 2) returns the last two, oldest-first.
	newest := decode(fmt.Sprintf("/api/conversations/%d/messages?limit=2", cid))
	if len(newest) != 2 || newest[0].ID != ids[3] || newest[1].ID != ids[4] {
		t.Fatalf("newest page wrong: %+v", newest)
	}

	// Older page before the newest page's first id, still oldest-first.
	older := decode(fmt.Sprintf("/api/conversations/%d/messages?limit=2&before=%d", cid, ids[3]))
	if len(older) != 2 || older[0].ID != ids[1] || older[1].ID != ids[2] {
		t.Fatalf("older page wrong: %+v", older)
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
