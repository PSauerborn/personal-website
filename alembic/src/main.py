"""Entrypoint of the alembic migration container.

The wrapper reads the ``ALEMBIC_COMMAND`` / ``ALEMBIC_REVISION`` contract through
``src.config`` and drives alembic programmatically against ``alembic.ini``. Any
failure - a missing or invalid environment variable, an unknown revision, or an
unreachable database - is reported as a structured log line and turns into a
non-zero exit code, so the migration job never reports success on a database that
was not migrated.

Logging is configured by :func:`configure_logging`, which renders every event as
a JSON object carrying ``message``, ``timestamp`` and ``level``, writes it to
stdout and appends it to ``LOG_FILE``; ``LOG_LEVEL`` sets the verbosity. It runs
as the first statement of :func:`main`, with the defaults, so an invalid
configuration is itself reported as a structured line, and is re-applied with the
configured level and file as soon as the settings are known.

Nothing rendered by this module may expose the configured credentials: the
settings object, the connection URL, and raw exception payloads are never logged
verbatim. Exception messages are passed through a redaction step before they
reach a log line.
"""

import logging
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Callable, List, Sequence, TextIO
from urllib.parse import quote, quote_plus

import structlog
from alembic import command
from alembic.config import Config as AlembicConfig
from pydantic import ValidationError

if TYPE_CHECKING:  # pragma: no cover - import used for type checking only
    from src.config import MigrationConfig

# The component root (the parent of this src directory) holds alembic.ini and
# the migrations directory, and is placed on sys.path so that ``src.config``
# resolves regardless of the working directory the wrapper is started from.
COMPONENT_ROOT = Path(__file__).resolve().parents[1]
if str(COMPONENT_ROOT) not in sys.path:
    sys.path.insert(0, str(COMPONENT_ROOT))

ALEMBIC_INI = COMPONENT_ROOT / "alembic.ini"
MIGRATIONS_DIRECTORY = COMPONENT_ROOT / "migrations"

REDACTED = "***"

# Defaults of the logging settings. They are repeated here rather than imported
# from ``src.config``, because importing that module validates the whole settings
# contract at import time and would make the error handler of ``main`` - which
# reports an invalid configuration as a log line - unreachable. The values must
# stay identical to the ``DEFAULT_LOG_*`` constants of ``src.config``.
DEFAULT_LOG_LEVEL = "INFO"
DEFAULT_LOG_FILE = "/app/logs/migrations.log"

LOGGER = structlog.get_logger()


class TeeStream:
    """TeeStream fans one rendered log line out to several writable streams.

    This is what puts the log lines on stdout *and* into a log file without a
    second rendering pass: ``structlog.WriteLoggerFactory`` writes to a single
    file object, and this is that object.

    Attributes:
        streams: The streams every write is fanned out to.
    """

    def __init__(self, streams: Sequence[TextIO]) -> None:
        """__init__ stores the streams the log lines are written to.

        Args:
            streams: The streams to fan writes out to.

        Returns:
            None.
        """

        self.streams: tuple[TextIO, ...] = tuple(streams)

    def write(self, data: str) -> int:
        """write writes one rendered log line to every stream.

        Args:
            data: The rendered log line.

        Returns:
            The number of characters written.
        """

        for stream in self.streams:
            stream.write(data)

        return len(data)

    def flush(self) -> None:
        """flush flushes every stream, so a crash cannot lose the last line.

        Returns:
            None.
        """

        for stream in self.streams:
            stream.flush()


