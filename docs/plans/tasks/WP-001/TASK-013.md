# Task: Seeding component configuration model (`scripts/seeding/src/config.py`)

Work Plan ID: WP-001
Task ID: TASK-013
Created Date: 2026-08-13
Description: Create the seeding component's `pydantic_settings` `Config` implementing the `POSTGRES_*` contract identically to the alembic component, with tests in `scripts/seeding/tests/test_config.py`.
Acceptance Criteria Covered: AC-6, AC-7

## Implementation Content

The seeding container receives connection settings as environment variables (REQ-2.6) while the
CLI takes them as arguments (REQ-2.2). The bridge is this config: `argparse` defaults are
sourced from it — **no entrypoint shell wrapper** (SPEC-001-REVIEW §6b, orchestrator decision
F-8).

Implement the contract **verbatim**; it must not diverge from `alembic/src/config.py`
(RISK-015):

| Variable | Required | Default | Type notes |
| --- | --- | --- | --- |
| `POSTGRES_HOST` | yes | — | str |
| `POSTGRES_PORT` | no | `5432` | int |
| `POSTGRES_USER` | yes | — | str |
| `POSTGRES_PASSWORD` | yes | — | **`SecretStr`** |
| `POSTGRES_DB` | yes | — | str |

`ALEMBIC_*` variables are **not** part of this component's contract.

Requirements:

- A `pydantic_settings.BaseSettings` subclass with the fields above; missing required variables
  fail at config validation with the variable named, before any work is attempted.
- A module-level global instance (per the plan) plus a way to construct it explicitly in tests
  with an injected environment.
- `POSTGRES_PASSWORD` is `SecretStr`; the module must never log or `repr` the settings object,
  and the password must only be unwrapped where the connection is actually made.

## Target Files

- [x] scripts/seeding/src/config.py
- [x] scripts/seeding/tests/test_config.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/alembic/src/config.py (TASK-001 — the sibling implementation this must
  match on names, defaults and `SecretStr` typing)
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Reference Contracts" → environment
  variable contract; seeder CLI contract)
- /home/agent/workspace/docs/specs/SPEC-001-REVIEW.md (§6b orchestrator decisions F-7 and F-8)
- /home/agent/workspace/scripts/seeding/tests/conftest.py (TASK-010 — available fixtures)
- Coding standards via the `coding-standards` skill: `python/GENERAL.md` (config example)

## Investigation Notes

- `alembic/src/config.py` uses `Annotated[str, StringConstraints(min_length=1)]` for the three
  string variables, `Annotated[int, Field(default=5432, gt=0, le=65535)]` for the port and
  `Annotated[SecretStr, StringConstraints(min_length=1)]` for the password, with a module-level
  `CONFIG = Config()`. The seeding config mirrors these five field declarations verbatim and
  drops `ALEMBIC_REVISION` / `ALEMBIC_COMMAND`. `StringConstraints(min_length=1)` was verified to
  be enforced on `SecretStr` under the pinned `pydantic==2.13.4`.
- The alembic module additionally exposes `postgres_connection_url()` built with SQLAlchemy;
  SQLAlchemy is **not** a seeding dependency (`scripts/seeding/requirements.txt` pins `psycopg`),
  so no connection helper is added here — the password stays wrapped until the persistence layer
  unwraps it at connection time.
- Plan "Reference Contracts" and SPEC-001-REVIEW §6b F-7/F-8 confirm the five-variable contract
  and that `argparse` defaults come from this config with no entrypoint shell wrapper, so the
  module keeps an import-time validated global (`CONFIG`) for `main.py` to source defaults from.
- `scripts/seeding/tests/conftest.py` provides only offline fake connection/recorder and fixture
  path fixtures — nothing config-related, and nothing that starts a server. The tests therefore
  inject the environment themselves via the new `load_config(environ)` factory and re-import the
  module under an injected environment to exercise the import-time failure path.
- The tests prepend `scripts/seeding` to `sys.path` so `src.config` is importable regardless of
  how `pytest` is invoked; `src` is a PEP 420 namespace package, matching `alembic/src`.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-010 | Seeding component test scaffolding and dependencies | blocks | pinned pydantic-settings/pytest, `conftest.py` |
| TASK-001 | Alembic component configuration model and dependencies | informs | The `POSTGRES_*` contract implementation this one must mirror |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverable: `alembic/src/config.py` — note field names, defaults and
      the password typing so the two do not drift
- [x] Write failing tests: all variables set → valid config; `POSTGRES_PORT` unset → defaults to
      `5432`; each required variable removed in turn → validation error naming that variable;
      `POSTGRES_PASSWORD` is `SecretStr` and `str(config)` / `repr(config)` does not contain the
      password value
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Add minimal implementation to pass the tests
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Align naming/structure with `alembic/src/config.py`; confirm tests still pass;
      `black`/`flake8` clean

## Completion Criteria

- [x] The config reads exactly `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`,
      `POSTGRES_PASSWORD`, `POSTGRES_DB` — no extra or renamed variables
- [x] `POSTGRES_PORT` defaults to `5432`; the other four are required with no default
- [x] Omitting any required variable raises a validation error naming it
- [x] `POSTGRES_PASSWORD` is `SecretStr` and neither `str()` nor `repr()` of the settings object
      reveals it
- [x] Field names and defaults match `alembic/src/config.py` exactly
- [x] All added tests pass with no PostgreSQL binary present
- [x] `black` and `flake8` clean

## Notes

- Impact scope: `main.py` (TASK-017) sources its `argparse` defaults from this config;
  `scripts/seeding/README.md` (TASK-023) documents the same table.
- Risk countermeasures carried by this task: **RISK-015** (identical contract in both
  components, `SecretStr` in both, no password-revealing rendering), **RISK-012** (no
  server-dependent test).
- Scope boundary: does not modify `alembic/src/config.py`, `models.py`, or `conftest.py`.
