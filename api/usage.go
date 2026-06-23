package main

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// tokenUsage is the prompt/completion token count for one completed LLM call.
type tokenUsage struct {
	Prompt     int
	Completion int
}

// recordUsage appends one row to the token-usage ledger.
func recordUsage(ctx context.Context, pool *pgxpool.Pool, userID int64, u tokenUsage) error {
	_, err := pool.Exec(ctx,
		`insert into token_usage (user_id, prompt_tokens, completion_tokens) values ($1, $2, $3)`,
		userID, u.Prompt, u.Completion)
	return err
}

// usageSince returns the total tokens (prompt + completion) a user has spent since the given time
func usageSince(ctx context.Context, pool *pgxpool.Pool, userID int64, since time.Time) (int, error) {
	var total int
	err := pool.QueryRow(ctx,
		`select coalesce(sum(prompt_tokens + completion_tokens), 0)
		 from token_usage where user_id = $1 and created_at > $2`,
		userID, since).Scan(&total)
	return total, err
}
