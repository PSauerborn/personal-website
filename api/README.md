# Personal Website - API

## Table Of Contents

1. [Overview](#overview)
2. [Endpoints](#endpoints)
3. [Configuration](#configuration)
4. [Local Development](#local-development)
5. [Unittests](#unittests)
6. [Dockerfile](#dockerfile)
7. [Deployment](#deployment)
8. [Make Commands](#make-commands)

## Overview

The following directory contains the source code for the core REST API, implemented in Golang. The API surfaces both public and authenticated endpoints. Public endpoints serve functionality that is required for the UI to function. Authenticated endpoints require an API key, and are designed to surface internal data and monitoring metrics for admin users. See [Endpoints](#endpoints) section for a complete list of endpoints and their functionality.

The persistence layer for the API is written using PostgreSQL, and a running postgres instance is required for the API to run.

The API is designed to be ran in a containerized environment using the provided `Dockerfile`. Note that the `Dockerfile` is implemented as a multi-stage build file, with separate stages for testing and production deployment. See [Dockerfile](#dockerfile) section for more details.

`make` is used to automate common sets of commands, including commands to run a local server, run unittests and push to ECR. See [Make Commands](#make-commands) section below for a complete set of available commands.

## Endpoints

### Public Endpoints

The following endpoints are public, and do not require authentication. However, all requests made to public endpoints is logged in the PostgreSQL database for monitoring.

#### GET - `/api/{version}/public/health`

Health check endpoint. Connects to database to ensure that DB access is correctly configured.

#### GET - `/api/{version}/public/version`

Returns APi version. Used for Kubernetes liveliness and readiness probes. Exempt from database logging.

#### GET - `/api/{version}/public/resume`

Returns PDF file containing resume. The resume is retrieved from the local filesystem. The filepath can be set using the `RESUME_PATH` environment variable, and defaults to `etc/resume.pdf`.

#### POST - `/api/{version}/public/contacts`

Creates a new contact and contact request. If no contact can be found in the database that matches the provided email, a new contact is created. Otherwise, the existing contact is used.

The `POST` request body takes the following format:

```json
{
    "email": "String",
    "name": "String",
    "message": "String"
}
```

All emails are converted to lowercase before storage in DB.

### Authenticated Endpoints

The following endpoints require admin authentication. Authentication is handled via API keys, which are maintained in the PostgreSQL server. Admin endpoints are not logged to the database.

#### GET - `/api/{version}/admin/stats`

Returns monitoring statistics for logged endpoints, including the number of requests made to each endpoint, as well as a summary of the status codes returning by the API.

#### GET - `/api/{version}/admin/contacts`

Returns a complete set of contacts.

#### GET - `/api/{version}/admin/contacts/requests`

Returns a complete set of contact requests.

## Configuration

The API retrieves certain configuration settings from environment variables. App config is handled by the `github.com/spf13/viper` package, and is defined in `config.go`. All required config settings are fetched and validated at app runtime to ensure that all required variables are present.

The following table shows all available configuration settings, as well as any default values set. Note that the API will __not__ start if any variable marked as `required` is not provided.

| Name              | Description                                             | Required | Default        |
|-------------------|---------------------------------------------------------|----------|----------------|
| PORT              | Port to serve API on                                    | false    | 8080           |
| LOG_LEVEL         | Log level to use                                        | false    | INFO           |
| POSTGRES_HOST     | Host of Postgres Server                                 | true     |                |
| POSTGRES_PORT     | Port of Postgres Server                                 | false    | 5432           |
| POSTGRES_DATABASE | Postgres Database to connect to                         | false    | postgres       |
| POSTGRES_USER     | Postgres Username                                       | true     |                |
| POSTGRES_PASSWORD | Postgres Password                                       | true     |                |
| API_VERSION       | API version. Used to construct endpoints during startup | false    | v1             |
| RESUME_PATH       | Path to resume PDF                                      | false    | `etc/resume.pdf` |


## Local Development

The API can be run using the standard `go` commands

```bash
$ go run .
```

Note that all required environment variables must first be set (see above section on app config).

By default, the app will serve on port `8080`, but this can be configured using the `API_PORT` environment variable.

Alternatively, a container serving the API can be ran using

```bash
$ make run-server
```

## Unittests

Unittests are implemented as per standard go best practices, and can be ran using the standard `go` commands

```bash
$ go test
```

Note that unittests are kept intentionally light. Database interfaces are mocked rather than using a live/local database connection. This is intentional as the included project integration tests are ran against a live database instance.

The `Dockerfile` also includes a separate `tests` stage that runs the unittests. To run the unittests using the provided `Dockerfile`, use the following `make` command:

```bash
$ make run-tests
```

When running using the `Dockerfile`, tests are ran using the `gotest.tools/gotestsum@latest` tool.

## Dockerfile

The `Dockerfile` is implemented as a multi-stage build file, with the following stages (provided in order):

1. `tests` - runs unittests using `gotest.tools/gotestsum@latest`
2. `build` - builds new executable from source
3. `runtime` - serves API

Both the `tests` and `build` stages use the `golang:1.25` base image. The `runtime` stage that serves the application uses `gcr.io/distroless/static:nonroot`, which is done to minimize build size, and maximize security in line with best practices.

The individual stages can be ran using standard `docker build` commands:

```bash
$ docker build --target {stage} -t {name} .
$ docker run {name}
```

The `tests` and `runtime` stages can also be accessed using the `run-tests` and `run-server` `make` stages for convenience.

```bash
$ make run-tests
$ make run-server
```

## Deployment

The API is deployed to the Kubernetes cluster from an AWS ECR repository. To build a new image, use `make`.

```bash
$ make ecr-login
$ make image_tag={tag} push-image
```

Note that the above requires configured AWS credentials. `image_tag` defaults to `latest` if not provided.

## Make Commands

`make` is used to automate vital sets of commands, all of which are defined in the provided `Makefile`. The following `make` targets are exposed:

1. `run-tests` - runs unittests
2. `build-image` - builds image in preparation for local run or ECR push
3. `push-image` - pushes image to ECR. Accepts an optional `image_tag` argument, which defaults to `latest`. Requires authenticated ECR access.
4. `run-server` - builds and runs the API
5. `lint` - runs linting and formatting tools, including `go fmt` and `go mod tidy`. Code is linted using `github.com/golangci/golangci-lint/cmd/golangci-lint`
6. `ecr-login` -  obtains ECR access token using AWS CLI and configures local docker authentication.
