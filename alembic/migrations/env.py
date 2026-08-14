"""Alembic environment for the ``base`` schema migrations.

The connection URL is never read from ``alembic.ini``: it is composed at runtime
from the ``POSTGRES_*`` environment variable contract implemented by
``src.config``. Offline mode (``--sql``) renders the migration DDL without
contacting a server, which is the component's static verification gate; online
mode connects through a psycopg v3 engine.

Alembic's own version table is deliberately **not** placed in the ``base``
schema. Alembic creates that table before the first revision body runs and never
creates a schema for it, so pinning it to ``base`` makes ``upgrade`` fail against
an empty database with ``schema "base" does not exist``. Left unconfigured, the
table is created in the connection's default schema (``public``), which keeps
``base`` owned exclusively by the revisions: the initial revision creates the
schema as its first statement and drops it unconditionally on downgrade.
"""

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

# The component root (the parent of this migrations directory) is placed on
# sys.path so that src.config is importable regardless of the working directory
# alembic is invoked from.
COMPONENT_ROOT = Path(__file__).resolve().parents[1]
if str(COMPONENT_ROOT) not in sys.path:
    sys.path.insert(0, str(COMPONENT_ROOT))

from src.config import postgres_connection_url  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    """run_migrations_offline renders the migrations as SQL without a server.

    The connection URL is used purely to select the dialect; no DBAPI connection
    is created, so a dummy URL is sufficient. Statements are emitted to stdout.
    No ``version_table_schema`` is configured, so the rendered SQL matches what
    online mode does: the version table is created in the default schema, ahead
    of the ``base`` schema the revisions own.

    Returns:
        None.
    """

    context.configure(
        url=postgres_connection_url(),
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """run_migrations_online runs the migrations against a live database.

    A psycopg v3 engine is created from the configured connection URL and
    disposed once the migrations have been applied. No ``version_table_schema``
    is configured: alembic bootstraps its version table in the connection's
    default schema before the first revision body runs, which is the only
    location that does not require a schema the revisions have yet to create.

    Returns:
        None.
    """

    engine = create_engine(postgres_connection_url(), poolclass=pool.NullPool)
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=None,
                include_schemas=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
