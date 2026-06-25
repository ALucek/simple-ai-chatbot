# api — simple-ai-chatbot backend

A small Go HTTP API for a multi-user streaming chatbot: hand-rolled JWT auth,
per-user conversations, and replies streamed from an LLM over Server-Sent Events.

## Stack

- **Go** `net/http` (1.22 method+path routing), `pgx`/`pgxpool`
- **Postgres** (local via Docker), schema managed with **goose** migrations
- **Auth**: `bcrypt` + HS256 JWT access tokens + **rotating** DB-backed refresh tokens (reuse detection), case-insensitive email, constant-time login
- **LLM**: OpenRouter (OpenAI-compatible) streamed as raw SSE
- **Observability**: structured `log/slog` JSON access logs + per-request id (stdlib, zero deps)
- **Guardrails**: request/message size caps, hand-rolled token-bucket rate limiting (IP on auth, user on chat), a daily per-user token budget
- **Tests**: `testcontainers-go` against a real ephemeral Postgres

## Quick start

From the repo root (the `Makefile` and `.env` live there):

```bash
cp .env.example .env        # then fill in OPENROUTER_API_KEY and a JWT_SECRET
make db-up                  # start Postgres in Docker
make migrate-up             # apply migrations
make api-run                # start the API on :$PORT (default 8080)
make health                 # -> 200 when the DB is reachable
```

