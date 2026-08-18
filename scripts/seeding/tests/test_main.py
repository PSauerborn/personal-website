"""Unit tests for the seeding CLI entrypoint.

NO-SERVER RULE: every test here drives `src.main` with a call-recording
connection factory built on the fake connection of `conftest.py`. No PostgreSQL
server is started or contacted, and no `pytest-postgresql` fixture is requested.

The suite exists mainly to pin the pipeline **order** (REQ-2.2, AC-7,
RISK-006): fixtures are loaded, validated and linked before a connection can be
created, so every failing path asserts that the connection factory was never
called - the only way to prove that a rejected fixture set cannot reach the
database.

`src.config` builds its global settings instance at import time, and `src.main`
imports that module from *inside* its functions rather than at module scope -
that deferred import is what keeps `main()`'s configuration error handler
reachable, and it is pinned by
`test_main_imports_without_the_settings_environment`. The modules under test are
imported through `importlib` inside a fixture that has placed a valid
environment in `os.environ`, exactly as in `test_config.py`. The one case an
in-process import cannot express, a required variable missing at *process*
start, is covered by `run_cli_process` at the end of this module.
"""

from __future__ import annotations

import importlib
import json
import os
import subprocess
import sys
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from types import ModuleType
from typing import Any, Callable, Iterator

import psycopg
import pytest
import structlog
from psycopg.rows import dict_row
from structlog.testing import capture_logs

SEEDING_ROOT: Path = Path(__file__).resolve().parent.parent

if str(SEEDING_ROOT) not in sys.path:
    sys.path.insert(0, str(SEEDING_ROOT))

MAIN_MODULE: str = "src.main"
CONFIG_MODULE: str = "src.config"

# Catalogue files the tests write aggregates into. Every other file of
# `DOMAIN_FIXTURE_MODELS` is written as an empty array, since discovery requires
# the whole catalogue to be present.
CONTACTS_FILE: str = "contacts.json"
SKILLS_FILE: str = "cv_skills.json"

# Environment supplying the argparse defaults. The password is deliberately
# distinctive, so that a log line or error message leaking it is unmistakable.
PASSWORD: str = "sup3r-s3cret-fixture-p4ssword"

ENVIRONMENT: dict[str, str] = {
    "POSTGRES_HOST": "postgres.internal",
    "POSTGRES_PORT": "6543",
    "POSTGRES_USER": "seeder",
    "POSTGRES_PASSWORD": PASSWORD,
    "POSTGRES_DB": "portfolio",
}

CONTACT_ID: str = "0192f1e2d3c47a1b8c0d1e2f3a4b5c6d"
CATEGORY_ID: str = "0192f1e2d3c47a1b8c0d1e2f3a4b5c7e"
LINK_ID: str = "0192f1e2d3c47a1b8c0d1e2f3a4b5c8f"
UNKNOWN_STACK_ITEM_ID: str = "0192f1e2d3c47a1b8c0d1e2f3a4b5c90"

CONTACT_AGGREGATE: dict[str, Any] = {
    "id": CONTACT_ID,
    "name": "Ada Lovelace",
    "email": "ada@example.com",
}

# A contact missing its required `email`, rejected by `ContactFixture`.
INVALID_CONTACT_AGGREGATE: dict[str, Any] = {"id": CONTACT_ID, "name": "Ada Lovelace"}

# A skill category linking a stack item that no `cv_experience.json` aggregate
# defines, so reference resolution fails while the run is still purely on-disk.
DANGLING_CATEGORY_AGGREGATE: dict[str, Any] = {
    "id": CATEGORY_ID,
    "category": "Languages",
    "stack_items": [{"id": LINK_ID, "stack_item_id": UNKNOWN_STACK_ITEM_ID}],
}


@dataclass
class RecordingConnectionFactory:
    """RecordingConnectionFactory stands in for `psycopg.connect`.

    It records the keyword arguments of every call, so a test can assert both
    that a connection was configured correctly and - on the failing paths - that
    no connection was ever requested.

    Attributes:
        connection (Any): The fake connection handed to the caller.
        error (Exception | None): Error raised instead of returning a
            connection, used to simulate an unreachable database.
        calls (list[dict[str, Any]]): The keyword arguments of every call, in
            order.
    """

    connection: Any
    error: Exception | None = None
    calls: list[dict[str, Any]] = field(default_factory=list)

    def __call__(self, **kwargs: Any) -> Any:
        """__call__ records a connection request and returns the fake.

        Args:
            **kwargs (Any): The connection parameters the CLI passed.

        Returns:
            Any: The fake connection.

        Raises:
            Exception: The configured error, when one was set.
        """

        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error

        return self.connection

    @property
    def call_count(self) -> int:
        """call_count returns the number of connection requests recorded.

        Returns:
            int: The count of calls made to the factory.
        """

        return len(self.calls)


