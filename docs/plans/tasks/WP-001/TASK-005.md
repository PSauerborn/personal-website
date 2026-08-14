# Task: Migration container image (`alembic/Dockerfile`, `alembic/.dockerignore`)

Work Plan ID: WP-001
Task ID: TASK-005
Created Date: 2026-08-13
Description: Build the multi-stage migration image on a pinned Python 3.14 slim base running `alembic/src/main.py`, plus its `.dockerignore`.
Acceptance Criteria Covered: AC-5

## Implementation Content

- `alembic/Dockerfile`: multi-stage build.
  - Base image: **Python 3.14 slim** (Debian-based), pinned explicitly by tag. Any lower
    version is a defect — the changeset depends on stdlib `uuid.uuid7()`, added in 3.14
    (the spec's `uuid.uuidv7` is a typo and must appear nowhere).
  - Builder stage installs `alembic/requirements.txt`; runtime stage carries only the
    installed dependencies plus the application files (`alembic.ini`, `migrations/`, `src/`).
  - **No test stage** — the alembic component ships without unit tests (binding decision 5).
  - Runs as a non-root user; entrypoint/CMD invokes `alembic/src/main.py`.
  - No PostgreSQL server package is installed.
- `alembic/.dockerignore`: exclude VCS, caches, docs, `acceptance/`, and anything not needed by
  the build context.

The image must actually be built during this task (RISK-010c) with the mandated flags:

```
docker build --platform linux/amd64 --provenance=false -t <local-tag> alembic/
```

## Target Files

- [x] alembic/Dockerfile
- [x] alembic/.dockerignore

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/alembic/requirements.txt and /home/agent/workspace/alembic/src/main.py
  (TASK-001 / TASK-004 — dependencies to install and the entrypoint to run)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-1.4 — Dockerfile runs migrations via the
  Python wrapper; connection settings come from environment variables)
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Reference Contracts" → Docker/build
  contract)
- Coding standards via the `coding-standards` skill: `general/DOCKER.md`, `python/DOCKER.md`
  plus `examples/DOCKER/two-stage-build.md`

## Investigation Notes

### Investigation observations

- `alembic/requirements.txt` pins `alembic==1.19.1`, `sqlalchemy==2.0.52`,
  `psycopg[binary]==3.3.4`, `pydantic==2.13.4`, `pydantic-settings==2.15.0`,
  `structlog==26.1.0`. `psycopg[binary]` ships the libpq wheel, so **no** `libpq-dev` or
  any postgres package is needed (or permitted) in the image. No test dependencies exist.
- `alembic/src/main.py` resolves `COMPONENT_ROOT` as the parent of `src/` and expects
  `alembic.ini` and `migrations/` next to `src/`; it inserts the component root into
  `sys.path` itself, so the wrapper works regardless of the working directory as long as
  the three artefacts sit side by side in the image. Invocation form is
  `python src/main.py` (module guard calls `sys.exit(main())`).
- `alembic/src/config.py` builds `CONFIG = Config()` at import time; with no environment
  set, pydantic-settings raises `ValidationError`, which `main.py` renders as the
  `Invalid migration configuration` log line listing every missing variable, returning 1.
- SPEC-001 REQ-1.4: the Dockerfile runs the migrations via the Python wrapper; all
  PostgreSQL connection settings arrive as environment variables (nothing baked in).
- WP-001 "Reference Contracts" → Docker/build contract: multi-stage Dockerfiles, Python
  3.14 slim (Debian-based) runtime, builds use `--platform linux/amd64
  --provenance=false`. The seeding image (not this one) carries the tests stage.
- Standards: `[DOCKER-002]` multi-stage; `[DOCKER-003]` exclude non-essential files;
  `[DOCKER-004]` mandated build flags; `[DOCKER-006]`/`[PY-DOCKER-002]` smallest viable
  Debian slim base. `[DOCKER-005]`/`[PY-DOCKER-001]` (test stage) is deliberately waived
  here by binding decision 5 — the alembic component ships no unit tests.

### Phase 1 completion evidence — BLOCKED: no container runtime available

The mandated build could not be executed: this environment has no Docker (or any other
container build tool) installed.

```
$ docker build --platform linux/amd64 --provenance=false -t wp001-alembic-migrations:local alembic/
/bin/bash: line 1: docker: command not found
EXIT=127
```

