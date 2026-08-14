# Task: QC Remediation — Coding Standards Violations (Review Iteration 1)

Work Plan ID: WP-001
Task ID: TASK-QC-REMEDIATION
Created Date: 2026-08-13
Description: Make the log-file sink actually usable in both container images, make the alembic library's log level environment-driven, and resolve the `[PY-024]` MUST deviation in the seeding settings module.
Acceptance Criteria Covered: none directly — standards conformance only.

## Implementation Content

Iteration 0's eight violations are all genuinely fixed and are **not** to be revisited: both enum
types now carry `COMMENT ON TYPE`, the seeding component configures `structlog` for JSON with
`message`/`timestamp`/`level`, and both components take `LOG_LEVEL` and `LOG_FILE`.

This task closes four remaining violations found on re-review. Three are code changes; the fourth is
a decision that must be put to the user before any code moves.

Full evidence: `docs/plans/quality/WP-001/WP-001-quality-report.md` (Review Iteration 1).

## Target Files

- [x] `alembic/Dockerfile`
- [x] `alembic/src/config.py` (comment correction plus the `ConsoleHandler` the
      `[LOG-006]` fix needs — see Iteration 2 Outcome)
- [x] `alembic/alembic.ini`
- [ ] `alembic/migrations/env.py` — **not modified**: outside the write set of iteration 2, and the
      `[LOG-006]` fix does not need it
- [x] `scripts/seeding/Dockerfile`
- [x] `scripts/seeding/src/config.py` (comment correction plus the module-level `CONFIG` instance)
- [x] `scripts/seeding/src/main.py` (deferred settings import)
- [x] `scripts/seeding/tests/test_config.py`, `scripts/seeding/tests/test_main.py`
- [ ] `scripts/seeding/README.md`, `alembic/README.md` (log-file persistence note) — **not
      modified**: outside the write set of iteration 2

## Investigation Targets

- `alembic/Dockerfile` (lines 47-62: `useradd`, `WORKDIR`, `COPY`, `USER`)
- `scripts/seeding/Dockerfile` (lines 82-102: `useradd`, `WORKDIR`, `COPY --from=tests`, `USER`,
  `ENTRYPOINT`)
- `alembic/src/main.py` (`open_log_file`, line 109 — the `except OSError` that swallows the failure)
- `scripts/seeding/src/main.py` (`open_log_file`, line 134 — same)
- `alembic/alembic.ini` (`[logger_*]` sections, lines 30-43) and `alembic/migrations/env.py:37`
  (`fileConfig`)
- `scripts/seeding/src/config.py` (module docstring lines 14-21 — the rationale for the `[PY-024]`
  deviation) and `alembic/src/config.py:62` + `alembic/src/main.py:174-190` (the conforming pattern)
- `docs/plans/tasks/WP-001/TASK-CODE-REVIEW-REMEDIATION.md` lines 60-90 (the finding that mandated
  removing the seeding global — do not silently revert it)

## Change Category

`Change Category: boundary-change`

The container filesystem/user boundary and the logging configuration boundary are both touched;
sweep both images and both entrypoints for the same class of defect rather than fixing one.

## Remediation Context

- Source: quality-controller
- Finding: 4 violations — `[LOG-005]` ×2 (`alembic/Dockerfile:60`, `scripts/seeding/Dockerfile:95`),
  `[LOG-006]` (`alembic/alembic.ini:41`), `[PY-024]` (`scripts/seeding/src/config.py:48`)
- Evidence:
  - Both Dockerfiles create `/app` via `WORKDIR` as root and never `chown` it, then drop to a
    non-root user (`migrations`/`seeding`, uid 1000). The default `LOG_FILE` is `/app/logs/*.log`, so
    `log_file.parent.mkdir(parents=True, exist_ok=True)` raises `PermissionError`, is caught by
    `except OSError`, and `open_log_file` returns `None` — the sink degrades to stdout-only on every
    containerised run. `grep -n "mkdir\|chown\|logs" alembic/Dockerfile scripts/seeding/Dockerfile`
    returns nothing.
  - `alembic/migrations/env.py:37` calls `fileConfig(config.config_file_name)`, applying the
    hard-coded `level = WARNING` / `WARNING` / `INFO` at `alembic/alembic.ini:31,36,41`. `LOG_LEVEL`
    reaches the `structlog` wrapper only, never alembic's own progress output.
  - `scripts/seeding/src/config.py` defines `Config` and `load_config` but no module-level instance;
    `[PY-024]` is a MUST.
