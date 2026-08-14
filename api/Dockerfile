# API container of the api component.
#
# The image runs the compiled Go binary, which serves the SPEC-002 REST API over
# the API_* / LISTEN_* / LOG_* / POSTGRES_* environment variable contract
# documented in README.md. config.yaml ships with the image and carries the
# non-secret defaults only; every value is overridable at run time and
# POSTGRES_PASSWORD has no default at all, so the process fails at start-up
# rather than connecting with a baked-in credential.
#
# The tests stage is the enforcement mechanism for the suite: `go test ./...`
# runs during the build and the runtime stage takes its binary from that stage,
# so the image cannot be built from code whose tests fail. The suite needs no
# database - the persistence layer is exercised through pgxmock.
#
# Build (mandated flags):
#   docker build --platform linux/amd64 --provenance=false -t <tag> api/

# OUTSTANDING: the three FROM lines below are pinned by the mutable `1.25-bookworm`
# and `12-slim` tags, so two builds of the same commit can resolve to different base
# images. They must be pinned as `<tag>@sha256:<digest>`, with the same digest in
# every stage that shares a base. The digests could not be resolved here - no
# container runtime is available in the authoring environment (rootless `newuidmap`
# is not permitted) and a guessed digest would be worse than none. The same
# outstanding item applies to alembic/Dockerfile and scripts/seeding/Dockerfile.

# Builder stage: resolve the pinned module graph and compile the binary. The base
# image ships go1.25, satisfying the `go 1.25.0` directive in go.mod, so no
# toolchain is downloaded during the build.
FROM golang:1.25-bookworm AS builder

WORKDIR /build

# Copied before the sources so that the module download layer is reused whenever
# only Go files change.
COPY go.mod go.sum ./

RUN go mod download

# The component is a flat `package main` ([GO-008]), so this takes the whole
# source set including the _test.go files the tests stage needs.
COPY *.go ./
COPY config.yaml ./

# CGO is disabled so the result is a static binary that runs on a base image
# carrying no Go runtime or libc dependency of its own. -trimpath keeps build
# paths out of the binary; -s -w drop the symbol and DWARF tables.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /build/bin/api .

# Tests stage: run the full suite as a build step against the same sources. A
# failing test fails the build. No POSTGRES_* variables are set - every test that
# touches configuration supplies its own environment, and the database is always
# mocked.
FROM builder AS tests

RUN go vet ./... && go test ./...

# Runtime stage: a slim base carrying the static binary, its configuration
# defaults and nothing else, running as a non-root user.
FROM debian:12-slim AS runtime

# curl is installed solely so that the HEALTHCHECK below can call the API's own
# /v1/health endpoint, which is the only check that reports the database
# connection as well as the process (REQ-1.5). It is the one package added to the
# runtime image; --no-install-recommends and the apt list cleanup keep the
# addition to the binary itself.
RUN apt-get update && \
    apt-get install --yes --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1000 api && \
    useradd --system --uid 1000 --gid api --home-dir /app api

WORKDIR /app

# Taken from the tests stage, so the runtime image can only be built once the
# suite has passed. config.go resolves the configuration file from the working
# directory or ./etc, so config.yaml sits beside the binary. Both stay
# root-owned and read-only to the runtime user.
COPY --from=tests /build/bin/api ./api
COPY --from=tests /build/config.yaml ./config.yaml

USER api

# Matches listen.port in config.yaml. Documentation only - it publishes nothing
# on its own, and LISTEN_PORT can still move the server at run time.
EXPOSE 10000

# --fail makes curl exit non-zero on the 500 that GET /v1/health returns when the
# PostgreSQL pool is unreachable, so an API that is up but cannot reach its
# database is reported unhealthy rather than healthy.
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \
    CMD curl --fail --silent --show-error http://localhost:10000/v1/health || exit 1

CMD ["/app/api"]
