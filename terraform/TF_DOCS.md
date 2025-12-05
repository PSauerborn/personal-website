## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.0.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 6.0 |
| <a name="requirement_helm"></a> [helm](#requirement\_helm) | ~> 3.0 |
| <a name="requirement_kubernetes"></a> [kubernetes](#requirement\_kubernetes) | ~> 2.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 6.0 |
| <a name="provider_helm"></a> [helm](#provider\_helm) | ~> 3.0 |
| <a name="provider_kubernetes"></a> [kubernetes](#provider\_kubernetes) | ~> 2.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_route53_record.a_record](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [helm_release.api](https://registry.terraform.io/providers/hashicorp/helm/latest/docs/resources/release) | resource |
| [helm_release.pg_cluster](https://registry.terraform.io/providers/hashicorp/helm/latest/docs/resources/release) | resource |
| [kubernetes_job.alembic_migrations](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/job) | resource |
| [kubernetes_namespace.main](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/namespace) | resource |
| [kubernetes_secret.ecr](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/secret) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_ecr_authorization_token.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ecr_authorization_token) | data source |
| [aws_region.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/region) | data source |
| [aws_route53_zone.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/route53_zone) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_dns_config"></a> [dns\_config](#input\_dns\_config) | DNS configuration for the personal website. | <pre>object({<br/>    root_domain_name = string<br/>    subdomains       = list(string)<br/>    forward_ip       = string<br/>  })</pre> | `null` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | The deployment environment (e.g., dev, staging, prod). | `string` | n/a | yes |
| <a name="input_ingress_controller_annotations"></a> [ingress\_controller\_annotations](#input\_ingress\_controller\_annotations) | n/a | `map(string)` | `{}` | no |

## Outputs

No outputs.
