"""Command-line entrypoint of the seeding component.

This module is the seeding container's entrypoint (REQ-2.2, REQ-2.6). It owns
two things the rest of the component deliberately does not: the ``argparse``
interface, and the lifetime of the database connection.

**The environment-to-CLI bridge.** Every connection argument defaults to the
matching field of ``src.config``, so ``docker run -e POSTGRES_...`` seeds a
database with no entrypoint wrapper and no shell indirection, while an explicit
``--host``/``--port``/``--user``/``--password``/``--dbname`` still overrides the
environment. The password travels as a ``SecretStr`` from the settings all the
way to the connection call, so neither the parsed namespace nor a traceback can
render it; it is unwrapped exactly once, in :func:`open_connection`.

**Seeding is opt-in.** A run truncates every seeded table and installs the
fixture corpus, whose API keys are published in ``README.md``; the image accepts
any host and database it is handed. :func:`destructive_run_allowed` therefore
refuses a run that does not carry ``--yes``, reporting the target host and
database as a structured error and exiting non-zero - before a fixture is read
and before :func:`open_connection` is called.

**The pipeline order is the safety property.** Fixtures are loaded and validated
(``src.fixtures``), then flattened, de-duplicated and reference-checked
(``src.persistence.build_seed_plan``) - and only once all of that has succeeded
is the connection factory called. Every failure mode of a fixture tree therefore
fails while the run is still a purely on-disk operation, which is what makes
"an invalid fixture leaves the database byte-identical" true by construction
rather than by rollback (AC-7, REQ-2.5, RISK-006). Reordering these steps, or
opening the connection earlier to "fail fast on connectivity", breaks that
guarantee.

Execution itself is delegated to ``src.persistence.execute_seed_plan``, which
runs everything in one transaction with a single commit; this module only
supplies an open connection with ``autocommit`` disabled and a ``dict_row`` row
factory, and closes it again afterwards.

**Logging.** :func:`configure_logging` renders every event as a JSON object
carrying ``message``, ``timestamp`` and ``level``, written to stdout and appended
to ``LOG_FILE``; ``LOG_LEVEL`` sets the verbosity. It is called as the first
statement of :func:`main`, before the settings are read, so a configuration
failure is itself reported as a structured line.

**The settings module is imported lazily.** ``src.config`` builds its global
``CONFIG`` instance while it is imported, so it is imported from inside
:func:`load_config` rather than at module scope. An unset or invalid variable
then raises where :func:`main` catches it, instead of killing the process with a
traceback that renders the collected environment (RISK-015). Hoisting that import
back to the module scope reintroduces exactly that leak.

Because that import validates the process environment, :func:`load_config`
performs it inside :func:`injected_environment` whenever an explicit ``environ``
was supplied. The injection seam is therefore honoured in a process carrying no
``POSTGRES_*`` variable at all - the test suite's, and any caller embedding the
CLI - while an incomplete ``environ`` still raises where :func:`main` reports it
by variable name.

Every failure - invalid configuration, invalid fixture, unresolved reference,
unreachable database, failing statement - is reported as a single structured
``structlog`` error event and turned into a non-zero exit code. No log line ever
carries the settings object, a connection string or the password (RISK-015):
configuration problems are reported by variable *name* only.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from contextlib import contextmanager
from itertools import chain
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Iterator, Mapping, Sequence, TextIO

import psycopg
import structlog
from psycopg.rows import dict_row
from pydantic import SecretStr, ValidationError

from src.fixtures import DEFAULT_FIXTURES_ROOT, FixtureError, load_fixtures
from src.persistence import (
    PersistenceError,
    SeedPlan,
    build_seed_plan,
    execute_seed_plan,
)

if TYPE_CHECKING:  # pragma: no cover - import used for type checking only
    from src.config import Config

LOGGER = structlog.get_logger()

# Defaults of the logging settings. They are repeated here rather than imported
# from `src.config`, because importing that module builds its global settings
# instance and would make the error handler of `main()` - which reports an
# invalid configuration as a single log line - unreachable. The values must stay
# identical to the `DEFAULT_LOG_*` constants of `src.config`.
DEFAULT_LOG_LEVEL: str = "INFO"
DEFAULT_LOG_FILE: str = "/app/logs/seeding.log"

# Exit codes of the container process. Anything non-zero fails the kubernetes
# job that will run this image.
EXIT_SUCCESS: int = 0
EXIT_FAILURE: int = 1

# Factory producing the connection the seed plan is executed against. Injected
# by the test suite so the pipeline can be driven with no server present.
ConnectionFactory = Callable[..., psycopg.Connection]


class TeeStream:
    """TeeStream fans one rendered log line out to several writable streams.

    This is what puts the log lines on stdout *and* into a log file without a
    second rendering pass: `structlog.WriteLoggerFactory` writes to a single
    file object, and this is that object.

    Attributes:
        streams (tuple[TextIO, ...]): The streams every write is fanned out to.
    """

    def __init__(self, streams: Sequence[TextIO]) -> None:
        """__init__ stores the streams the log lines are written to.

        Args:
            streams (Sequence[TextIO]): The streams to fan writes out to.

        Returns:
            None
        """

        self.streams: tuple[TextIO, ...] = tuple(streams)

    def write(self, data: str) -> int:
        """write writes one rendered log line to every stream.

        Args:
            data (str): The rendered log line.

        Returns:
            int: The number of characters written.
        """

        for stream in self.streams:
            stream.write(data)

        return len(data)

    def flush(self) -> None:
        """flush flushes every stream, so a crash cannot lose the last line.

        Returns:
            None
        """

        for stream in self.streams:
            stream.flush()


def open_log_file(log_file: Path) -> TextIO | None:
    """open_log_file opens the log file the log lines are appended to.

    A container whose log directory cannot be created or written must still log
    on stdout rather than die before its first line, so every filesystem error
    degrades to "stdout only" instead of propagating.

    Args:
        log_file (Path): Path of the log file to append to.

    Returns:
        TextIO | None: The open file, or None if it could not be opened.
    """

    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        return log_file.open("a", encoding="utf-8")
    except OSError:
        return None


def configure_logging(
    log_level: str = DEFAULT_LOG_LEVEL,
    log_file: Path | str = DEFAULT_LOG_FILE,
) -> None:
    """configure_logging renders structlog output as JSON on stdout and a file.

    Every log line carries the `message`, `timestamp` and `level` fields
    required of structured logs; contextual values are emitted as dedicated
    fields rather than being interpolated into the message. The lines are
    written to stdout, which the platform collects, and appended to `log_file`
    so recent logs remain inspectable inside the container.

    Args:
        log_level (str): Name of the lowest level that is emitted, matched
            case-insensitively. Defaults to `DEFAULT_LOG_LEVEL`; an unknown name
            falls back to it as well.
        log_file (Path | str): File the log lines are appended to besides
            stdout. Defaults to `DEFAULT_LOG_FILE`.

    Returns:
        None
    """

    streams: list[TextIO] = [sys.stdout]
    opened = open_log_file(Path(log_file))
    if opened is not None:
        streams.append(opened)

    level = logging.getLevelNamesMapping().get(
        log_level.upper(), logging.getLevelNamesMapping()[DEFAULT_LOG_LEVEL]
    )

    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", key="timestamp"),
            structlog.processors.EventRenamer("message"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.WriteLoggerFactory(file=TeeStream(streams)),
    )


@contextmanager
def injected_environment(environ: Mapping[str, str]) -> Iterator[None]:
    """injected_environment runs a block with `environ` as the process environment.

    The settings module validates the whole ``POSTGRES_*`` contract while it is
    imported, so the import itself has to happen under the environment the
    caller supplied - otherwise a complete `environ` handed to :func:`main` is
    still rejected whenever the ambient process environment is incomplete. The
    previous environment is always restored, so nothing leaks into the rest of
    the process.

    Args:
        environ (Mapping[str, str]): Environment to install for the block.

    Returns:
        Iterator[None]: A single yield, restoring the environment on exit.
    """

    previous = dict(os.environ)
    os.environ.clear()
    os.environ.update(environ)
    try:
        yield
    finally:
        os.environ.clear()
        os.environ.update(previous)


def load_config(environ: Mapping[str, str] | None = None) -> "Config":
    """load_config loads and validates the seeding settings.

    The settings module is imported *here* rather than at module scope: it
    builds its global `CONFIG` instance while it is imported, so importing it
    earlier would raise before `main()` is entered and kill the process with a
    traceback rendering the collected environment. Deferred to this call, the
    same failure is a `ValidationError` `main()` catches and reports by variable
    name.

    Because that import validates the contract, an explicitly supplied `environ`
    is installed *around* it: the injection seam then works in a process that
    carries no `POSTGRES_*` variable at all, and an incomplete `environ` still
    raises where `main()` reports it by name.

    Args:
        environ (Mapping[str, str] | None): Environment the settings are built
            from. Defaults to None, in which case the process environment the
            settings module was imported under is used.

    Returns:
        Config: The validated settings of the seeding component.

    Raises:
        pydantic.ValidationError: If any required variable is unset or invalid.
    """

    if environ is None:
        from src.config import load_config as load_settings

        return load_settings(None)

    with injected_environment(environ):
        from src.config import load_config as load_settings

        return load_settings(environ)


def build_parser(config: Config) -> argparse.ArgumentParser:
    """build_parser builds the CLI, defaulting every argument to the settings.

    The defaults are the validated ``POSTGRES_*`` settings, which is the whole
    of the environment-to-CLI bridge: omitting an argument uses the environment,
    supplying one overrides it. The password is parsed as a `SecretStr` so an
    explicitly supplied value is masked exactly like the environment-sourced one.

    Args:
        config (Config): The validated settings supplying the defaults.

    Returns:
        argparse.ArgumentParser: The parser of the seeding CLI.
    """

    parser = argparse.ArgumentParser(
        prog="seed",
        description=(
            "Seed a migrated database from the JSON fixtures. Connection "
            "arguments default to the POSTGRES_* environment variables."
        ),
    )
    parser.add_argument(
        "--host",
        default=config.POSTGRES_HOST,
        help="Hostname of the PostgreSQL instance. Defaults to POSTGRES_HOST.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=config.POSTGRES_PORT,
        help="Port of the PostgreSQL instance. Defaults to POSTGRES_PORT.",
    )
    parser.add_argument(
        "--user",
        default=config.POSTGRES_USER,
        help="User to connect as. Defaults to POSTGRES_USER.",
    )
    parser.add_argument(
        "--password",
        type=SecretStr,
        default=config.POSTGRES_PASSWORD,
        help="Password of the user. Defaults to POSTGRES_PASSWORD.",
    )
    parser.add_argument(
        "--dbname",
        default=config.POSTGRES_DB,
        help="Name of the database to seed. Defaults to POSTGRES_DB.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help=(
            "Confirm the destructive run. Seeding truncates every seeded table "
            "and installs known development credentials, so it is refused "
            "unless this flag is given."
        ),
    )
    parser.add_argument(
        "--fixtures-dir",
        type=Path,
        default=DEFAULT_FIXTURES_ROOT,
        help="Root directory holding the JSON fixture files.",
    )

    return parser


def destructive_run_allowed(arguments: argparse.Namespace) -> bool:
    """destructive_run_allowed reports whether the run was explicitly opted in.

    Seeding is destructive and unconditional: it truncates every seeded table
    and installs the fixture corpus, whose API keys are published in this
    repository. The image accepts whatever `POSTGRES_HOST`/`POSTGRES_DB` it is
    given, so without an opt-in a mistyped host or a misconfigured job would
    silently wipe a shared database and install known credentials in it. The
    check runs before any fixture is read and before a connection is opened, so
    a refused run touches nothing at all.

    Args:
        arguments (argparse.Namespace): The parsed CLI arguments.

    Returns:
        bool: True when `--yes` was supplied, False otherwise.
    """

    if arguments.yes:
        return True

    LOGGER.error(
        "refusing to seed without --yes; the run would truncate every seeded "
        "table and install known development credentials",
        host=arguments.host,
        port=arguments.port,
        dbname=arguments.dbname,
        opt_in="--yes",
    )

    return False


def plan_seeding(fixtures_root: Path) -> SeedPlan:
    """plan_seeding loads, validates and links the fixtures into a seed plan.

    This is the entire on-disk phase of a run. It performs no database
    interaction, so every fixture failure it can raise happens before a
    connection exists (AC-7).

    Args:
        fixtures_root (Path): Root directory holding the fixture files.

    Returns:
        SeedPlan: The de-duplicated, reference-checked, ordered rows to seed.

    Raises:
        FixtureError: If the fixture tree is missing, incomplete or malformed.
        pydantic.ValidationError: If an aggregate violates its model.
        PersistenceError: If two rows conflict or a reference resolves to no row.
    """

    LOGGER.info("loading fixtures", fixtures_root=str(fixtures_root))
    fixtures = load_fixtures(fixtures_root=fixtures_root)

    aggregates = list(chain.from_iterable(fixtures.domains.values()))
    LOGGER.info(
        "validated fixture aggregates",
        files=len(fixtures.domains),
        aggregates=len(aggregates),
    )

    plan = build_seed_plan(aggregates)
    LOGGER.info(
        "resolved seed plan",
        tables=len(plan.insert_order),
        rows=sum(len(rows) for rows in plan.rows.values()),
    )

    return plan


def open_connection(
    arguments: argparse.Namespace,
    connection_factory: ConnectionFactory,
) -> psycopg.Connection:
    """open_connection opens the connection the seed plan is executed against.

    Auto-commit is disabled so the executor owns the single transaction, and the
    `dict_row` row factory is requested so any row read maps column names to
    values. This is the only place the password is unwrapped, and the log line
    names the host, port, user and database but never the password or a DSN.

    Args:
        arguments (argparse.Namespace): The parsed connection arguments.
        connection_factory (ConnectionFactory): Factory called to open the
            connection, `psycopg.connect` in production.

    Returns:
        psycopg.Connection: The open connection, owned by the caller.

    Raises:
        psycopg.Error: If the database cannot be reached.
    """

    LOGGER.info(
        "opening database connection",
        host=arguments.host,
        port=arguments.port,
        user=arguments.user,
        dbname=arguments.dbname,
    )

    return connection_factory(
        host=arguments.host,
        port=arguments.port,
        user=arguments.user,
        password=arguments.password.get_secret_value(),
        dbname=arguments.dbname,
        autocommit=False,
        row_factory=dict_row,
    )


def seed(arguments: argparse.Namespace, connection_factory: ConnectionFactory) -> int:
    """seed runs the whole pipeline for one set of parsed arguments.

    The order is mandatory: the plan is complete before a connection is opened,
    so a rejected fixture tree never reaches the database.

    Args:
        arguments (argparse.Namespace): The parsed CLI arguments.
        connection_factory (ConnectionFactory): Factory opening the connection.

    Returns:
        int: The number of rows written.

    Raises:
        FixtureError: If the fixture tree is missing, incomplete or malformed.
        pydantic.ValidationError: If an aggregate violates its model.
        PersistenceError: If two rows conflict or a reference resolves to no row.
        psycopg.Error: If the database is unreachable or a statement fails.
    """

    plan = plan_seeding(fixtures_root=arguments.fixtures_dir)

    connection = open_connection(
        arguments=arguments, connection_factory=connection_factory
    )
    try:
        return execute_seed_plan(connection, plan)
    finally:
        connection.close()


def configuration_variables(error: ValidationError) -> list[str]:
    """configuration_variables lists the settings an error names, by name only.

    Only the variable names are extracted: a validation error's rendered message
    can carry the offending input, which for `POSTGRES_PASSWORD` would be the
    password itself.

    Args:
        error (ValidationError): The error raised while loading the settings.

    Returns:
        list[str]: The names of the offending environment variables, sorted.
    """

    return sorted({str(detail["loc"][0]) for detail in error.errors() if detail["loc"]})


def main(
    argv: Sequence[str] | None = None,
    connection_factory: ConnectionFactory = psycopg.connect,
    environ: Mapping[str, str] | None = None,
) -> int:
    """main runs the seeding CLI and returns the process exit code.

    Logging is configured twice on purpose: once with the defaults before the
    settings are read, so that an invalid configuration is itself reported as a
    JSON line, and once more with `LOG_LEVEL` / `LOG_FILE` as soon as the
    settings are known.

    Args:
        argv (Sequence[str] | None): Command-line arguments. Defaults to None,
            in which case `sys.argv` is used.
        connection_factory (ConnectionFactory): Factory opening the database
            connection. Defaults to `psycopg.connect`; the test suite injects a
            recording fake.
        environ (Mapping[str, str] | None): Environment supplying the argument
            defaults. Defaults to None, in which case the process environment is
            used.

    Returns:
        int: Zero when the database was seeded, non-zero on any failure.
    """

    configure_logging()

    try:
        config = load_config(environ)
    except ValidationError as error:
        LOGGER.error(
            "invalid seeding configuration",
            variables=configuration_variables(error),
        )
        return EXIT_FAILURE

    configure_logging(log_level=config.LOG_LEVEL, log_file=config.LOG_FILE)

    arguments = build_parser(config).parse_args(argv)

    if not destructive_run_allowed(arguments):
        return EXIT_FAILURE

    try:
        written = seed(arguments, connection_factory=connection_factory)
    except (FixtureError, ValidationError) as error:
        LOGGER.error(
            "invalid fixtures; nothing was written",
            error_type=type(error).__name__,
            error=str(error),
        )
        return EXIT_FAILURE
    except PersistenceError as error:
        LOGGER.error(
            "fixtures could not be linked; nothing was written",
            error_type=type(error).__name__,
            error=str(error),
        )
        return EXIT_FAILURE
    except psycopg.Error as error:
        LOGGER.error(
            "database seeding failed; the transaction was not committed",
            error_type=type(error).__name__,
            error=str(error),
        )
        return EXIT_FAILURE

    LOGGER.info("seeding completed", dbname=arguments.dbname, rows=written)
    return EXIT_SUCCESS


def run() -> Any:
    """run executes the CLI and terminates the process with its exit code.

    Returns:
        Any: Never returns; `SystemExit` carries the exit code.
    """

    return sys.exit(main())


if __name__ == "__main__":
    run()
