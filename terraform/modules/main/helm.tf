locals {
  base_name = "personal-website-${var.environment}"
  is_prod   = var.environment == "production"

  images_tags = {
    api                = "latest"
    alembic_migrations = "latest"
  }

  api_subdomain = local.is_prod ? "api.alpn-software.com" : "api-dev.alpn-software.com"
}

resource "helm_release" "pg_cluster" {
  name       = "${local.base_name}-db"
  repository = "https://cloudnative-pg.github.io/charts"
  chart      = "cluster"
  namespace  = kubernetes_namespace.main.metadata[0].name

  values = [
    file("../../modules/helm/values/pg_cluster.yaml")
  ]
}

resource "helm_release" "api" {
  depends_on = [kubernetes_secret.ecr, helm_release.pg_cluster]
  name       = "${local.base_name}-api"
  chart      = "../../modules/helm/charts/personal-website-api"
  namespace  = kubernetes_namespace.main.metadata[0].name

  values = [
    # NOTE: static configuration is kept in a separate values file for clarity
    file("../../modules/helm/values/personal_website_api.yaml"),
    # NOTE: yamlencode is used here in conjunction with values instead
    # of set to pass environment-specific values. set requires a string value
    # which makes it hard to pass complex structures
    # like maps or lists. Using yamlencode allows us to pass these complex structures
    # directly as YAML, which Helm can then parse correctly.
    yamlencode({
      image = {
        tag        = local.images_tags["api"]
        pullPolicy = local.is_prod ? "IfNotPresent" : "Always"
      }

      imagePullSecrets = [
        {
          name = kubernetes_secret.ecr.metadata[0].name
        }
      ]

      ingress = {
        enabled = true
        hosts = [
          {
            paths = [
              {
                path     = "/"
                pathType = "Prefix"
              }

            ]
            host = local.api_subdomain
          }
        ]
        annotations = var.ingress_controller_annotations
      }

      containerEnv = {
        ENVIRONMENT   = var.environment
        API_VERSION   = "v1"
        POSTGRES_HOST = "${local.base_name}-db-cluster-rw"
        POSTGRES_PORT = 5432
        POSTGRES_DB   = "postgres"
      }

      containerEnvFromSecrets = {
        POSTGRES_USER = {
          secretName = "${local.base_name}-db-cluster-superuser"
          key        = "username"
        }

        POSTGRES_PASSWORD = {
          secretName = "${local.base_name}-db-cluster-superuser"
          key        = "password"
        }
      }
    })
  ]
}
