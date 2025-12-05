module "main" {
  source = "../../modules/main"

  environment = "prod"

  dns_config = {
    root_domain_name = "alpn-software.com"
    subdomains = [
      "alpn-software.com",
      "api.alpn-software.com",
    ]
    forward_ip = "46.62.205.122"
  }
}
