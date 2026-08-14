# Migration container of the alembic component.
#
# The image runs the wrapper in src/main.py, which drives alembic programmatically
# using the POSTGRES_* / ALEMBIC_* environment variable contract. No connection
# setting is baked into the image - every value is supplied at run time.
#
# The component ships without unit tests, so this build has no test stage. The
# psycopg[binary] wheel carries libpq, so no PostgreSQL package is installed.
#
# Build (mandated flags):
#   docker build --platform linux/amd64 --provenance=false -t <tag> alembic/

# OUTSTANDING: both FROM lines below are pinned by the mutable `3.14-slim` tag, so
# two builds of the same commit can resolve to different base images. They must be
# pinned as `python:3.14-slim@sha256:<digest>`, with the same digest in every stage
# and in scripts/seeding/Dockerfile. The digest could not be resolved here - no
# container runtime exists in the authoring environment and a guessed digest would
# be worse than none. README.md ("Outstanding: pin the base image by digest") holds
# the refresh procedure.

# Builder stage: resolve the pinned dependencies into a self-contained virtualenv
# so that pip and its build artefacts never reach the runtime image.
FROM python:3.14-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv

RUN python -m venv "${VIRTUAL_ENV}"

WORKDIR /build

COPY requirements.txt ./

RUN "${VIRTUAL_ENV}/bin/pip" install --upgrade pip && \
    "${VIRTUAL_ENV}/bin/pip" install -r requirements.txt

# Runtime stage: the same slim base carrying only the installed dependencies and
# the application files, running as a non-root user.
FROM python:3.14-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

RUN groupadd --system --gid 1000 migrations && \
    useradd --system --uid 1000 --gid migrations --home-dir /app migrations

COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}

WORKDIR /app

# src/main.py resolves the component root as the parent of the src directory and
# expects alembic.ini and migrations/ to sit beside it.
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations
COPY src ./src

# WORKDIR creates /app as root, so the log directory has to be created and handed
# to the runtime user here: the process drops to `migrations` below and could
# otherwise not create the parent of the default LOG_FILE
# (/app/logs/migrations.log, see src/config.py). src/main.py degrades to
# stdout-only on a filesystem error, so a missing directory would silently cost
# the file sink on every containerised run. Only the log directory changes owner
# - alembic.ini, migrations/ and src/ stay root-owned and read-only to the
# runtime user.
RUN mkdir -p /app/logs && chown migrations:migrations /app/logs

USER migrations

CMD ["python", "src/main.py"]
