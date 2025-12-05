# Personal Website - Terraform

## Table Of Contents

1. [Overview](#overview)
    - [Environments](#environments)
    - [Providers](#providers)
2. [State Management](#state-management)
3. [Deployments](#deployments)
4. [Helm Charts](#helm-charts)

## Overview

The following directory contains the Terraform to manage AWS and Kubernetes resources across all environments. This includes the following:

1. AWS ECR container repositories
2. AWS Route53 records
3. Kubernetes namespaces and ECR secrets
4. Helm releases for PostgreSQL cluster, API, UI and more.

For a full list of resources, see `TF_DOCS.md`.

All terraform is structured in accordance with the Google best practices (link <a href="https://docs.cloud.google.com/docs/terraform/best-practices/general-style-structure">here</a>). Each managed environment has a dedicated directory in the `env/` directory, each containing a `main.tf` and `provider.tf` file with the following function(s):

* `provider.tf` - defines terraform providers, and state management settings.
* `main.tf` - invokes the `modules/main` module

The resource definitions themselves are all stored in the `modules` directory. `modules/main` provides the main entrypoint, and creates all the resources required for an individual environment.

### Environments

Currently, a `DEV` and `PROD` environment are managed, in `env/dev` and `env/prod` respectively. Each environment has its own dedicated workspace within the kubernetes cluster. Ingress is managed via environment-specific subdomains. The `DEV` API for instance is accessed via `api-dev.alpn-software.com` while the `PROD` API is accessed via `api.alpn-software.com`.

Some infrastructure must be shared across environments. Kubernetes operators for instance create cluster-wide CRDs that cannot be scoped to a namespace. To accommodate this, a `GLOBAL` workspace containing infrastructure that is shared across environments is managed in `env/global`. Note that this workspace does __not__ invoke the `modules/main` module, but has its own dedicated module in `modules/global`.

### Providers

The following providers are used to manage AWS and Kubernetes resources:

1. `hashicorp/aws` - version `~> 6.0`
2. `hashicorp/kubernetes` - version `~> 2.0`
3. `hashicorp/helm` - version `~> 3.0`

For a full list of providers, see `modules/main/versions.tf`.

## State Management

All terraform state is stored in AWS S3 buckets. Valid AWS credentials are required to run terraform comments. Additionally, DynamoDB table(s) are used to store the state locks that terraform manages.

## Deployments

Deployments are handled via Github actions/worklows. The repository follows a quasi git-flow structure, with the `dev` branch corresponding to the `DEV` environment and the `master` branch corresponding to `PROD`.

Terraform releases are automatically triggered on merge to either `dev` or `master`. All releases to the `GLOBAL` and `PROD` environments require manual approval before they can be triggered.

## Helm Charts

In addition to the terraform required to provision the application, the `terraform` directory also contains any Helm charts that are used to deploy applications to the Kubernetes cluster. Helm charts themselves are stored in the `modules/helm/charts` directory, while values files can be found in `modules/helm/values`.
