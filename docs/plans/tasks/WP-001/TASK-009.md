# Task: Fixture catalogue derivation from the acceptance suite (`scripts/seeding/README.md`)

Work Plan ID: WP-001
Task ID: TASK-009
Created Date: 2026-08-13
Description: Read every `@spec-002`, `@spec-003` and `@spec-004` scenario in `acceptance/features/` and record the derived fixture catalogue — domain fixture files, the rows each must contain (each traced to the scenario that motivates it), sidecar document content requirements, shared-lookup ownership, and the FK-safe cross-file insert order — in an initial `scripts/seeding/README.md`.
Acceptance Criteria Covered: AC-6, AC-10

## Implementation Content

This task front-loads the single largest correctness risk in the changeset: the fixtures and the
schema must satisfy 83 already-written scenarios that are **user inputs and cannot be edited**.
It is executed as a genuine derivation, not a plausible guess — every catalogue row cites the
scenario that motivates it (RISK-004, RISK-019).

Read **all six** feature files and **all three** tags (`@spec-002` 42 scenarios, `@spec-003` 5,
`@spec-004` 36). Then write `scripts/seeding/README.md` containing:

1. **Purpose and scope** of the seeding component (one short section; the CLI and environment
   contract are added later by TASK-023 — leave a placeholder heading).
2. **Fixture catalogue** — one subsection per domain aggregate JSON file under
   `scripts/seeding/fixtures/`. The plan's proposed decomposition (confirm or adjust, and
   record the final decision):
   contacts (contact + messages), blog (topics + articles + comments + owned documents),
   agent specs (spec + document links + owned documents), CV experience (experiences +
   responsibilities + owned stack items + links), CV skills (categories + stack-item ID
   references), CV education, subagents, projects, API keys, admin audit log (API-key ID
   references).
   For each file list: the rows it must contain, the distinguishing attributes each row needs
   (e.g. visible **and** hidden blog posts, a visible post with **no** linked document,
   experience entries with responsibilities and stack items, categorised **and** uncategorised
   stack items, API keys for admin scenarios, expired vs. active keys if scenarios require it),
   and **the scenario(s) that require it**.
3. **Sidecar document content requirements** — which fixture rows reference `base.document`,
   and therefore which files must exist under `scripts/seeding/fixtures/documents/**`. State
   the rule: a document fixture's `content` field is a path relative to
   `scripts/seeding/fixtures/`; the seeder reads it as bytes; `size` is **derived** from the
   byte length and must never be supplied by a fixture (binding decision F-1).
4. **Shared-lookup ownership** — `base.cv_stack_item` is owned by the CV experience fixture
   (the CV skills fixture references stack items by ID only); `base.document` is shared between
   the blog and agent-spec fixtures; the seeder de-duplicates shared rows so each is inserted
   exactly once and raises on conflicting duplicates. **Flag this as an orchestrator assumption
   (SPEC-001-REVIEW §6b, F-3), not a user decision, and open to user override** (RISK-008).
5. **FK-safe cross-file insert order** — a single, explicitly written ordered list of table
   names, derived from the FK graph in the delivered revision. This list is the independent
   constant that `tests/test_persistence.py` asserts against (RISK-007), so it must be written
   here and not re-derived in code. It must at minimum satisfy: `document` before `article`;
   `article` before `topic_article_link` and `article_comment`; `topic` before
   `topic_article_link`; `api_key` before `admin_audit_log`; `cv_stack_item` and
   `cv_experience` before `cv_stack_item_experience_link`; `cv_skill_category` before
   `cv_stack_item_category_link`; `agent_spec` and `document` before
   `agent_spec_document_link`; `contact` before `message`.
6. **Stability statement** — fixture IDs are pre-generated UUIDv7 hex literals and are a
   published contract: SPEC-002/3/4 tests will pin to these IDs and file names, so they must
   not be renumbered or the files re-decomposed without a coordinated downstream change
   (RISK-005).

If any scenario expectation cannot be represented by the SPEC-001 §6.1 schema, **stop and
surface it as a user-input conflict** — do not edit feature files, do not edit the spec, and do
not bend the schema beyond the recorded F-9 resolutions.

## Target Files

- [x] scripts/seeding/README.md

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/acceptance/features/agent_catalogue.feature (all `@spec-002`/`-003`/
  `-004` scenarios — data each expects to exist)
- /home/agent/workspace/acceptance/features/api.feature
- /home/agent/workspace/acceptance/features/blog.feature (visible/hidden posts, comments,
  topics, article content documents)
- /home/agent/workspace/acceptance/features/contacts.feature
- /home/agent/workspace/acceptance/features/cv.feature (experiences, responsibilities, stack
  items, skill categories, education)
- /home/agent/workspace/acceptance/features/projects.feature
- /home/agent/workspace/alembic/migrations/versions/0001_initial_base_schema.py (the FK graph
  from which the insert order is derived; the exact column set each fixture row must supply)
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Reference Contracts" → domain fixture
  decomposition; the 20-table list)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-2.3, REQ-2.5, REQ-2.8)

## Investigation Notes

Recorded before implementation began.

- **Scenario census confirmed by machine count** over `acceptance/features/*.feature`
  (tag attached to each `Scenario`/`Scenario Outline`): `@spec-002` 42, `@spec-003` 5,
  `@spec-004` 36 — 83 total, matching the expected census exactly. Per file:
  `agent_catalogue` 8/0/11, `api` 6/0/2, `blog` 13/0/7, `contacts` 6/3/8, `cv` 7/2/0,
  `projects` 2/0/8.
