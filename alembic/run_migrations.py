import time
from enum import Enum

import psycopg2
from pydantic_settings import BaseSettings
from pydantic import Field, StringConstraints
from typing_extensions import Annotated
from alembic import command
from alembic.config import Config as AlembicCon


class AlembicCommandEnum(str, Enum):
    UPGRADE = "upgrade"
    DOWNGRADE = "downgrade"
    CURRENT = "current"
    HISTORY = "history"


class Config(BaseSettings):
    postgres_host: Annotated[str, StringConstraints(min_length=1)]
    postgres_port: Annotated[int, Field(gt=0, lt=65536, default=5432)]
    postgres_user: Annotated[str, StringConstraints(min_length=1)]
    postgres_password: Annotated[str, StringConstraints(min_length=1)]
    postgres_db: Annotated[str, StringConstraints(min_length=1)]
    command: Annotated[AlembicCommandEnum, Field(default=AlembicCommandEnum.UPGRADE)]
    revision: Annotated[str, StringConstraints(min_length=1)]
    max_connection_retries: Annotated[int, Field(gt=0, default=10)]
    connection_retries_sleep_seconds: Annotated[int, Field(gt=0, default=5)]


CONFIG = Config()


def wait_for_db(dsn: str):
    """wait_for_db tries to connect to the Postgres database until successful.
    Once the maximum number of retries is reached, a ConnectionError is raised."""

    retries = 0
    while True:
        try:
            conn = psycopg2.connect(dsn)
            conn.close()
            break

        except psycopg2.OperationalError:
            pass

        retries += 1
        if retries >= CONFIG.max_connection_retries:
            raise ConnectionError(
                f"Could not connect to the database after {retries} attempts."
            )

        time.sleep(CONFIG.connection_retries_sleep_seconds)


def main():
    """Run Alembic migrations based on the provided configuration."""

    pg_dsn = (
        f"postgresql://{CONFIG.postgres_user}:{CONFIG.postgres_password}"
        + f"@{CONFIG.postgres_host}:{CONFIG.postgres_port}"
        + f"/{CONFIG.postgres_db}"
    )

    # Ensure the database is reachable before running migrations
    wait_for_db(pg_dsn)

    alembic_cfg = AlembicCon()
    alembic_cfg.set_main_option("script_location", ".")
    alembic_cfg.set_main_option("sqlalchemy.url", pg_dsn)

    match CONFIG.command:
        case AlembicCommandEnum.UPGRADE:
            command.upgrade(alembic_cfg, CONFIG.revision)
        case AlembicCommandEnum.DOWNGRADE:
            command.downgrade(alembic_cfg, CONFIG.revision)
        case AlembicCommandEnum.CURRENT:
            command.current(alembic_cfg)
        case AlembicCommandEnum.HISTORY:
            command.history(alembic_cfg)
        case _:
            raise ValueError(f"Unknown command: {CONFIG.command}")


if __name__ == "__main__":
    main()
