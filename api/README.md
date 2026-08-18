# API

## Table Of Contents

1. [Overview](#overview)
2. [Component Layout](#component-layout)
3. [Configuration](#configuration)
    - [Configuration Fields](#configuration-fields)
        - [Connection Pool](#connection-pool)
        - [Accepted Residual Risk: No Pagination](#accepted-residual-risk-no-pagination)
    - [Secrets](#secrets)
4. [Running Locally](#running-locally)
    - [Running In The Compose Stack](#running-in-the-compose-stack)
    - [Building The Image Directly](#building-the-image-directly)
5. [Make Targets](#make-targets)
    - [Prerequisites](#prerequisites)
6. [Endpoints](#endpoints)
    - [Write Endpoint Limits](#write-endpoint-limits)
    - [Accepted Residual Risk: Rate Limiting And Spam Protection](#accepted-residual-risk-rate-limiting-and-spam-protection)
7. [Testing](#testing)

## Overview

This component holds the Golang REST API that serves the public website and manages the internal
data stored in the PostgreSQL `base` schema. It exposes the CV, the subagent and spec catalogue,
the blog articles and their comments, the contact messages and the project listing over a single
`gin` engine mounted on the `/v1` prefix.

Every endpoint reads from, or writes to, the `base` schema provisioned by the `alembic` component;
this component owns no schema of its own and applies no migrations. The specification the
component implements is `docs/specs/SPEC-002.md`, and the endpoint contract is published as
OpenAPI in [`docs/openapi.yaml`](../docs/openapi.yaml) with a matching Postman collection in
`docs/postman/collection.json`.

## Component Layout

The component is a single flat Go module — there are no nested packages. Each file owns one
concern and its tests live next to it in a `_test.go` sibling:

```txt
api
├── .dockerignore     # build context exclusions, chiefly the compiled binary
├── .golangci.yaml    # linter configuration
├── Dockerfile        # multi-stage container build
├── Makefile          # build, test, fmt and lint targets
├── config.go         # configuration loading and validation
├── config.yaml       # default configuration values
├── controller.go     # request handlers
├── errors.go         # sentinel errors, error types and HTTP error responses
├── go.mod
├── go.sum
├── logging.go        # structured logging setup
├── main.go           # entrypoint
├── persistence.go    # PostgreSQL access layer
├── router.go         # gin engine, router groups and CORS
└── types.go          # response envelope, request/response DTOs and domain models
```

File names are lower case and use `snake_case` where a name needs more than one word; a
`<name>.go` file is always accompanied by `<name>_test.go`.

## Configuration

Defaults live in `config.yaml`. **Every** value can be overridden by the environment variable
formed by upper-casing the key and replacing `.` with `_` — `postgres.host` becomes
`POSTGRES_HOST`, `postgres.ssl.mode` becomes `POSTGRES_SSL_MODE`. Environment variables take
precedence over the file, which makes the same image deployable to every environment without a
rebuild.

### Configuration Fields

| Key | Environment Variable | Default | Description |
| --- | --- | --- | --- |
| `api.version` | `API_VERSION` | `v1` | Version reported by `GET /v1/version` |
| `listen.host` | `LISTEN_HOST` | `0.0.0.0` | Interface the HTTP server binds to |
| `listen.port` | `LISTEN_PORT` | `10000` | Port the HTTP server binds to |
| `log.level` | `LOG_LEVEL` | `info` | Lowest log level that is emitted |
| `postgres.host` | `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `postgres.port` | `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `postgres.user` | `POSTGRES_USER` | `postgres` | PostgreSQL user |
| `postgres.db` | `POSTGRES_DB` | `postgres` | PostgreSQL database name |
| `postgres.ssl.mode` | `POSTGRES_SSL_MODE` | `disable` | `sslmode` used when connecting |
| `postgres.pool.max_connections` | `POSTGRES_POOL_MAX_CONNECTIONS` | `10` | Largest number of connections the pool opens (1–1000) |
| `postgres.pool.connect_timeout_seconds` | `POSTGRES_POOL_CONNECT_TIMEOUT_SECONDS` | `5` | Deadline for establishing a single new connection (1–300) |
| `postgres.pool.max_connection_lifetime_seconds` | `POSTGRES_POOL_MAX_CONNECTION_LIFETIME_SECONDS` | `3600` | Age at which a pooled connection is retired |
| `postgres.pool.max_connection_idle_time_seconds` | `POSTGRES_POOL_MAX_CONNECTION_IDLE_TIME_SECONDS` | `300` | Idle period after which a pooled connection is closed |

#### Connection Pool

The four `postgres.pool.*` keys are applied by `poolConfig` in `persistence.go` on top of the
parsed connection string, so the pool is never left on the pgx driver defaults. Every endpoint is
anonymous, so a traffic burst turns straight into concurrent queries: `max_connections` caps what
a single instance can take from the server's connection budget, and `connect_timeout_seconds`
stops a request from waiting on an unreachable server. All four are validated at start-up, so an
out-of-range value fails the process rather than silently reverting to a default.

The health check adds a bound of its own: `HealthCheck` derives a two-second deadline
(`healthCheckPingTimeout`) from the request context before pinging, so a hung database is reported
as unhealthy promptly instead of holding `GET /v1/health` open.

#### Accepted Residual Risk: No Pagination

None of the list endpoints (`/v1/articles/list`, `/v1/agents/list`, `/v1/agents/specs/list`,
`/v1/projects/list`, `/v1/cv`) paginates: each returns its full result set, and the two content
endpoints load a whole stored document into memory. This is part of **RISK-018** in
`docs/plans/risk/WP-002/WP-002-risk-plan.md` and is an **accepted, documented** decision, not an
oversight. SPEC-002 defines no pagination parameters and the frontend (SPEC-003) consumes whole
lists, so the response sizes are bounded in practice by the size of the site's own content rather
than by user input. The mitigations that *are* in place are the aggregated CV and spec queries (no
N+1 follow-up query per row), the request-scoped `context.Context` passed into every query so a
client disconnect releases the connection, and the pool bounds above. Should the content volume
grow, pagination is the change to make — not a larger pool.

### Secrets

No secret is committed to `config.yaml` and none carries a default. The database password is
supplied **only** through the environment:

| Environment Variable | Required | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | yes | Password for `POSTGRES_USER` |

The password is read at start-up and used solely to compose the connection string; it is never
logged and never written back to the configuration file.

## Running Locally

The API needs a migrated database to talk to. Apply the migrations first (see
`alembic/README.md`), optionally seed it (see `scripts/seeding/README.md`), then export the
settings that differ from the defaults and start the server:

```bash
$ export POSTGRES_HOST=localhost
$ export POSTGRES_USER=postgres
$ export POSTGRES_PASSWORD=<password>
$ export POSTGRES_DB=personal_website

$ make -C api build
$ cd api && ./api
```

`go run .` from within this directory is equivalent for a quick iteration loop. Once the server
is up, the health endpoint confirms both the API and its database connection:

```bash
$ curl localhost:10000/v1/health
```

### Running In The Compose Stack

`docker-compose.yaml` at the repository root runs the API alongside PostgreSQL. The image is
built from source, so `--build` is needed on the first run and after any change under `api/`:

```bash
$ export POSTGRES_PASSWORD=<password>
$ docker compose up -d --build
```

The stack applies no migrations. Bring PostgreSQL up, migrate and optionally seed it, then start
the API:

```bash
$ docker compose up -d postgres
$ make -C alembic run-migrations
$ make -C scripts/seeding seed
$ docker compose up -d --build api
```

The API waits for `postgres` to report healthy before it starts, and carries a health check of
its own that calls `GET /v1/health`, so `docker compose ps` reports it healthy only once the
database connection is usable. It is published on `${API_PORT:-10000}`.

Inside the stack the database is reached as `postgres:5432` — the service name, and the
container-internal port rather than `POSTGRES_PORT`, which is the host-side half of the
PostgreSQL port mapping and would break the API whenever the server is published elsewhere.

### Building The Image Directly

```bash
$ docker build --platform linux/amd64 --provenance=false -t personal-website-api:local api/
```

The build runs `go vet` and the full test suite in a dedicated stage, and the runtime stage takes
its binary from that stage — a failing test therefore fails the build. The runtime image carries
the static binary, `config.yaml` and `curl` (used only by the health check), and runs as the
non-root `api` user. No connection setting is baked in beyond the non-secret defaults in
`config.yaml`; `POSTGRES_PASSWORD` has no default, so a container started without it fails at
start-up rather than connecting with a committed credential.

## Make Targets

| Target | Description |
| --- | --- |
| `help` | Lists the available targets |
| `build` | Compiles every package in the module (`go build ./...`) |
| `test` | Runs the module test suite (`go test ./...`) |
| `fmt` | Formats every Go file in the module (`go fmt ./...`) |
| `lint` | Runs `golangci-lint run ./...` over the module (invoked by `pre-commit`) |

All targets follow the monorepo convention and are run as `make -C api <target>`. Every recipe
exports `GOTOOLCHAIN=auto` so the toolchain pinned by the `go` directive in `go.mod` is fetched on
demand on hosts shipping an older Go.

### Prerequisites

* **Go** — a working `go` toolchain. Override the binary with `make -C api build go_bin=<path>`.
* **`golangci-lint`** — **not provisioned by this repository**. It is neither vendored nor
  installed by any target or CI step, so the `lint` target (and therefore the `api` pre-commit
  hook) fails with an actionable install message when it is absent. Developers and CI must install
  it themselves:

  ```bash
  $ go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest
  ```

  If the binary lives outside `PATH`, point the target at it instead of installing globally:

  ```bash
  $ make -C api lint golangci_lint_bin=<path>
  ```

  The failure is deliberate — skipping the lint step silently would let unlinted code through the
  hook.

## Endpoints

All endpoints are mounted under the `/v1` prefix and are documented in full, with request and
response schemas, in [`docs/openapi.yaml`](../docs/openapi.yaml). The section references point at
the response schemas in `docs/specs/SPEC-002.md`.

| Endpoint | Description | Request Body | Response Schema |
| --- | --- | --- | --- |
| `GET /v1/health` | Executes health check on API and required services | N/A | SPEC-002 § 6.1.1 |
| `GET /v1/version` | Fetches API version | N/A | SPEC-002 § 6.1.2 |
| `GET /v1/cv` | Fetches CV data from DB, returning skills, experiences, and education | N/A | SPEC-002 § 6.1.3 |
| `GET /v1/agents/list` | Fetches subagents used in development flow | N/A | SPEC-002 § 6.1.4 |
| `GET /v1/agents/specs/list` | Fetches list of specs available for display. Only spec metadata is returned | N/A | SPEC-002 § 6.1.5 |
| `GET /v1/agents/specs/:id/:document_id` | Fetches spec content using provided spec and document ID | N/A | SPEC-002 § 6.1.6 |
| `POST /v1/messages` | Creates a new message in the database. Contact created if not already exists | SPEC-002 § 6.1.7 | SPEC-002 § 6.1.7 |
| `GET /v1/articles/list` | Lists all articles available. Only article metadata is returned | N/A | SPEC-002 § 6.1.8 |
| `GET /v1/articles/:article_id/content` | Fetches article content using the provided article ID | N/A | SPEC-002 § 6.1.9 |
| `GET /v1/articles/:article_id/comments` | Lists all comments made against an article | N/A | SPEC-002 § 6.1.10 |
| `POST /v1/articles/:article_id/comment` | Creates a new comment against a provided article | SPEC-002 § 6.1.11 | SPEC-002 § 6.1.11 |
| `GET /v1/projects/list` | Lists all projects | N/A | SPEC-002 § 6.1.12 |

CORS is enabled on the engine by default, so the browser preflight for each of the above is
answered without a dedicated route.

### Write Endpoint Limits

`POST /v1/messages` and `POST /v1/articles/:article_id/comment` are the only write endpoints and
are served **unauthenticated**. Two limits bound what a single caller can submit through them:

| Limit | Value | Enforced by |
| --- | --- | --- |
| Request body size (both endpoints) | 64 KiB | `BodyLimitMiddleware` in `router.go`; an oversized body is answered with the `400` `body` envelope |
| `comment` length | 4096 characters | `validateCommentRequest` in `controller_articles.go` |
| `message` length | 8192 characters | `validateMessageRequest` in `controller_messages.go` |

Both free-text fields are persisted into unbounded `TEXT` columns, so these limits — and not the
schema — are what bounds the stored row size.

#### Accepted Residual Risk: Rate Limiting And Spam Protection

Neither write endpoint is rate limited and neither carries spam protection (no CAPTCHA, no proof
of work, no per-IP quota). This is **RISK-004** in `docs/plans/risk/WP-002/WP-002-risk-plan.md`
and is an **accepted, deliberately deferred** residual risk, not an oversight: a caller who stays
below the body and field limits above can still submit messages and comments in a loop, filling
`base.message` and `base.article_comment` and generating unsolicited content.

The countermeasures that *are* in scope — the request body size limit and the explicit maximum
lengths of `comment` and `message` — are implemented and listed above. Rate limiting, spam
protection and any form of authentication are owned by later work (SPEC-004) and must not be
added here.

## Testing

The module carries unit tests alongside every source file. They need no database and no network:

```bash
$ make -C api test
```

End-to-end coverage of the endpoints lives in the `acceptance` component, where the scenarios
verifying this component are tagged `@spec-002` and run against a deployed environment.
