locals {
  registry  = "${var.region}-docker.pkg.dev/${var.project_id}/chat"
  api_image = "${local.registry}/api:bootstrap"
  web_image = "${local.registry}/web:bootstrap"
}

resource "google_service_account" "api" {
  account_id   = "chat-api"
  display_name = "chat api runtime"
}

resource "google_service_account" "web" {
  account_id   = "chat-web"
  display_name = "chat web runtime"
}

resource "google_secret_manager_secret_iam_member" "api_secrets" {
  for_each  = google_secret_manager_secret.app
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "web" {
  name                = "chat-web"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = false

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = local.web_image
      ports {
        container_port = 3000
      }
    }
  }

  # Fields written by gcloud/Cloud Run, not managed here.
  lifecycle {
    ignore_changes = [
      client,
      client_version,
      scaling,
      template[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_v2_service" "api" {
  name                = "chat-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email
    timeout         = "3600s"

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.chat.connection_name]
      }
    }

    containers {
      image = local.api_image
      ports {
        container_port = 8080
      }

      env {
        name  = "DB_USER"
        value = "app"
      }
      env {
        name  = "DB_NAME"
        value = "chat"
      }
      env {
        name  = "DB_PORT"
        value = "5432"
      }
      env {
        name  = "DB_HOST"
        value = "/cloudsql/${google_sql_database_instance.chat.connection_name}"
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }
      env {
        name  = "OWNER_EMAIL"
        value = var.owner_email
      }
      env {
        name  = "ALLOWED_ORIGIN"
        value = "https://${var.domain}"
      }

      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["db-password"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["jwt-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "OPENROUTER_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["openrouter-api-key"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "GOOGLE_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["google-client-secret"].secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/readyz"
          port = 8080
        }
      }
    }
  }

  # Fields written by gcloud/Cloud Run, not managed here.
  lifecycle {
    ignore_changes = [
      client,
      client_version,
      scaling,
      template[0].containers[0].image,
      template[0].containers[0].volume_mounts,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.api_secrets,
    google_project_iam_member.api_sql,
  ]
}

resource "google_cloud_run_v2_job" "migrate" {
  name                = "chat-migrate"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.api.email
      timeout         = "600s"
      max_retries     = 0

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.chat.connection_name]
        }
      }

      containers {
        image   = local.api_image
        command = ["/server", "migrate"]

        env {
          name  = "DB_USER"
          value = "app"
        }
        env {
          name  = "DB_NAME"
          value = "chat"
        }
        env {
          name  = "DB_PORT"
          value = "5432"
        }
        env {
          name  = "DB_HOST"
          value = "/cloudsql/${google_sql_database_instance.chat.connection_name}"
        }
        env {
          name = "DB_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app["db-password"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  # Fields written by gcloud/Cloud Run, not managed here.
  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].template[0].containers[0].image,
      template[0].template[0].containers[0].volume_mounts,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.api_secrets,
    google_project_iam_member.api_sql,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  name     = google_cloud_run_v2_service.web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}