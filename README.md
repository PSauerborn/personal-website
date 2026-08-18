# Personal Website

## Table Of Contents

1. [Overview](#overview)
2. [Components](#components)
    - [.github/workflows](#.github%2Fworkflows)
    - [acceptance](#acceptance)
    - [alembic](#alembic)
    - [api](#api)
    - [infrastructure/manifests](#manifests)
    - [infrastructure/terraform](#terraform)
    - [scripts/seeding](#scriptsseeding)
    - [web](#web)
3. [Deployments](#deployments)
    - [Pipeline Triggers](#pipeline-triggers)
4. [Makefiles](#makefiles)
5. [Precommit Checks](#precommit-checks)


## Overview

The following repository contains source code, IAC and CI/CD pipelines to manage my personal website. The repository is set up in a monorepo format, and the following directory tree provides an overview of its structure.

```txt
.
├── .github
│   └── workflows # CICD pipelines
├── acceptance # End-to-end acceptance tests
├── alembic # PostgreSQL table definitions and migration scripts
├── api # source code for API layer
├── infrastructure # Infrastructure as Code
│   ├── manifests # Kubernetes manifests
│   └── terraform # Terraform configuration
├── scripts # Helper scripts for development and deployment
│   └── seeding # Test data seeding
│       └── fixtures # JSON domain fixtures and sidecar document content
├── web # source code for UI layer
└── .pre-commit-config.yaml
```

The project is deployed to a Kubernetes cluster (`k3s`) hosted on a virtual machine. With the exception of the `k3s` cluster itself, all infrastructure is managed via the terraform and CICD pipelines provided in this project. This includes the `golang` API and the Next.js application that serve the backend and frontend respectively. Data is stored within a `postgresql` server deployed within the Kubernetes cluster.

Some key infrastructure items are hosted in AWS instead of k8s. This includes:

1. DNS management via Route53
2. S3 + DynamoDB for Terraform state and lock management
3. ECR repositories to store container images

With the exception of the terraform state resources, all AWS resources are defined and managed within the `terraform` setup within this repository.

## Components

The monorepo contains several key components, each of which has its own dedicated directory. An overview of these is provided here. Note that each component has its own `README` with an in-depth explanation of how the component functions, including deployment details.

#### `.github/workflows`

CI/CD workflows and shared actions used for deployments. `tests.yaml` runs on pull requests to `dev` and `master` to perform pre-merge checks, and `deploy.yaml` runs on merges to `dev` and `master` to release.


#### `acceptance`

Gherkin feature files and Golang step definitions for end-to-end acceptance tests written in Golang using the Godog BDD framework. These tests run against the deployed environment to verify system functionality.

#### `alembic`

Database table definitions and the `alembic` migrations that provision them. A single revision creates the `base` schema and all of its tables. The container entrypoint is a thin wrapper that drives `alembic` programmatically, and every connection setting, the target revision and the command to run are supplied at run time through environment variables — the image contains none of them. The included `Dockerfile` builds a container that is ran as a Kubernetes job to provision the PostgreSQL database when a new revision is released, and `make -C alembic run-migrations` runs the same image against the database described by the current shell environment. See `alembic/README.md` for the environment-variable contract and `docs/db_schema.md` for the schema itself.

#### `api`

Golang source code for the REST API that serves the main application and manages internal data. It is a single flat Go module built on `gin`, mounted on the `/v1` prefix with CORS enabled, and reads from the `base` schema provisioned by the `alembic` component — it owns no schema and applies no migrations of its own. The endpoints cover the CV, the subagent and spec catalogue, the blog articles and their comments, contact messages and the project listing. Configuration defaults live in `api/config.yaml` and every value is overridable through the environment; the database password is supplied through the environment only. Note that `golangci-lint`, which the `make -C api lint` target and the `api` pre-commit hook require, is not provisioned by this repository and must be installed separately. See `api/README.md` for the configuration reference and the endpoint list, and `docs/openapi.yaml` for the full request/response contract.

#### `infrastructure/manifests`

Additional kubernetes utility manifests, including a job to load seed data into the database for acceptance tests.

#### `infrastructure/terraform`

IAC to manage the Kubernetes cluster and required AWS resources. All terraform is structured in accordance with the google best practices. Each environment has its own folder in the `terraform/env` directory that invokes `terraform/modules/main`. Currently, a `DEV`, `PROD` and `GLOBAL` environment is maintained.

#### `scripts/seeding`

Python component that seeds an already-migrated database with the test fixtures used by the acceptance suite and by local development. The fixtures are JSON files under `scripts/seeding/fixtures/`, one per domain, whose document content is held in sidecar files under `fixtures/documents/`; they are validated through `pydantic` domain models before any connection is opened. Seeding is atomic — every truncation and insert runs inside a single transaction, so the database is never left partially seeded. As with the migrations, the `Dockerfile` builds a container that is ran as a Kubernetes job, and `make -C scripts/seeding seed` runs the same image against the database described by the current shell environment. See `scripts/seeding/README.md` for the fixture contract and the CLI reference.

#### `web`

TypeScript source code for the Next.js (App Router) frontend that renders the site, styled with Tailwind CSS and built on `shadcn/ui` primitives. Pages are server-rendered by Server Components that read from the `api` component; the small amount of interactive behaviour is isolated in client islands that call the API directly from the browser, so the component contains no proxying route handlers of its own. Both the development server and the container listen on **port 9000** rather than Next's default 3000 — 9000 is the exact origin the API pins in its CORS allowlist (`api/router.go`), so serving the frontend anywhere else breaks every browser-side call. Locally the component is run with `npm ci && npm run dev` from `web/` (`http://localhost:9000`), with `make -C web lint`, `make -C web test`, `make -C web format` and `make -C web build` providing the usual checks; the full stack is run with `docker compose up -d --build` from the repository root, which publishes postgres on 5432, the API on 8080 and the frontend on 9000 and requires `POSTGRES_PASSWORD` to be exported first. Two environment variables configure the API location and they are **not** interchangeable: `API_BASE_URL` is a genuine runtime value, re-read server-side on every request (`http://api:8080` under compose, so Server Components reach the API over the compose network), while `NEXT_PUBLIC_API_BASE_URL` is **inlined into the client bundle by `next build`** and must therefore be supplied as a compose `build.args` entry — setting it in the runtime environment of an already-built image has no effect and fails silently. Changing it requires an image rebuild, not a restart. See `web/README.md` for the make targets, the test conventions and the standards-waiver boundary that applies to this component.

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


### Makefiles

`make` is used extensively in all components to automate key functions, such as unittests, linting and image building. It is recommended to use the provided `Makefile` where possible to run pre-configured actions. See the README for each respective component for a full list of available `make` commands. Each component owns its own `Makefile`, and its targets are invoked from the repository root through it — `make -C <COMPONENT> <target>`, the same convention the pre-commit hooks below use. Applying the migrations and seeding the database are therefore `make -C alembic run-migrations` and `make -C scripts/seeding seed`.

### Precommit Checks

The repository implements a set of pre-commit checks, which can be installed with

```bash
$ pre-commit install
```

Note that `pre-commit` typically does not work well with monorepos by default, mainly because `pre-commit` hooks cannot be scoped to a given set of files. To get around this, a `local` repo is implemented for each component of the monorepo, which only runs if files in that component have changed. Moreover, `pre-commit` is configured to run a given `make` command within the component directory using

```bash
$ make -C <COMPONENT> lint
```

This ensures that the command(s) being executed only run on the component, not on the repository as a whole.
