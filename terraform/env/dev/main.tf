module "main" {
  source = "../../modules/main"

  providers = {
    aws.acm = aws.acm
  }

  environment = "dev"

  dns_config = {
    root_domain_name = "alpn-software.com"
    subdomains = [
      "dev.alpn-software.com",
      "api-dev.alpn-software.com",
    ]
    forward_ip = "46.62.205.122"
  }

  deploy_ingress_controller = false
}
