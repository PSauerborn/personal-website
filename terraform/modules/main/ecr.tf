locals {
  container_images = [
    "api",
    "alembic-migrations"
  ]
}

resource "aws_ecr_repository" "main" {
  for_each = toset(local.container_images)

  name                 = "${local.base_name}-${each.key}"
  image_tag_mutability = "MUTABLE"

  lifecycle {
    prevent_destroy = true
  }
}
