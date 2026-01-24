locals {
  container_images = [
    "api",
    "alembic-migrations",
    "web",
    "load-seed-data"
  ]
}

# ECR repositories
resource "aws_ecr_repository" "ecr_repositories" {
  for_each = toset(local.container_images)

  name                 = "${var.app_name}/${each.value}"
  image_tag_mutability = "MUTABLE"
}

# namespace to hold the k8s resources
resource "kubernetes_namespace_v1" "namespace" {
  metadata {
    name = var.app_name
  }
}

# ECR credentials
module "ecr_creds" {
  depends_on = [kubernetes_namespace_v1.namespace]
  source     = "git::ssh://git@github.com/s31-software-co/terraform-modules.git//k8s-ecr-credentials?ref=1.0.0"

  namespace      = kubernetes_namespace_v1.namespace.metadata[0].name
  deploy_rotator = true
  base_name      = var.app_name

  cron_schedule = "0 * * * *"
}
