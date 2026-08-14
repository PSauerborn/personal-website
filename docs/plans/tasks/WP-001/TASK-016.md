# Task: Single-transaction seeding executor

Work Plan ID: WP-001
Task ID: TASK-016
Created Date: 2026-08-13
Description: Add the executor function to `scripts/seeding/src/persistence.py` — one function taking an open psycopg v3 connection that performs every truncation and insert inside a single transaction with exactly one commit path; with tests in `scripts/seeding/tests/test_persistence.py`.
Acceptance Criteria Covered: AC-6, AC-7, AC-8

## Implementation Content

REQ-2.5 / AC-7 require atomicity: all truncations and inserts in one transaction, nothing
written on failure. Implement one executor function:

- Signature: takes an **already-open** psycopg v3 connection (created by the caller with
  `row_factory=dict_row` and `autocommit` **disabled**) plus the planned truncate set, ordered
  table list, and rows produced by TASK-015. It must not create the connection itself and must
  not read fixtures.
- All statements run inside a single `with conn.transaction():` block: truncations first (once
  per table, before the first insert into that table), then inserts in the FK-safe order.
- Exactly **one** commit path. No `conn.commit()` anywhere else in the module; no
  `autocommit=True` anywhere in the component.
- Any exception propagates with the transaction rolled back and no commit.
- Log progress with `structlog`; never log the connection, DSN, or the settings object
  (RISK-015). Do not log fixture document content.

Tests use the recording fake connection/cursor from `conftest.py` and assert on the recorded
call sequence.

## Target Files

- [x] scripts/seeding/src/persistence.py
- [x] scripts/seeding/tests/test_persistence.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/src/persistence.py (TASK-015 — the pure planning
  functions whose output the executor consumes)
- /home/agent/workspace/scripts/seeding/tests/conftest.py (TASK-010 — the recorder fake's API:
  statements, call sequence, commit/rollback counts)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-2.5 — single transaction, truncate-once
  semantics)
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Failure Modes" — atomicity entries)
- Coding standards via the `coding-standards` skill: `python/GENERAL.md`
  (persistence-postgres example), `general/LOGGING.md`

## Investigation Notes

- `src/persistence.py` (TASK-015) exposes `SeedPlan` (`rows`, `insert_order`,
  `truncate_order`), `build_truncate_statements(plan) -> tuple[str, ...]` and
  `build_insert_statements(plan) -> tuple[InsertStatement, ...]`. A table may yield MORE
  than one insert statement (`base.article_comment` rows are grouped by column signature),
  so the executor iterates the returned tuple in order instead of assuming one statement
  per table.
- The executor therefore takes `(connection, plan)`: the plan already carries the truncate
  set, the ordered table list and the rows, and the two pure builders turn it into SQL.
- `tests/conftest.py` records `transaction_enter` / `transaction_exit` around a
  `FakeTransaction`, and performs NO implicit commit or rollback on exit, so an explicit
  `connection.commit()` after the transaction block is what the recorder observes. In real
  `psycopg` v3 that commit is a no-op after the outermost block has already committed, and
  it is forbidden (and never attempted) inside the block.
- `JSON` parameters are `psycopg` `Jsonb` adapters, which compare by identity; executor
  parameter assertions unwrap them via the local `comparable()` helper.
- Failure injection is a local `FailingConnection`/`FailingCursor` pair in the test module
  (conftest is out of scope and unchanged); it forwards to the recorder until the insert
  into a nominated table, then raises.
- Standards applied: PY-039/040/041/042/045/046 (dedicated persistence file, one
  transactional unit of work, functional style, client as first argument, `psycopg`, no
  autocommit), PY-006/007/008 (Google docstrings, type hints), PY-038 and LOG-004
  (`structlog`, context in fields: schema, table names and row counts only - never the
  connection, DSN, settings or document content).
- Pre-existing, unrelated failures in `tests/test_fixtures.py` concern the not-yet-authored
  shipped `blog.json` fixture set (a separate task); `tests/test_persistence.py` is green.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-015 | Persistence planning functions | blocks | Truncate set, ordered rows and built SQL the executor runs |
| TASK-010 | Seeding component test scaffolding and dependencies | blocks | Recording fake connection/cursor |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables
- [x] Write failing tests against the recording fake:
      - happy path: all truncates precede the first insert for their table; statements appear in
        the FK-safe order; **exactly one** commit is recorded
      - each table in the truncate set is truncated exactly once
      - failure path: a cursor raising mid-inserts results in **zero** commits and a rollback (or
        a propagated exception with the transaction context exited without commit)
      - the executor never sets `autocommit`
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Add minimal implementation to pass the tests
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Improve structure while keeping exactly one commit path; confirm tests still pass;
      `black`/`flake8` clean

## Completion Criteria

- [x] All truncations and inserts execute inside one transaction block with exactly one commit
      on the success path
- [x] On a mid-run failure the recorded call sequence contains **no** commit
- [x] Each truncated table is truncated exactly once, before the first insert into it
- [x] Inserts are executed in the FK-safe order produced by TASK-015
- [x] The module contains no `autocommit=True` and no `conn.commit()` outside the executor's
      single commit path
- [x] The executor does not create a connection and does not read fixtures
- [x] No log call renders the DSN, password, settings object, or document content
- [x] All added tests pass with no PostgreSQL binary present
- [x] `black` and `flake8` clean

## Notes

- Impact scope: `main.py` (TASK-017) opens the connection and invokes this executor as the last
  step of the pipeline.
- Risk countermeasures carried by this task: **RISK-006** (isolated executor, autocommit
  disabled, one commit path, tests asserting on the recorded call sequence), **RISK-012**
  (mock-driven, no server), **RISK-015** (no credential-revealing logging).
- Scope boundary: does not modify `models.py`, `fixtures.py`, `config.py`, `conftest.py`, or any
  fixture data. Does not change the pure functions' behaviour from TASK-015.
