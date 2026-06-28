output "instance_connection_name" {
  value       = google_sql_database_instance.chat.connection_name
  description = "Cloud SQL connection name for the Cloud Run socket DSN."
}

output "instance_name" {
  value       = google_sql_database_instance.chat.name
  description = "Cloud SQL instance name."
}
