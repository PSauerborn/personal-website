# Task: Fixture discovery, loading and validation (`scripts/seeding/src/fixtures.py`)

Work Plan ID: WP-001
Task ID: TASK-014
Created Date: 2026-08-13
Description: Implement discovery and loading of the JSON domain fixture files from `scripts/seeding/fixtures/`, validation through the domain-aggregate models, and sidecar document resolution — all completing before any database interaction; with tests in `scripts/seeding/tests/test_fixtures.py`.
Acceptance Criteria Covered: AC-6, AC-7

## Implementation Content

`scripts/seeding/src/fixtures.py` must:

- Discover the JSON domain files under a given fixtures root (default:
  `scripts/seeding/fixtures/`), mapping each expected file name to its domain-aggregate model
  from `models.py`. An expected file that is missing, and an unexpected `.json` file that maps
  to no model, must both raise an explicit error rather than being silently skipped.
- Parse each file (arrays of objects per REQ-2.3) and validate it through its model, passing the
  fixtures root so document sidecar paths resolve and `size` is derived (TASK-011 behaviour).
- Raise `pydantic.ValidationError` (or an explicit wrapping error that preserves it) on any
  invalid fixture — **before any database connection is opened** (AC-7). This module must not
  import or construct a connection; keep it strictly I/O-on-disk plus validation.
- Return the validated aggregates in a structure the persistence layer can consume.
- Do not exclude the `documents/` sidecar subdirectory from discovery by accident — only `.json`
  domain files at the fixtures root are domain files; sidecar content lives under
  `fixtures/documents/**` and is reached only through document `content` paths.

Tests in `scripts/seeding/tests/test_fixtures.py` operate on synthetic fixture trees built in
`tmp_path` (the shipped-fixture tests are added later by TASK-018 … TASK-021).

## Target Files

- [x] scripts/seeding/src/fixtures.py
- [x] scripts/seeding/tests/test_fixtures.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/src/models.py (TASK-011/012 — the aggregate models and
  how the fixtures root is injected for sidecar resolution)
- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — the enumerated domain files and
  their names)
- /home/agent/workspace/scripts/seeding/tests/conftest.py (TASK-010 — `fixtures_root` fixtures)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-2.1, REQ-2.3, REQ-2.4)

## Investigation Notes

- `src/models.py` exports `DOMAIN_FIXTURE_MODELS: dict[str, type[IdentifiedFixtureModel]]`, the
  catalogue of README §4 as code: ten file names, one aggregate model each. `fixtures.py`
  consumes this mapping rather than re-deriving it, so the two never drift.
- `FixtureModel.from_fixture(data, fixtures_root)` validates a payload against an explicit root,
  passing it through the pydantic validation context (`FIXTURES_ROOT_CONTEXT_KEY`). pydantic
  propagates the context into nested models, so a `DocumentFixture` nested inside an article or a
  spec-document link resolves its sidecar against the same root with no extra plumbing, and
  `size` is derived from the sidecar's byte length (README §5.1, F-1).
- Each domain file is a JSON **array of objects** (REQ-2.3, README §4), one object per aggregate,
  so loading is: parse array → validate each element through the file's model.
- Sidecar content lives under `fixtures/documents/**` and is reached only through document
  `content` paths. Discovery therefore scans `*.json` **at the fixtures root only**
  (non-recursive), which excludes `documents/` without a special case.
- `src/` has no `__init__.py`; tests import `src.fixtures`, which must not import `src.config`
  (module-level `CONFIG`) or `psycopg` — validation provably precedes any connection (AC-7).
- `tests/conftest.py` supplies `fixtures_root` (an empty `tmp_path/fixtures` directory) and
  forbids any pytest-postgresql fixture (NO-SERVER RULE).
- Standards applied: PY-005 – PY-011 (snake_case, Google docstrings, full type hints), PY-010
  (functional approach), PY-025 – PY-030 (pytest, one test per function), PY-003/PY-004
  (`black`, `flake8`).

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-012 | Domain-aggregate pydantic models for all fixture domains | blocks | The model per domain file |
| TASK-013 | Seeding component configuration model | informs | Module layout/conventions of `scripts/seeding/src/` |
| TASK-009 | Fixture catalogue derivation | blocks | The canonical list of domain file names |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables (models, catalogue)
- [x] Verify/create contract definitions: the file-name → model mapping, written explicitly
- [x] Write failing tests over synthetic `tmp_path` trees: a complete valid tree loads all
      domains; a malformed JSON file raises; a fixture violating its model raises
      `ValidationError`; a missing expected file raises; an unknown `.json` file raises; a
      document with a valid sidecar loads with derived size
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Add minimal implementation to pass the tests
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Tidy the mapping/loading structure; confirm tests still pass; `black`/`flake8` clean

## Completion Criteria

- [x] Loading a complete valid fixture tree returns validated aggregates for every domain file
      named in the catalogue
- [x] A fixture violating its model raises `ValidationError`; malformed JSON, a missing expected
      file and an unrecognised `.json` file each raise an explicit error
- [x] `fixtures.py` neither imports nor opens a database connection — validation provably
      completes before any DB interaction (AC-7 ordering)
- [x] Document sidecar paths resolve relative to the fixtures root, with `size` derived
- [x] All added tests pass with no PostgreSQL binary present
- [x] `black` and `flake8` clean

## Notes

- Impact scope: `main.py` (TASK-017) calls this before connecting; TASK-018 … TASK-021 extend
  `test_fixtures.py` to run the **shipped** fixtures through this loader.
- Risk countermeasures carried by this task: **RISK-009** (sidecar resolution against the
  fixtures root), **RISK-012** (no server-dependent test), **RISK-006** (validation strictly
  precedes any connection — this module cannot open one).
- Scope boundary: does not modify `models.py`, `config.py`, `persistence.py`, `conftest.py`, or
  any fixture data.
