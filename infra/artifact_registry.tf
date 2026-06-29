resource "google_artifact_registry_repository" "chat" {
  repository_id = "chat"
  location      = var.region
  format        = "DOCKER"
  description   = "Container images for the chat app (api + web)."

  # Always retain the 10 newest versions (protects the live image).
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  # Delete versions older than 30 days that the keep rule doesn't retain.
  cleanup_policies {
    id     = "delete-stale"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }

  depends_on = [google_project_service.enabled]
}