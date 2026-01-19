# Job for running Alembic migrations
resource "kubernetes_job" "alembic_migrations" {
  metadata {
    name      = "${local.base_name}-alembic-migrations"
    namespace = "personal-website"
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
          image = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/personal-website/alembic-migrations:${local.images_tags.alembic_migrations}"

          image_pull_policy = "Always"

          env {
            name  = "POSTGRES_HOST"
            value = "postgres-${var.environment}-rw.shared-infra"
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
                name = kubernetes_secret_v1.postgres_creds.metadata[0].name
                key  = "username"
              }
            }
          }

          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.postgres_creds.metadata[0].name
                key  = "password"
              }
            }
          }
        }

        image_pull_secrets {
          name = "aws-ecr-credentials"
        }


        restart_policy = "OnFailure"
      }
    }
  }
}
