module "main" {
  source = "../../modules/main"

  environment = "dev"

  app_name = "personal-website"

  image_tag_overrides = {
    api                = "latest"
    alembic_migrations = "latest"
    web                = "latest"
  }

  postgres_user     = var.postgres_user
  postgres_password = var.postgres_password
}