@pytest.fixture
def seeding(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    """seeding imports the CLI module with a valid environment in place.

    Args:
        monkeypatch (pytest.MonkeyPatch): Fixture setting the environment the
            settings are validated against at import time.

    Returns:
        ModuleType: The imported `src.main` module.
    """

    for name, value in ENVIRONMENT.items():
        monkeypatch.setenv(name, value)

    return importlib.import_module(MAIN_MODULE)


@pytest.fixture(autouse=True)
def structlog_defaults() -> Iterator[None]:
    """structlog_defaults restores structlog's defaults after every test.

    `configure_logging` - called by the tests directly and by `main` - mutates
    structlog's global configuration, which would otherwise leak the JSON
    renderer and the configured level into every later test in the session.

    Returns:
        Iterator[None]: A single yield, resetting the configuration on teardown.
    """

    yield
    structlog.reset_defaults()


@contextmanager
def capture_main_logs(seeding: ModuleType) -> Iterator[list[dict[str, Any]]]:
    """capture_main_logs captures the events one `main` call emits.

    `main` configures structlog itself, which would replace the capturing
    processor `capture_logs` installs; the configuration step is therefore
    neutralised for the duration of the capture. What it does is covered
    separately, by the `configure_logging` tests and by the process-level test
    at the end of this module.

    Args:
        seeding (ModuleType): The imported CLI module.

    Returns:
        Iterator[list[dict[str, Any]]]: The captured events, filled while the
            context is active.
    """

    configure_logging = seeding.configure_logging
    seeding.configure_logging = lambda *args, **kwargs: None
    try:
        with capture_logs() as events:
            yield events
    finally:
        seeding.configure_logging = configure_logging


def rendered_events(output: str) -> list[dict[str, Any]]:
    """rendered_events parses the JSON log lines of a captured stream.

    Args:
        output (str): The captured standard output or log file contents.

    Returns:
        list[dict[str, Any]]: One decoded event per non-empty line, in order.
    """

    return [json.loads(line) for line in output.splitlines() if line.strip()]


@pytest.fixture
def connection_factory(fake_connection: Any) -> RecordingConnectionFactory:
    """connection_factory provides a call-recording fake connection factory.

    Args:
        fake_connection (Any): The offline connection built by `conftest`.

    Returns:
        RecordingConnectionFactory: The factory injected into `main`.
    """

    return RecordingConnectionFactory(connection=fake_connection)


def load_settings() -> Any:
    """load_settings builds the settings the argparse defaults come from.

    Returns:
        Any: A `Config` built from the module's valid environment.
    """

    return importlib.import_module(CONFIG_MODULE).load_config(ENVIRONMENT)


def error_types(events: list[dict[str, Any]]) -> list[str]:
    """error_types lists the exception types the captured error events name.

    Args:
        events (list[dict[str, Any]]): The events captured by `capture_logs`.

    Returns:
        list[str]: The `error_type` of every error-level event, in order.
    """

    return [
        event["error_type"]
        for event in events
        if event["log_level"] == "error" and "error_type" in event
    ]


def write_catalogue(root: Path, payloads: dict[str, Any] | None = None) -> Path:
    """write_catalogue writes a complete fixture catalogue into a directory.

    Every catalogue file is written - holding the supplied payload where one is
    given and an empty array otherwise - so that discovery succeeds while a test
    exercises a single file.

    Args:
        root (Path): Directory the catalogue is written into.
        payloads (dict[str, Any] | None): Payload per catalogue file name.

    Returns:
        Path: The directory the catalogue was written into.
    """

    supplied = payloads or {}
    catalogue = importlib.import_module("src.models").DOMAIN_FIXTURE_MODELS
    for file_name in catalogue:
        (root / file_name).write_text(
            json.dumps(supplied.get(file_name, [])), encoding="utf-8"
        )

    return root


def run_main(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: Callable[..., Any],
    environment: dict[str, str] | None = None,
    opt_in: bool = True,
) -> int:
    """run_main invokes the CLI against a fixture root with no connection flags.

    Seeding is destructive, so the CLI refuses to run without the `--yes`
    opt-in; it is passed by default here, and omitted by the tests that pin the
    refusal itself.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Root the fixtures are loaded from.
        connection_factory (Callable[..., Any]): Factory injected in place of
            `psycopg.connect`.
        environment (dict[str, str] | None): Environment supplying the argparse
            defaults. Defaults to the module's valid environment.
        opt_in (bool): Whether the destructive-run opt-in is supplied. Defaults
            to True.

    Returns:
        int: The exit code returned by `main`.
    """

    argv = ["--fixtures-dir", str(fixtures_root)] + (["--yes"] if opt_in else [])

    return seeding.main(
        argv=argv,
        connection_factory=connection_factory,
        environ=ENVIRONMENT if environment is None else environment,
    )


def test_main_imports_without_the_settings_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """test_main_imports_without_the_settings_environment pins the import shape.

    `src.config` validates the whole contract when it is imported, so importing
    it at the module scope of the CLI would raise before `main()` is entered -
    making the error handler that reports a missing variable by name
    unreachable, and killing the process with a traceback rendering the
    collected environment, password included. The CLI therefore imports the
    settings module from inside its functions, and must import cleanly with no
    `POSTGRES_*` variable set at all.

    Args:
        monkeypatch (pytest.MonkeyPatch): Fixture clearing the environment and
            the cached modules, both restored on teardown.

    Returns:
        None
    """

    for name in ENVIRONMENT:
        monkeypatch.delenv(name, raising=False)

    for module_name in (MAIN_MODULE, CONFIG_MODULE):
        monkeypatch.delitem(sys.modules, module_name, raising=False)

    module = importlib.import_module(MAIN_MODULE)

    assert callable(module.main)
    assert CONFIG_MODULE not in sys.modules


def test_main_uses_the_supplied_environment_when_the_process_has_none(
    monkeypatch: pytest.MonkeyPatch,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_uses_the_supplied_environment_when_the_process_has_none checks it.

    The `environ` argument is an injection seam: a caller that supplies a
    complete environment must be able to drive the CLI in a process where no
    `POSTGRES_*` variable is set at all. That only holds if the deferred import
    of the settings module happens *under* the supplied environment - the module
    validates the whole contract while it is imported, so importing it under the
    bare process environment would fail even though the caller handed over a
    complete one.

    Args:
        monkeypatch (pytest.MonkeyPatch): Fixture clearing the environment and
            the cached modules, both restored on teardown.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    for name in ENVIRONMENT:
        monkeypatch.delenv(name, raising=False)

    for module_name in (MAIN_MODULE, CONFIG_MODULE):
        monkeypatch.delitem(sys.modules, module_name, raising=False)

    seeding = importlib.import_module(MAIN_MODULE)
    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    assert run_main(seeding, fixtures_root, connection_factory) == 0

    assert connection_factory.call_count == 1
    assert connection_factory.calls[0]["host"] == ENVIRONMENT["POSTGRES_HOST"]
    assert connection_factory.calls[0]["dbname"] == ENVIRONMENT["POSTGRES_DB"]


def test_build_parser_defaults_come_from_the_configuration(
    seeding: ModuleType,
) -> None:
    """test_build_parser_defaults_come_from_the_configuration checks defaults.

    Args:
        seeding (ModuleType): The imported CLI module.

    Returns:
        None
    """

    arguments = seeding.build_parser(load_settings()).parse_args([])

    assert arguments.host == "postgres.internal"
    assert arguments.port == 6543
    assert arguments.user == "seeder"
    assert arguments.dbname == "portfolio"
    assert arguments.password.get_secret_value() == PASSWORD
    assert (
        arguments.fixtures_dir
        == importlib.import_module("src.fixtures").DEFAULT_FIXTURES_ROOT
    )


def test_build_parser_arguments_override_the_defaults(seeding: ModuleType) -> None:
    """test_build_parser_arguments_override_the_defaults checks CLI precedence.

    Args:
        seeding (ModuleType): The imported CLI module.

    Returns:
        None
    """

    arguments = seeding.build_parser(load_settings()).parse_args(
        [
            "--host",
            "localhost",
            "--port",
            "5432",
            "--user",
            "override-user",
            "--password",
            "override-password",
            "--dbname",
            "override-db",
            "--fixtures-dir",
            "/tmp/fixtures",
        ]
    )

    assert arguments.host == "localhost"
    assert arguments.port == 5432
    assert arguments.user == "override-user"
    assert arguments.dbname == "override-db"
    assert arguments.password.get_secret_value() == "override-password"
    assert arguments.fixtures_dir == Path("/tmp/fixtures")


def test_build_parser_masks_the_password(seeding: ModuleType) -> None:
    """test_build_parser_masks_the_password checks that the namespace hides it.

    Args:
        seeding (ModuleType): The imported CLI module.

    Returns:
        None
    """

    arguments = seeding.build_parser(load_settings()).parse_args([])

    assert PASSWORD not in repr(arguments)


def test_build_parser_defaults_the_destructive_opt_in_to_off(
    seeding: ModuleType,
) -> None:
    """test_build_parser_defaults_the_destructive_opt_in_to_off checks SEC-001.

    Args:
        seeding (ModuleType): The imported CLI module.

    Returns:
        None
    """

    parser = seeding.build_parser(load_settings())

    assert parser.parse_args([]).yes is False
    assert parser.parse_args(["--yes"]).yes is True


def test_main_refuses_a_destructive_run_without_the_opt_in(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
    call_recorder: Any,
) -> None:
    """test_main_refuses_a_destructive_run_without_the_opt_in checks SEC-001.

    Seeding truncates every seeded table and installs known development
    credentials, so a run without the opt-in must refuse before a connection is
    ever requested.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.
        call_recorder (Any): Recorder shared by the fake connection.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    with capture_main_logs(seeding):
        exit_code = run_main(seeding, fixtures_root, connection_factory, opt_in=False)

    assert exit_code != 0
    assert connection_factory.call_count == 0
    assert call_recorder.calls == []


def test_main_refusal_names_the_target_host_and_database(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_refusal_names_the_target_host_and_database checks the log line.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    with capture_main_logs(seeding) as events:
        assert run_main(seeding, fixtures_root, connection_factory, opt_in=False) != 0

    errors = [event for event in events if event["log_level"] == "error"]

    assert len(errors) == 1
    assert errors[0]["host"] == "postgres.internal"
    assert errors[0]["dbname"] == "portfolio"
    assert PASSWORD not in repr(events)


def test_main_seeds_with_the_destructive_opt_in(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_seeds_with_the_destructive_opt_in checks the opt-in path.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    assert run_main(seeding, fixtures_root, connection_factory, opt_in=True) == 0
    assert connection_factory.call_count == 1


def test_main_seeds_the_planned_rows(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
    call_recorder: Any,
) -> None:
    """test_main_seeds_the_planned_rows checks the happy path end to end.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.
        call_recorder (Any): Recorder shared by the fake connection.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    assert run_main(seeding, fixtures_root, connection_factory) == 0

    assert connection_factory.call_count == 1
    assert "TRUNCATE TABLE base.contact CASCADE" in call_recorder.statements
    assert (
        "INSERT INTO base.contact (id, name, email, organization) "
        "VALUES (%s, %s, %s, %s)"
    ) in call_recorder.statements
    assert [
        (CONTACT_ID, "Ada Lovelace", "ada@example.com", None)
    ] in call_recorder.parameters
    assert call_recorder.commit_count == 1


def test_main_opens_the_connection_with_dict_row_and_no_autocommit(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_opens_the_connection_with_dict_row_and_no_autocommit checks it.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    assert run_main(seeding, fixtures_root, connection_factory) == 0

    assert connection_factory.calls == [
        {
            "host": "postgres.internal",
            "port": 6543,
            "user": "seeder",
            "password": PASSWORD,
            "dbname": "portfolio",
            "autocommit": False,
            "row_factory": dict_row,
        }
    ]


def test_main_closes_the_connection(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
    fake_connection: Any,
) -> None:
    """test_main_closes_the_connection checks the connection lifetime.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.
        fake_connection (Any): The connection the factory hands out.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    assert run_main(seeding, fixtures_root, connection_factory) == 0
    assert fake_connection.closed


def test_main_rejects_an_invalid_fixture_without_connecting(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
    call_recorder: Any,
) -> None:
    """test_main_rejects_an_invalid_fixture_without_connecting checks AC-7.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.
        call_recorder (Any): Recorder shared by the fake connection.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [INVALID_CONTACT_AGGREGATE]})

    with capture_main_logs(seeding) as events:
        assert run_main(seeding, fixtures_root, connection_factory) != 0

    assert connection_factory.call_count == 0
    assert call_recorder.calls == []
    assert error_types(events) == ["ValidationError"]


def test_main_rejects_a_missing_fixture_file_without_connecting(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_rejects_a_missing_fixture_file_without_connecting checks AC-7.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root)
    (fixtures_root / CONTACTS_FILE).unlink()

    with capture_main_logs(seeding) as events:
        assert run_main(seeding, fixtures_root, connection_factory) != 0

    assert connection_factory.call_count == 0
    assert error_types(events) == ["MissingFixtureFileError"]


def test_main_rejects_an_unresolved_reference_without_connecting(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_rejects_an_unresolved_reference_without_connecting checks AC-7.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {SKILLS_FILE: [DANGLING_CATEGORY_AGGREGATE]})

    with capture_main_logs(seeding) as events:
        assert run_main(seeding, fixtures_root, connection_factory) != 0

    assert connection_factory.call_count == 0
    assert error_types(events) == ["UnresolvedReferenceError"]


def test_main_reports_an_unreachable_database(
    seeding: ModuleType,
    fixtures_root: Path,
    fake_connection: Any,
    call_recorder: Any,
) -> None:
    """test_main_reports_an_unreachable_database checks the connection failure.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        fake_connection (Any): The connection the factory would hand out.
        call_recorder (Any): Recorder shared by the fake connection.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})
    factory = RecordingConnectionFactory(
        connection=fake_connection, error=psycopg.OperationalError("connection refused")
    )

    assert run_main(seeding, fixtures_root, factory) != 0

    assert factory.call_count == 1
    assert call_recorder.commit_count == 0


def test_main_reports_a_failing_execution_without_committing(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
    call_recorder: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """test_main_reports_a_failing_execution_without_committing checks failure.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.
        call_recorder (Any): Recorder shared by the fake connection.
        monkeypatch (pytest.MonkeyPatch): Fixture replacing the executor.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    def _fail(connection: Any, plan: Any) -> int:
        """_fail raises as a failing statement would.

        Args:
            connection (Any): The open connection.
            plan (Any): The plan being executed.

        Returns:
            int: Never returns.

        Raises:
            psycopg.errors.UndefinedTable: Always.
        """

        raise psycopg.errors.UndefinedTable('relation "base.contact" does not exist')

    monkeypatch.setattr(seeding, "execute_seed_plan", _fail)

    assert run_main(seeding, fixtures_root, connection_factory) != 0

    assert connection_factory.call_count == 1
    assert call_recorder.commit_count == 0


def test_main_rejects_an_invalid_configuration_without_connecting(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_rejects_an_invalid_configuration_without_connecting checks it.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})
    environment = {
        name: value for name, value in ENVIRONMENT.items() if name != "POSTGRES_HOST"
    }

    exit_code = run_main(
        seeding, fixtures_root, connection_factory, environment=environment
    )

    assert exit_code != 0
    assert connection_factory.call_count == 0


