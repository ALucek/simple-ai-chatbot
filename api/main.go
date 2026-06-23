package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	setupLogger(cfg.LogLevel)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := NewPool(ctx, cfg)
	if err != nil {
		slog.Error("db", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	check := func(ctx context.Context) error { return Healthy(ctx, pool) }

	auth := &Auth{pool: pool, secret: []byte(cfg.JWTSecret)}
	llm := &openRouterClient{key: cfg.OpenRouterKey, model: cfg.Model, baseURL: cfg.OpenRouterBaseURL, http: &http.Client{}}
	chat := &Chat{pool: pool, llm: llm, systemPrompt: cfg.SystemPrompt}

	mux := newMux(check, auth, chat)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           withRequestID(withLogging(withCORS(cfg.AllowedOrigin, mux))),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("listening", "port", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown", "err", err)
	}
}

// readyHandler reports 200 when the dependency check passes, 503 when it fails.
func readyHandler(check func(context.Context) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := check(r.Context()); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// liveHandler reports 200 as long as the process is serving; no dependency checks.
func liveHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// newMux registers every route.
func newMux(check func(context.Context) error, auth *Auth, chat *Chat) *http.ServeMux {
	protect := func(h http.HandlerFunc) http.Handler { return auth.Middleware(http.HandlerFunc(h)) }

	mux := http.NewServeMux()
	mux.HandleFunc("GET /livez", liveHandler())
	mux.HandleFunc("GET /readyz", readyHandler(check))
	mux.HandleFunc("POST /api/signup", auth.Signup)
	mux.HandleFunc("POST /api/login", auth.Login)
	mux.HandleFunc("POST /api/refresh", auth.Refresh)
	mux.HandleFunc("POST /api/logout", auth.Logout)
	mux.Handle("GET /api/me", auth.Middleware(http.HandlerFunc(auth.Me)))
	mux.Handle("GET /api/conversations", protect(chat.List))
	mux.Handle("POST /api/conversations", protect(chat.Create))
	mux.Handle("GET /api/conversations/{id}/messages", protect(chat.Messages))
	mux.Handle("PATCH /api/conversations/{id}", protect(chat.Rename))
	mux.Handle("DELETE /api/conversations/{id}", protect(chat.Delete))
	mux.Handle("POST /api/conversations/{id}/messages", protect(chat.Send))
	return mux
}
