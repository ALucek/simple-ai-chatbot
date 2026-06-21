include .env
export
DB_DSN := postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable

.PHONY: db-up db-down db-psql run health test migrate-up migrate-down migrate-status migrate-create

db-up:
	docker compose up -d

db-down:
	docker compose down

db-psql:
	docker compose exec db psql -U $(DB_USER) -d $(DB_NAME)

run:
	cd api && go run .

health:
	@curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$(PORT)/health

test:
	cd api && go test ./...

migrate-up:
	@cd api && go tool goose -dir migrations postgres "$(DB_DSN)" up

migrate-down:
	@cd api && go tool goose -dir migrations postgres "$(DB_DSN)" down

migrate-status:
	@cd api && go tool goose -dir migrations postgres "$(DB_DSN)" status

migrate-create:
	@cd api && go tool goose -dir migrations create $(name) sql