def open_log_file(log_file: Path) -> TextIO | None:
    """open_log_file opens the log file the log lines are appended to.

    A container whose log directory cannot be created or written must still log
    on stdout rather than die before its first line, so every filesystem error
    degrades to "stdout only" instead of propagating.

    Args:
        log_file: Path of the log file to append to.

    Returns:
        The open file, or ``None`` if it could not be opened.
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

    Every log line carries the ``message``, ``timestamp`` and ``level`` fields
    required of structured logs; contextual values are emitted as dedicated
    fields rather than being interpolated into the message. The lines are
    written to stdout, which the platform collects, and appended to ``log_file``
    so recent logs remain inspectable inside the container.

    Args:
        log_level: Name of the lowest level that is emitted, matched
            case-insensitively. Defaults to ``DEFAULT_LOG_LEVEL``; an unknown
            name falls back to it as well.
        log_file: File the log lines are appended to besides stdout. Defaults to
            ``DEFAULT_LOG_FILE``.

    Returns:
        None.
    """

    streams: List[TextIO] = [sys.stdout]
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


def load_config() -> "MigrationConfig":
    """load_config loads and validates the migration settings.

    Importing the settings module validates the ``LOG_*`` / ``POSTGRES_*`` half of
    the contract, and constructing ``MigrationConfig`` adds the ``ALEMBIC_*`` half
    the entrypoint requires. Either half failing surfaces here as a
    ``ValidationError`` before any migration work is attempted, which is what
    REQ-1.4 asks of this wrapper.

    Returns:
        Validated settings of the migration component.

    Raises:
        ValidationError: If any required variable is unset or invalid.
    """

    from src.config import MigrationConfig

    return MigrationConfig()


def format_validation_errors(error: ValidationError) -> List[str]:
    """format_validation_errors renders a settings validation error safely.

    Only the offending variable name and pydantic's reason are kept: the raw
    error carries the submitted input, which for a missing variable includes the
    full environment payload and therefore the configured password.

    Args:
        error: Validation error raised while loading the settings.

    Returns:
        One ``<VARIABLE>: <reason>`` entry per invalid or missing variable.
    """

    return [
        f"{'.'.join(str(part) for part in detail['loc'])}: {detail['msg']}"
        for detail in error.errors()
    ]


def secret_renderings(secret: str) -> List[str]:
    """secret_renderings lists every form the secret can appear in, longest first.

    ``src.config.postgres_connection_url`` renders the DSN with
    ``render_as_string(hide_password=False)``, which percent-encodes the
    password: a driver or SQLAlchemy error echoing that DSN carries the secret
    in an encoded form rather than verbatim. Every encoding SQLAlchemy and the
    driver can produce is covered alongside the raw value:

    * ``quote(safe=" +")`` - what ``render_as_string`` itself emits, leaving a
      space and a ``+`` literal while encoding everything else, and therefore
      the form the DSN in an error message actually carries.
    * ``quote_plus`` - space as ``+``, ``+`` as ``%2B``.
    * ``quote(safe="")`` - space as ``%20``, ``+`` as ``%2B``.

    The renderings are ordered longest first, so that a rendering which contains
    a shorter one as a prefix is replaced before the shorter one can break it up
    and leave the remainder in the message.

    Args:
        secret: Secret value that must never be rendered.

    Returns:
        The distinct renderings of the secret, longest first.
    """

    renderings = {
        secret,
        quote(secret, safe=" +"),
        quote_plus(secret),
        quote(secret, safe=""),
    }
    return sorted(renderings, key=len, reverse=True)


