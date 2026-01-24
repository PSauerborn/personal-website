# Personal Website - Alembic

## Table Of Contents

1. [Overview](#overview)
2. [Running Locally](#running-locally)
    - [Configuration](#configuration-1)
3. [Running Container Job](#running-container-job)
    - [Configuration](#configuration-2)
4. [Deployment](#deployment)
5. [Make Commands](#make-commands)

## Overview

The following directory contains alembic migrations to manage the PostgreSQL database that stores metrics, contacts, contact requests and more. The alembic migrations can be ran using the standard `alembic` commands.

Note that for security reasons, the PostgreSQL server deployed in the Kubernetes cluster is not exposed via any external ingress or port forwarding. As a result, alembic migrations cannot be ran locally to configure the DB deployed to the cluster. Instead, the migrations must be ran from within the cluster i.e. via a Kubernetes Job. A `run_migrations.py` scrip and `Dockerfile` is provided to run the migrations as part of a containerized build environment.

`make` is used to automate common sets of commands, including commands to run a local server, run unittests and push to ECR. See [Make Commands](#make-commands) section below for a complete set of available commands.

## Running Locally

All migrations can be ran locally using `alembic`. To upgrade to a provided revision, run

```bash
$ alembic upgrade {revision}
```

To upgrade to the latest revision

```bash
$ alembic upgrade head
```

Similarly to downgrade to a set revision

```bash
$ alembic downgrade {revision}
```

and to downgrade to the last revision

```bash
$ alembic downgrade -1
```

### Configuration

Before running any local `alembic` commands, ensure that the postgres DSN is set in the `alembic.ini` file. By default, this is set to a `PLACEHOLDER` value.

## Running Container Job

For security reasons, the PostgreSQL server is not exposed via any external ingress or port forwarding. As a result, alembic migrations cannot be ran locally to configure the DB deployed to the cluster. Instead, the migrations must be ran from within the cluster i.e. via a Kubernetes Job.

The easiest way to run the migrations is via the `run-migrations` `make` target:

```bash
$ make run-migrations
```

This runs a docker container that wraps the `run_migrations.py` Python script, which in turn runs the alembic migrations.

### Configuration

The python script retrieves certain configuration settings from environment variables. App config is handled by the `pydantic` package, and is defined in `run_migrations.py`. All required config settings are fetched and validated at app runtime to ensure that all required variables are present.

The following table shows all available configuration settings, as well as any default values set. Note that the job will __not__ start if any variable marked as `required` is not provided.

| Name              | Description                                                        | Required | Default        |
|-------------------|--------------------------------------------------------------------|----------|----------------|
| POSTGRES_HOST     | Host of Postgres Server                                            | true     |                |
| POSTGRES_PORT     | Port of Postgres Server                                            | false    | 5432           |
| POSTGRES_DB       | Postgres Database to connect to                                    | true     |                |
| POSTGRES_USER     | Postgres Username                                                  | true     |                |
| POSTGRES_PASSWORD | Postgres Password                                                  | true     |                |
| COMMAND           | Alembic command to run. One of `(upgrade|downgrade|current|history)` | true     |                |
| REVISION          | Alembic revision                                                   | true     |                |

## Deployment

The containerized migrations script is deployed to the Kubernetes cluster from an AWS ECR repository in the format of a Kubernetes Job. To build a new image, use `make`.

```bash
$ make ecr-login
$ make image_tag={tag} push-image
```

Note that the above requires configured AWS credentials. `image_tag` defaults to `latest` if not provided.

## Make Commands

`make` is used to automate vital sets of commands, all of which are defined in the provided `Makefile`. The following `make` targets are exposed:

1. `build-image` - builds image in preparation for local run or ECR push
2. `push-image` - pushes image to ECR. Accepts an optional `image_tag` argument, which defaults to `latest`. Requires authenticated ECR access.
4. `run-migrations` - runs the containerized migrations job
5. `lint` - runs linting and formatting tools, including `black` for python formatting
6. `ecr-login` -  obtains ECR access token using AWS CLI and configures local docker authentication.
