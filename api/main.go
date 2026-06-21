package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := NewPool(ctx, cfg)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	check := func(ctx context.Context) error { return Healthy(ctx, pool) }

	auth := &Auth{pool: pool, secret: []byte(cfg.JWTSecret)}
	llm := &openRouterClient{key: cfg.OpenRouterKey, model: cfg.Model, http: &http.Client{}}
	chat := &Chat{pool: pool, llm: llm, systemPrompt: cfg.SystemPrompt}
	protect := func(h http.HandlerFunc) http.Handler { return auth.Middleware(http.HandlerFunc(h)) }

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", healthHandler(check))
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

	server := &http.Server{Addr: ":" + cfg.Port, Handler: mux}

	go func() {
		log.Printf("listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

// healthHandler reports 200 when check passes, 503 when it fails.
func healthHandler(check func(context.Context) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := check(r.Context()); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
