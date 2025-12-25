# Personal Website - Acceptance Tests

## Table Of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Configuration](#configuration)
4. [Local Development](#local-development)
5. [Dockerfile](#dockerfile)
6. [Make Commands](#make-commands)

## Overview

The following directory contains end-to-end acceptance tests for the Personal Website, implemented in Golang using the [Godog](https://github.com/cucumber/godog) BDD framework. These tests are designed to run against a deployed environment (e.g., DEV or PROD) to verify the system's functionality from a user's perspective.

The tests are written in Gherkin syntax (`.feature` files) and backed by Golang step definitions.

## Features

The acceptance tests cover the following main features of the application:

* **Admin**: Verifies secured admin endpoints, including statistics and contact management.
* **Contacts**: Tests the public contact form submission and internal contact tracking.
* **Resume**: Verifies the public resume download functionality in various formats (JSON, PDF).
* **General**: Basic health checks and connectivity tests.

## Configuration

The acceptance tests require certain configuration settings to run, primarily passed via environment variables.

| Name            | Description                                      | Required | Default                           |
|-----------------|--------------------------------------------------|----------|-----------------------------------|
| `ADMIN_API_KEY` | API key for authenticating admin requests        | true     |                                   |
| `API_BASE_URL`  | The base URL of the API to test                  | false    | `https://api-dev.alpn-software.com` |

## Local Development

You can run the acceptance tests locally using standard `go` commands, provided you have the necessary environment variables set.

```bash
$ export ADMIN_API_KEY=your_api_key
$ go test
```

## Dockerfile

The `Dockerfile` in this directory is a simple single-stage build that sets up the environment to run the acceptance tests continuously or as part of a CI/CD pipeline.

It uses the `golang:1.25` image, downloads dependencies, and sets the entrypoint to run the tests.

## Make Commands

`make` is used to automate common tasks for the acceptance tests. The following targets are available:

1. `run-tests`: Builds the test Docker image and runs the acceptance tests. Requires `ADMIN_API_KEY` to be set in the environment.
   ```bash
   $ ADMIN_API_KEY=your_key make run-tests
   ```
2. `build-image`: Builds the docker image for the acceptance tests.
3. `push-image`: Builds and pushes the image to the configured ECR repository.
4. `lint`: Runs standard Go formatting and linting tools (`go fmt`, `go mod tidy`, `golangci-lint`).
5. `ecr-login`: Authenticates your local Docker client with AWS ECR.
