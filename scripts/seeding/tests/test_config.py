"""Unit tests for the seeding component configuration model.

The suite pins the ``LOG_*`` / ``POSTGRES_*`` environment variable contract shared
with the alembic component: variable names, which of them are required, the port
and logging defaults and the ``SecretStr`` typing of the password.

NO-SERVER RULE: every test here drives `pydantic_settings` with an injected
environment mapping only. No PostgreSQL server is started or contacted, so the
suite passes with no `postgres` executable present.
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from types import ModuleType
from typing import Mapping

import pytest
from pydantic import SecretStr, ValidationError

SEEDING_ROOT: Path = Path(__file__).resolve().parent.parent

if str(SEEDING_ROOT) not in sys.path:
    sys.path.insert(0, str(SEEDING_ROOT))

CONFIG_MODULE: str = "src.config"

PASSWORD: str = "s3cr3t-seed-p4ssw0rd"

VALID_ENVIRONMENT: dict[str, str] = {
    "POSTGRES_HOST": "postgres.internal",
    "POSTGRES_PORT": "6543",
    "POSTGRES_USER": "seeder",
    "POSTGRES_PASSWORD": PASSWORD,
    "POSTGRES_DB": "portfolio",
}

CONTRACT_VARIABLES: tuple[str, ...] = (
    "LOG_LEVEL",
    "LOG_FILE",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
)

REQUIRED_VARIABLES: tuple[str, ...] = (
    "POSTGRES_HOST",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
)


def environment_without(variable: str) -> dict[str, str]:
    """environment_without builds a valid environment missing one variable.

    Args:
        variable (str): The variable to omit from the mapping.

    Returns:
        dict[str, str]: A copy of `VALID_ENVIRONMENT` without `variable`.
    """

    environment = dict(VALID_ENVIRONMENT)
    environment.pop(variable)
    return environment


def import_config_module(environ: Mapping[str, str]) -> ModuleType:
    """import_config_module imports `src.config` under an injected environment.

    The module is always re-executed, so that whatever the import itself does
    with `environ` is exercised. The process environment is restored before
    returning.

    Args:
        environ (Mapping[str, str]): The environment to import the module under.

    Returns:
        ModuleType: The freshly executed configuration module.
    """

    previous = dict(os.environ)
    os.environ.clear()
    os.environ.update(environ)
    try:
        return importlib.reload(importlib.import_module(CONFIG_MODULE))
    finally:
        os.environ.clear()
        os.environ.update(previous)


@pytest.fixture
def config_module() -> ModuleType:
    """config_module provides `src.config` imported under a complete environment.

    Returns:
        ModuleType: The configuration module, holding its `Config` class and
            `load_config` factory.
    """

    return import_config_module(VALID_ENVIRONMENT)


def test_config_defines_only_the_postgres_contract(config_module: ModuleType) -> None:
    """test_config_defines_only_the_postgres_contract pins the variable set.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    assert tuple(config_module.Config.model_fields) == CONTRACT_VARIABLES


def test_load_config_reads_every_variable(config_module: ModuleType) -> None:
    """test_load_config_reads_every_variable checks the parsed settings.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    config = config_module.load_config(VALID_ENVIRONMENT)

    assert config.POSTGRES_HOST == "postgres.internal"
    assert config.POSTGRES_PORT == 6543
    assert config.POSTGRES_USER == "seeder"
    assert config.POSTGRES_PASSWORD.get_secret_value() == PASSWORD
    assert config.POSTGRES_DB == "portfolio"


def test_load_config_defaults_postgres_port(config_module: ModuleType) -> None:
    """test_load_config_defaults_postgres_port checks the only optional variable.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    config = config_module.load_config(environment_without("POSTGRES_PORT"))

    assert config.POSTGRES_PORT == 5432


def test_load_config_defaults_the_logging_settings(config_module: ModuleType) -> None:
    """test_load_config_defaults_the_logging_settings checks the logging defaults.

    Neither logging variable may be required: an existing deployment that sets
    none of them must keep working and log at `INFO` into the image's log file.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    config = config_module.load_config(VALID_ENVIRONMENT)

    assert config.LOG_LEVEL == config_module.DEFAULT_LOG_LEVEL == "INFO"
    assert config.LOG_FILE == config_module.DEFAULT_LOG_FILE
    assert config.LOG_FILE.startswith("/app/")


def test_load_config_reads_the_logging_settings(config_module: ModuleType) -> None:
    """test_load_config_reads_the_logging_settings checks the overrides.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    environment = dict(VALID_ENVIRONMENT) | {
        "LOG_LEVEL": "debug",
        "LOG_FILE": "/var/log/seeding.log",
    }

    config = config_module.load_config(environment)

    assert config.LOG_LEVEL == "debug"
    assert config.LOG_FILE == "/var/log/seeding.log"


@pytest.mark.parametrize("variable", ("LOG_LEVEL", "LOG_FILE"))
def test_load_config_rejects_an_empty_logging_setting(
    config_module: ModuleType,
    variable: str,
) -> None:
    """test_load_config_rejects_an_empty_logging_setting checks the constraints.

    Args:
        config_module (ModuleType): The configuration module under test.
        variable (str): The logging variable set to an empty string.

    Returns:
        None
    """

    environment = dict(VALID_ENVIRONMENT) | {variable: ""}

    with pytest.raises(ValidationError) as error:
        config_module.load_config(environment)

    assert variable in str(error.value)


