resource "kubernetes_secret_v1" "postgres_creds" {
  metadata {
    name      = "postgres-creds-${var.environment}"
    namespace = var.app_name
  }

  data = {
    username = var.postgres_user
    password = var.postgres_password
  }
}