def test_main_logs_an_error_naming_the_missing_variable(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_logs_an_error_naming_the_missing_variable checks the log line.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})
    environment = {
        name: value for name, value in ENVIRONMENT.items() if name != "POSTGRES_HOST"
    }

    with capture_main_logs(seeding) as events:
        exit_code = run_main(
            seeding, fixtures_root, connection_factory, environment=environment
        )

    assert exit_code != 0
    errors = [event for event in events if event["log_level"] == "error"]
    assert errors
    assert any("POSTGRES_HOST" in repr(event) for event in errors)
    assert PASSWORD not in repr(events)


def test_main_logs_an_error_for_an_invalid_fixture(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_logs_an_error_for_an_invalid_fixture checks the log line.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [INVALID_CONTACT_AGGREGATE]})

    with capture_main_logs(seeding) as events:
        assert run_main(seeding, fixtures_root, connection_factory) != 0

    assert any(event["log_level"] == "error" for event in events)


def test_main_never_logs_the_password_on_the_happy_path(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
) -> None:
    """test_main_never_logs_the_password_on_the_happy_path checks RISK-015.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})

    with capture_main_logs(seeding) as events:
        assert run_main(seeding, fixtures_root, connection_factory) == 0

    assert events
    assert PASSWORD not in repr(events)


def test_main_never_logs_the_password_on_a_failing_path(
    seeding: ModuleType,
    fixtures_root: Path,
    fake_connection: Any,
) -> None:
    """test_main_never_logs_the_password_on_a_failing_path checks RISK-015.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        fake_connection (Any): The connection the factory would hand out.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})
    factory = RecordingConnectionFactory(
        connection=fake_connection, error=psycopg.OperationalError("connection refused")
    )

    with capture_main_logs(seeding) as events:
        assert run_main(seeding, fixtures_root, factory) != 0

    assert any(event["log_level"] == "error" for event in events)
    assert PASSWORD not in repr(events)