@pytest.mark.parametrize("variable", REQUIRED_VARIABLES)
def test_load_config_requires_variable(
    config_module: ModuleType,
    variable: str,
) -> None:
    """test_load_config_requires_variable checks fail-fast on a missing variable.

    Args:
        config_module (ModuleType): The configuration module under test.
        variable (str): The required variable removed from the environment.

    Returns:
        None
    """

    with pytest.raises(ValidationError) as error:
        config_module.load_config(environment_without(variable))

    assert variable in str(error.value)


@pytest.mark.parametrize("variable", REQUIRED_VARIABLES)
def test_load_config_rejects_empty_variable(
    config_module: ModuleType,
    variable: str,
) -> None:
    """test_load_config_rejects_empty_variable checks empty strings are invalid.

    Args:
        config_module (ModuleType): The configuration module under test.
        variable (str): The required variable set to an empty string.

    Returns:
        None
    """

    environment = dict(VALID_ENVIRONMENT) | {variable: ""}

    with pytest.raises(ValidationError) as error:
        config_module.load_config(environment)

    assert variable in str(error.value)


@pytest.mark.parametrize("port", ["not-a-port", "0", "65536"])
def test_load_config_rejects_invalid_port(
    config_module: ModuleType,
    port: str,
) -> None:
    """test_load_config_rejects_invalid_port checks the port constraints.

    Args:
        config_module (ModuleType): The configuration module under test.
        port (str): The rejected `POSTGRES_PORT` value.

    Returns:
        None
    """

    environment = dict(VALID_ENVIRONMENT) | {"POSTGRES_PORT": port}

    with pytest.raises(ValidationError) as error:
        config_module.load_config(environment)

    assert "POSTGRES_PORT" in str(error.value)


def test_load_config_password_is_secret(config_module: ModuleType) -> None:
    """test_load_config_password_is_secret checks the password never renders.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    config = config_module.load_config(VALID_ENVIRONMENT)

    assert isinstance(config.POSTGRES_PASSWORD, SecretStr)
    assert PASSWORD not in str(config)
    assert PASSWORD not in repr(config)
    assert PASSWORD not in str(config.POSTGRES_PASSWORD)
    assert PASSWORD not in repr(config.POSTGRES_PASSWORD)
    assert PASSWORD not in str(config.model_dump())


def test_load_config_leaves_process_environment_untouched(
    config_module: ModuleType,
) -> None:
    """test_load_config_leaves_process_environment_untouched checks isolation.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    before = dict(os.environ)

    config_module.load_config(VALID_ENVIRONMENT)

    assert dict(os.environ) == before


def test_load_config_ignores_process_environment(
    config_module: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """test_load_config_ignores_process_environment checks the injected mapping wins.

    Args:
        config_module (ModuleType): The configuration module under test.
        monkeypatch (pytest.MonkeyPatch): Fixture setting a conflicting variable.

    Returns:
        None
    """

    monkeypatch.setenv("POSTGRES_HOST", "leaked-from-process")

    config = config_module.load_config(VALID_ENVIRONMENT)

    assert config.POSTGRES_HOST == "postgres.internal"


def test_config_module_builds_the_settings_at_import_time(
    config_module: ModuleType,
) -> None:
    """test_config_module_builds_the_settings_at_import_time pins `CONFIG`.

    The module exposes a single global settings instance, built while the module
    is imported. `src.main` keeps its configuration error handler reachable by
    importing this module from *inside* `main()` rather than at module scope, so
    the failure of that instantiation is a catchable `ValidationError` rather
    than an import-time crash.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    assert isinstance(config_module.CONFIG, config_module.Config)
    assert config_module.CONFIG.POSTGRES_HOST == "postgres.internal"
    assert config_module.CONFIG.POSTGRES_DB == "portfolio"


def test_load_config_returns_the_global_instance(config_module: ModuleType) -> None:
    """test_load_config_returns_the_global_instance pins the default source.

    Called without an explicit environment - which is how `main()` calls it in
    the container - `load_config` hands back the global instance rather than
    parsing the environment a second time.

    Args:
        config_module (ModuleType): The configuration module under test.

    Returns:
        None
    """

    assert config_module.load_config() is config_module.CONFIG


@pytest.mark.parametrize("variable", REQUIRED_VARIABLES)
def test_config_module_import_reports_a_missing_variable(variable: str) -> None:
    """test_config_module_import_reports_a_missing_variable checks the failure.

    Importing the module under an incomplete environment must fail with a
    `ValidationError` naming the offending variable - the error `main()` catches
    around its deferred import and reports as a single structured line.

    Args:
        variable (str): The required variable removed from the environment.

    Returns:
        None
    """

    try:
        with pytest.raises(ValidationError) as error:
            import_config_module(environment_without(variable))

        assert variable in str(error.value)
    finally:
        import_config_module(VALID_ENVIRONMENT)
