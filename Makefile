-include .env
export
DB_DSN := postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable

.PHONY: db-up db-down db-psql migrate-up migrate-down migrate-status migrate-create db-delete db-reset docker-build stack-up stack-down\
        api-run api-fmt api-fmt-check api-lint api-typecheck api-test api-vuln api-sast \
        web-install web-run web-build web-fmt web-fmt-check web-lint web-typecheck web-test web-audit e2e e2e-local \
        fmt lint typecheck test api-check web-check check \
		scan-secrets scan-secrets-staged scan-images security \
        hooks health

# ── Database & migrations ──────────────────────────────────────────────

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

db-psql:
	docker compose exec db psql -U $(DB_USER) -d $(DB_NAME)

migrate-up:
	@cd api && go tool goose -dir migrations postgres "$(DB_DSN)" up

migrate-down:
	@cd api && go tool goose -dir migrations postgres "$(DB_DSN)" down

migrate-status:
	@cd api && go tool goose -dir migrations postgres "$(DB_DSN)" status

migrate-create:
	@cd api && go tool goose -dir migrations create $(name) sql

db-delete:
	docker compose down -v

db-reset: db-delete db-up migrate-up

# ── API ────────────────────────────────────────────────────────────────

api-run:
	cd api && go run .

api-fmt:
	cd api && gofmt -w .

api-fmt-check:
	@cd api && test -z "$$(gofmt -l .)" || { echo "gofmt needed — run 'make api-fmt'"; gofmt -l .; exit 1; }

api-lint:
	cd api && go vet ./...

api-typecheck:
	cd api && go build ./...

api-test:
	cd api && go test ./...

api-vuln:
	cd api && go tool govulncheck ./...

api-sast:
	cd api && go tool gosec -severity medium -confidence medium -quiet ./...

# ── Web ────────────────────────────────────────────────────────────────

web-install:
	cd web && pnpm install --frozen-lockfile

web-run:
	cd web && pnpm dev --port 3000

web-build:
	cd web && pnpm build

web-fmt:
	cd web && pnpm format

web-fmt-check:
	cd web && pnpm format:check

web-lint:
	cd web && pnpm lint

web-typecheck:
	cd web && pnpm typecheck

web-test:
	cd web && pnpm test

web-audit:
	cd web && pnpm audit --audit-level high

e2e:
	cd web && pnpm e2e

e2e-local: db-up migrate-up e2e

# ── Security scanning ────────────────────────────────────────────────────

scan-secrets:
	gitleaks dir . --config .gitleaks.toml --no-banner --redact

scan-secrets-staged:
	gitleaks git --staged --config .gitleaks.toml --no-banner --redact

# Fast static scans (no Docker) — what the CI `security` job runs.
security: api-vuln api-sast web-audit scan-secrets

# ── Containers / full stack ────────────────────────────────────────────

docker-build:
	docker compose --profile full build

stack-up:
	docker compose --profile full up -d --wait
	$(MAKE) migrate-up

stack-down:
	docker compose --profile full down

# ── Quality gates (aggregates) ─────────────────────────────────────────

fmt: api-fmt web-fmt

lint: api-fmt-check api-lint web-fmt-check web-lint

typecheck: api-typecheck web-typecheck

test: api-test web-test

# Per-service umbrella gates — what CI runs for each job (CI == local).
api-check: api-fmt-check api-lint api-typecheck api-test
web-check: web-fmt-check web-lint web-typecheck web-test web-build

# Full local gate: everything that must pass before merge.
check: api-check web-check e2e-local

# ── Dev tooling ────────────────────────────────────────────────────────

hooks:
	pre-commit install
	pre-commit install --hook-type pre-push

health:
	@curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$(PORT)/readyz
