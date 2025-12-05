terraform {
  required_version = ">= 1.7.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket = "alpn-software.terraform-state"
    key    = "state/app=personal_website/env=global/state.tfstate"
    region = "eu-west-2"
    assume_role = {
      role_arn = "arn:aws:iam::215268073545:role/TerraformCIRole"
    }
    dynamodb_table = "alpn-software.terraform-state-locks"
  }
}

provider "aws" {
  region = "eu-west-2"

  assume_role {
    role_arn = "arn:aws:iam::215268073545:role/TerraformCIRole"
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
