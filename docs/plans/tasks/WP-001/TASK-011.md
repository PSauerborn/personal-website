# Task: Document fixture model with sidecar content and derived size

Work Plan ID: WP-001
Task ID: TASK-011
Created Date: 2026-08-13
Description: Create `scripts/seeding/src/models.py` with the shared pydantic v2 base configuration and the `base.document` model that resolves a sidecar content path safely, reads it as bytes, and derives `size`; with tests in `scripts/seeding/tests/test_models.py`.
Acceptance Criteria Covered: AC-7, AC-10

## Implementation Content

Binding decision F-1 (`docs/specs/SPEC-001-REVIEW.md` §6a): a document fixture's `content`
field holds a **path relative to `scripts/seeding/fixtures/`**; the seeder reads that file as
bytes; `size` is **derived** from the file's byte length and is never fixture-supplied.

Deliver, in `scripts/seeding/src/models.py`:

- A shared pydantic v2 base model with `model_config = ConfigDict(extra="forbid")` (so unknown
  keys — including a fixture-supplied `size` — are rejected) that all fixture models inherit.
- The document model, with the fields of `base.document` (`id`, `filename`, `restricted`,
  plus the derived `size` and the resolved `content` bytes). It must:
  1. Reject an **absolute** `content` path outright.
  2. Resolve the path against the fixtures root and reject any resolved path that falls
     **outside** that root — compare fully resolved absolute paths so `..` segments and
     symlinks are both covered.
  3. Read the file in **binary** mode (`Path.read_bytes()`), never decoding to text.
  4. Derive `size = len(content_bytes)`.
  5. Raise a validation error for a missing file and for an **empty** file (AC-10 requires
     non-empty representative content).
  6. Reject a fixture that supplies `size` explicitly.
- The fixtures root must be injectable (e.g. via pydantic validation context or an explicit
  constructor argument) so tests can point at a `tmp_path` tree.

`id` is required on every record (REQ-2.3) and is a 32-character UUIDv7 hex string — enforce
the length/format on the base model or on a shared ID type.

## Target Files

- [x] scripts/seeding/src/models.py
- [x] scripts/seeding/tests/test_models.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — sidecar document rules and which
  fixtures carry documents)
- /home/agent/workspace/alembic/migrations/versions/0001_initial_base_schema.py (`base.document`
  table — exact columns, types, nullability, defaults)
- /home/agent/workspace/scripts/seeding/tests/conftest.py (TASK-010 — `fixtures_root` fixtures)
- /home/agent/workspace/docs/specs/SPEC-001-REVIEW.md (§6a F-1 — sidecar decision)
- Coding standards via the `coding-standards` skill: `python/GENERAL.md` plus the data-models
  example

## Investigation Notes

- `scripts/seeding/README.md` §5.1 states the binding sidecar rule: `content` is a path
  relative to `scripts/seeding/fixtures/`, read as bytes; `size` is derived and never
  fixture-supplied; an escaping, missing or empty path is a validation error raised before
  any database interaction. §5.1 lists the twelve sidecar files (five blog, seven spec);
  `restricted` defaults to `true` in the schema, so public documents must set it explicitly.
- `alembic/migrations/versions/0001_initial_base_schema.py::create_document` gives the
  column set: `id` `VARCHAR(32)` (hyphen-free UUIDv7 hex, `ID_LENGTH` = 32), `filename`
  `VARCHAR(255) NOT NULL`, `size` `INTEGER NOT NULL`, `restricted` `BOOLEAN NOT NULL`
  server-default `true`, `content` `BYTEA NOT NULL`, plus the shared timestamp columns
  (`created_at` / `updated_at`, both server-defaulted — not fixture-supplied for documents).
- `scripts/seeding/tests/conftest.py` supplies `fixtures_root` (an empty `tmp_path`
  directory for synthetic trees) and `shipped_fixtures_root`, and carries the NO-SERVER
  rule; no `pytest-postgresql` fixture may be requested. `src/` has no `__init__.py`, so
  `src.models` imports without pulling in `src.config` (whose module-level `CONFIG` needs
  `POSTGRES_*` set).
- `docs/specs/SPEC-001-REVIEW.md` §3 F-1 is the finding the sidecar decision resolves: the
  spec never defined the binary fixture encoding nor whether `size` is supplied or derived.
- Standards: `[PY-013]`/`[PY-014]` (models in `models.py`, pydantic), `[PY-019]`
  (length-constrained strings over bare `str`), `[PY-006]`–`[PY-008]` (Google docstrings
  starting with the function name, full type hints), `[PY-026]`–`[PY-028]` (pytest suite in
  `tests/`, one `test_*.py` per module), `[PY-031]` (no live connections). `flake8` is
  configured repo-wide at 88 columns, black-compatible.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-003 | Single initial migration revision for the `base` schema | informs | `base.document` column set and types |
| TASK-009 | Fixture catalogue derivation | blocks | Sidecar-content rules and the document fixture inventory |
| TASK-010 | Seeding component test scaffolding and dependencies | blocks | `conftest.py` fixtures and pinned pydantic/pytest versions |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables (`README.md` catalogue, conftest fixtures)
- [x] Verify/create contract definitions: the document model's field set, matched to the
      `base.document` columns
- [x] Write failing tests in `test_models.py` covering: valid document (correct derived size
      for a known byte string), `../` traversal rejection, symlink-escape rejection, absolute
      path rejection, missing file, empty file, and explicit fixture-supplied `size` rejection
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Add minimal implementation to pass the tests
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Extract the shared base model / ID type cleanly for reuse by TASK-012; confirm tests
      still pass; `black` and `flake8` clean

## Completion Criteria

- [x] A document fixture whose `content` path resolves inside `scripts/seeding/fixtures/`
      validates, exposes the file's bytes unchanged, and reports `size` equal to the byte
      length
- [x] A `content` path containing `..`, a symlink pointing outside the fixtures root, or an
      absolute path is rejected with a validation error
- [x] A missing sidecar file and an empty sidecar file are each rejected with a validation error
- [x] A fixture supplying `size` is rejected (`extra="forbid"` plus an explicit check)
- [x] Content is read in binary mode — no decode/encode round trip anywhere in the path
- [x] `id` is required and validated as a 32-character hex string
- [x] All added tests pass with no PostgreSQL binary present
- [x] `black` and `flake8` clean

## Notes

- Impact scope: `models.py` is extended by TASK-012 with the remaining domain aggregates and is
  consumed by `fixtures.py` (TASK-014) and the shipped-fixture tests (TASK-018 … TASK-021).
- Risk countermeasures carried by this task: **RISK-009** (containment check on resolved paths,
  binary read, derived size, rejection of fixture-supplied size, missing/empty file errors —
  with tests for each), **RISK-012** (no server-dependent test).
- Scope boundary: does not touch `conftest.py`, `config.py`, `fixtures.py`, or any fixture data.
