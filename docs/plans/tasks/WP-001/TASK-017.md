# Task: Seeding CLI entrypoint (`scripts/seeding/src/main.py`)

Work Plan ID: WP-001
Task ID: TASK-017
Created Date: 2026-08-13
Description: Implement the `argparse` CLI exposing `main`, with connection arguments defaulting from the `pydantic_settings` config, orchestrating load → validate → link → connect → seed, logging via `structlog` and exiting non-zero on any failure; with tests in `scripts/seeding/tests/test_main.py`.
Acceptance Criteria Covered: AC-6, AC-7

## Implementation Content

`scripts/seeding/src/main.py`:

- `argparse` CLI (REQ-2.2) with arguments for host, port, user, password and dbname whose
  **defaults come from `scripts/seeding/src/config.py`**. This is the env→CLI bridge: `docker
  run -e POSTGRES_...` works with no shell wrapper, and explicit CLI arguments still override
  (SPEC-001-REVIEW §6b, F-8). A `--fixtures-dir` argument defaulting to
  `scripts/seeding/fixtures/` is permitted.
- Pipeline order is mandatory: **load → validate → flatten/de-duplicate/link → only then open
  the connection → execute**. No connection may be opened before validation and linking have
  completed successfully (AC-7, RISK-006).
- Connection creation: psycopg v3 with `row_factory=dict_row` and `autocommit` disabled; the
  password is unwrapped from `SecretStr` only here.
- `structlog` logging; never log the settings object, the DSN, or the password.
- Any failure (validation, linking, connection, execution) exits non-zero with a structured
  error line and nothing written.
- Expose `main()` and an `if __name__ == "__main__":` guard for the container entrypoint.

## Target Files

- [x] scripts/seeding/src/main.py
- [x] scripts/seeding/tests/test_main.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/src/config.py (TASK-013 — fields supplying argparse
  defaults; `SecretStr` handling)
- /home/agent/workspace/scripts/seeding/src/fixtures.py (TASK-014 — loading/validation entry
  point)
- /home/agent/workspace/scripts/seeding/src/persistence.py (TASK-015/016 — planning functions
  and the executor signature)
- /home/agent/workspace/scripts/seeding/tests/conftest.py (TASK-010 — recording fake connection)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-2.2, REQ-2.5, REQ-2.6)
- Coding standards via the `coding-standards` skill: `python/GENERAL.md`, `general/LOGGING.md`

## Investigation Notes

- `src/config.py`: `Config(BaseSettings)` with `POSTGRES_HOST/PORT/USER/PASSWORD/DB`
  (`PASSWORD` is a `SecretStr`, `PORT` defaults to 5432), `load_config(environ)` factory and a
  module-level `CONFIG` built at import. `main.py` uses `load_config(environ)` for the argparse
  defaults rather than `CONFIG`, so the environment supplying them is explicit and injectable;
  importing `src.config` still validates the process environment at import (`[PY-021]`), which
  is why `test_main.py` imports the module through `importlib` from inside a fixture that has
  already set a valid environment, exactly as `test_config.py` does.
- `src/fixtures.py`: `load_fixtures(fixtures_root=DEFAULT_FIXTURES_ROOT) -> DomainFixtures`;
  raises `FixtureError` subclasses and lets `pydantic.ValidationError` propagate. Opens no
  connection and imports neither `psycopg` nor `config`. `DomainFixtures.domains` maps catalogue
  file name to the validated aggregates, so the CLI chains the values into the planner.
- `src/persistence.py`: `build_seed_plan(fixtures) -> SeedPlan` (flatten, de-duplicate,
  `validate_references`) is pure and raises `PersistenceError` subclasses
  (`ConflictingFixtureRowError`, `UnresolvedReferenceError`); `execute_seed_plan(connection,
  plan) -> int` requires an already-open connection with auto-commit disabled and performs the
  single commit. Connection creation and closing therefore belong to `main.py`.
- `tests/conftest.py`: `call_recorder`, `fake_connection_factory` and `fake_connection` provide
  the offline recorder (`recorder.statements`, `recorder.parameters`, `recorder.commit_count`).
  No `pytest-postgresql` fixture may be requested; `test_main.py` wraps `fake_connection` in a
  call-recording factory passed into `main()` so "connection factory never called" is assertable.
- Fixture IDs are 32-character lowercase hex (`^[0-9a-f]{32}$`); the catalogue file names come
  from `models.DOMAIN_FIXTURE_MODELS` (`contacts.json`, `cv_skills.json`, ...) and discovery
  requires every one of them to be present, so the tests write the whole catalogue into a
  temporary root, holding `[]` for every file they do not exercise.
- Standards: `[PY-045]`/`[PY-046]`/`[PY-047]` (psycopg, `autocommit=False`, `dict_row`),
  `[PY-038]`/`[LOG-002]`/`[LOG-004]` (structlog with context in dedicated fields, never in the
  message), `[PY-008]`, `[PY-006]`/`[PY-007]` (Google-style docstrings), `[PY-012]` (`main.py`
  at the root of `src`). Configuration validation failures are logged by variable **name** only,
  never by value, so no settings object, DSN or password can reach a log line.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-013 | Seeding component configuration model | blocks | Config supplying argparse defaults |
| TASK-014 | Fixture discovery, loading and validation | blocks | Fixture loading/validation entry point |
| TASK-016 | Single-transaction seeding executor | blocks | Executor function and planning functions |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables
- [x] Write failing tests in `test_main.py` with the connection factory patched to a recording
      fake:
      - CLI defaults come from the config when no arguments are given; explicit arguments
        override the environment-sourced defaults
      - happy path: pipeline runs and the executor receives the planned rows; exit code 0
      - **invalid fixture: the connection factory is never called** and the process exits
        non-zero (assert on the factory mock's call count)
      - unresolved cross-file reference: connection factory never called, non-zero exit
      - executor raising: non-zero exit, no commit recorded
      - the connection is created with `autocommit` disabled and `dict_row`
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Add minimal implementation to pass the tests
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Tidy argument wiring and error handling; confirm tests still pass; `black`/`flake8` clean

## Completion Criteria

- [x] Running with no CLI arguments uses the `POSTGRES_*` environment-sourced defaults; explicit
      arguments override them
- [x] On an invalid fixture, no database connection is opened (proved by the connection factory
      never being called) and the process exits non-zero
- [x] On an unresolved cross-file ID reference, no connection is opened and the process exits
      non-zero
- [x] The connection is created with `row_factory=dict_row` and `autocommit` disabled
- [x] Any failure exits non-zero with a structlog error line; no `print`, no silent swallow
- [x] No log line or error message renders the password, DSN, or settings object
- [x] All added tests pass with no PostgreSQL binary present
- [x] `black` and `flake8` clean

## Notes

- Impact scope: this module is the seeding container's entrypoint (TASK-022) and the target of
  the `seed` make target (TASK-023).
- Risk countermeasures carried by this task: **RISK-006** (load → validate → link → connect
  ordering, asserted by "connection factory never called" on the failure path), **RISK-012**
  (mock-driven tests, no server), **RISK-015** (no password-revealing logging).
- Scope boundary: does not modify `config.py`, `fixtures.py`, `persistence.py`, `conftest.py`,
  or fixture data.
