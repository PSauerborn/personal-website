# Task: Alembic scaffolding — alembic.ini, env.py, script.py.mako

Work Plan ID: WP-001
Task ID: TASK-002
Created Date: 2026-08-13
Description: Create the alembic runtime scaffolding: `alembic/alembic.ini`, `alembic/migrations/env.py` (connection URL from the config, `base`-schema version table, offline and online modes) and `alembic/migrations/script.py.mako`.
Acceptance Criteria Covered: AC-1

## Implementation Content

Wire alembic so a revision can be rendered offline and executed online:

- `alembic/alembic.ini`: `script_location = migrations`, no hard-coded `sqlalchemy.url`
  (the URL is built in `env.py` from `alembic/src/config.py` — never commit credentials),
  logging configuration consistent with the component.
- `alembic/migrations/env.py`:
  - Build the connection URL from the `Config` object delivered by TASK-001.
  - `run_migrations_offline()` must work with a **dummy URL and no server**, because the
    Phase 1 verification point is `alembic upgrade head --sql` / `alembic downgrade base --sql`
    (the only proxy available for AC-1/AC-2 — no PostgreSQL instance is in scope).
  - `run_migrations_online()` uses a psycopg v3 engine/connection.
  - Alembic's own version table must live in the `base` schema
    (`version_table_schema="base"`), and `include_schemas=True` where relevant. The revision
    itself creates the `base` schema, so offline rendering must not require the schema to
    pre-exist.
  - No `target_metadata` autogenerate wiring is required — the single revision is hand-written.
- `alembic/migrations/script.py.mako`: the standard alembic revision template.

## Target Files

- [x] alembic/alembic.ini
- [x] alembic/migrations/env.py
- [x] alembic/migrations/script.py.mako

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/alembic/src/config.py (TASK-001 deliverable — settings fields and the
  connection-URL helper this file consumes)
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Verification Strategy" → Phase 1
  offline SQL render; "Reference Contracts" → environment contract)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-1.1, REQ-1.2 — single revision creating the
  `base` schema)
- Coding standards via the `coding-standards` skill: `python/GENERAL.md`,
  `databases/POSTGRES.md`

## Investigation Notes

- `alembic/src/config.py` (TASK-001) exposes `Config`/`CONFIG` for the `POSTGRES_*` +
  `ALEMBIC_*` contract and `postgres_connection_url(config=CONFIG)`, which renders a
  SQLAlchemy URL with `drivername="postgresql+psycopg"` (psycopg v3) and the password
  unwrapped. `env.py` consumes this helper — it never reads a URL from `alembic.ini`.
- `CONFIG` is constructed at import time, so every alembic invocation (including
  `--sql` offline runs) requires the full `POSTGRES_*` / `ALEMBIC_*` variable set —
  dummy values are sufficient for offline rendering.
- WP-001 Verification Strategy: Phase 1's only gate is the offline SQL render; no
  PostgreSQL instance is provisioned. Lint gate is `black` + repo `.flake8`
  (max-line-length 88, `extend-ignore = E203, W503`).
- SPEC-001 REQ-1.1/REQ-1.2/REQ-1.3: one revision creates the `base` schema and all
  entities; `downgrade` must leave no residue (enums, triggers, schema).
- Standards applied: `[PY-006]`/`[PY-007]`/`[PY-008]` (Google docstrings, type hints),
  `[PY-003]`/`[PY-004]` (black/flake8), `[PY-020]`–`[PY-024]` (env-driven config via the
  existing `pydantic_settings` `Config` — no credentials in `alembic.ini`), `[PY-045]`
  (psycopg for PostgreSQL access).
- Alembic behaviour observed: `alembic downgrade base --sql` is rejected by alembic
  itself ("downgrade with --sql requires <fromrev>:<torev>"); the offline downgrade is
  invoked as `alembic downgrade head:base --sql`.
- Alembic behaviour observed: with `version_table_schema="base"`, the rendered upgrade
  emits `CREATE TABLE base.alembic_version` **before** the revision body, and the
  rendered downgrade emits the `DELETE FROM base.alembic_version` **after** the
  revision body. TASK-003 must therefore make the revision tolerant of this ordering
  (create the schema idempotently, and drop it in a way that does not orphan or
  collide with the version table).

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-001 | Alembic component configuration model and dependencies | blocks | `alembic/src/config.py` settings model and connection-URL helper; `alembic/requirements.txt` |

## Implementation Steps (TDD: Red-Green-Refactor)

The alembic component ships **without unit tests** by binding decision 5. The Red phase is the
offline-render check, which is the component's real verification gate.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverable: `alembic/src/config.py`
- [x] Red check: from `alembic/`, run `alembic upgrade head --sql` with dummy `POSTGRES_*` /
      `ALEMBIC_*` values and confirm it fails (no scaffolding / no revisions yet) — record the
      error: `FAILED: No 'script_location' key found in configuration.` (exit 255)

### 2. Green Phase

- [x] Add minimal implementation (ini + env.py + mako) so `alembic upgrade head --sql` and
      `alembic downgrade base --sql` run against a dummy URL and exit 0 with no revision
      present (empty output is acceptable at this stage — TASK-003 supplies the revision).
      `alembic upgrade head --sql` exits 0 with an empty `BEGIN; COMMIT;` body. The
      downgrade render was verified against a throwaway probe revision in a scratch copy
      of the component (`alembic downgrade head:base --sql`, exit 0, emitted `DROP SCHEMA
      base;`); with **no** revision present alembic cannot resolve `head` and the command
      fails by alembic's own design, not through this scaffolding.
- [x] Confirm no server connection is attempted in offline mode (rendered with dummy
      `POSTGRES_*` values, no PostgreSQL server running, no connection error)

### 3. Refactor Phase

- [x] Improve code (keep the offline render working); `black` and `flake8` clean on `env.py`

## Completion Criteria

- [x] `alembic upgrade head --sql` and `alembic downgrade base --sql` execute from `alembic/`
      with a dummy connection URL and **no PostgreSQL server running**, exiting 0
      (downgrade is invoked as `alembic downgrade head:base --sql`, which is alembic's
      required offline form; verified exit 0 with a probe revision)
- [x] `alembic.ini` contains no `sqlalchemy.url` credential value; the URL is composed at
      runtime from the config
- [x] Alembic's version table is configured for the `base` schema, and offline rendering does
      not require `base` to already exist
- [x] Online mode uses psycopg v3 (`postgresql+psycopg` engine from
      `postgres_connection_url()`)
- [x] `black` and `flake8` clean

## Notes

- Impact scope: `alembic/migrations/versions/**` (TASK-003) and `alembic/src/main.py`
  (TASK-004) both run through this scaffolding.
- Risk countermeasures carried by this task: **RISK-002** — the offline render enabled here is
  the *only* static gate for DDL correctness; it must render real SQL rather than silently
  no-op, and must never depend on `search_path` defaults.
- Scope boundary: do not modify `alembic/src/config.py` (TASK-001's write set). Do not add a
  CI workflow, docker-compose, or any PostgreSQL provisioning (RISK-018).