- **Revision FK graph** (`0001_initial_base_schema.py`): the `TABLES` tuple is already an
  FK-safe order; the catalogue's insert order is written to match it exactly. FK edges are
  `message→contact`, `article→document` (nullable, PG-005 waiver),
  `topic_article_link→topic,article`, `article_comment→article`,
  `cv_experience_responsibility→cv_experience`,
  `cv_stack_item_experience_link→cv_stack_item,cv_experience`,
  `admin_audit_log→api_key` (RESTRICT), `agent_spec_document_link→agent_spec,document`,
  `cv_stack_item_category_link→cv_skill_category,cv_stack_item`. `document`, `subagent`,
  `topic`, `cv_education`, `project`, `api_key`, `agent_spec`, `cv_skill_category`,
  `contact`, `cv_experience`, `cv_stack_item` have no outbound FKs.
- **Column sets that constrain fixtures**: `document.size` is `NOT NULL` (derived per F-1);
  `document.restricted` defaults `true` (public content must set it `false` explicitly);
  `article.document_id` nullable; `article_comment.author` nullable;
  `contact.organization` nullable; `contact.email` unique; `subagent.inputs/outputs`
  nullable JSONB; `cv_experience.end_date` / `cv_education.end_date` nullable;
  `api_key.expires_at` nullable, `api_key.api_key` unique (SHA-256 hex);
  `agent_spec_document_link.document_type` enum `spec|acceptance|other`;
  `admin_audit_log.method` enum `get|post|put|patch|delete`; `project.github_link` nullable.
- **`created_at` is a transaction-constant server default** (`now()` = transaction start),
  so every row seeded in the single REQ-2.5 transaction shares one `created_at`. Any
  scenario asserting ordering by creation time therefore needs an explicit, fixture-supplied
  timestamp — recorded as assumption A-3 in the catalogue.
- **Three user-input conflicts / gaps surfaced** (recorded in
  `scripts/seeding/README.md` §7, not worked around): unauthenticated audit-log entries vs.
  `admin_audit_log.api_key_id NOT NULL`; the `spec_id`/`SPEC-101` field with no
  corresponding `base.agent_spec` column; and the `@spec-003` site-owner personal-details
  header with no §6.1 entity.
- **Reserved literals** appearing in `Given no … exists` steps must never be used as fixture
  IDs or emails: `3f2a9c1de4b7482ba6c10e5d8c714b39`, `9b4d2f7ac1e34d59b8a61c0f5e372d48`,
  `7c1e5a9db2f6470c93d84b1a6e05c827`, and `test@example.com`.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-003 | Single initial migration revision for the `base` schema | informs | The FK graph and column set from which the insert order and required fixture fields are derived |

## Implementation Steps (TDD: Red-Green-Refactor)

Derivation and documentation task — no code, therefore no unit tests. The Red-Green cycle is
coverage verification against the acceptance suite.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Red check: enumerate every scenario in all six feature files with its tag, and build a
      raw list of the data each scenario presupposes; confirm the count of scenarios read
      covers all three tags (expected census: 42 `@spec-002`, 5 `@spec-003`, 36 `@spec-004`)
- [x] Record any scenario expectation the §6.1 schema cannot represent — this is a blocking
      user-input conflict to surface, not something to work around

### 2. Green Phase

- [x] Write `scripts/seeding/README.md` sections 1–6
- [x] Walk the scenario list again and confirm every presupposed data item maps to a catalogue
      row

### 3. Refactor Phase

- [x] Deduplicate and tighten the catalogue; confirm the insert order list is internally
      consistent with the revision's FK graph

## Completion Criteria

- [x] `scripts/seeding/README.md` enumerates every domain fixture file to be shipped, and for
      each, the rows it must contain
- [x] Every catalogue row cites the scenario (feature file + scenario name) that motivates it
- [x] All six feature files and all three tags are covered; the coverage is stated explicitly
- [x] Sidecar-document rules are recorded: path relative to `scripts/seeding/fixtures/`, binary
      read, `size` derived and never fixture-supplied
- [x] Shared-lookup ownership for `base.cv_stack_item` and `base.document` is recorded and
      explicitly flagged as an orchestrator assumption open to user override
- [x] A single explicit, ordered FK-safe insert list of table names is present and satisfies
      every ordering pair listed above
- [x] The fixture-ID stability statement is present
- [x] `acceptance/**` and `docs/specs/**` are unmodified by this task

## Notes

- Impact scope: this catalogue is the specification for TASK-011/012 (models), TASK-015
  (insert order constant) and TASK-018 … TASK-021 (fixture authoring). It is the critical path
  for four downstream tasks — under-executing it forces coordinated rework (RISK-019).
- Risk countermeasures carried by this task: **RISK-004** (derivation from all six feature
  files; conflicts surfaced not absorbed), **RISK-005** (published, stable fixture contract),
  **RISK-007** (independently written FK order constant), **RISK-008** (ownership rules stated
  and flagged as an assumption), **RISK-018** (read-only on `acceptance/**`), **RISK-019**
  (standalone reviewable deliverable before fixture authoring begins).
- Scope boundary: `acceptance/**` and `docs/specs/**` are strictly read-only. No fixture files,
  models or code are written in this task.
