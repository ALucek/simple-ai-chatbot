package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeJSON_TooLargeBody(t *testing.T) {
	h := withMaxBody(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var v map[string]any
		if !decodeJSON(w, r, &v) {
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"ok": "yes"})
	}))

	// Valid JSON whose string value forces reading past the 1 MiB cap.
	big := `{"x":"` + strings.Repeat("A", (1<<20)+10) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(big))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("want 413, got %d (%s)", rec.Code, rec.Body)
	}
}

func TestDecodeJSON_Malformed(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var v map[string]any
		if !decodeJSON(w, r, &v) {
			return
		}
		writeJSON(w, http.StatusOK, nil)
	})
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("not json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}
