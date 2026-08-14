"""Configuration for the seeding component.

The settings defined here implement the ``LOG_*`` / ``POSTGRES_*`` environment
variable contract of the seeding container, identically to
``alembic/src/config.py``: the two components must never drift apart on variable
names, defaults or typing. ``ALEMBIC_*`` variables are not part of this
component's contract.

Both logging variables are optional and carry defaults, so a deployment that
predates them keeps working unchanged: ``LOG_LEVEL`` sets the verbosity of the
structured logger and ``LOG_FILE`` names the file the rendered log lines are
written to in addition to stdout.

The module-level ``CONFIG`` instance is built at import time, so an unset or
invalid variable fails validation before any seeding work is attempted. What
keeps that fail-fast compatible with the CLI's own error reporting is *where* the
import happens: ``src.main`` imports this module from inside its functions, never
at module scope, so the ``pydantic.ValidationError`` raised while building
``CONFIG`` surfaces inside ``main()`` and is caught there. A missing variable is
therefore reported by *name* as a single structured error line with a non-zero
exit code - never as a traceback rendering the collected environment, password
included. Moving the import back to the module scope of ``src.main`` would make
that error handler unreachable and reintroduce the leak.

Because the import validates the *process* environment, a caller handing an
explicit environment to :func:`load_config` must import this module under that
environment - which is exactly what ``src.main.load_config`` does. Otherwise a
complete mapping would still be rejected whenever the ambient process
environment happens to be incomplete.

The loaded settings supply the defaults of the ``argparse`` connection arguments,
so ``docker run -e POSTGRES_...`` works without an entrypoint wrapper while
explicit CLI arguments still override.

``POSTGRES_PASSWORD`` is a ``SecretStr``: neither ``str()`` nor ``repr()`` of the
settings object reveals it, and the value must only be unwrapped at the point the
database connection is actually made.
"""

from __future__ import annotations

import os
from typing import Mapping

from pydantic import Field, SecretStr, StringConstraints
from pydantic_settings import BaseSettings
from typing_extensions import Annotated

# Verbosity of the structured logger, and the file the rendered log lines are
# written to alongside stdout. The default path sits in the log directory the
# image creates and hands to the non-root user it runs as (see the `mkdir -p
# /app/logs && chown` step of Dockerfile); outside that image the directory is
# created on first use, and a run that cannot create it logs to stdout only.
DEFAULT_LOG_LEVEL: str = "INFO"
DEFAULT_LOG_FILE: str = "/app/logs/seeding.log"


class Config(BaseSettings):
    """Config defines the environment-driven settings of the seeding component.

    Attributes:
        LOG_LEVEL: Verbosity of the structured logger. Defaults to "INFO".
        LOG_FILE: File the log lines are written to besides stdout. Defaults to
            "/app/logs/seeding.log".
        POSTGRES_HOST: Hostname of the PostgreSQL instance to seed. Required.
        POSTGRES_PORT: Port of the PostgreSQL instance. Defaults to 5432.
        POSTGRES_USER: User to connect to the PostgreSQL instance with. Required.
        POSTGRES_PASSWORD: Password of the PostgreSQL user. Required.
        POSTGRES_DB: Name of the database to seed. Required.
    """

    LOG_LEVEL: Annotated[
        str, StringConstraints(min_length=1), Field(default=DEFAULT_LOG_LEVEL)
    ]
    LOG_FILE: Annotated[
        str, StringConstraints(min_length=1), Field(default=DEFAULT_LOG_FILE)
    ]
    POSTGRES_HOST: Annotated[str, StringConstraints(min_length=1)]
    POSTGRES_PORT: Annotated[int, Field(default=5432, gt=0, le=65535)]
    POSTGRES_USER: Annotated[str, StringConstraints(min_length=1)]
    POSTGRES_PASSWORD: Annotated[SecretStr, StringConstraints(min_length=1)]
    POSTGRES_DB: Annotated[str, StringConstraints(min_length=1)]


CONFIG = Config()


def load_config(environ: Mapping[str, str] | None = None) -> Config:
    """load_config builds a Config from an explicitly supplied environment.

    The process environment is temporarily replaced by `environ` so that the
    settings are parsed exactly as they would be at container start, then
    restored. Passing `None` hands back `CONFIG`, the instance built from the
    process environment when this module was imported.

    Args:
        environ: Environment mapping to build the settings from. Defaults to
            None, in which case the global `CONFIG` instance is returned.

    Returns:
        Validated settings for the seeding component.
    """

    if environ is None:
        return CONFIG

    previous = dict(os.environ)
    os.environ.clear()
    os.environ.update(environ)
    try:
        return Config()
    finally:
        os.environ.clear()
        os.environ.update(previous)