Generate a secret with `openssl rand -hex 32`. Get a key (and pick a model) at
[openrouter.ai](https://openrouter.ai); the default model is a free slug.

## Configuration

Read from the environment (see `.env.example`):

| Var | Required | Default | Notes |
|---|---|---|---|
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | yes | — | Postgres connection |
| `PORT` | yes | — | HTTP listen port |
| `JWT_SECRET` | yes | — | HS256 signing key |
| `OPENROUTER_API_KEY` | yes | — | LLM access |
| `OPENROUTER_MODEL` | no | `openrouter/free` | any openrouter.ai/models slug |
| `OPENROUTER_BASE_URL` | no | OpenRouter chat-completions URL | override the upstream (the e2e suite points it at a fake) |
| `SYSTEM_PROMPT` | no | `You are a helpful assistant.` | prepended to every request |
| `ALLOWED_ORIGIN` | no | `http://localhost:3000` | CORS allow-origin for the web client |
| `DATABASE_URL` | no | — | full DSN override; used verbatim if set (e.g. a Cloud SQL socket), else built from `DB_*` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error`; unknown → `info` |
| `TOKEN_BUDGET_DAILY` | no | `8192` | per-user rolling-24h token budget; over → `429`. Unparseable/≤0 → `8192` |

## API

All `/api/*` routes except signup/login/refresh require
`Authorization: Bearer <access_token>`.

| Method & path | Purpose |
|---|---|
| `GET /livez` | process liveness — always `200`, no dependency checks |
| `GET /readyz` | dependency readiness — `200` when the DB is reachable, `503` when not |
| `POST /api/signup` | create user → `{access_token, refresh_token}` |
| `POST /api/login` | verify password → `{access_token, refresh_token}` |
| `POST /api/refresh` | rotate: exchange a refresh token for a new access **and** refresh token |
| `POST /api/logout` | revoke a refresh token |
| `GET /api/me` | current user |
| `GET /api/conversations` | list the caller's conversations |
| `POST /api/conversations` | create a conversation |
| `GET /api/conversations/{id}/messages` | message history |
| `PATCH /api/conversations/{id}` | rename |
| `DELETE /api/conversations/{id}` | delete (messages cascade) |
| `POST /api/conversations/{id}/messages` | send a message, **stream** the reply |

### Streaming

`POST /api/conversations/{id}/messages` responds with `text/event-stream`. Each
frame's `data:` is a JSON object; read the stream to EOF:

```
event: delta
data: {"text":"Hel"}

event: done
data: {"message_id":42}

event: title
data: {"title":"Plan a trip to"}
```

- `delta` — an incremental chunk of the reply
- `done` — the reply is complete and persisted (`message_id`)
- `title` — on a conversation's first message only, its generated name (may follow `done`)
- `error` — something failed mid-stream (`{"error":"..."}`)

## Observability

Every request flows through `withRequestID` → `withLogging` → `withCORS` (request id
outermost, so logging and handlers see it). Each request emits **one** structured JSON
line on stdout via `log/slog`:

```json
{"time":"...","level":"INFO","msg":"request","method":"POST","path":"/api/conversations/1/messages","status":200,"bytes":512,"duration_ms":1843,"remote_addr":"...","request_id":"a1b2...","user_id":7}
```

- **Request id** — an inbound `X-Request-Id` is honored; otherwise one is minted (16 hex
  bytes). It's stored in `context`, echoed as the `X-Request-Id` response header, and
  auto-attached to every `slog` line through a small context-aware handler.
- **`user_id`** is present only on authenticated requests; omitted otherwise.
- **Health probes** (`/livez`, `/readyz`) log at `debug`, so readiness polling doesn't
  flood the log at the default `info` level. Set `LOG_LEVEL=debug` to see them.

## Guardrails

Limits that bound abuse and (paid) LLM cost — all stdlib, zero deps:

- **Request body cap** — a `withMaxBody` middleware caps every request body at **1 MiB**; an
  over-cap body is rejected with **413** `{"error":"request too large"}` (a shared `decodeJSON`
  helper maps `*http.MaxBytesError` → 413, any other decode error → 400).
- **Message length cap** — a chat message over **8000 characters** is rejected with **400**.
- **Rate limiting** — a hand-rolled token-bucket limiter (`ratelimit.go`): credential endpoints
  (`/signup`, `/login`, `/refresh`) are limited **per IP** (5/min, burst 5), the chat send
  endpoint **per user** (20/min, burst 20). Over-limit → **429** `{"error":"rate limit
  exceeded"}` with a `Retry-After` header. IP keying uses `RemoteAddr` for now; reading
  `X-Forwarded-For` behind a proxy is an M7 follow-up.
- **Daily token budget** — every completed LLM call's token usage (`stream_options.
  include_usage`) is written to an append-only `token_usage` ledger. Before each send the API
  sums a user's usage over the last 24h; once it reaches `TOKEN_BUDGET_DAILY` the next send is
  blocked with **429** `{"error":"daily token budget exceeded"}`. The ledger references `users`
  only (not conversations), so deleting a chat can't reset the cap. Because a call's cost isn't
  known until it finishes, enforcement is "block the *next* call when already at/over budget."

## Security

Auth hardening that lives alongside the guardrails above — all stdlib + the deps already
in the tree:

- **Password rules** — signup rejects a password over **72 bytes** (bcrypt's hard limit, so
  a long password can't be silently truncated) or under **8 characters**, both with **400**.
- **Case-insensitive email** — email is normalized (`lower` + trim) on signup and login, and
  a `unique index on users (lower(email))` enforces it at the database, so `Foo@x.com` and
  `foo@x.com` are one account.
- **Constant-time login** — when an email isn't found the API still runs one bcrypt compare
  against a fixed dummy hash, so login timing can't be used to enumerate which emails are
  registered; unknown-email and wrong-password return the identical generic **401**.
- **Security headers** — a `withSecurityHeaders` middleware sets `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a strict
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` on every response
  (the API only ever returns JSON). HSTS is deferred to the load balancer (M7).
- **Refresh-token rotation + reuse detection** — every `/refresh` atomically consumes the
  presented token and issues a **new** access *and* refresh token in the same **family** (a
  random `family_id` minted at login and carried through rotations). Replaying an
  already-rotated token is treated as theft: the whole family is revoked, so the attacker and
  the victim both have to re-authenticate, while the user's other logins (other families) stay
  valid. `logout` deletes its token, so a logged-out token reads as a plain invalid token, not
  a reuse alarm.

## Container image

`make docker-build` builds a multi-stage image: the static Go binary (`CGO_ENABLED=0`) is
copied onto `gcr.io/distroless/static:nonroot` — no shell or package manager, runs non-root.
It takes all config from env (point `DATABASE_URL` at a managed Postgres). Migrations are
**not** run on boot — apply them out-of-band (`make migrate-up`). See the root README for the
full local stack (`make stack-up`).

## Tests

```bash
make api-test     # or: cd api && go test ./...
```

Integration tests run the real handlers against a throwaway Postgres
(Docker required) and cover the auth flow, CRUD, per-user scoping (IDOR), and
streaming. CI runs the same suite on every push.

## Layout

```
api/
  main.go          # wiring, routes (newMux), graceful shutdown
  config.go        # env config
  db.go            # pgxpool connection + health check
  logging.go       # request-id + access-log middleware, slog setup, Flusher-safe wrapper
  ratelimit.go     # hand-rolled token-bucket rate limiter + middleware
  usage.go         # append-only token-usage ledger (record + windowed sum)
  auth.go          # bcrypt, JWT, refresh tokens, middleware
  auth_handlers.go # signup / login / refresh / logout / me
  chat.go          # conversations CRUD + streaming + titles + size/budget guards
  openrouter.go    # OpenRouter SSE client
  migrations/      # goose SQL migrations
  *_test.go        # unit + integration tests
```
