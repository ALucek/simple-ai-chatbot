package main

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const maxConns = 5

// NewPool opens a connection pool to Postgres using the given config.
func NewPool(ctx context.Context, cfg Config) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(dsn(cfg))
	if err != nil {
		return nil, fmt.Errorf("parse db config: %w", err)
	}
	poolCfg.MaxConns = maxConns
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}
	return pool, nil
}

func dsn(cfg Config) string {
	if cfg.DatabaseURL != "" {
		return cfg.DatabaseURL
	}
	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(cfg.DBUser, cfg.DBPassword),
		Path:   "/" + cfg.DBName,
	}
	if strings.HasPrefix(cfg.DBHost, "/") {
		// Unix socket connection keeps the host in the query and uses no port.
		u.RawQuery = url.Values{"host": {cfg.DBHost}}.Encode()
	} else {
		u.Host = cfg.DBHost + ":" + cfg.DBPort
	}
	return u.String()
}

// Healthy runs a trivial query to confirm the database actually answers.
func Healthy(ctx context.Context, pool *pgxpool.Pool) error {
	var one int
	if err := pool.QueryRow(ctx, "select 1").Scan(&one); err != nil {
		return fmt.Errorf("db health check: %w", err)
	}
	return nil
}
