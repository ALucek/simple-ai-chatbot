locals {
  secret_ids = ["jwt-secret", "openrouter-api-key", "db-password", "google-client-secret"]
}

resource "google_secret_manager_secret" "app" {
  for_each  = toset(local.secret_ids)
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}