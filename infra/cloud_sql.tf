# No authorized networks and SSL required, so the instance is reachable only via the IAM-gated connector.
#trivy:ignore:AVD-GCP-0017
resource "google_sql_database_instance" "chat" {
  name                = "chat"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true

  settings {
    tier                        = var.db_tier
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_autoresize             = true
    disk_size                   = 10
    deletion_protection_enabled = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_sql_database" "chat" {
  name     = "chat"
  instance = google_sql_database_instance.chat.name
}

# Real password is set out-of-band and stored in the db-password secret.
resource "google_sql_user" "app" {
  name     = "app"
  instance = google_sql_database_instance.chat.name
  password = "placeholder-rotated-out-of-band"

  lifecycle {
    ignore_changes = [password]
  }
}
