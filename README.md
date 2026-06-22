# simple-ai-chatbot

A small, full-stack, multi-user streaming chatbot built from the ground up with no LLM framework, SDK, or agent library. The Go API calls the model's HTTP API directly and hand-rolls the streaming: it reads the raw upstream Server-Sent Events and re-streams them to a hand-built Next.js client that renders the reply token-by-token. Everything in between (auth, conversation storage, the SSE plumbing) is plain Go and plain React.

WIP learning project

## Components

| Dir | What it is | README |
|---|---|---|
| [`api/`](api/README.md) | Go HTTP API — JWT auth, per-user conversations, LLM streaming over SSE | [api/README.md](api/README.md) |
| [`web/`](web/README.md) | Next.js client — auth, conversation sidebar, streamed chat | [web/README.md](web/README.md) |

## Stack

- **Backend**: Go `net/http`, `pgx`/`pgxpool`, `bcrypt` + JWT, OpenRouter (OpenAI-compatible)
- **Database**: Postgres (local via Docker), `goose` migrations
- **Frontend**: Next.js 16 (App Router, TS strict), React 19, Tailwind v4, pnpm
- **Tests**: `testcontainers-go` (API, real Postgres) and Vitest + RTL (web); CI on every push

## Quick start

Prerequisites: Docker, Go, and pnpm.

```bash
cp .env.example .env        # then fill in OPENROUTER_API_KEY and a JWT_SECRET
make db-up                  # start Postgres in Docker
make migrate-up             # apply migrations
make api-run                # start the API on :$PORT (default 8080)

# in a second terminal:
make web-install            # install web dependencies
make web-run                # start the client on :3000
```

Then open <http://localhost:3000> and sign up. Generate a JWT secret with
`openssl rand -hex 32`; get an API key (and pick a model) at [openrouter.ai](https://openrouter.ai).

Configuration lives in the repo-root `.env` (consumed by both the `Makefile` and the API);
see [`api/README.md`](api/README.md#configuration) for the full variable list and
[`web/README.md`](web/README.md#configuration) for the single client variable.