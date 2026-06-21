package main

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Chat holds the conversation/message handlers and their dependencies.
type Chat struct {
	pool *pgxpool.Pool
}

type conversation struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// List returns the caller's conversations, newest activity first.
func (c *Chat) List(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFromContext(r.Context())
	rows, err := c.pool.Query(r.Context(),
		`select id, coalesce(title,''), created_at, updated_at
		 from conversations where user_id = $1 order by updated_at desc`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not list conversations"})
		return
	}
	defer rows.Close()

	list := []conversation{}
	for rows.Next() {
		var cv conversation
		if err := rows.Scan(&cv.ID, &cv.Title, &cv.CreatedAt, &cv.UpdatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan failed"})
			return
		}
		list = append(list, cv)
	}
	writeJSON(w, http.StatusOK, list)
}

// Create makes a new (untitled) conversation for the caller.
func (c *Chat) Create(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFromContext(r.Context())
	var cv conversation
	err := c.pool.QueryRow(r.Context(),
		`insert into conversations (user_id) values ($1)
		 returning id, coalesce(title,''), created_at, updated_at`, userID).
		Scan(&cv.ID, &cv.Title, &cv.CreatedAt, &cv.UpdatedAt)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create conversation"})
		return
	}
	writeJSON(w, http.StatusCreated, cv)
}
