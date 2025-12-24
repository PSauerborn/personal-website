variable "aws_assume_role_arn" {
  type        = string
  description = "The ARN of the AWS IAM role to assume"
}

variable "aws_region" {
  type        = string
  default     = "eu-west-2"
  description = "The AWS region to deploy resources in"
}
