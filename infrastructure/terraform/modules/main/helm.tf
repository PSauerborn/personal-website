locals {
  base_name = "personal-website-${var.environment}"
  is_prod   = var.environment == "prod"

  default_images_tags = {
    api                = "1.1.0"
    alembic_migrations = "1.0.0"
    web                = "1.2.0"
  }
  # Override image tags if provided via variable
  images_tags = merge(local.default_images_tags, var.image_tag_overrides)

  api_subdomain = local.is_prod ? "api.s31-software.com" : "api-dev.s31-software.com"
  web_subdomain = local.is_prod ? "s31-software.com" : "dev.s31-software.com"
}

resource "helm_release" "api" {
  name      = "${local.base_name}-api"
  chart     = "../../modules/helm/charts/web-server"
  namespace = "personal-website"

  values = [
    # NOTE: static configuration is kept in a separate values file for clarity
    file("../../modules/helm/values/api.yaml"),
    # NOTE: yamlencode is used here in conjunction with values instead
    # of set to pass environment-specific values. set requires a string value
    # which makes it hard to pass complex structures
    # like maps or lists. Using yamlencode allows us to pass these complex structures
    # directly as YAML, which Helm can then parse correctly.
    yamlencode({
      image = {
        tag = local.images_tags["api"]

        pullPolicy = "Always"
      }

      imagePullSecrets = [
        {
          name = "aws-ecr-credentials"
        }
      ]

      fullNameOverride = "${local.base_name}-api"

      env = {
        ENVIRONMENT       = var.environment
        API_VERSION       = "v1"
        API_PORT          = 8080
        POSTGRES_HOST     = "postgres-${var.environment}-rw.shared-infra"
        POSTGRES_PORT     = 5432
        POSTGRES_DATABASE = "personal_website"
      }

      secrets = {
        POSTGRES_USER = {
          secretName = kubernetes_secret_v1.postgres_creds.metadata[0].name
          key        = "username"
        }

        POSTGRES_PASSWORD = {
          secretName = kubernetes_secret_v1.postgres_creds.metadata[0].name
          key        = "password"
        }
      }

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
      }
    })
  ]
}

resource "helm_release" "web" {
  name      = "${local.base_name}-web"
  chart     = "../../modules/helm/charts/web-server"
  namespace = "personal-website"

  values = [
    # NOTE: static configuration is kept in a separate values file for clarity
    file("../../modules/helm/values/web.yaml"),
    # NOTE: yamlencode is used here in conjunction with values instead
    # of set to pass environment-specific values. set requires a string value
    # which makes it hard to pass complex structures
    # like maps or lists. Using yamlencode allows us to pass these complex structures
    # directly as YAML, which Helm can then parse correctly.
    yamlencode({
      image = {
        tag = local.images_tags["web"]

        pullPolicy = "Always"
      }

      imagePullSecrets = [
        {
          name = "aws-ecr-credentials"
        }
      ]

      fullNameOverride = "${local.base_name}-web"

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
            host = local.web_subdomain
          }
        ]
      }
    })
  ]
}
