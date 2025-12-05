variable "environment" {
  type        = string
  description = "The deployment environment (e.g., dev, staging, prod)."

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "The environment must be one of: dev, staging, prod."
  }
}

variable "dns_config" {
  type = object({
    root_domain_name = string
    subdomains       = list(string)
    forward_ip       = string
  })
  default     = null
  description = "DNS configuration for the personal website."
}

variable "ingress_controller_annotations" {
  type        = map(string)
  description = ""
  default     = {}
}
