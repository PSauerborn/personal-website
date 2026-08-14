# Task: Blog domain fixtures, sidecar article documents, and the shipped-fixture test harness

Work Plan ID: WP-001
Task ID: TASK-018
Created Date: 2026-08-13
Description: Author the blog domain fixture JSON (topics, articles, comments, owned documents) with its sidecar content files, and add the shipped-fixture validation harness to `scripts/seeding/tests/test_fixtures.py`.
Acceptance Criteria Covered: AC-6, AC-10

## Implementation Content

Author, exactly per the catalogue in `scripts/seeding/README.md` (TASK-009):

- The blog domain fixture JSON under `scripts/seeding/fixtures/` (file name as named in the
  catalogue) containing topics, articles, article comments and the documents the articles own.
  It must cover the distinguishing cases the `@spec-002`/`@spec-003` blog scenarios require —
  at minimum visible **and** hidden articles, an article with **no** linked document, articles
  with one and with several topics, and comments with and without an author.
- The sidecar content files under `scripts/seeding/fixtures/documents/**` referenced by each
  document row's `content` path. Content must be **representative and non-empty** (REQ-2.8,
  AC-10) — readable Markdown/text so it stays diffable in git.
- Rules: IDs are **pre-generated UUIDv7 hex literals** (32 chars, no hyphens) written into the
  file — never generated at runtime; `content` is a path relative to
  `scripts/seeding/fixtures/`; **no fixture supplies `size`**.
- Extend `scripts/seeding/tests/test_fixtures.py` with the **shipped-fixture harness**: a test
  that loads the real `scripts/seeding/fixtures/` directory through the real loader and models,
  asserting the blog domain validates and that every document it defines has non-empty sidecar
  bytes with the derived `size` equal to the file length. Structure the harness so later fixture
  tasks add their domains to it without rewriting it.

## Target Files

- [x] scripts/seeding/fixtures/ (blog domain JSON file — name per the catalogue)
- [x] scripts/seeding/fixtures/documents/ (sidecar content files for the blog documents)
- [x] scripts/seeding/tests/test_fixtures.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — the blog fixture rows, their
  motivating scenarios, sidecar requirements, and shared-document ownership)
- /home/agent/workspace/scripts/seeding/src/models.py (TASK-011/012 — the blog aggregate model's
  exact field names and the document model's constraints)
- /home/agent/workspace/scripts/seeding/src/fixtures.py (TASK-014 — expected file names and the
  loader entry point the harness calls)
- /home/agent/workspace/acceptance/features/blog.feature (the scenarios these rows must satisfy
  — read-only)

## Investigation Notes

- `scripts/seeding/README.md` §4.2 fixes the blog catalogue: four topics (`golang`, `postgres`,
  `terraform`, `kubernetes`), six articles (`sample_post`, `scaling_postgres`,
  `terraform_layout`, `k8s_operators`, `unpublished_notes`, `draft_post`) and four comments
  (three on `sample_post` with ascending explicit `created_at`, one on `scaling_postgres`).
  `draft_post` has no document; all five documents are `restricted: false`; every
  `authored_at` is distinct. §5.1 fixes the five sidecar paths under `documents/blog/`.
- `src/models.py`: `ArticleFixture` has `author`, `title`, `description`, `display`,
  `authored_at`, `document`, `topics`, `comments`; `extra="forbid"` on every model.
  `topics` entries are `ArticleTopicLinkFixture` — the **link** carries its own `id` and
  embeds `topic` (README §5.2, "link rows carry their own explicit ID"). `DocumentFixture`
  rejects a fixture-supplied `size` and derives it from the sidecar's byte length; `content`
  is a path relative to the fixtures root.
- `src/fixtures.py`: `load_fixtures` requires **every** catalogue file to be present, so it
  cannot yet run against the shipped tree (TASK-019/020/021 add the other nine files). The
  harness therefore drives the same real code path one domain at a time through
  `load_domain_file` — the entry point `load_fixtures` itself calls — keyed off a
  `SHIPPED_DOMAINS` tuple that later tasks extend by adding their file name. Once the
  catalogue is complete, the harness can be switched to `load_fixtures` without changing an
  assertion.
- `tests/conftest.py` already exposes a `shipped_fixtures_root` fixture pointing at
  `scripts/seeding/fixtures/`; no conftest change is needed.
- `acceptance/features/blog.feature` (read-only) confirms the catalogue: listing needs
  collections of visible and hidden posts with linked topics, "Draft Post" must exist with no
  document, "Sample Post" carries the comment scenarios including the oldest-first ordering,
  and content responses assert the full document body byte-for-byte.
- IDs were pre-generated as UUIDv7 hex literals (48-bit ms timestamp, version 7, RFC 4122
  variant, hyphens removed) and are frozen from this commit; none collides with the reserved
  literals of README §3.2.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-009 | Fixture catalogue derivation | blocks | The blog fixture catalogue and file naming |
| TASK-012 | Domain-aggregate pydantic models | blocks | The blog aggregate model |
| TASK-014 | Fixture discovery, loading and validation | blocks | The loader the shipped-fixture harness drives |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables; list the blog rows required by the catalogue with their
      motivating scenarios
- [x] Write the failing shipped-fixture test (loads the real fixtures directory, asserts the
      blog domain validates and every blog document has non-empty bytes with a matching derived
      size)
- [x] Run tests and confirm failure (fixtures do not exist yet)

### 2. Green Phase

- [x] Author the blog fixture JSON and its sidecar content files
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Generalise the harness so subsequent domains plug in; confirm tests still pass

## Completion Criteria

- [x] The blog fixture file exists with exactly the rows the catalogue requires, including
      visible and hidden articles and an article with no linked document
- [x] Every blog document row references a sidecar file that exists under
      `scripts/seeding/fixtures/documents/` and is non-empty
- [x] The shipped-fixture test loads the real fixtures directory through the real loader and
      models and passes, with the derived `size` equal to each sidecar file's byte length
- [x] All IDs are 32-character pre-generated hex literals; no fixture supplies `size`; no
      runtime UUID generation
- [x] `acceptance/**` is unmodified
- [x] All added tests pass with no PostgreSQL binary present

## Notes

- Impact scope: `test_fixtures.py` is extended further by TASK-019, TASK-020 and TASK-021; the
  document rows created here are shared with the agent-spec domain via the seeder's
  de-duplication.
- Risk countermeasures carried by this task: **RISK-004** (rows traced to scenarios; feature
  files untouched), **RISK-005** (IDs and file names are a stable published contract),
  **RISK-009** (non-empty sidecars, no fixture-supplied size), **RISK-011** (pre-generated ID
  literals), **RISK-019** (authored against the reviewed catalogue, not ad-hoc judgement).
- Scope boundary: does not modify `README.md`, models, loader, or persistence code.