def redact(message: str, secret: str) -> str:
    """redact removes the configured password from a message.

    Every rendering of the secret is removed, not just the raw value, because
    the message may embed the percent-encoded DSN (RISK-015).

    Args:
        message: Message about to be logged.
        secret: Secret value that must never be rendered.

    Returns:
        The message with every rendering of the secret replaced.

    Examples:
        A password containing ``@``, ``/``, ``%`` and a space is removed in its
        raw form and in both of its percent-encoded forms:

        >>> secret = "p@ss /w%rd"  # pragma: allowlist secret
        >>> dsn = "postgresql+psycopg://user:p%40ss+%2Fw%25rd@db:5432/portfolio"
        >>> redact(dsn, secret)
        'postgresql+psycopg://user:***@db:5432/portfolio'
        >>> redact("could not parse p%40ss%20%2Fw%25rd", secret)
        'could not parse ***'
        >>> redact("could not parse p@ss /w%rd", secret)
        'could not parse ***'

        The DSN ``src.config.postgres_connection_url`` actually produces is
        redacted too - SQLAlchemy leaves a space and a ``+`` literal while
        encoding everything else, so a base64-generated password carrying
        ``+`` and ``/`` and a password carrying a space are both removed:

        >>> from sqlalchemy.engine.url import URL
        >>> def dsn_for(password):
        ...     return URL.create(
        ...         drivername="postgresql+psycopg",
        ...         username="user",
        ...         password=password,
        ...         host="db",
        ...         port=5432,
        ...         database="portfolio",
        ...     ).render_as_string(hide_password=False)
        >>> secret = "xY+9/abc="  # pragma: allowlist secret
        >>> dsn_for(secret)
        'postgresql+psycopg://user:xY+9%2Fabc%3D@db:5432/portfolio'
        >>> redact(dsn_for(secret), secret)
        'postgresql+psycopg://user:***@db:5432/portfolio'
        >>> secret = "p@ss+/w%rd 1"  # pragma: allowlist secret
        >>> dsn_for(secret)
        'postgresql+psycopg://user:p%40ss+%2Fw%25rd 1@db:5432/portfolio'
        >>> redact(dsn_for(secret), secret)
        'postgresql+psycopg://user:***@db:5432/portfolio'
    """

    if not secret:
        return message

    for rendering in secret_renderings(secret):
        message = message.replace(rendering, REDACTED)

    return message


def build_alembic_config() -> AlembicConfig:
    """build_alembic_config loads alembic.ini with absolute paths.

    The script location is pinned to the component's ``migrations`` directory so
    that the wrapper behaves identically regardless of the working directory.

    Returns:
        Alembic configuration for this component.
    """

    alembic_config = AlembicConfig(str(ALEMBIC_INI))
    alembic_config.set_main_option("script_location", str(MIGRATIONS_DIRECTORY))
    return alembic_config


def run_migration(config: "MigrationConfig") -> None:
    """run_migration runs the configured alembic command.

    Args:
        config: Validated settings of the migration component.

    Returns:
        None.

    Raises:
        Exception: Any error raised by alembic while running the migration.
    """

    commands: dict[str, Callable[[AlembicConfig, str], None]] = {
        "upgrade": command.upgrade,
        "downgrade": command.downgrade,
    }

    commands[config.ALEMBIC_COMMAND](build_alembic_config(), config.ALEMBIC_REVISION)


def main() -> int:
    """main runs the configured migration and reports the process exit code.

    Returns:
        ``0`` if the migration succeeded, ``1`` if the settings are invalid or
        alembic failed.
    """

    configure_logging()
    LOGGER.info("Starting database migration")

    try:
        config = load_config()
    except ValidationError as error:
        LOGGER.error(
            "Invalid migration configuration",
            errors=format_validation_errors(error),
        )
        return 1

    configure_logging(log_level=config.LOG_LEVEL, log_file=config.LOG_FILE)

    LOGGER.info(
        "Loaded migration configuration",
        alembic_command=config.ALEMBIC_COMMAND,
        alembic_revision=config.ALEMBIC_REVISION,
        postgres_host=config.POSTGRES_HOST,
        postgres_port=config.POSTGRES_PORT,
        postgres_db=config.POSTGRES_DB,
    )

    try:
        run_migration(config)
    except Exception as error:
        LOGGER.error(
            "Database migration failed",
            alembic_command=config.ALEMBIC_COMMAND,
            alembic_revision=config.ALEMBIC_REVISION,
            error_type=type(error).__name__,
            error=redact(str(error), config.POSTGRES_PASSWORD.get_secret_value()),
        )
        return 1

    LOGGER.info(
        "Database migration completed",
        alembic_command=config.ALEMBIC_COMMAND,
        alembic_revision=config.ALEMBIC_REVISION,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
