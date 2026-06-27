# web — simple-ai-chatbot frontend

A minimal, hand-built Next.js client for the chatbot: email/password auth, a
conversation sidebar, and assistant replies streamed in token-by-token over SSE.

## Stack

- **Next.js** 16 (App Router, TypeScript strict), **React** 19
- **Tailwind CSS** v4 with a hand-built design system — semantic `@theme` tokens + small
  primitives (`Button`/`Input`/`Textarea`); no component kit. Black-and-white UI
- **Rendering/behavior utilities** (not a component kit): `react-markdown` + `remark-gfm` +
  `rehype-sanitize` (safe Markdown), `use-stick-to-bottom` (scroll anchoring)
- **pnpm** package manager
- **Tests**: Vitest + React Testing Library (`@testing-library/user-event`, `renderHook`)

## Quick start

From the repo root (the `Makefile` lives there). The Go API must be running first —
see [`../api`](../api/README.md).

```bash
make web-install            # pnpm install --frozen-lockfile
make web-run                # next dev on :3000
```

Open <http://localhost:3000>, sign up, and start chatting.

By default the client calls the API at `http://localhost:8080`. Point it elsewhere with
`NEXT_PUBLIC_API_URL` (e.g. in `web/.env.local`). The API's `ALLOWED_ORIGIN` must include
the web origin (it defaults to `http://localhost:3000`).

## Configuration

| Var                   | Required | Default                 | Notes                  |
| --------------------- | -------- | ----------------------- | ---------------------- |
| `NEXT_PUBLIC_API_URL` | no       | `http://localhost:8080` | base URL of the Go API |

`NEXT_PUBLIC_API_URL` is a public var, so in the production image it's baked at **build**
time as a Docker build-arg (see the root README's production-parity stack), not read at runtime.

## Design system

The UI is hand-built on a small token + primitive foundation — no component kit.

- **Tokens.** Semantic colors and one radius live in a Tailwind v4 `@theme` block in
  `src/app/globals.css` (`bg-surface`, `text-muted`, `border-border`, `bg-accent`,
  `--radius`, …). Components reference these names, never raw palette values, so the whole
  look changes from one place.
- **`cn()`** (`src/lib/cn.ts`) — merges class strings via `clsx` + `tailwind-merge`, so a
  caller's `className` can safely override a primitive's base styles.
- **Primitives** (`src/components/ui/`) — `Button` (`variant`/`size`), `Input`, `Textarea`.
  Presentational only; variants are plain lookup objects. Feature components compose these.

To restyle, edit the tokens (and, for shape changes, the primitives) — not every component.

## How it works

- **Auth.** The access token lives in memory; the refresh token in `localStorage`.
  `api.ts`'s `request()` attaches the `Bearer` header and, on a `401`, refreshes once
  (single-flight) and retries. `lib/auth-context.tsx` restores the session on boot and
  exposes `login` / `signup` / `logout`. (Tradeoff: an in-memory token is invisible to
  the server, so route protection is client-side.)
- **Routing.** Route groups `(auth)` and `(app)` don't appear in the URL. `(app)/layout.tsx`
  is the auth guard plus the two-pane shell (sidebar │ main); each conversation is its own
  route at `/c/[id]`.
- **Data.** Hand-built hooks and contexts instead of a data library. `ConversationsProvider`
  owns the sidebar list; `MessagesProvider` (`lib/messages-context.tsx`) is an app-level
  per-conversation message store, and `useMessages(id)` reads it. Because the store sits
  **above** the pages, a stream keeps running when you navigate to another conversation and
  rehydrates when you return; only the **Stop** button aborts it. (In-memory, so a hard
  browser refresh starts fresh — resuming across a refresh would need server-side support.)
- **Streaming.** `api.ts`'s `sendMessage()` POSTs the message and consumes the SSE response
  with `fetch` + `getReader()` (cancellable via an `AbortSignal`); `parseSSE()` frames the
  bytes. Deltas append to an optimistic assistant bubble, `done` swaps in the real message id,
  and `title` updates the sidebar live. Stopping aborts the fetch and drops the partial reply
  (the user message stays); an `AbortError` is swallowed, never shown as an error.
- **Robustness.**
  - **Session expiry** — when a mid-session refresh fails, `api.ts` notifies the auth context
    (`setOnUnauthorized`), which drops to `anon` so the shell redirects to `/login` instead of
    showing an inline error.
  - **Scroll anchoring** — `use-stick-to-bottom` keeps the view pinned to the latest token
    while streaming but releases the moment you scroll up to read.
  - **Markdown** — assistant replies render as Markdown via `react-markdown` (+ `remark-gfm`),
    sanitized by `rehype-sanitize` with raw HTML disabled; user messages stay plain text.
  - **Page CSP** — a pragmatic `Content-Security-Policy` (built in `lib/csp.ts`, applied in
    `next.config.ts`) is sent on every response as defense-in-depth.

## Tests

```bash
make web-test               # or: cd web && pnpm test
```

Component tests (RTL) and hook tests (`renderHook`) mock the `api` module or `fetch`; the
SSE parser and consumer are unit-tested directly. CI runs the suite on every push.

## Layout

```
web/src/
  app/
    layout.tsx                # root layout, wraps the app in AuthProvider
    (auth)/login, signup      # public auth pages
    (app)/layout.tsx          # auth guard + sidebar shell (ConversationsProvider)
    (app)/page.tsx            # index empty state
    (app)/c/[id]/page.tsx     # one conversation: history + composer
  components/
    ui/                       # presentational primitives: Button, Input, Textarea
    sidebar.tsx               # conversation list; new / rename / delete
    conversation-item.tsx     # one sidebar row (inline rename + delete confirm)
    message-list.tsx          # message bubbles (sanitized Markdown) + streaming caret
    composer.tsx              # message input box + Stop button
  lib/
    cn.ts                     # clsx + tailwind-merge class-merge helper
    api.ts                    # fetch client: auth, CRUD, SSE streaming (parseSSE/sendMessage), setOnUnauthorized
    auth-context.tsx          # session state + login / signup / logout
    conversations-context.tsx # shared conversation list + patchConversation
    messages-context.tsx      # app-level message store; survives navigation; send / stop / stream
    csp.ts                    # builds the page Content-Security-Policy (used by next.config.ts)
```
