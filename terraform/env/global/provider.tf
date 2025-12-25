terraform {
  required_version = ">= 1.7.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    key = "state/app=personal_website/env=global/state.tfstate"
  }
}

provider "aws" {
  region = var.aws_region

  assume_role {
    role_arn = var.aws_assume_role_arn
  }
}

provider "kubernetes" {
  config_path    = "~/.kube/config"
  config_context = "alpn-software"
}

provider "helm" {
  kubernetes = {
    config_path    = "~/.kube/config"
    config_context = "alpn-software"
  }
}
