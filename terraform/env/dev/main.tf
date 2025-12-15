module "main" {
  source = "../../modules/main"

  environment = "dev"

  dns_config = {
    root_domain_name = "alpn-software.com"
    subdomains = [
      "dev.alpn-software.com",
      "api-dev.alpn-software.com",
      "www-dev.alpn-software.com",
    ]
    forward_ip = "46.62.205.122"
  }

  image_tag_overrides = {
    api                = "latest"
    alembic_migrations = "latest"
    web                = "latest"
  }
}
