# Task: Migration wrapper entrypoint (`alembic/src/main.py`)

Work Plan ID: WP-001
Task ID: TASK-004
Created Date: 2026-08-13
Description: Create the Python wrapper that reads `ALEMBIC_COMMAND` / `ALEMBIC_REVISION` via the config, invokes alembic programmatically, logs via `structlog`, and exits non-zero on any failure.
Acceptance Criteria Covered: AC-4

## Implementation Content

`alembic/src/main.py` is the container entrypoint (REQ-1.4). It must:

- Load the `Config` from `alembic/src/config.py`. A missing `ALEMBIC_REVISION` or
  `ALEMBIC_COMMAND` surfaces as an explicit error **naming the missing variable**, and the
  process exits non-zero (AC-4). The `Literal["upgrade", "downgrade"]` type on
  `ALEMBIC_COMMAND` rejects any other value — do not re-implement that check by hand.
- Invoke alembic programmatically (`alembic.config.Config` + `alembic.command.upgrade` /
  `alembic.command.downgrade`) against `alembic/alembic.ini`, using the configured revision.
- Log with `structlog` (structured, no `print`). **Never** log the settings object, the
  connection URL, or any exception payload that renders `POSTGRES_PASSWORD` (RISK-015).
- Exit non-zero on any failure: missing/invalid variable, unknown revision, unreachable
  database. No bare `except: pass`; the failure reason must appear in a log line.
- Expose a `main()` callable and an `if __name__ == "__main__":` guard so the Dockerfile can
  run it directly.

## Target Files

- [x] alembic/src/main.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/alembic/src/config.py (TASK-001 — settings fields, `Literal` command,
  `SecretStr` password, connection-URL helper)
- /home/agent/workspace/alembic/alembic.ini and /home/agent/workspace/alembic/migrations/env.py
  (TASK-002 — how the ini locates `migrations/` and how the URL reaches alembic)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-1.4 — wrapper must raise when either
  variable is unset)
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Failure Modes")
- Coding standards via the `coding-standards` skill: `python/GENERAL.md`, `general/LOGGING.md`
  (plus the logging example)

## Investigation Notes

### Dependency deliverables

- `alembic/src/config.py` (TASK-001): `Config(BaseSettings)` with `ALEMBIC_REVISION`
  (`min_length=1`), `ALEMBIC_COMMAND: Literal["upgrade", "downgrade"]`, `POSTGRES_PASSWORD:
  SecretStr`. `CONFIG = Config()` is built **at import time**, so the wrapper imports
  `src.config` lazily inside `load_config()` and catches `ValidationError` — importing it at
  module level would abort before logging is configured.
- Pydantic's `ValidationError` for a *missing* field carries the whole submitted input
  (including `POSTGRES_PASSWORD`) in `errors()[i]["input"]`. Only `loc` and `msg` are rendered
  (`format_validation_errors`), never `str(error)` and never `errors()` verbatim (RISK-015).
- `alembic/alembic.ini` (TASK-002): `script_location = migrations` is relative, so the wrapper
  pins it to the absolute `alembic/migrations` path via `set_main_option` — the ini itself is
  untouched. `migrations/env.py` composes the URL from `src.config.postgres_connection_url()`;
  the wrapper never touches the URL.
- `alembic/migrations/versions/0001_initial_base_schema.py` (TASK-003): revision `0001`.
- SPEC-001 REQ-1.4 / AC-4: both variables must be set, otherwise raise and exit non-zero.
  Work plan "Failure Modes" additionally requires a non-zero exit and a clear structlog error
  for an unreachable database.
- Standards applied: `[PY-038]` structlog (no `print`), `[LOG-002]`–`[LOG-004]` JSON output
  with `message` / `timestamp` / `level` and context in dedicated fields, `[PY-006]`–`[PY-008]`
  Google docstrings and type hints, `[PY-012]` `src/main.py` entrypoint.

### Fail-fast check results (RISK-010(a) evidence)

Red phase (before `alembic/src/main.py` existed) — all three checks exited `1` with
`/usr/bin/python3: No module named src.main`, i.e. failing for the wrong reason.

Green phase, run from `alembic/` as `python3 -m src.main` with
`POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=test POSTGRES_PASSWORD=sup3rs3cret
POSTGRES_DB=testdb`:

