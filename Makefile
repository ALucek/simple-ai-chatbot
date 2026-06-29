-include .env
export
DB_DSN := postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable

.PHONY: db-up db-down db-psql migrate-up migrate-down migrate-status migrate-create db-delete db-reset docker-build stack-up stack-down\
        api-run api-fmt api-fmt-check api-lint api-typecheck api-test api-vuln api-sast \
        web-install web-run web-build web-fmt web-fmt-check web-lint web-typecheck web-test web-audit e2e e2e-local \
        fmt lint typecheck test api-check web-check check comment-check comment-check-test \
		scan-secrets scan-secrets-staged scan-images security \
		tf-fmt tf-fmt-check tf-validate tf-lint tf-config-scan tf-check \
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

scan-images:
	trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 simple-ai-chatbot-api:local
	trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 simple-ai-chatbot-web:local

# ── Infra (Terraform) ────────────────────────────────────────────────────
# Local use needs terraform + tflint + trivy on PATH.

tf-fmt:
	cd infra && terraform fmt -recursive

tf-fmt-check:
	cd infra && terraform fmt -check -recursive

tf-validate:
	@cd infra && { [ -d .terraform ] || terraform init -backend=false -input=false >/dev/null; } && terraform validate

tf-lint:
	@cd infra && tflint --init >/dev/null && tflint

tf-config-scan:
	trivy config infra --severity HIGH,CRITICAL --exit-code 1

# Infra quality gate (no cloud creds): format + validate + lint.
tf-check: tf-fmt-check tf-validate tf-lint

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

lint: api-fmt-check api-lint web-fmt-check web-lint comment-check

typecheck: api-typecheck web-typecheck

test: api-test web-test

# Comment style: <=80 chars + no multi-line block comments (ast-grep, all languages).
comment-check:
	@web/node_modules/.bin/ast-grep scan

comment-check-test:
	@web/node_modules/.bin/ast-grep test --skip-snapshot-tests

# Per-service umbrella gates — what CI runs for each job (CI == local).
api-check: api-fmt-check api-lint api-typecheck api-test
web-check: web-fmt-check web-lint web-typecheck web-test web-build

# Full local gate: everything that must pass before merge.
check: api-check web-check tf-check comment-check comment-check-test e2e-local

# ── Dev tooling ────────────────────────────────────────────────────────

hooks:
	pre-commit install
	pre-commit install --hook-type pre-push

health:
	@curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$(PORT)/readyz
