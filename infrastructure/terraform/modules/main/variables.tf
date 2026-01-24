variable "environment" {
  type        = string
  description = "The deployment environment (e.g., dev, staging, prod)."

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "The environment must be one of: dev, staging, prod."
  }
}

variable "image_tag_overrides" {
  type        = map(string)
  description = "Override image tags for specific services."
  default     = {}
}

variable "app_name" {
  type        = string
  description = "Name of the app."
}

variable "postgres_user" {
  type        = string
  description = "Username for the postgres database."
  sensitive   = true
}

variable "postgres_password" {
  type        = string
  description = "Password for the postgres database."
  sensitive   = true
}
