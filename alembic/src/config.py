"""Configuration for the alembic migration component.

The settings defined here implement the ``LOG_*`` / ``POSTGRES_*`` / ``ALEMBIC_*``
environment variable contract consumed by the migrations container. The module-level
``CONFIG`` instance is constructed at import time so that a missing or invalid variable
fails validation before any migration work is attempted.

Both logging variables are optional and carry defaults, so a deployment that predates
them keeps working unchanged: ``LOG_LEVEL`` sets the verbosity of the structured logger
and ``LOG_FILE`` names the file the rendered log lines are written to besides stdout.
The ``LOG_*`` and ``POSTGRES_*`` halves of the contract are shared verbatim with
``scripts/seeding/src/config.py`` and must not drift apart.
"""

import logging
from typing import Literal, TextIO

from pydantic import Field, SecretStr, StringConstraints
from pydantic_settings import BaseSettings
from sqlalchemy.engine import URL
from typing_extensions import Annotated

POSTGRES_DRIVER = "postgresql+psycopg"

# Verbosity of the structured logger, and the file the rendered log lines are
# written to alongside stdout. The default path sits in the log directory the
# image creates and hands to the non-root user it runs as (see the `mkdir -p
# /app/logs && chown` step of Dockerfile); outside that image the directory is
# created on first use, and a run that cannot create it logs to stdout only.
DEFAULT_LOG_LEVEL = "INFO"
DEFAULT_LOG_FILE = "/app/logs/migrations.log"


class Config(BaseSettings):
    """Config defines the settings needed to connect to the database.

    These are the settings ``migrations/env.py`` needs, and deliberately nothing
    more: the ``ALEMBIC_*`` half of the contract belongs to the container
    entrypoint and lives on ``MigrationConfig`` instead. Keeping them apart is
    what lets the alembic CLI be driven directly - ``alembic upgrade head`` takes
    its command and revision from its own arguments, so requiring the entrypoint's
    variables there would be asking for the same information twice.

    Attributes:
        LOG_LEVEL: Verbosity of the structured logger. Defaults to "INFO".
        LOG_FILE: File the log lines are written to besides stdout. Defaults to
            "/app/logs/migrations.log".
        POSTGRES_HOST: Hostname of the PostgreSQL instance to migrate. Required.
        POSTGRES_PORT: Port of the PostgreSQL instance. Defaults to 5432.
        POSTGRES_USER: User to connect to the PostgreSQL instance with. Required.
        POSTGRES_PASSWORD: Password of the PostgreSQL user. Required.
        POSTGRES_DB: Name of the database to migrate. Required.
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


class MigrationConfig(Config):
    """MigrationConfig adds the settings the container entrypoint is driven by.

    ``src.main`` has no arguments: which command to run and which revision to run
    it to are supplied as environment variables, and REQ-1.4 requires both to be
    set. Validation of that requirement lives here rather than on ``Config`` so
    that it applies to the entrypoint alone.

    Attributes:
        ALEMBIC_REVISION: Revision to migrate the database to. Required.
        ALEMBIC_COMMAND: Alembic command to run. Either "upgrade" or "downgrade".
    """

    ALEMBIC_REVISION: Annotated[str, StringConstraints(min_length=1)]
    ALEMBIC_COMMAND: Literal["upgrade", "downgrade"]


CONFIG = Config()


class ConsoleHandler(logging.StreamHandler):
    """ConsoleHandler emits alembic's own output at the configured log level.

    ``migrations/env.py`` hands ``alembic.ini`` to ``logging.config.fileConfig``,
    which reads every ``level`` key of that file literally and has no access to
    the environment: alembic's progress output would be pinned to the level
    written into the image. The ``class`` key of a handler section is resolved to
    a handler class instead, which is what this class is for - it takes its level
    from ``LOG_LEVEL`` through the validated settings, the same variable the
    structured logger of ``src.main`` uses. The logger sections of
    ``alembic.ini`` only decide which records are offered to it; the filtering
    happens here.
    """

    def __init__(self, stream: TextIO) -> None:
        """__init__ builds the handler at the configured level.

        Args:
            stream: Stream the log lines are written to, supplied by the ``args``
                key of the handler section.

        Returns:
            None.
        """

        super().__init__(stream)

        levels = logging.getLevelNamesMapping()
        self.setLevel(levels.get(CONFIG.LOG_LEVEL.upper(), levels[DEFAULT_LOG_LEVEL]))


def postgres_connection_url(config: Config = CONFIG) -> str:
    """postgres_connection_url builds the SQLAlchemy connection URL.

    This is the only location in which the configured password is unwrapped. The
    returned URL carries the password in plain text and must never be logged.

    Args:
        config: Settings to build the connection URL from. Defaults to CONFIG.

    Returns:
        SQLAlchemy connection URL for the configured PostgreSQL instance.
    """

    return URL.create(
        drivername=POSTGRES_DRIVER,
        username=config.POSTGRES_USER,
        password=config.POSTGRES_PASSWORD.get_secret_value(),
        host=config.POSTGRES_HOST,
        port=config.POSTGRES_PORT,
        database=config.POSTGRES_DB,
    ).render_as_string(hide_password=False)
