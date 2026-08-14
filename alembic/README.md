# Alembic

## Table Of Contents

1. [Overview](#overview)
2. [Component Layout](#component-layout)
3. [Running Migrations](#running-migrations)
    - [Locally](#locally)
    - [Via The Alembic CLI](#via-the-alembic-cli)
    - [Via The Container](#via-the-container)
4. [Environment Variables](#environment-variables)
5. [Make Targets](#make-targets)
6. [Testing](#testing)
7. [Verification Status](#verification-status)
    - [Outstanding: pin the base image by digest](#outstanding-pin-the-base-image-by-digest)

## Overview

This component holds the PostgreSQL table definitions and the `alembic` migrations that
provision them. Migrations are applied by a container image built from this directory, which is
run as a Kubernetes job whenever a new revision is released. The image contains no connection
setting of any kind: host, credentials, database name, the target revision and the command to
run are all supplied at run time through environment variables.

The container entrypoint is the wrapper in `src/main.py`, which drives `alembic`
programmatically. Configuration is validated at import time by `src/config.py`, so a missing or
invalid variable fails before any migration work is attempted.

**Where alembic's bookkeeping lives.** `migrations/env.py` configures no `version_table_schema`,
so the `alembic_version` table is created in the connection's default schema (`public` for a
default PostgreSQL role), *not* in `base`. This is deliberate and must not be changed: alembic
creates its version table before the first revision body runs and never creates a schema for it,
so pinning it to `base` makes `upgrade` fail against an empty database with
`schema "base" does not exist`. Keeping it out of `base` also means the schema contains only
revision-owned objects, which is what lets `downgrade` end with an unconditional
`DROP SCHEMA base RESTRICT`.

## Component Layout

```txt
alembic
├── Dockerfile      # migration container image
├── Makefile        # build + run targets
├── alembic.ini     # alembic configuration
├── migrations      # revision scripts and env.py
├── requirements.txt
└── src             # config, models and the migration wrapper
```

## Running Migrations

### Locally

Install the pinned dependencies and export the variables documented in
[Environment Variables](#environment-variables), then invoke the wrapper directly:

```bash
$ pip install -r requirements.txt

$ export POSTGRES_HOST=localhost
$ export POSTGRES_USER=postgres
$ export POSTGRES_PASSWORD=<password>
$ export POSTGRES_DB=postgres
$ export ALEMBIC_REVISION=head
$ export ALEMBIC_COMMAND=upgrade

$ python src/main.py
```

### Via The Alembic CLI

The wrapper exists because a container entrypoint takes no arguments. When you have a shell,
`alembic` can be driven directly against `alembic.ini` — useful for the commands the wrapper
does not expose, such as `history`, `current`, `show` and `stamp`.

Only the connection variables are needed. `ALEMBIC_REVISION` and `ALEMBIC_COMMAND` configure the
*wrapper*, and the CLI takes the same two pieces of information as its own arguments, so it does
not ask for them:

```bash
$ export POSTGRES_HOST=localhost
$ export POSTGRES_USER=admin
$ export POSTGRES_PASSWORD=<password>
$ export POSTGRES_DB=personal_website

$ cd alembic

$ alembic upgrade head            # apply every revision
$ alembic downgrade base          # drop the base schema
$ alembic history                 # list revisions (no server needed)
$ alembic upgrade head --sql      # render the DDL without connecting
```

Run these from this directory: `script_location` and `prepend_sys_path` in `alembic.ini` are
relative to it, and the latter is what lets `migrations/env.py` import `src.config` to compose the
connection URL. Rendering with `--sql` needs the variables set but never contacts a server, so any
syntactically valid values will do.

Note that `alembic downgrade base --sql` is rejected by alembic itself — an offline downgrade needs
an explicit range, so use `alembic downgrade head:base --sql`.

### Via The Container

The `run-migrations` target builds the image and runs it against the database described by the
current shell environment:

```bash
$ export POSTGRES_HOST=localhost
$ export POSTGRES_USER=postgres
$ export POSTGRES_PASSWORD=<password>
$ export POSTGRES_DB=postgres
$ export ALEMBIC_REVISION=head
$ export ALEMBIC_COMMAND=upgrade

$ make -C alembic run-migrations
```

The image is always built with `--platform linux/amd64` (the cluster nodes are amd64) and
`--provenance=false` (the target registry does not support provenance attestations). The
variables are handed to the container with the value-less `docker run -e <NAME>` form, so their
values are read from the parent shell and never appear in the `Makefile`, the image or the
repository.

## Environment Variables

| Variable | Required | Default | Consumers |
| --- | --- | --- | --- |
| `POSTGRES_HOST` | yes | — | both containers |
| `POSTGRES_PORT` | no | `5432` | both containers |
| `POSTGRES_USER` | yes | — | both containers |
| `POSTGRES_PASSWORD` | yes | — (SecretStr) | both containers |
| `POSTGRES_DB` | yes | — | both containers |
| `LOG_LEVEL` | no | `INFO` | both containers |
| `LOG_FILE` | no | `/app/logs/migrations.log` (this container; `/app/logs/seeding.log` in the seeding container) | both containers |
| `ALEMBIC_REVISION` | yes (no default; raise if unset) | — | migrations container |
| `ALEMBIC_COMMAND` | yes (`upgrade`\|`downgrade` only; raise if unset) | — | migrations container |

The two `ALEMBIC_*` variables are required by the **wrapper only** (`src/main.py`), which is why
they are modelled on `MigrationConfig` rather than on the `Config` that `migrations/env.py`
consumes. Driving the `alembic` CLI directly therefore needs the `POSTGRES_*` variables and
nothing more — see [Via The Alembic CLI](#via-the-alembic-cli).

"Both containers" refers to this migrations container and the seed-data container documented in
`scripts/seeding/README.md`; the `POSTGRES_*` and `LOG_*` rows above are shared between the two
components and must not diverge — only the default of `LOG_FILE` is per-container, since each
writes its own file.

Notes on the contract:

* `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` are required and have
  no defaults. A missing value raises a validation error at start-up naming the variable.
* `POSTGRES_PORT` is the only variable with a default (`5432`) and must be a valid port number.
* `POSTGRES_PASSWORD` is held as a pydantic `SecretStr` and is unwrapped in exactly one place,
  when the SQLAlchemy connection URL is built. It is never logged.
* `ALEMBIC_REVISION` is required and has no default: the revision to migrate to is always stated
  explicitly (`head`, a revision hash, `-1`, ...), never inferred.
* `ALEMBIC_COMMAND` is required and constrained to `upgrade` or `downgrade`. Any other value
  fails validation at start-up.
* `LOG_LEVEL` and `LOG_FILE` are optional and carry defaults, so a deployment that predates them
  keeps working unchanged. `LOG_LEVEL` names the lowest level that is emitted (matched
  case-insensitively; an unknown name falls back to `INFO`), and `LOG_FILE` names the file the
  rendered JSON lines are appended to *in addition to* stdout. A log file that cannot be created
  or written degrades to stdout only rather than failing the migration.

## Make Targets

| Target | Description |
| --- | --- |
| `build` | Builds the migration image with the mandated `--platform`/`--provenance` flags |
| `run-migrations` | Builds the image and runs it against the environment's database |
| `lint` | Runs `black` and `flake8` over the component (invoked by `pre-commit`) |

All targets follow the monorepo convention and are run as `make -C alembic <target>`.

## Testing

This component intentionally ships **without unit tests** (binding decision 5). Its logic is a
thin wrapper around `alembic` plus declarative table definitions; the behaviour worth verifying
is whether the revisions apply cleanly to a real PostgreSQL instance, which is integration
territory rather than unit territory. Correctness is instead exercised by running the migrations
against a provisioned database.

The one piece of pure logic that is not a pass-through, the log redaction in
`src/main.py:redact`, carries its checks as doctests in its docstring, so it can be exercised
without introducing a test suite:

```bash
$ cd alembic && python -m doctest src/main.py
```

The command prints nothing and exits `0` when the redaction holds. It covers the case the raw
substring replacement used to miss: the connection URL percent-encodes the password, so a
password containing `@`, `/`, `%` or a space appears in a driver or SQLAlchemy error in an
encoded form (`quote_plus` and `quote(safe="")` both), and every one of those renderings must be
removed before the error reaches a log line.

## Verification Status

AC-1 … AC-5 are **implemented but unverified** in this changeset. The mechanisms that would
verify them are out of scope here:

* There is **no migration CI job** — nothing runs `alembic upgrade`/`downgrade` automatically on
  a pull request or a release.
* There is **no provisioned PostgreSQL instance** in scope, so the revisions have not been
  applied to, or rolled back from, a real database.
* The container image has **not been built or executed** in the authoring environment, as no
  container runtime was available there. The `Makefile` recipes are verified by inspection and
  by `make -n` expansion only.

Until a migration CI job and a target database exist, treat the acceptance criteria of this
component as claims backed by review, not by execution.

### Outstanding: pin the base image by digest

Both `FROM python:3.14-slim` lines in this component's `Dockerfile` (the `builder` base and the
`runtime` base) are still pinned by **mutable tag**. Two builds of the same commit can therefore
resolve to different base images, which is how a compromised or regressed upstream publish
reaches an image that holds database credentials at run time, with no change to this repository
and no signal in review. The dependency pins in `requirements.txt` are exact and are not
affected; only the base layer is unpinned.

This is **not fixed in this changeset**: resolving a digest requires pulling the image, and no
container runtime exists in the authoring environment. Inventing a digest would be worse than
leaving the tag, so the requirement is recorded here and must be carried out in an environment
that has a runtime:

```bash
$ docker pull python:3.14-slim
$ docker inspect --format '{{index .RepoDigests 0}}' python:3.14-slim
python@sha256:<digest>
```

Then rewrite **every** `FROM` line in this component's `Dockerfile` — and in
`scripts/seeding/Dockerfile` — as `FROM python:3.14-slim@sha256:<digest> AS <stage>`, keeping the
human-readable tag in front of the digest. All stages of a Dockerfile must carry the *same*
digest, and both components should be refreshed together so the two images share a base. Repeat
this procedure whenever the base image is deliberately upgraded; the digest is the only thing
that changes.
