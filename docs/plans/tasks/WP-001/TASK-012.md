# Task: Domain-aggregate pydantic models for all fixture domains

Work Plan ID: WP-001
Task ID: TASK-012
Created Date: 2026-08-13
Description: Extend `scripts/seeding/src/models.py` with one pydantic v2 domain-aggregate model per fixture file (not one per table), and extend `scripts/seeding/tests/test_models.py` accordingly.
Acceptance Criteria Covered: AC-6, AC-7

## Implementation Content

REQ-2.4 requires models defined as **domain aggregates, not one model per table**. Using the
catalogue recorded in `scripts/seeding/README.md` (TASK-009), add one aggregate model per
domain fixture file, reusing the shared base model, ID type and document model from TASK-011:

- contacts (contact + its messages)
- blog (topics + articles + comments + owned documents)
- agent specs (spec + document links + owned documents)
- CV experience (experiences + responsibilities + owned stack items + experience↔stack-item
  links)
- CV skills (skill categories + stack-item **ID references only** — the CV experience fixture
  owns stack items)
- CV education
- subagents
- projects
- API keys
- admin audit log (API-key **ID references**)

Rules:

- Field names, types, nullability and defaults must match the corresponding columns in
  `0001_initial_base_schema.py` exactly (including the enum value sets: `base.http_method` →
  `get|post|put|patch|delete`; `base.document_type` → `spec|acceptance|other`, modelled as
  `Literal`/`Enum`).
- `id` is required on **every** record at every nesting level.
- `extra="forbid"` everywhere (inherited from the shared base model).
- Cross-file references (CV skills → stack item IDs, admin audit log → API-key IDs) are plain
  ID fields; their resolvability is checked at link time in the persistence layer, not here.
- Date-only columns (`start_date`, `end_date`) model as `date`; timestamps as timezone-aware
  `datetime`.
- No `uuid.uuid7()` call at runtime — fixture IDs are pre-generated literals; the string
  `uuid.uuidv7` must appear nowhere (RISK-011).

## Target Files

- [x] scripts/seeding/src/models.py
- [x] scripts/seeding/tests/test_models.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — the confirmed domain-file
  decomposition and the rows each file carries)
- /home/agent/workspace/alembic/migrations/versions/0001_initial_base_schema.py (all 20 tables —
  column names, types, nullability, defaults, enum values)
- /home/agent/workspace/scripts/seeding/src/models.py (TASK-011 — shared base model, ID type,
  document model to reuse)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-2.3, REQ-2.4 — domain-level fixtures and
  aggregate models)

## Investigation Notes

Catalogue (`scripts/seeding/README.md` §4) — ten domain files, so ten aggregate models. Each
file is a JSON array of aggregate objects, so one model validates one array element:

| File | Aggregate model | Nested rows |
| --- | --- | --- |
| `contacts.json` | `ContactFixture` | `MessageFixture` |
| `blog.json` | `ArticleFixture` | `ArticleTopicLinkFixture` → embedded `TopicFixture` (deduped by id), `ArticleCommentFixture`, owned `DocumentFixture` |
| `agent_specs.json` | `AgentSpecFixture` | `AgentSpecDocumentLinkFixture` → owned `DocumentFixture` |
| `cv_experience.json` | `CvExperienceFixture` | `CvExperienceResponsibilityFixture`, `CvStackItemExperienceLinkFixture` → owned `CvStackItemFixture` |
| `cv_skills.json` | `CvSkillCategoryFixture` | `CvStackItemCategoryLinkFixture` (`stack_item_id` only) |
| `cv_education.json` | `CvEducationFixture` | — |
| `subagents.json` | `SubagentFixture` | — |
| `projects.json` | `ProjectFixture` | — |
| `api_keys.json` | `ApiKeyFixture` | — |
| `admin_audit_log.json` | `AdminAuditLogFixture` | — (`api_key_id` reference only) |

Column mapping taken from `0001_initial_base_schema.py` (authoritative):

- `contact`: `name` VARCHAR(255) NN, `email` VARCHAR(320) NN unique, `organization`
  VARCHAR(255) NULL. `message`: `content` TEXT NN, `read` BOOL NN default false,
  `submitted_at` TIMESTAMPTZ NN. `contact_id` is implied by nesting and is not a model field.
- `topic`: `name` VARCHAR(128) NN unique, `description` TEXT NULL.
- `article`: `author` VARCHAR(255) NN, `display` BOOL NN default true, `title` VARCHAR(255) NN,
  `description` TEXT NN, `document_id` NULL, `authored_at` TIMESTAMPTZ NN.
  `article_comment`: `comment` TEXT NN, `author` VARCHAR(255) NULL, optional explicit
  `created_at` (README A-3).
- `agent_spec`: `display_name` VARCHAR(255) NN, `description` TEXT NN, `display` BOOL NN
  default true. `agent_spec_document_link` carries its own `id` plus `document_type`.
- `cv_experience`: `organization`/`job_title` VARCHAR(255) NN, `start_date` DATE NN,
  `end_date` DATE NULL, `description` TEXT NN. `cv_experience_responsibility`: `description`
  TEXT NN. `cv_stack_item`: `name` VARCHAR(128) NN unique.