- Verification:
  - `grep -n "mkdir -p /app/logs" alembic/Dockerfile scripts/seeding/Dockerfile` returns a line in
    each, ordered before the corresponding `USER` instruction, with a matching `chown`.
  - `grep -n "LOG_LEVEL" alembic/alembic.ini alembic/migrations/env.py` shows the level is sourced
    from the environment.
  - `cd scripts/seeding && python -m pytest` passes (currently 271 tests).
  - `black --check alembic scripts` and `flake8 alembic scripts` are clean.

For remediation without a testable behaviour change, replace the TDD cycle with: reproduce the
failure, apply the fix, re-run the Verification checks until they pass.

## Iteration 2 Outcome

All four re-review violations are fixed. Notes that matter for the next review:

- `[LOG-005]` — both images now run `mkdir -p /app/logs && chown <user>:<user> /app/logs` between the
  last `COPY` and the `USER` instruction, so only the log directory changes owner; sources stay
  root-owned and read-only to the runtime user. The comments in both `src/config.py` files no longer
  claim the default path "is writable in the container"; they name the image step that makes it so
  and state the stdout-only fallback outside the image. `scripts/seeding/Dockerfile`'s header claim
  about import-time validation was rewritten to describe the deferred import (below).
- `[LOG-006]` — `logging.config.fileConfig` reads every `level` key of `alembic.ini` literally and
  takes no `defaults` from `migrations/env.py` (which is outside this iteration's write set), so the
  level cannot be interpolated from the environment inside the ini file. It does resolve the `class`
  key of a handler section to a handler class, so the console handler is now
  `src.config.ConsoleHandler`, which sets its own level from `CONFIG.LOG_LEVEL` (default `INFO`, and
  an unknown name falls back to it). `[logger_alembic]` moved to `DEBUG` so alembic's records are
  offered in full and the handler does the filtering; `[logger_root]` and `[logger_sqlalchemy]` stay
  at `WARNING`. Verified against the offline gate: unset/`INFO`/`bogus` emit the four `INFO` lines,
  `WARNING` emits none, `DEBUG` emits five — all exit 0.
- `[PY-024]` — resolved as Option A, per the orchestrator's decision. `scripts/seeding/src/config.py`
  has a module-level `CONFIG = Config()`; `load_config(None)` returns it. `src/main.py` no longer
  imports `src.config` at module scope: `DEFAULT_LOG_LEVEL`/`DEFAULT_LOG_FILE` are duplicated there
  (as in `alembic/src/main.py`), `Config` is a `TYPE_CHECKING`-only import, and `src.main.load_config`
  performs the import inside the function. A missing variable therefore still raises a *catchable*
  `ValidationError` inside `main()` and is reported as one structured line naming only the variable.
  `test_config_module_builds_no_settings_at_import_time` was replaced by
  `test_config_module_builds_the_settings_at_import_time`,
  `test_load_config_returns_the_global_instance` and
  `test_config_module_import_reports_a_missing_variable`; `test_main.py` gained
  `test_main_imports_without_the_settings_environment`, which pins that `src.main` imports with no
  `POSTGRES_*` variable set and leaves `src.config` unimported. The subprocess acceptance gate
  `test_cli_reports_a_missing_variable_by_name_and_exits_non_zero` is unchanged and passes.

Verification: 273 tests pass with no PostgreSQL binary present (271 baseline + 7 added − 5 replaced),
also in a bare environment (`env -i`); `black --check` and `flake8` clean over `alembic/` and
`scripts/`; both offline render gates exit 0, the upgrade emits `CREATE SCHEMA IF NOT EXISTS base`
(line 10) before the first base-qualified statement (line 15) and the downgrade contains the
unconditional `DROP SCHEMA base RESTRICT`.

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations.
- [x] Sweep the boundary: confirm both images share the same root-owned `WORKDIR` / non-root `USER`
      shape, and that both entrypoints share the same swallowed-`OSError` path.
- [x] For violation 1/2, `test_configure_logging_survives_an_unwritable_log_file` already covers the
      stdout-only fallback, so it was left alone rather than duplicated. The image-level fix itself is
      not unit-testable (no container runtime); it is verified by inspection plus the `grep` checks.
- [x] For violation 3, no test is possible in the alembic component (no suite, binding decision) —
      verified by running the offline render gate at four `LOG_LEVEL` settings plus inspection.
- [x] For violation 4, the two `src.config` contract tests were rewritten first and failed (7 failing
      tests) before the code moved.

### 2. Green Phase

- [x] **Violation 1 — `alembic/Dockerfile`**: before `USER migrations`, add
      `RUN mkdir -p /app/logs && chown migrations:migrations /app/logs` (or `chown` the whole
      `WORKDIR`). Keep the ownership change minimal — do not make the application sources writable by
      the runtime user.
- [x] **Violation 2 — `scripts/seeding/Dockerfile`**: the same, with `seeding:seeding`, before
      `USER seeding`.
- [x] Correct the now-false comments at `alembic/src/config.py:24-28` and
      `scripts/seeding/src/config.py:41-45` ("which is writable in the container") to state that the
      image creates and owns the directory. Also correct `scripts/seeding/Dockerfile:6-7`, which
      still claims `src/config.py` validates the environment at import time.
- [x] **Violation 3 — `alembic/alembic.ini`**: the `%(LOG_LEVEL)s` + `fileConfig(defaults=...)` shape
      proposed here needs `migrations/env.py`, which is outside iteration 2's write set;
      `configparser` interpolation cannot reach the environment on its own. Solved inside
      `alembic.ini` instead, via the `class` key of the handler section — see Iteration 2 Outcome.
      `LOG_LEVEL` unset keeps working and defaults to `INFO`.
- [x] **Violation 4 — `scripts/seeding/src/config.py` (`[PY-024]`)**: resolved as **Option A** by
      orchestrator decision (iteration 2), mirroring `alembic/`. The options that were put:
      - `[PY-024]` (MUST) requires a global `Config` instance; `TASK-CODE-REVIEW-REMEDIATION`
        (lines 84-86) required removing the import-time instance so that `main()`'s error handler
        stays reachable and no traceback renders the environment.
      - Option A (conforming): mirror `alembic/` — restore `CONFIG = Config()` in `config.py` and
        move `from src.config import ...` inside the functions of `scripts/seeding/src/main.py` so
        the module is imported lazily. Cost: every test that imports `src.config` must supply the
        `POSTGRES_*` environment before import.
      - Option B (waiver): the user accepts the deviation; record it in the Approved Deviations list
        of `docs/plans/quality/WP-001/WP-001-quality-report.md` and in
        `scripts/seeding/README.md`, so it is not re-raised.
- [ ] Add a line to both READMEs noting that `LOG_FILE` lives inside the container and that
      `docker run --rm` discards it unless `/app/logs` is mounted. — **not done**: both READMEs are
      outside iteration 2's write set. Carry into the next iteration if the reviewer still wants it;
      it was not one of the four re-review violations.

### 3. Refactor Phase

- [x] Re-run the seeding suite and confirm no regression (273 passed, no PostgreSQL binary present).
- [x] Confirm `black --check` and `flake8` are clean over `alembic/` and `scripts/`.

## Completion Criteria

- [x] Both images create `/app/logs` owned by their non-root runtime user before the `USER`
      instruction, so `LOG_FILE` resolves to a writable path (`[LOG-005]`).
- [x] The alembic library's log level is sourced from `LOG_LEVEL` with a safe default
      (`[LOG-006]`).
- [x] The `[PY-024]` conflict is resolved by an explicit decision (Option A, taken by the
      orchestrator), and the outcome is recorded in Iteration 2 Outcome and in the code.
- [x] All added tests pass; the full seeding suite passes.
- [x] Verification checks from Remediation Context pass (`grep` for the `mkdir -p /app/logs` lines,
      `LOG_LEVEL` reaching alembic's own output, the suite, `black --check`, `flake8`).

## Notes

- Impact scope: container runtime filesystem layout, logging configuration of both components, and
  the seeding settings contract if Option A is taken.
- Scope boundary — preserve unchanged:
  - `alembic/migrations/versions/0001_initial_base_schema.py` — the iteration-0 `COMMENT ON TYPE`
    fixes are correct and complete.
  - `scripts/seeding/src/main.py` / `alembic/src/main.py` logging code — `configure_logging`,
    `TeeStream`, `open_log_file` and the deliberate double configuration in `main()` all conform;
    only the surrounding image and comments are wrong. The one permitted change here is closing the
    file handle opened by the first `configure_logging()` call, if the executor chooses to address
    the descriptor leak noted in the report's Observations.
  - `scripts/seeding/src/persistence.py`, `src/models.py`, `src/fixtures.py` and the fixture corpus —
    untouched by this task.
  - `.pre-commit-config.yaml`, `.flake8` — deliberately untouched for this work plan.