def test_configure_logging_renders_json_events(
    seeding: ModuleType,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """test_configure_logging_renders_json_events checks the log structure.

    Every rendered line must be valid JSON carrying `message`, `timestamp` and
    `level`, with contextual values in dedicated fields rather than interpolated
    into the message.

    Args:
        seeding (ModuleType): The imported CLI module.
        tmp_path (Path): Directory the log file is written into.
        capsys (pytest.CaptureFixture[str]): Fixture capturing standard output.

    Returns:
        None
    """

    seeding.configure_logging(log_file=tmp_path / "seeding.log")
    structlog.get_logger().info("seeding completed", dbname="portfolio", rows=3)

    events = rendered_events(capsys.readouterr().out)

    assert len(events) == 1
    assert events[0]["message"] == "seeding completed"
    assert events[0]["level"] == "info"
    assert events[0]["dbname"] == "portfolio"
    assert events[0]["rows"] == 3
    assert datetime.fromisoformat(events[0]["timestamp"])


def test_configure_logging_applies_the_configured_level(
    seeding: ModuleType,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """test_configure_logging_applies_the_configured_level checks the filtering.

    Args:
        seeding (ModuleType): The imported CLI module.
        tmp_path (Path): Directory the log file is written into.
        capsys (pytest.CaptureFixture[str]): Fixture capturing standard output.

    Returns:
        None
    """

    seeding.configure_logging(log_level="warning", log_file=tmp_path / "seeding.log")
    logger = structlog.get_logger()
    logger.info("dropped by the configured level")
    logger.warning("kept by the configured level")

    events = rendered_events(capsys.readouterr().out)

    assert [event["message"] for event in events] == ["kept by the configured level"]


def test_configure_logging_writes_to_stdout_and_the_log_file(
    seeding: ModuleType,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """test_configure_logging_writes_to_stdout_and_the_log_file checks both sinks.

    Args:
        seeding (ModuleType): The imported CLI module.
        tmp_path (Path): Directory the log file is written into.
        capsys (pytest.CaptureFixture[str]): Fixture capturing standard output.

    Returns:
        None
    """

    log_file = tmp_path / "logs" / "seeding.log"

    seeding.configure_logging(log_file=log_file)
    structlog.get_logger().info("seeding completed", rows=3)

    stdout_events = rendered_events(capsys.readouterr().out)

    assert log_file.exists()
    assert rendered_events(log_file.read_text(encoding="utf-8")) == stdout_events


def test_configure_logging_survives_an_unwritable_log_file(
    seeding: ModuleType,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """test_configure_logging_survives_an_unwritable_log_file checks the fallback.

    A container whose log directory cannot be created must still log on stdout
    rather than die before the first line is emitted.

    Args:
        seeding (ModuleType): The imported CLI module.
        tmp_path (Path): Directory holding the blocking file.
        capsys (pytest.CaptureFixture[str]): Fixture capturing standard output.

    Returns:
        None
    """

    blocker = tmp_path / "blocker"
    blocker.write_text("not a directory", encoding="utf-8")

    seeding.configure_logging(log_file=blocker / "seeding.log")
    structlog.get_logger().info("seeding completed")

    events = rendered_events(capsys.readouterr().out)

    assert [event["message"] for event in events] == ["seeding completed"]


def test_main_logs_json_on_the_happy_path(
    seeding: ModuleType,
    fixtures_root: Path,
    connection_factory: RecordingConnectionFactory,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """test_main_logs_json_on_the_happy_path checks the entrypoint configures it.

    Args:
        seeding (ModuleType): The imported CLI module.
        fixtures_root (Path): Temporary fixture root.
        connection_factory (RecordingConnectionFactory): The injected factory.
        tmp_path (Path): Directory the log file is written into.
        capsys (pytest.CaptureFixture[str]): Fixture capturing standard output.

    Returns:
        None
    """

    write_catalogue(fixtures_root, {CONTACTS_FILE: [CONTACT_AGGREGATE]})
    environment = dict(ENVIRONMENT) | {"LOG_FILE": str(tmp_path / "seeding.log")}

    exit_code = seeding.main(
        argv=["--fixtures-dir", str(fixtures_root), "--yes"],
        connection_factory=connection_factory,
        environ=environment,
    )

    events = rendered_events(capsys.readouterr().out)

    assert exit_code == 0
    assert events
    assert all({"message", "timestamp", "level"} <= set(event) for event in events)
    assert PASSWORD not in repr(events)


def run_cli_process(
    environment: dict[str, str],
    arguments: list[str] | None = None,
) -> subprocess.CompletedProcess[str]:
    """run_cli_process runs the CLI as the container does, in a child process.

    The child is started with `python -m src.main` and an environment holding
    nothing but the supplied variables (plus `PATH` and `PYTHONPATH`), so the
    module is imported exactly as it is at container start. This is the only way
    to observe an import-time configuration failure: an in-process test imports
    `src.main` once, under a valid environment, and can never see it.

    Args:
        environment (dict[str, str]): The `POSTGRES_*` variables to start the
            child process with.
        arguments (list[str] | None): Command-line arguments appended to the
            module invocation, as `docker run` appends them to the entrypoint.
            Defaults to None, in which case none are passed.

    Returns:
        subprocess.CompletedProcess[str]: The finished child process, with its
            standard output and standard error captured as text.
    """

    return subprocess.run(
        [sys.executable, "-m", MAIN_MODULE, *(arguments or [])],
        cwd=str(SEEDING_ROOT),
        env={
            **environment,
            "PATH": os.environ.get("PATH", ""),
            "PYTHONPATH": str(SEEDING_ROOT),
        },
        capture_output=True,
        text=True,
        check=False,
    )


def test_cli_reports_a_missing_variable_by_name_and_exits_non_zero() -> None:
    """test_cli_reports_a_missing_variable_by_name_and_exits_non_zero checks it.

    Starting the CLI with a required variable unset must produce a single
    structured error event naming that variable, and a non-zero exit code -
    never an unhandled `ValidationError` traceback, which renders the collected
    environment including the plaintext password (RISK-015).

    Returns:
        None
    """

    environment = {
        name: value for name, value in ENVIRONMENT.items() if name != "POSTGRES_HOST"
    }

    completed = run_cli_process(environment)
    output = completed.stdout + completed.stderr

    assert completed.returncode != 0
    assert "Traceback" not in output
    assert "ValidationError" not in output
    assert PASSWORD not in output
    assert "POSTGRES_HOST" in output
    assert not [
        name
        for name in (
            "POSTGRES_PORT",
            "POSTGRES_USER",
            "POSTGRES_PASSWORD",
            "POSTGRES_DB",
        )
        if name in output
    ]


def test_cli_refuses_a_destructive_run_without_the_opt_in() -> None:
    """test_cli_refuses_a_destructive_run_without_the_opt_in checks SEC-001.

    Started as the container starts it - a fully valid environment and no
    arguments - the CLI must refuse, name the target host and database in a
    structured event, and exit non-zero, rather than truncating and reseeding
    whichever database the environment happens to point at.

    Returns:
        None
    """

    completed = run_cli_process(ENVIRONMENT)
    events = rendered_events(completed.stdout)

    assert completed.returncode != 0
    assert events
    assert all({"message", "timestamp", "level"} <= set(event) for event in events)

    errors = [event for event in events if event["level"] == "error"]

    assert len(errors) == 1
    assert errors[0]["host"] == "postgres.internal"
    assert errors[0]["dbname"] == "portfolio"
    assert PASSWORD not in completed.stdout + completed.stderr


def test_cli_reports_a_configuration_failure_as_json() -> None:
    """test_cli_reports_a_configuration_failure_as_json checks the bootstrap.

    Logging is configured before the settings are loaded, so a configuration
    failure at container start is itself reported as a structured JSON line and
    not as unstructured console output.

    Returns:
        None
    """

    environment = {
        name: value for name, value in ENVIRONMENT.items() if name != "POSTGRES_HOST"
    }

    completed = run_cli_process(environment)
    events = rendered_events(completed.stdout)

    assert completed.returncode != 0
    assert events
    assert all({"message", "timestamp", "level"} <= set(event) for event in events)
    assert any("POSTGRES_HOST" in repr(event) for event in events)