- `cv_skill_category`: `category` VARCHAR(128) NN unique.
- `cv_education`: `institution` VARCHAR(255) NN, `certificate` VARCHAR(128) NN,
  `start_date` DATE NN, `end_date` DATE NULL.
- `subagent`: `name` VARCHAR(128) NN, `description` TEXT NN, `inputs`/`outputs` JSONB NULL.
- `project`: `name` VARCHAR(255) NN, `description` TEXT NN, `primary_link` VARCHAR(512) NN,
  `github_link` VARCHAR(512) NULL, `display` BOOL NN default true.
- `api_key`: `api_key` VARCHAR(64) NN unique (SHA-256 hex), `description` TEXT NN,
  `issued_at` TIMESTAMPTZ NN, `expires_at` TIMESTAMPTZ NULL, `issued_for` VARCHAR(255) NN.
- `admin_audit_log`: `api_key_id` **NULLABLE** (amended revision — an unauthenticated or
  invalid-key request must be representable), `endpoint` VARCHAR(512) NN, `method`
  `base.http_method` NN, `status_code` INT NN, `payload`/`response` JSONB NULL.
- `created_at`/`updated_at` are server defaults on every table and are therefore not fixture
  fields, with the single documented exception of `article_comment.created_at` (A-3).

Ownership and reference rules (README §5.2): `cv_experience.json` owns every `cv_stack_item`,
so `CvSkillCategoryFixture` carries `stack_item_id` references only and `extra="forbid"`
makes an inline stack-item definition a validation error. `admin_audit_log` references
`api_key` by ID only. `document` is owned by `blog.json` and `agent_specs.json`; both embed
the `DocumentFixture` from TASK-011, which resolves its sidecar through the validation
context — pydantic propagates that context into nested models, so no extra plumbing is
needed. `from_fixture` was lifted from `DocumentFixture` onto `FixtureModel` so every
aggregate can be validated against an explicit fixtures root.

**Amendment (2026-08-13, spans TASK-012 and TASK-015).** `ArticleFixture.topics` was
originally `list[TopicFixture]`, which left `base.topic_article_link` with no fixture-supplied
primary key and forced TASK-015's persistence layer to derive one as a truncated
`md5(f'{article_id}:{topic_id}')`. That breaks SPEC-001 §6.1 (primary keys must be UUIDv7 hex
literals) and REQ-2.3 (PK id fields must be present in **all** fixtures), and a weak digest is
a finding a security review would raise. `topics` is now
`list[ArticleTopicLinkFixture]` — an explicit `{id, topic}` wrapper mirroring
`CvStackItemExperienceLinkFixture` — so the link row carries its own fixture-supplied id while
the embedded `TopicFixture` keeps its own id and stays de-duplicable as a shared lookup.
`extra="forbid"` makes a bare, unwrapped topic and a missing link `id` validation errors, both
pinned by tests. The md5 derivation, the `hashlib` import and the unused `ID_LENGTH` constant
were deleted from `src/persistence.py`; no table's id is derived anywhere in that module.
`scripts/seeding/README.md` §5.2 records the rule so TASK-018 authors explicit link ids.

Enums are modelled as `str`-valued `Enum`s taking their members verbatim from the revision's
`postgresql.ENUM` declarations: `http_method` → `get|post|put|patch|delete`, `document_type`
→ `spec|acceptance|other`.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-011 | Document fixture model with sidecar content and derived size | blocks | Shared base model, ID type and document model |
| TASK-009 | Fixture catalogue derivation | blocks | The domain-file decomposition the models mirror |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables (catalogue, existing models)
- [x] Verify/create contract definitions: map each domain model field to its revision column
      and record the mapping
- [x] Write failing tests: one valid-payload test per domain aggregate, plus rejection tests for
      a missing `id`, an unknown extra key, an invalid enum value, and a wrong-typed date
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Add minimal implementation to pass the tests
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Factor out repeated nested-record patterns; confirm tests still pass; `black`/`flake8`
      clean

## Completion Criteria

- [x] Exactly one aggregate model exists per domain fixture file listed in the catalogue, and
      none of the models is a bare one-model-per-table wrapper
- [x] Every model field matches its revision column in name, type, nullability and default;
      both enum value sets are enforced
- [x] A payload missing an `id` at any nesting level is rejected
- [x] A payload with an unknown key is rejected (`extra="forbid"`)
- [x] The CV skills model references stack items by ID only and cannot define a stack item
- [x] No runtime UUID generation; the string `uuid.uuidv7` appears nowhere
- [x] All added tests pass with no PostgreSQL binary present
- [x] `black` and `flake8` clean

## Notes

- Impact scope: consumed by `fixtures.py` (TASK-014), the persistence flattening logic
  (TASK-015) and every fixture-authoring task (TASK-018 … TASK-021).
- Risk countermeasures carried by this task: **RISK-019** (models follow the reviewed catalogue,
  not the executor's own judgement), **RISK-008** (ownership encoded in the model shapes: CV
  skills cannot redefine stack items), **RISK-011** (no `uuid.uuidv7`, no runtime generation),
  **RISK-012** (no server-dependent test).
- Scope boundary: does not modify `conftest.py`, `config.py`, `fixtures.py`, `persistence.py`,
  or fixture data.
