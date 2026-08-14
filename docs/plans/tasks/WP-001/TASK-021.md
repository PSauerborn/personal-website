# Task: CV domain fixtures and whole-corpus cross-reference test

Work Plan ID: WP-001
Task ID: TASK-021
Created Date: 2026-08-13
Description: Author the CV experience, CV skills and CV education fixtures, and complete `scripts/seeding/tests/test_fixtures.py` with a whole-corpus test proving every shipped fixture validates and every cross-file ID reference resolves.
Acceptance Criteria Covered: AC-6, AC-10

## Implementation Content

Author, exactly per the catalogue in `scripts/seeding/README.md` (TASK-009):

- **CV experience** domain fixture — the **owner** of `base.cv_stack_item`: experiences,
  their responsibilities, the stack items themselves, and the experience↔stack-item links.
  Cover the cases the `@spec-002`/`@spec-003` CV scenarios require, including a current role
  with a null `end_date` and experiences with several responsibilities and stack items.
- **CV skills** fixture: skill categories plus category↔stack-item links that reference stack
  items **by ID only** (this fixture must not define stack items — ownership rule, RISK-008).
  Include at least one stack item that belongs to no category (uncategorised) if the scenarios
  require it.
- **CV education** fixture: education entries, including one with a null `end_date`.
- Rules (unchanged): IDs are **pre-generated UUIDv7 hex literals**; every referenced stack-item
  ID must exist in the CV experience fixture.
- Complete `scripts/seeding/tests/test_fixtures.py` with the **whole-corpus test**: load the
  entire shipped `scripts/seeding/fixtures/` directory through the real loader and models and
  assert that (a) every domain file named in the catalogue is present and validates, (b) every
  document row has non-empty sidecar bytes with a matching derived `size`, and (c) **every
  cross-file ID reference resolves** to a defined row (CV skills → stack items, audit log → API
  keys, agent-spec links → documents/specs, and every other FK column).

## Target Files

- [x] scripts/seeding/fixtures/ (CV experience, CV skills and CV education domain JSON files — names per the catalogue)
- [x] scripts/seeding/tests/test_fixtures.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — CV rows with motivating scenarios;
  the `cv_stack_item` ownership rule; the full enumerated file list)
- /home/agent/workspace/scripts/seeding/src/models.py (TASK-012 — the CV aggregate models)
- /home/agent/workspace/scripts/seeding/src/persistence.py (TASK-015 — the link-resolution
  function the corpus test can reuse to check cross-file references)
- /home/agent/workspace/scripts/seeding/tests/test_fixtures.py (TASK-018/019/020 — the harness to
  complete)
- /home/agent/workspace/acceptance/features/cv.feature (scenarios these rows satisfy — read-only)

## Investigation Notes

- `scripts/seeding/README.md` §4.4–§4.6 fixes the CV rows exactly: three experiences (Senior
  Engineer @ Acme Cloud GmbH, 2022-03-01 → null; Platform Engineer @ Beta Systems AG,
  2019-01-01 → 2022-02-28; Software Engineer @ Gamma Labs, 2016-09-01 → 2018-12-31) with 3/2/2
  responsibilities and 3/2/2 stack items (seven `cv_stack_item_experience_link` rows); five
  stack items owned here (Go, Python, Kubernetes, Terraform, PostgreSQL); three skill
  categories (Languages → Go + Python, Infrastructure → Kubernetes, Databases → PostgreSQL,
  four category links, Terraform deliberately uncategorised); three education rows (PGCert @
  Open University 2025-01-01 → null, MSc @ TU Munich, BSc @ University of Bristol).
- `src/models.py`: `CvStackItemCategoryLinkFixture` carries only `id` and `stack_item_id`, and
  every fixture model is `extra="forbid"`, so an inline `stack_item` in `cv_skills.json` is a
  `ValidationError` — the ownership rule A-1 is enforced by the model, not by a convention.
- `src/persistence.py`: `build_seed_plan` flattens, de-duplicates on primary key and runs
  `validate_references` against `FOREIGN_KEYS`, so the whole-corpus test can drive the real
  planner rather than re-deriving the FK graph; `INSERT_ORDER` mirrors README §6.
- `tests/test_fixtures.py`: the shipped harness is parametrised over `SHIPPED_DOMAINS` with a
  `DOCUMENT_BEARING_DOMAINS` subset; `load_shipped_domain` used `load_domain_file` because
  `load_fixtures` demands the complete catalogue. With the CV files authored the catalogue is
  complete, so the harness now loads the whole corpus through `load_fixtures` once and indexes
  into it — `load_fixtures` is the single authoritative entry point.
- `acceptance/features/cv.feature` motivates every row above: complete aggregates for "Senior
  Engineer", a null end date for the ongoing role, descending order over three distinct start
  dates per collection, the three-category skills map and the uncategorised "Terraform".

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-009 | Fixture catalogue derivation | blocks | Catalogue rows, ownership rules and the full file list |
| TASK-012 | Domain-aggregate pydantic models | blocks | The CV aggregate models |
| TASK-015 | Persistence planning functions | blocks | Flatten/de-duplicate/link functions used by the corpus test |
| TASK-020 | Contacts, API key and admin audit log fixtures | blocks | The extended shipped-fixture harness and the remaining corpus |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables; list the required CV rows with motivating scenarios
- [x] Write the failing whole-corpus test (all catalogue files present and valid; all document
      sidecars non-empty with matching sizes; all cross-file ID references resolve)
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Author the three CV fixture files
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Consolidate the harness so the corpus test is the single authoritative check; confirm the
      full seeding suite passes

## Completion Criteria

- [x] The CV experience, CV skills and CV education fixture files exist with exactly the rows the
      catalogue requires, including a current role with a null `end_date`
- [x] `base.cv_stack_item` rows are defined **only** in the CV experience fixture; the CV skills
      fixture references them by ID
- [x] The whole-corpus test loads every catalogue-named file through the real loader and models
      and passes
- [x] Every document across the whole corpus has non-empty sidecar bytes and a derived `size`
      equal to the file's byte length
- [x] Every cross-file ID reference in the whole corpus resolves to a defined row
- [x] The set of files under `scripts/seeding/fixtures/` matches the catalogue in
      `scripts/seeding/README.md` exactly — no undocumented file, no missing file
- [x] `acceptance/**` is unmodified
- [x] The full `scripts/seeding/tests/` suite passes with no PostgreSQL binary present

## Notes

- Impact scope: this closes the fixture corpus; TASK-022's image tests stage runs the resulting
  suite during the build.
- Risk countermeasures carried by this task: **RISK-004** (rows traced to scenarios),
  **RISK-005** (catalogue↔fixtures directory match with no drift), **RISK-008** (ownership
  enforced; unresolved references fail), **RISK-009** (sidecar bytes/derived size over the whole
  corpus), **RISK-011**, **RISK-019** (authored against the reviewed catalogue).
- Scope boundary: does not modify `README.md`, models, loader or persistence code; does not edit
  fixtures authored by TASK-018/019/020.
