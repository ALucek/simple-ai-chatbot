package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestStream_SkipsCommentsAndStopsAtDone(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, ": OPENROUTER PROCESSING\n\n") // keep-alive comment
		fmt.Fprint(w, deltaFrame("Hel"))
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{}}]}\n\n") // empty content
		fmt.Fprint(w, deltaFrame("lo"))
		fmt.Fprint(w, "data: [DONE]\n\n")
		fmt.Fprint(w, deltaFrame("AFTER")) // must not be delivered
	}))
	defer srv.Close()
	client := &openRouterClient{baseURL: srv.URL, http: srv.Client()}

	var got strings.Builder
	if _, err := client.stream(context.Background(), nil, func(s string) { got.WriteString(s) }); err != nil {
		t.Fatalf("stream: %v", err)
	}
	if got.String() != "Hello" {
		t.Fatalf("want %q, got %q", "Hello", got.String())
	}
}

func TestStream_Non200IsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	client := &openRouterClient{baseURL: srv.URL, http: srv.Client()}
	if _, err := client.stream(context.Background(), nil, func(string) {}); err == nil {
		t.Fatal("want error on non-200, got nil")
	}
}

func TestStream_ParsesUsage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, deltaFrame("hi"))
		fmt.Fprint(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":11,\"completion_tokens\":7}}\n\n")
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()
	client := &openRouterClient{baseURL: srv.URL, http: srv.Client()}

	usage, err := client.stream(context.Background(), nil, func(string) {})
	if err != nil {
		t.Fatalf("stream: %v", err)
	}
	if usage.Prompt != 11 || usage.Completion != 7 {
		t.Fatalf("want {11 7}, got %+v", usage)
	}
}

func TestNewLLMHTTPClient_TransportDeadlines(t *testing.T) {
	c := newLLMHTTPClient()

	// Client.Timeout must stay zero
	if c.Timeout != 0 {
		t.Fatalf("Client.Timeout must be 0 (would cut SSE), got %v", c.Timeout)
	}

	tr, ok := c.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("Transport is %T, want *http.Transport", c.Transport)
	}
	if tr.DialContext == nil {
		t.Fatal("DialContext not set (dial timeout missing)")
	}
	if tr.TLSHandshakeTimeout != llmTLSTimeout {
		t.Fatalf("TLSHandshakeTimeout = %v, want %v", tr.TLSHandshakeTimeout, llmTLSTimeout)
	}
	if tr.ResponseHeaderTimeout != llmResponseHeaderTimeout {
		t.Fatalf("ResponseHeaderTimeout = %v, want %v", tr.ResponseHeaderTimeout, llmResponseHeaderTimeout)
	}
}

func TestStream_ResponseHeaderTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond) // never ACK (no response headers) in time
		fmt.Fprint(w, deltaFrame("late"))
	}))
	defer srv.Close()

	// Tiny ResponseHeaderTimeout so the test is fast; proves the deadline reaches stream().
	client := &openRouterClient{
		baseURL: srv.URL,
		http:    &http.Client{Transport: &http.Transport{ResponseHeaderTimeout: 20 * time.Millisecond}},
	}

	if _, err := client.stream(context.Background(), nil, func(string) {}); err == nil {
		t.Fatal("want error when upstream stalls before response headers, got nil")
	}
}
