# Task: Seeding component test scaffolding and dependencies

Work Plan ID: WP-001
Task ID: TASK-010
Created Date: 2026-08-13
Description: Create `scripts/seeding/requirements.txt` and `scripts/seeding/tests/conftest.py` — the pinned dependency set and the shared test fixtures, with a hard rule that no test may spawn or connect to a PostgreSQL server.
Acceptance Criteria Covered: AC-6

## Implementation Content

- `scripts/seeding/requirements.txt`: pins for `pydantic` (v2), `pydantic-settings`,
  `psycopg` (v3, with the binary/pool extra as appropriate), `structlog`, `pytest`, and
  `pytest-postgresql`. `pytest-postgresql` is pinned because binding decision 5 names it —
  but **no test may request any `pytest-postgresql` fixture that spawns or connects to a
  server**, because no `postgres` executable exists in the test environment or in the image
  (RISK-012). All pins must resolve on **Python 3.14**; if one has no 3.14 wheel, surface the
  conflict rather than lowering the interpreter (RISK-011).
- `scripts/seeding/tests/conftest.py`: shared fixtures only, all offline:
  - a `fixtures_root` fixture pointing at a `tmp_path`-based directory for synthetic fixture
    trees, and one pointing at the real `scripts/seeding/fixtures/` directory for the
    shipped-fixture tests added later;
  - a **fake connection/cursor** factory that records executed statements, parameters, and the
    call sequence (`execute`, `commit`, `rollback`, `close`, transaction enter/exit) so
    downstream tests can assert on ordering and commit counts. Implement it with
    `unittest.mock` or as a small hand-rolled recorder; it must not import `psycopg` connection
    machinery that requires a server.
  - a module-level comment stating the no-server rule so future contributors do not add a
    server-spawning fixture.

## Target Files

- [x] scripts/seeding/requirements.txt
- [x] scripts/seeding/tests/conftest.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Verification Strategy" →
  pytest-postgresql resolution; "Reference Contracts" → Docker/build contract)
- /home/agent/workspace/docs/specs/SPEC-001-REVIEW.md (§6b "Test scaffolding" — the binding
  decision naming pytest + pytest-postgresql with the database mocked)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-2.1 — psycopg for inserts)
- Coding standards via the `coding-standards` skill: `python/GENERAL.md` (testing statements
  and the persistence-postgres example)

## Investigation Notes

- WP-001 "Verification Strategy": no live PostgreSQL in this changeset; the seeding unit
  suite drives the persistence layer through mock connection/cursor objects recording
  executed statements. `pytest-postgresql` is pinned only to honour the binding decision;
  its process fixtures need a `postgres` executable that is absent. The Dockerfile tests
  stage (no PostgreSQL binary) is the enforcement mechanism. Lint contract: repo `.flake8`
  (max-line-length 88, extend-ignore E203/W503) plus `black`.
- WP-001 "Reference Contracts" / binding decisions: Python 3.14 slim base for both images;
  `POSTGRES_*` variable set is `HOST/PORT/USER/PASSWORD/DB`; config via `pydantic_settings`.
- SPEC-001-REVIEW §6b: "Unit tests for the seeding script only, using `pytest` +
  `pytest-postgresql`, mocking the database — no real database is started in tests."
- SPEC-001 REQ-2.1: fixtures are validated with `pydantic` models and inserted via
  `psycopg`; REQ-2.5 requires truncate-then-insert in a single committed transaction, so the
  recorder must expose statement order plus commit/rollback counts.
- Standards (`python/GENERAL.md`): `[PY-026]` tests live under `tests/`, `[PY-027]` pytest,
  `[PY-029]` shared fixtures in `conftest.py`, `[PY-031]` mock database connections,
  `[PY-045]`–`[PY-047]` psycopg v3 with `dict_row` and autocommit disabled — the fake cursor
  therefore accepts and records a `row_factory` argument and never commits implicitly.
- Environment check: no `postgres`/`pg_ctl` on PATH; pins verified to resolve for cp314
  (`pip install --dry-run --python-version 3.14 --abi cp314/abi3/none --only-binary=:all:`)
  with `psycopg-binary` 3.3.4 and `pydantic-core` 2.46.4 both providing 3.14-compatible
  wheels.
- Recorder contract published for downstream test tasks (`conftest.py`):
  `FakeConnection(recorder=None, rows=None)` with `.recorder`, `.cursor(row_factory=...)`,
  `.execute()`, `.transaction()`, `.commit()`, `.rollback()`, `.close()` and context-manager
  support; `FakeCursor` with `.execute/.executemany/.fetchone/.fetchall/.close`;
  `CallRecorder` exposing `.calls` (`RecordedCall(name, sql, params)`), `.names`,
  `.executed`, `.statements`, `.parameters`, `.commit_count`, `.rollback_count`. Call names
  are `cursor`, `execute`, `executemany`, `fetchone`, `fetchall`, `cursor_close`, `commit`,
  `rollback`, `close`, `transaction_enter`, `transaction_exit`. Fixtures: `call_recorder`,
  `fake_connection_factory`, `fake_connection`, `fixtures_root` (tmp_path-based),
  `shipped_fixtures_root` (real `scripts/seeding/fixtures/`).

## Task Dependencies

(None.)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Verify/create contract definitions: decide and write down the recorder API the fake
      connection exposes (e.g. `.statements`, `.calls`, `.commit_count`) — downstream test
      tasks depend on it
- [x] Red check: run `python -m pytest scripts/seeding/tests` and confirm it fails/collects
      nothing (no suite yet)

### 2. Green Phase

- [x] Add `requirements.txt` and `conftest.py` with a single smoke test-free collection; run
      `python -m pytest scripts/seeding/tests` and confirm it collects and exits cleanly with
      no tests, **with no PostgreSQL server running and no `postgres` binary on PATH**

### 3. Refactor Phase

- [x] Simplify the recorder API; re-run collection

## Completion Criteria

- [x] `python -m pytest scripts/seeding/tests` collects successfully with no PostgreSQL binary
      available and no server running
- [x] `conftest.py` defines the fake connection/cursor recorder (statements, parameters, call
      sequence, commit/rollback counts) and the fixtures-root fixtures
- [x] No fixture in `conftest.py` spawns, starts, or connects to a PostgreSQL server; no
      `pytest_postgresql` fixture is imported or requested
- [x] `requirements.txt` pins pydantic v2, pydantic-settings, psycopg v3, structlog, pytest and
      pytest-postgresql, all resolvable on Python 3.14
- [x] `black` and `flake8` clean

## Notes

- Impact scope: every seeding test module (`test_models.py`, `test_config.py`,
  `test_fixtures.py`, `test_persistence.py`, `test_main.py`) consumes this conftest; the
  seeding Dockerfile's tests stage (TASK-022) runs the resulting suite.
- Risk countermeasures carried by this task: **RISK-012** (no server-spawning fixture; the rule
  is stated in the file), **RISK-011** (Python 3.14-compatible pins).
- Scope boundary: no source modules are written here; no `postgres` server package is added
  anywhere.
