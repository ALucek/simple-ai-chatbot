package main

import "net/http"

// withOriginCheck blocks unsafe requests with a mismatched Origin (CSRF).
func withOriginCheck(allowedOrigin string, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost, http.MethodPatch, http.MethodDelete:
			if o := r.Header.Get("Origin"); o != "" && o != allowedOrigin {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "origin not allowed"})
				return
			}
		}
		h.ServeHTTP(w, r)
	})
}
