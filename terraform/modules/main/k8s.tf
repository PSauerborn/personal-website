locals {
  ecr_server   = data.aws_ecr_authorization_token.this.proxy_endpoint
  ecr_username = data.aws_ecr_authorization_token.this.user_name
  ecr_password = data.aws_ecr_authorization_token.this.password

  dockerconfigjson = jsonencode({
    auths = {
      "${local.ecr_server}" = {
        username = local.ecr_username
        password = local.ecr_password
        auth     = base64encode("${local.ecr_username}:${local.ecr_password}")
      }
    }
  })
}

# Kubernetes namespace for environment
resource "kubernetes_namespace" "main" {
  metadata {
    name = var.environment
  }
}

# secret for storing AWS ECR token
resource "kubernetes_secret" "ecr" {
  metadata {
    name      = "${kubernetes_namespace.main.metadata[0].name}-ecr-creds"
    namespace = kubernetes_namespace.main.metadata[0].name
  }

  type = "kubernetes.io/dockerconfigjson"

  data = {
    ".dockerconfigjson" = local.dockerconfigjson
  }
}

# Job for running Alembic migrations
resource "kubernetes_job" "alembic_migrations" {
  depends_on = [helm_release.pg_cluster, aws_ecr_repository.main, kubernetes_secret.ecr]
  metadata {
    name      = "${local.base_name}-alembic-migrations"
    namespace = kubernetes_namespace.main.metadata[0].name
  }

  spec {
    template {
      metadata {
        labels = {
          job = "${local.base_name}-alembic-migrations"
        }
      }

      spec {
        container {
          name  = "alembic-migrations"
          image = "${aws_ecr_repository.main["alembic-migrations"].repository_url}:${local.images_tags.alembic_migrations}"

          image_pull_policy = local.is_prod ? "IfNotPresent" : "Always"

          env {
            name  = "POSTGRES_HOST"
            value = "${local.base_name}-db-cluster-rw"
          }

          env {
            name  = "POSTGRES_PORT"
            value = "5432"
          }

          env {
            name  = "POSTGRES_DB"
            value = "postgres"
          }

          env {
            name  = "ENVIRONMENT"
            value = var.environment
          }

          env {
            name  = "REVISION"
            value = "head"
          }

          env {
            name  = "COMMAND"
            value = "upgrade"
          }

          env {
            name = "POSTGRES_USER"
            value_from {
              secret_key_ref {
                name = "${local.base_name}-db-cluster-superuser"
                key  = "username"
              }
            }
          }

          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = "${local.base_name}-db-cluster-superuser"
                key  = "password"
              }
            }
          }
        }

        image_pull_secrets {
          name = kubernetes_secret.ecr.metadata[0].name
        }


        restart_policy = "OnFailure"
      }
    }
  }
}
