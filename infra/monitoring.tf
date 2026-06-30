# Email channel every alert notifies.
resource "google_monitoring_notification_channel" "email" {
  display_name = "Owner email"
  type         = "email"
  labels = {
    email_address = var.owner_email
  }

  depends_on = [google_project_service.enabled]
}

# Synthetic check: is the site (and its DB dependency) responding at all?
resource "google_monitoring_uptime_check_config" "readyz" {
  display_name = "chat readyz"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/readyz"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain
    }
  }

  depends_on = [google_project_service.enabled]
}

# Fires when the uptime check fails (site down or DB unreachable).
resource "google_monitoring_alert_policy" "uptime" {
  display_name = "Site down (readyz uptime failing)"
  combiner     = "OR"

  conditions {
    display_name = "readyz check failing"
    condition_threshold {
      filter = join(" AND ", [
        "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\"",
        "resource.type = \"uptime_url\"",
        "metric.label.check_id = \"${google_monitoring_uptime_check_config.readyz.uptime_check_id}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "60s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

# More than 5 server errors from chat-api within 5 minutes.
resource "google_monitoring_alert_policy" "api_5xx" {
  display_name = "API 5xx errors"
  combiner     = "OR"

  conditions {
    display_name = "chat-api 5xx > 5 / 5m"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "resource.labels.service_name = \"chat-api\"",
        "metric.type = \"run.googleapis.com/request_count\"",
        "metric.labels.response_code_class = \"5xx\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Per-request latency distribution, excluding the SSE stream and probes.
resource "google_logging_metric" "api_latency" {
  name = "chat_api_request_latency"
  filter = join(" ", [
    "resource.type=\"cloud_run_revision\"",
    "resource.labels.service_name=\"chat-api\"",
    "jsonPayload.msg=\"request\"",
    "jsonPayload.path!=\"/api/chat\"",
    "jsonPayload.path!=\"/readyz\"",
    "jsonPayload.path!=\"/livez\"",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"
  }

  value_extractor = "EXTRACT(jsonPayload.duration_ms)"

  bucket_options {
    exponential_buckets {
      num_finite_buckets = 64
      growth_factor      = 1.4
      scale              = 1
    }
  }
}

# Fires when non-stream p95 latency exceeds 2s over 5 minutes.
resource "google_monitoring_alert_policy" "api_latency" {
  display_name = "API latency p95 (non-stream)"
  combiner     = "OR"

  conditions {
    display_name = "p95 > 2000ms / 5m"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "metric.type = \"logging.googleapis.com/user/${google_logging_metric.api_latency.name}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 2000
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Disk filling up (autoresize lagging / cost climbing).
resource "google_monitoring_alert_policy" "sql_disk" {
  display_name = "Cloud SQL disk > 85%"
  combiner     = "OR"

  conditions {
    display_name = "disk utilization > 0.85 / 10m"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloudsql_database\"",
        "resource.labels.database_id = \"${var.project_id}:chat\"",
        "metric.type = \"cloudsql.googleapis.com/database/disk/utilization\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85
      duration        = "600s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Sustained high CPU on the database instance.
resource "google_monitoring_alert_policy" "sql_cpu" {
  display_name = "Cloud SQL CPU > 80%"
  combiner     = "OR"

  conditions {
    display_name = "cpu utilization > 0.80 / 15m"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloudsql_database\"",
        "resource.labels.database_id = \"${var.project_id}:chat\"",
        "metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 0.80
      duration        = "900s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Counts ERROR logs from chat-api whose err mentions the OpenRouter upstream.
resource "google_logging_metric" "openrouter_errors" {
  name = "chat_api_openrouter_errors"
  filter = join(" ", [
    "resource.type=\"cloud_run_revision\"",
    "resource.labels.service_name=\"chat-api\"",
    "severity=ERROR",
    "jsonPayload.err:\"openrouter:\"",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

# Fires when more than 2 OpenRouter errors (3+) occur within 5 minutes.
resource "google_monitoring_alert_policy" "openrouter_errors" {
  display_name = "OpenRouter upstream errors"
  combiner     = "OR"

  conditions {
    display_name = "openrouter errors > 2 / 5m"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "metric.type = \"logging.googleapis.com/user/${google_logging_metric.openrouter_errors.name}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}
