# Personal Website

## Table Of Contents

1. [Overview](#overview)
2. [Components](#components)
    - [.github/workflows](#.github%2Fworkflows)
    - [alembic](#alembic)
    - [api](#api)
    - [terraform](#terraform)
    - [web](#web)
3. [Deployments](#deployments)
    - [Pipeline Triggers](#pipeline-triggers)


## Overview

The following repository contains source code, IAC and CI/CD pipelines to manage my personal website. The repository is set up in a monorepo format, and the following directory tree provides an overview of its structure.

```txt
.
├── .github
│   └── workflows # CICD pipelines
├── alembic # PostgreSQL table definition and migration scripts
├── api # source code for API layer
├── terraform
│   └── env
│       ├── dev # tf for DEV environment
│       ├── global # tf for shared infra
│       └── prod # tf for PROD environment
├── web # source code for UI layer
└── .pre-commit-config.yaml
```

The project is deployed to a Kubernetes cluster (`k3s`) hosted on a virtual machine. With the exception of the `k3s` cluster itself, all infrastructure is managed via the terraform and CICD pipelines provided in this project. This includes the `golang` API and `quasar` Vue application that serve the backend and frontend respectively. Data is stored within a `postgresql` server deployed within the Kubernetes cluster.

Some key infrastructure items are hosted in AWS instead of k8s. This includes:

1. DNS management via Route53
2. S3 + DynamoDB for Terraform state and lock management
3. ECR repositories to store container images

With the exception of the terraform state resources, all AWS resources are defined and managed within the `terraform` setup within this repository.

## Components

The monorepo contains several key components, each of which has its own dedicated directory. An overview of these is provided here. Note that each component has its own `README` with an in-depth explanation of how the component functions, including deployment details.

#### `.github/workflows`

CI/CD workflows and shared actions used for deployments. `tests.yaml` runs on pull requests to `dev` and `master` to perform pre-merge checks, and `deploy.yaml` runs on merges to `dev` and `master` to release.

#### `alembic`

Database table definitions and migrations managed via `alembic`. The included `Dockerfile` builds a container that is ran as a Kubernetes job to provision the PostgreSQL database when a new revision is released.

#### `api`

Golang source code for the REST API that serves the main application and manages internal data.

#### `terraform`

IAC to manage the Kubernetes cluster and required AWS resources. All terraform is structured in accordance with the google best practices. Each environment has its own folder in the `terraform/env` directory that invokes `terraform/modules/main`. Currently, a `DEV`, `PROD` and `GLOBAL` environment is maintained.

#### `web`

Vue source code for `quasar` app. All UI components are server-side rendered and served via the NodeJS container deployed within the cluster.

## Deployments

This repository is setup to (roughly) follow git flow, and consists of a long-lived `dev` and `master` branch, which respectively correspond to a `DEV` and `PROD` environment within the Kubernetes cluster. In addition to the `DEV` and `PROD` environments, a `GLOBAL` environment is also managed, which contains cluster-wide, shared infrastructure components, including ECR repositories and Kubernetes operators.

Changes are made by creating `feature` branches from `dev`, which are then merged into `dev`. `dev` is then merged into `master` to trigger a production release.

### Pipeline Triggers

Deployments are managed via Github Actions/Workflows, which can be found in the `.github/workflows` directory. Currently, the following pipeline triggers are configured:

* PR from `feature` to  `dev` - trigger unittests and `terraform plan` actions for `DEV` environment.
* Merge `feature` into `dev` - trigger release to `DEV` environment
* PR from `dev` to `master` - trigger unittests and `terraform plan` actions for `DEV` and `GLOBAL` environment.
* Merge `dev` into `master` - trigger release to `PROD` and `GLOBAL` environment

All releases to the `PROD` environment require manual approval by admins.
