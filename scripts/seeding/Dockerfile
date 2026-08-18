# Seeding container of the scripts/seeding component.
#
# The image runs the CLI in src/main.py, which seeds a migrated database from the
# JSON fixtures shipped alongside it using the POSTGRES_* environment variable
# contract. No connection setting is baked into the image - every value is
# supplied at run time. src/main.py imports src/config.py from inside main(),
# which validates the whole environment before any seeding work, so a missing
# variable fails the container immediately, reported by name as one structured
# error line rather than as a traceback rendering the environment.
#
# NO-SERVER RULE (RISK-012): no stage installs a PostgreSQL package. psycopg is
# pinned as psycopg[binary], whose wheel carries libpq, so neither libpq-dev nor
# a server package is needed. The tests stage is the enforcement mechanism: the
# suite runs during the build in an image with no `postgres` executable, so a
# test that requested a server-spawning fixture would fail the build.
#
# Build (mandated flags):
#   docker build --platform linux/amd64 --provenance=false -t <tag> scripts/seeding/

# OUTSTANDING: both FROM lines below are pinned by the mutable `3.14-slim` tag, so
# two builds of the same commit can resolve to different base images. They must be
# pinned as `python:3.14-slim@sha256:<digest>`, with the same digest in every stage
# and in alembic/Dockerfile. The digest could not be resolved here - no container
# runtime exists in the authoring environment and a guessed digest would be worse
# than none. README.md §2.8 holds the refresh procedure.

# Builder stage: resolve the runtime dependencies into a self-contained
# virtualenv so that pip and its build artefacts never reach the runtime image.
FROM python:3.14-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv

RUN python -m venv "${VIRTUAL_ENV}"

WORKDIR /app

COPY requirements.txt ./

# requirements.txt pins the runtime and the test dependencies in one file, under
# the `# Runtime` and `# Test` headings. The shipped virtualenv takes the runtime
# section only; the tests stage adds the test section on top of it. The import
# check below fails the build if a runtime dependency ever ends up below the
# `# Test` heading and is therefore missing from the shipped virtualenv.
RUN sed '/^# Test$/,$d' requirements.txt > requirements-runtime.txt && \
    "${VIRTUAL_ENV}/bin/pip" install --upgrade pip && \
    "${VIRTUAL_ENV}/bin/pip" install -r requirements-runtime.txt && \
    "${VIRTUAL_ENV}/bin/python" -c \
        "import psycopg, pydantic, pydantic_settings, structlog" && \
    rm requirements-runtime.txt

# Tests stage: the pinned runtime virtualenv plus the test dependencies, running
# the full pytest suite as a build step. A failing test fails the build. The
# suite runs with no POSTGRES_* variables set - every test that touches the
# settings or the entrypoint supplies its own environment, and the database is
# always mocked.
FROM builder AS tests

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}"

RUN pip install -r requirements.txt

COPY src ./src
COPY fixtures ./fixtures
COPY tests ./tests

# `python -m pytest` puts /app on sys.path, which is how the tests import `src`.
RUN python -m pytest

# Runtime stage: the same slim base carrying the runtime virtualenv, the sources
# and the whole fixture corpus, running as a non-root user. The sources are taken
# from the tests stage, so the runtime image can only be built once the suite has
# passed.
FROM python:3.14-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

RUN groupadd --system --gid 1000 seeding && \
    useradd --system --uid 1000 --gid seeding --home-dir /app seeding

COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}

WORKDIR /app

# src/fixtures.py resolves the fixture root as the `fixtures` directory beside
# the src directory, and reads the document sidecars under fixtures/documents/,
# so the whole tree ships. tests/ deliberately does not.
COPY --from=tests /app/src ./src
COPY --from=tests /app/fixtures ./fixtures

# WORKDIR creates /app as root, so the log directory has to be created and handed
# to the runtime user here: the process drops to `seeding` below and could
# otherwise not create the parent of the default LOG_FILE
# (/app/logs/seeding.log, see src/config.py). src/main.py degrades to
# stdout-only on a filesystem error, so a missing directory would silently cost
# the file sink on every containerised run. Only the log directory changes owner
# - src/ and fixtures/ stay root-owned and read-only to the runtime user.
RUN mkdir -p /app/logs && chown seeding:seeding /app/logs

USER seeding

# Run as a module, not as a script: `-m` puts /app on sys.path so that the
# absolute `src.*` imports resolve, and any argument appended to `docker run`
# reaches the CLI (`--yes`, `--host`, `--dbname`, `--fixtures-dir`, ...). Seeding
# is destructive, so a run without `--yes` is refused before anything is read or
# connected to; the Makefile's `seed` target appends it.
ENTRYPOINT ["python", "-m", "src.main"]
