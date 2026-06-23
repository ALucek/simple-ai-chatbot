package main

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestResponseWriter_CapturesStatusAndBytes(t *testing.T) {
	rec := httptest.NewRecorder()
	w := &responseWriter{ResponseWriter: rec}
	w.WriteHeader(http.StatusTeapot)
	n, _ := w.Write([]byte("hello"))
	if w.status != http.StatusTeapot || w.bytes != 5 || n != 5 {
		t.Fatalf("status=%d bytes=%d n=%d", w.status, w.bytes, n)
	}
}

func TestResponseWriter_PreservesFlusher(t *testing.T) {
	rec := httptest.NewRecorder() // httptest.ResponseRecorder implements http.Flusher
	w := &responseWriter{ResponseWriter: rec}
	f, ok := interface{}(w).(http.Flusher)
	if !ok {
		t.Fatal("responseWriter must implement http.Flusher (SSE depends on it)")
	}
	f.Flush()
	if !rec.Flushed {
		t.Fatal("Flush did not forward to the underlying writer")
	}
}

func TestContextHandler_AddsRequestID(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(contextHandler{slog.NewJSONHandler(&buf, nil)})
	ctx := context.WithValue(context.Background(), requestIDKey, "rid-1")
	logger.InfoContext(ctx, "hi")
	if !strings.Contains(buf.String(), `"request_id":"rid-1"`) {
		t.Fatalf("expected request_id attr, got %s", buf.String())
	}
}

func TestWithLogging_EmitsRequestLine(t *testing.T) {
	var buf bytes.Buffer
	slog.SetDefault(slog.New(contextHandler{slog.NewJSONHandler(&buf, nil)}))

	h := withRequestID(withLogging(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("xy"))
	})))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/foo", nil))

	out := buf.String()
	for _, want := range []string{
		`"msg":"request"`, `"method":"GET"`, `"path":"/foo"`,
		`"status":418`, `"bytes":2`, `"duration_ms":`, `"request_id":`,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("access line missing %s in: %s", want, out)
		}
	}
}

func TestWithLogging_HealthPathsAreDebug(t *testing.T) {
	var buf bytes.Buffer
	slog.SetDefault(slog.New(contextHandler{
		slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}),
	}))
	h := withLogging(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if strings.Contains(buf.String(), `"msg":"request"`) {
		t.Fatalf("health probe should not log at info level: %s", buf.String())
	}
}
