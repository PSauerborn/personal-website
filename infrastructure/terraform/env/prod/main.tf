module "main" {
  source = "../../modules/main"

  environment = "prod"

  app_name = "personal-website"

  postgres_user     = var.postgres_user
  postgres_password = var.postgres_password
}
