locals {
  base_name = "personal-website-${var.environment}"

  container_images = [
    "api",
    "alembic-migrations"
  ]
}

resource "aws_ecr_repository" "main" {
  for_each = toset(local.container_images)

  name                 = "personal-website-${each.key}"
  image_tag_mutability = "MUTABLE"

  lifecycle {
    prevent_destroy = true
  }
}

resource "kubernetes_namespace" "main" {
  metadata {
    name = var.environment
  }
}

resource "helm_release" "pg_operator" {
  depends_on = [kubernetes_namespace.main]
  name       = "${local.base_name}-pg-operator"
  repository = "https://cloudnative-pg.github.io/charts"
  chart      = "cloudnative-pg"
  namespace  = kubernetes_namespace.main.metadata[0].name

  values = [
    file("../../modules/helm/values/pg_operator.yaml")
  ]
}

resource "helm_release" "nginx_ingress" {
  depends_on = [kubernetes_namespace.main]
  count      = var.deploy_ingress_controller ? 1 : 0
  name       = "${local.base_name}-ingress"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = kubernetes_namespace.main.metadata[0].name

  values = [
    file("../../modules/helm/values/nginx_ingress.yaml")
  ]
}
