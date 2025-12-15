# Personal Website - API

## Table Of Contents

1. [Overview](#overview)
   - [Subdomains](#subdomains)
2. [Local Development](#local-development)
3. [Dockerfile](#dockerfile)
4. [Deployment](#deployment)
5. [Make Commands](#make-commands)

## Overview

The following directory contains the source code for the core UI, written in VueJS using Quasar. The app itself is server-side rendered by a NodeJS server running on the main Kubernetes cluster.

`make` is used to automate common sets of commands, including commands to run a local server, run unittests and push to ECR. See [Make Commands](#make-commands) section below for a complete set of available commands.

### Subdomains

A separate node server is deployed in the `DEV` and `PROD` environments, each with a dedicated subdomain:

- `www-dev.alpn-software.com` - serves `DEV` application
- `wwww.alpn-softare.com` - servers `PROD` application

## Local Development

The application can be run using the standard `yarn` commands. `yarn dev` will start a new SSR rendered application on port `9100`.

Alternatively, a container serving the app can be ran using

```bash
$ make run-server
```

## Dockerfile

The `Dockerfile` is implemented as a multi-stage build file, with the following stages (provided in order):

1. `build` - builds new SSR bundle
2. `runtime` - serves application

Both stages use `node:22` images, but the runtime stage uses an `alpine` version to ensure that the final build container is as small as possible.

The individual stages can be ran using standard `docker build` commands:

```bash
$ docker build --target {stage} -t {name} .
$ docker run {name}
```

The `runtime` stage can also be accessed using the `run-server` `make` stage for convenience.

```bash
$ make run-server
```

## Deployment

The Node server is deployed to the Kubernetes cluster from an AWS ECR repository. To build a new image, use `make`.

```bash
$ make ecr-login
$ make image_tag={tag} push-image
```

Note that the above requires configured AWS credentials. `image_tag` defaults to `latest` if not provided.

## Make Commands

`make` is used to automate vital sets of commands, all of which are defined in the provided `Makefile`. The following `make` targets are exposed:

1. `build-image` - builds image in preparation for local run or ECR push
2. `push-image` - pushes image to ECR. Accepts an optional `image_tag` argument, which defaults to `latest`. Requires authenticated ECR access.
3. `run-server` - builds and runs the API
4. `lint` - runs linting and formatting tools, including `prettier`.
5. `ecr-login` - obtains ECR access token using AWS CLI and configures local docker authentication.
