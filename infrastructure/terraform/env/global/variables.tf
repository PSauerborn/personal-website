variable "aws_assume_role_arn" {
  type        = string
  description = "The ARN of the AWS IAM role to assume"
}

variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "The AWS region to deploy resources in"
}
