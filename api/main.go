package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

const serverIdleTimeout = 120 * time.Second

// WriteTimeout is left unset on purpose cuz streaming SSE response.
func newServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       serverIdleTimeout,
	}
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		if err := runMigrations(migrateDSN()); err != nil {
			slog.Error("migrate", "err", err)
			os.Exit(1)
		}
		slog.Info("migrations applied")
		return
	}

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

	auth := &Auth{pool: pool, secret: []byte(cfg.JWTSecret), verify: selectGoogleVerifier(cfg), signupOpen: cfg.SignupOpen}
	llm := &openRouterClient{key: cfg.OpenRouterKey, model: cfg.Model, baseURL: cfg.OpenRouterBaseURL, http: newLLMHTTPClient()}
	chat := &Chat{pool: pool, llm: llm, systemPrompt: cfg.SystemPrompt, tokenBudget: cfg.TokenBudgetDaily, ownerEmail: normalizeEmail(cfg.OwnerEmail)}

	mux := newMux(check, auth, chat, cfg.TrustProxy)

	handler := withRequestID(withLogging(withRecover(withSecurityHeaders(withCORS(cfg.AllowedOrigin, withMaxBody(mux))))))
	server := newServer(":"+cfg.Port, handler)

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

const maxBodyBytes = 1 << 20 // 1 MiB

// withMaxBody caps the request body so a single request can't exhaust memory.
func withMaxBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		next.ServeHTTP(w, r)
	})
}

// withSecurityHeaders sets a baseline of security response headers on every response.
func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		next.ServeHTTP(w, r)
	})
}

// decodeJSON reads the (size-capped) request body into dst.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "request too large"})
		} else {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}
		return false
	}
	return true
}

// newMux registers every route.
func newMux(check func(context.Context) error, auth *Auth, chat *Chat, trustProxy bool) *http.ServeMux {
	protect := func(h http.HandlerFunc) http.Handler { return auth.Middleware(http.HandlerFunc(h)) }

	authLimiter := newLimiter(authRatePerMin, authRateBurst)
	chatLimiter := newLimiter(chatRatePerMin, chatRateBurst)
	limitIP := authLimiter.middleware(func(r *http.Request) string { return clientIP(r, trustProxy) })
	limitUser := chatLimiter.middleware(func(r *http.Request) string {
		uid, _ := userIDFromContext(r.Context())
		return strconv.FormatInt(uid, 10)
	})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /livez", liveHandler())
	mux.HandleFunc("GET /readyz", readyHandler(check))
	mux.Handle("POST /api/google", limitIP(http.HandlerFunc(auth.Google)))
	mux.Handle("POST /api/refresh", limitIP(http.HandlerFunc(auth.Refresh)))
	mux.HandleFunc("POST /api/logout", auth.Logout)
	mux.Handle("GET /api/me", auth.Middleware(http.HandlerFunc(auth.Me)))
	mux.Handle("GET /api/conversations", protect(chat.List))
	mux.Handle("POST /api/conversations", protect(chat.Create))
	mux.Handle("GET /api/conversations/{id}/messages", protect(chat.Messages))
	mux.Handle("PATCH /api/conversations/{id}", protect(chat.Rename))
	mux.Handle("DELETE /api/conversations/{id}", protect(chat.Delete))
	mux.Handle("GET /api/usage", protect(chat.Usage))
	// auth first (puts user in context) → then the user-keyed limiter → handler.
	mux.Handle("POST /api/conversations/{id}/messages",
		auth.Middleware(limitUser(http.HandlerFunc(chat.Send))))
	return mux
}
