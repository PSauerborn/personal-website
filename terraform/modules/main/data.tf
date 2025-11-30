data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_ecr_authorization_token" "this" {
  registry_id = data.aws_caller_identity.current.account_id
}

data "aws_route53_zone" "main" {
  name = var.dns_config.root_domain_name
}
