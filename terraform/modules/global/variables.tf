variable "environment" {
  type        = string
  description = "The deployment environment (e.g., dev, global, prod)."

  validation {
    condition     = contains(["dev", "global", "prod"], var.environment)
    error_message = "The environment must be one of: dev, global, prod."
  }
}

variable "deploy_ingress_controller" {
  type        = bool
  description = "Whether to deploy the NGINX ingress controller."
  default     = true
}