Confirmed absent: `docker`, `buildx`, `podman`, `nerdctl`, `img` are not on `PATH`; there
is no `/var/run/docker.sock` or `/run/docker.sock`. The Red-phase failure above is
therefore a tooling failure, not the expected "no Dockerfile yet" failure, and the
Green/Refactor rebuilds and the no-env container run cannot be produced here. The image
must be built with the mandated flags by a caller that has a Docker daemon before AC-5's
build evidence can be claimed.

Host-side proxy for the no-env run (the wrapper the container's `CMD` invokes, executed
directly on the host, not inside the image):

```
$ cd alembic && env -u POSTGRES_HOST -u POSTGRES_USER -u POSTGRES_PASSWORD \
    -u POSTGRES_DB -u ALEMBIC_REVISION -u ALEMBIC_COMMAND python3 src/main.py
{"level": "info", ..., "message": "Starting database migration"}
{"errors": ["POSTGRES_HOST: Field required", "POSTGRES_USER: Field required",
            "POSTGRES_PASSWORD: Field required", "POSTGRES_DB: Field required",
            "ALEMBIC_REVISION: Field required", "ALEMBIC_COMMAND: Field required"],
 "level": "error", ..., "message": "Invalid migration configuration"}
EXIT=1
```

### Image design

- Both stages pin `python:3.14-slim`; no other Python version appears in the Dockerfile.
- Builder resolves `requirements.txt` into `/opt/venv`; the runtime stage copies only that
  virtualenv plus `alembic.ini`, `migrations/` and `src/` into `/app`, matching the layout
  `src/main.py` expects (`COMPONENT_ROOT` = parent of `src/`).
- Runtime runs as the non-root `migrations` user (uid/gid 1000); `CMD ["python",
  "src/main.py"]`.
- No test stage (binding decision 5) and no PostgreSQL or `libpq-dev` package —
  `psycopg[binary]` ships libpq in its wheel.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-004 | Migration wrapper entrypoint (`alembic/src/main.py`) | blocks | The entrypoint module the image runs |

## Implementation Steps (TDD: Red-Green-Refactor)

No unit tests exist for the alembic component (binding decision 5). The Red-Green cycle is
driven by the image build.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverable: `alembic/src/main.py` (module path and invocation form)
- [ ] Red check: run the mandated `docker build` command and confirm it fails (no Dockerfile
      yet) — **blocked**: no container runtime in this environment (see Investigation Notes)

### 2. Green Phase

- [ ] Write the Dockerfile and `.dockerignore`; re-run the mandated build until it exits 0 —
      files written; the build is **blocked** (no Docker daemon)
- [ ] Run the built image with **no** environment variables and confirm it exits non-zero with
      the config validation error naming a missing variable — **blocked**; host-side proxy run
      of `src/main.py` recorded in Investigation Notes (exit 1, names all missing variables)

### 3. Refactor Phase

- [ ] Tighten layers/caching and the ignore list; rebuild and confirm the build still passes —
      layers and ignore list written in final shape; rebuild **blocked**

## Completion Criteria

- [ ] `docker build --platform linux/amd64 --provenance=false -t <tag> alembic/` exits 0 —
      **blocked**: no container runtime available in this environment
- [x] The Dockerfile pins an explicit **Python 3.14 slim** tag; no other Python version appears
- [x] The image contains no PostgreSQL server package and no test stage
- [ ] Running the image with no environment set exits non-zero, naming the missing variable —
      **blocked** (host-side proxy recorded instead)
- [x] The container runs as a non-root user
- [x] The build output and the no-env run result are recorded in Investigation Notes (Phase 1
      completion evidence) — recorded, including the tooling block

## Notes

- Impact scope: `alembic/Makefile` (TASK-006) builds and runs this image; `README.md`
  (TASK-024) describes it.
- Risk countermeasures carried by this task: **RISK-010** (image is actually built with the
  mandated flags, not merely declared buildable), **RISK-011** (explicit 3.14 slim tag; never
  lower the base image to satisfy a dependency — surface the conflict instead).
- Scope boundary: no `docker-compose.yml`, no `.github/workflows/**`, no PostgreSQL
  provisioning (RISK-018). Do not modify Python sources under `alembic/src/`.
