module "main" {
  source = "../../modules/global"

  environment = "global"

  deploy_ingress_controller = false
}
