variable "project_id" {
  type        = string
  description = "GCP project hosting the deployment."
}

variable "region" {
  type        = string
  description = "Region for regional resources."
  default     = "us-central1"
}

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier"
  default     = "db-f1-micro"
}