- Check A — `ALEMBIC_COMMAND=upgrade`, `ALEMBIC_REVISION` unset → **exit 1**
  `{"errors": ["ALEMBIC_REVISION: Field required"], "level": "error", "timestamp":
  "2026-08-13T20:19:03.006368Z", "message": "Invalid migration configuration"}`
- Check B — `ALEMBIC_REVISION=0001`, `ALEMBIC_COMMAND` unset → **exit 1**
  `{"errors": ["ALEMBIC_COMMAND: Field required"], "level": "error", "timestamp":
  "2026-08-13T20:19:03.231986Z", "message": "Invalid migration configuration"}`
- Check C — `ALEMBIC_COMMAND=drop-everything` → **exit 1**
  `{"errors": ["ALEMBIC_COMMAND: Input should be 'upgrade' or 'downgrade'"], "level": "error",
  "timestamp": "2026-08-13T20:19:03.455552Z", "message": "Invalid migration configuration"}`
- Check D (unreachable database, complete configuration) — **exit 1**, alembic was reached and
  the failure logged as
  `{"alembic_command": "upgrade", "alembic_revision": "0001", "error_type": "OperationalError",
  "error": "(psycopg.OperationalError) failed to resolve host 'nonexistent-db.invalid': [Errno
  -2] Name or service not known ...", "level": "error", "message": "Database migration
  failed"}` — a structlog error line, not a bare traceback.

No line of any run rendered `sup3rs3cret`, the connection URL, or the settings object.
`black --check` and `flake8` (repo `.flake8`, max line length 88) are clean.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-001 | Alembic component configuration model and dependencies | blocks | `Config` model with `ALEMBIC_*` fields |
| TASK-003 | Single initial migration revision for the `base` schema | blocks | The revision the wrapper upgrades/downgrades to |

## Implementation Steps (TDD: Red-Green-Refactor)

The alembic component ships **without unit tests** by binding decision 5 (`quality-controller`
will not flag `[PY-025]`–`[PY-028]` here). The Red phase is the mandated **manual fail-fast
check** — RISK-010(a) makes running it and reporting its output a hard requirement.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables: `alembic/src/config.py`, the revision file
- [x] Red check A: run the module with `POSTGRES_*` set but `ALEMBIC_REVISION` unset; record the
      exit code and the message
- [x] Red check B: same with `ALEMBIC_COMMAND` unset; record exit code and message
- [x] Red check C: same with `ALEMBIC_COMMAND=drop-everything`; record exit code and message

### 2. Green Phase

- [x] Implement the wrapper so all three checks exit non-zero with a message naming the
      offending variable/value, and so a fully configured invocation reaches alembic
- [x] Re-run checks A–C and paste the observed exit codes and messages into Investigation Notes

### 3. Refactor Phase

- [x] Improve code (keep the checks failing fast); `black` and `flake8` clean

## Completion Criteria

- [x] Running the wrapper with `ALEMBIC_REVISION` unset exits non-zero and the error message
      contains the literal string `ALEMBIC_REVISION`
- [x] Running the wrapper with `ALEMBIC_COMMAND` unset exits non-zero and the error message
      contains the literal string `ALEMBIC_COMMAND`
- [x] `ALEMBIC_COMMAND` set to any value outside `{upgrade, downgrade}` exits non-zero
- [x] With a complete but unreachable database configuration, the wrapper exits non-zero with a
      structlog error line and no traceback-only failure
- [x] No log line, message or exception renders `POSTGRES_PASSWORD`, the connection URL, or the
      whole settings object
- [x] The observed exit codes and messages from all three Red checks are recorded in this task
      file's Investigation Notes (this is the Phase 1 completion evidence for AC-4)
- [x] `black` and `flake8` clean

## Notes

- Impact scope: this is the process the migration container runs; `alembic/Dockerfile`
  (TASK-005) and `alembic/Makefile` (TASK-006) invoke it.
- Risk countermeasures carried by this task: **RISK-010** (no automated coverage — the manual
  fail-fast checks are the substitute gate and their results must be reported), **RISK-015**
  (no password-revealing log call).
- Scope boundary: do not modify `alembic/src/config.py`, `env.py`, `alembic.ini`, or the
  revision — they belong to TASK-001/002/003. Do not add unit tests under `alembic/`.
