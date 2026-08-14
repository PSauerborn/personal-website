# Task: Single initial migration revision for the `base` schema (20 tables)

Work Plan ID: WP-001
Task ID: TASK-003
Created Date: 2026-08-13
Description: Author `alembic/migrations/versions/0001_initial_base_schema.py` — one revision whose `upgrade` creates the `base` schema, both named enum types, the `base.set_updated_at()` trigger function, all 20 tables with constraints, timestamps, per-table triggers and `COMMENT ON`, and whose `downgrade` removes every one of those objects without residue.
Acceptance Criteria Covered: AC-1, AC-2, AC-3

## Implementation Content

This is the root artifact of the whole changeset: it fixes every table shape, width, constraint,
enum name and FK action that `docs/db_schema.md`, the pydantic models and the fixtures must
then conform to. It is a single hand-written revision (REQ-1.1) — autogenerate is not in play.

### The 20 physical tables (exhaustive checklist — all must exist)

`base.contact`, `base.message`, `base.topic`, `base.article`, `base.topic_article_link`,
`base.article_comment`, `base.document`, `base.subagent`, `base.cv_stack_item`,
`base.cv_experience`, `base.cv_experience_responsibility`,
`base.cv_stack_item_experience_link`, `base.cv_education`, `base.api_key`,
`base.admin_audit_log`, `base.agent_spec`, `base.agent_spec_document_link`,
`base.cv_skill_category`, `base.cv_stack_item_category_link`, `base.project`.

Columns, nullability and FK delete actions come from SPEC-001 §6.1 (read it in full).
Columns are non-nullable unless §6.1 explicitly marks them nullable.

### Fixed contracts (from the work plan's Reference Contracts — implement verbatim)

- **Primary keys**: `VARCHAR(32)` (UUIDv7 hex, hyphens stripped). FK columns are `VARCHAR(32)`
  to match.
- **Timestamps**: `TIMESTAMP WITH TIME ZONE`; `created_at` and `updated_at` on **every** table
  with `server_default=sa.func.now()`. The form `DEFAULT (now() AT TIME ZONE 'utc')` is
  forbidden and must not appear anywhere.
- **Trigger function**: one `base.set_updated_at()` per schema; per-table triggers named
  `{table}_set_updated_at`; `COMMENT ON` for the function and for each trigger.
- **Named native enum types** (F-9e resolution — named so downgrade can drop them):
  - `base.http_method` — `get`, `post`, `put`, `patch`, `delete` (used by
    `base.admin_audit_log.method`)
  - `base.document_type` — `spec`, `acceptance`, `other` (used by
    `base.agent_spec_document_link.document_type`)
  Declare both with explicit lifecycle (e.g. `create_type=False` plus explicit
  `sa.Enum(..., name=..., schema="base").create(bind, checkfirst=False)`) so ownership of
  creation and dropping is unambiguous.
- **F-9 resolutions** (the executor may refine widths, but every final value must be reported so
  TASK-007/TASK-008 record it in `docs/db_schema.md`):
  - F-9a: non-PK string columns get explicit widths — bounded `VARCHAR(n)` for names, emails,
    titles, filenames and similar short fields; `TEXT` for free-form prose (message content,
    comment bodies, descriptions).
  - F-9b: unique constraint on `base.api_key.api_key`.
  - F-9c: unique constraint on `base.cv_skill_category.category`.
  - F-9d: unique constraint on `base.agent_spec_document_link (spec_id, document_id)`; every
    link table has a unique constraint over its link tuple
    (`topic_article_link (topic_id, article_id)`,
    `cv_stack_item_experience_link (stack_item_id, experience_id)`,
    `cv_stack_item_category_link (category_id, stack_item_id)`).
  - F-9f: `base.admin_audit_log.api_key_id` FK is `ON DELETE RESTRICT`.
  - Lookup names `base.topic.name` and `base.cv_stack_item.name` are unique.
- **`base.article.document_id`**: nullable FK with `ON DELETE CASCADE`, exactly as SPEC-001
  §6.1.3 specifies. The `[PG-005]` waiver and the `SET NULL` alternative (F-4b) were both
  decided by the user — implement cascade and do **not** "improve" it (RISK-016).
- **JSONB columns** stay JSONB per spec (`base.subagent.inputs/outputs`,
  `base.admin_audit_log.payload/response`) — `[PG-014]` is waived.
- **No secondary indexes.** Express uniqueness only via `UniqueConstraint`; never
  `op.create_index` and never `index=True` (RISK-013).

### Downgrade (RISK-001 — Critical)

`downgrade` must be the literal mirror of `upgrade` in reverse order, with an explicit `DROP`
for each object class, in this order:

1. the 20 per-table triggers, 2. the 20 tables (reverse FK-dependency order),
3. `base.set_updated_at()`, 4. `base.document_type` and `base.http_method`,
5. `DROP SCHEMA base`.

### Ordering and raw SQL (RISK-002 — Critical)

- Emit objects in strict FK-dependency order; create both enum types and the trigger function
  **before** any dependent object.
- Every raw-SQL string passed to `op.execute` (trigger function, `CREATE TRIGGER`,
  `COMMENT ON`) must be schema-qualified with `base.` — never rely on `search_path`.
- Generate the `created_at`/`updated_at` columns and the trigger DDL from one shared
  helper/loop over the table list, not by copy-paste (RISK-017).
- Check every generated identifier against the PostgreSQL 63-character limit — in particular
  `cv_stack_item_experience_link_set_updated_at` (44 chars) and
  `cv_stack_item_category_link_set_updated_at` — and against PostgreSQL reserved words.

## Target Files

- [x] alembic/migrations/versions/0001_initial_base_schema.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/docs/specs/SPEC-001.md (§6.1.1–§6.1.12 — every entity's columns,
  nullability, defaults, FK delete actions; §6.1 preamble lines 111–119 — PK type, timestamps,
  the secondary-index ban)
- /home/agent/workspace/docs/specs/SPEC-001-REVIEW.md (§6a F-4 — `[PG-005]` waiver and the
  declined `SET NULL`; §6b F-9a–f resolutions; typo corrections: `uuid.uuidv7` is not a real
  API, "nan exception" reads "an exception")
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Reference Contracts"; "Failure Modes")
- /home/agent/workspace/alembic/migrations/env.py (TASK-002 — offline/online mode wiring this
  revision is rendered through)
- Coding standards via the `coding-standards` skill: `databases/POSTGRES.md` plus
  `examples/POSTGRES/timestamp-columns.md` and `examples/POSTGRES/link-tables.md`

## Investigation Notes

### Environment

- `alembic` is not on `PATH`; the offline renders were run as
  `PYTHONPATH=<scratchpad>/pylibs python3 -m alembic ...` from `alembic/`, with
  `POSTGRES_*`, `ALEMBIC_REVISION` and `ALEMBIC_COMMAND` set to dummy values (`src.config`
  validates all of them at import time, so the alembic-specific ones must be set even for
  a render).
- Offline downgrade must be invoked as `alembic downgrade head:base --sql` (confirmed).
- Revision id is `0001` (`file_template = %%(rev)s_%%(slug)s`), `down_revision = None`.

### FK-dependency order of the 20 tables (also the seeder's insert order)

`contact` → `message` → `topic` → `document` → `article` → `topic_article_link` →
`article_comment` → `subagent` → `cv_stack_item` → `cv_experience` →
`cv_experience_responsibility` → `cv_stack_item_experience_link` → `cv_education` →
`api_key` → `admin_audit_log` → `agent_spec` → `agent_spec_document_link` →
`cv_skill_category` → `cv_stack_item_category_link` → `project`.

The downgrade drops tables in the exact reverse of this order (verified against the
rendered SQL).

### Final column types and widths (F-9a resolution — for TASK-007/TASK-008)

All PK `id` and all FK columns are `VARCHAR(32)`. All tables additionally carry
`created_at`/`updated_at` as `TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`.

| Table | Column | Type | Nullable | Default / constraint |
| --- | --- | --- | --- | --- |
| contact | name | VARCHAR(255) | no | |
| contact | email | VARCHAR(320) | no | `uq_contact_email` |
| contact | organization | VARCHAR(255) | yes | |
| message | contact_id | VARCHAR(32) | no | FK → contact.id, `ON DELETE CASCADE` |
| message | content | TEXT | no | |
| message | read | BOOLEAN | no | `DEFAULT false` |
| message | submitted_at | TIMESTAMPTZ | no | |
| topic | name | VARCHAR(128) | no | `uq_topic_name` |
| topic | description | TEXT | yes | |
| document | filename | VARCHAR(255) | no | |
| document | size | INTEGER | no | |
| document | restricted | BOOLEAN | no | `DEFAULT true` |
| document | content | BYTEA | no | |
| article | author | VARCHAR(255) | no | |
| article | display | BOOLEAN | no | `DEFAULT true` |
| article | title | VARCHAR(255) | no | |
| article | description | TEXT | no | |
| article | document_id | VARCHAR(32) | **yes** | FK → document.id, `ON DELETE CASCADE` ([PG-005] waiver) |
| article | authored_at | TIMESTAMPTZ | no | |
| topic_article_link | topic_id / article_id | VARCHAR(32) | no | FKs cascade; `uq_topic_article_link_topic_id_article_id` |
| article_comment | comment | TEXT | no | |
| article_comment | author | VARCHAR(255) | yes | |
| article_comment | article_id | VARCHAR(32) | no | FK → article.id, cascade |
| subagent | name | VARCHAR(128) | no | |
| subagent | description | TEXT | no | |
| subagent | inputs / outputs | JSONB | yes | [PG-014] waiver |
| cv_stack_item | name | VARCHAR(128) | no | `uq_cv_stack_item_name` |
| cv_experience | organization | VARCHAR(255) | no | |
| cv_experience | job_title | VARCHAR(255) | no | |
| cv_experience | start_date | DATE | no | |
| cv_experience | end_date | DATE | yes | |
| cv_experience | description | TEXT | no | |
| cv_experience_responsibility | experience_id | VARCHAR(32) | no | FK → cv_experience.id, cascade |
| cv_experience_responsibility | description | TEXT | no | |
| cv_stack_item_experience_link | stack_item_id / experience_id | VARCHAR(32) | no | FKs cascade; `uq_cv_stack_item_experience_link_stack_experience` |
| cv_education | institution | VARCHAR(255) | no | |
| cv_education | certificate | VARCHAR(128) | no | |
| cv_education | start_date | DATE | no | |
| cv_education | end_date | DATE | yes | |
| api_key | api_key | VARCHAR(64) | no | sha256 hex; `uq_api_key_api_key` |
| api_key | description | TEXT | no | |
| api_key | issued_at | TIMESTAMPTZ | no | |
| api_key | expires_at | TIMESTAMPTZ | yes | |
| api_key | issued_for | VARCHAR(255) | no | |
| admin_audit_log | api_key_id | VARCHAR(32) | **yes** | FK → api_key.id, **`ON DELETE RESTRICT`** (see "Amendment 2026-08-13") |
| admin_audit_log | endpoint | VARCHAR(512) | no | |
| admin_audit_log | method | `base.http_method` | no | enum (get, post, put, patch, delete) |
| admin_audit_log | status_code | INTEGER | no | |
| admin_audit_log | payload / response | JSONB | yes | [PG-014] waiver |
| agent_spec | display_name | VARCHAR(255) | no | |
| agent_spec | description | TEXT | no | |
| agent_spec | display | BOOLEAN | no | `DEFAULT true` |
| agent_spec_document_link | spec_id / document_id | VARCHAR(32) | no | FKs cascade; `uq_agent_spec_document_link_spec_id_document_id` |
| agent_spec_document_link | document_type | `base.document_type` | no | enum (spec, acceptance, other) |
| cv_skill_category | category | VARCHAR(128) | no | `uq_cv_skill_category_category` |
| cv_stack_item_category_link | category_id / stack_item_id | VARCHAR(32) | no | FKs cascade; `uq_cv_stack_item_category_link_category_stack_item` |
| project | name | VARCHAR(255) | no | |
| project | description | TEXT | no | |
| project | primary_link | VARCHAR(512) | no | |
| project | github_link | VARCHAR(512) | yes | |
| project | display | BOOLEAN | no | `DEFAULT true` |

Constraint naming: `pk_{table}`, `fk_{table}_{column}`, `uq_{table}_{columns}`. The two
longest generated identifiers are `uq_cv_stack_item_category_link_category_stack_item`
(50 chars) and `cv_stack_item_experience_link_set_updated_at` (44 chars), both well inside
the 63-character limit. No identifier is a PostgreSQL reserved word (`comment`, `read`,
`size`, `content`, `method` are all non-reserved).

### Schema drop and the alembic version table

Offline (and online) alembic keeps `base.alembic_version` in the same schema and writes to
it *after* the downgrade body. The downgrade therefore drops all 20 tables, the function
and both enum types explicitly, and then drops the schema from inside a `DO` block that
skips the `DROP SCHEMA base RESTRICT` while `base.alembic_version` still exists — so the
drop can neither delete the table alembic is about to update nor orphan any object of this
revision.

### Amendment 2026-08-13 — `base.admin_audit_log.api_key_id` is NULLABLE

Post-delivery change, made on an explicit user decision and limited to this one column.

- **What changed**: `base.admin_audit_log.api_key_id` renders as `VARCHAR(32)` without
  `NOT NULL`. The foreign key `fk_admin_audit_log_api_key_id` → `base.api_key(id)` is
  retained, and its delete action stays `ON DELETE RESTRICT` (SPEC-001 §6.1.9, "do not
  cascade on delete"). Nothing else in the revision or the rendered SQL changed.
- **Why**: SPEC-001 §6.1.9 defaults the column to non-nullable, but the acceptance suite's
  `api.feature` scenario "An unauthenticated admin request is recorded in the audit log" —
  and every "invalid API key" example — requires an audit row for a request that presented
  no valid key. The spec and the acceptance suite are both user inputs and contradicted
  each other; the user resolved the contradiction on 2026-08-13 in favour of a nullable
  `api_key_id`. This is an explicit, documented deviation from §6.1.9 that sits alongside
  the existing `[PG-005]` and `[PG-014]` waivers.
- **Where it is recorded in the artifact**: the rationale is carried in the column's
  `COMMENT ON COLUMN base.admin_audit_log.api_key_id`, so it is visible in the database
  itself as well as in the migration source.
- **Downstream impact** (per the Notes section's propagation rule): `docs/db_schema.md`
  (TASK-007/TASK-008), the pydantic models (TASK-011/TASK-012) and the fixtures
  (TASK-018…021) must record `api_key_id` as optional/nullable.
- **Re-verification**: both offline gates re-run and exited 0; the rendered upgrade SQL
  diffs against the pre-amendment render in exactly two lines (the column definition losing
  `NOT NULL`, and the column comment). The downgrade render is byte-identical. Object
  counts and ordering unchanged: 1 schema, 2 enum types, 1 trigger function, 20 tables,
  20 triggers, 0 secondary indexes; downgrade still emits 20 `DROP TRIGGER`, 20
  `DROP TABLE`, `DROP FUNCTION`, both `DROP TYPE`s and `DROP SCHEMA base`. `black` and
  `flake8` clean.

### Render verification (all run against the final file)

- `alembic upgrade head --sql` exit 0: 20 `CREATE TABLE base.*` (plus alembic's own
  version table), 20 `CREATE TRIGGER … _set_updated_at`, 20 `COMMENT ON TABLE`,
  127 `COMMENT ON COLUMN`, 20 `COMMENT ON TRIGGER`, `COMMENT ON SCHEMA`,
  `COMMENT ON FUNCTION`; 0 `CREATE INDEX`; 0 occurrences of `AT TIME ZONE 'utc'`.
- `alembic downgrade head:base --sql` exit 0: 20 `DROP TRIGGER`, 20 `DROP TABLE`
  (exact reverse of the create order), `DROP FUNCTION base.set_updated_at()`,
  `DROP TYPE base.document_type`, `DROP TYPE base.http_method`, `DROP SCHEMA base`.
- Ordering asserted programmatically: every `REFERENCES base.X` target, both enum types
  and the trigger function are created before their first use.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-002 | Alembic scaffolding — alembic.ini, env.py, script.py.mako | blocks | Working `alembic` scaffolding and offline render mode |

## Implementation Steps (TDD: Red-Green-Refactor)

The alembic component ships **without unit tests** by binding decision 5. The Red-Green cycle
below is driven by the **offline SQL render**, which is this revision's only verification gate.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations — in particular, write out the
      20-table checklist and the per-table column list from §6.1 before coding
- [x] Review dependency deliverable: `alembic/migrations/env.py`
- [x] Verify/create contract definitions: derive and write down the FK-dependency order of the
      20 tables (this same order is consumed downstream by the seeder's insert order)
- [x] Red check: run `alembic upgrade head --sql` from `alembic/` with a dummy URL and confirm
      it emits nothing/fails before the revision exists

### 2. Green Phase

- [x] Implement `upgrade` and `downgrade`
- [x] Run `alembic upgrade head --sql > /tmp/upgrade.sql` and
      `alembic downgrade base --sql > /tmp/downgrade.sql` with a dummy URL and no server;
      both must exit 0

### 3. Refactor Phase

- [x] Collapse repeated timestamp/trigger/comment DDL into a single shared helper over the
      table list; re-run both renders and confirm the emitted SQL is unchanged
- [x] `black` and `flake8` clean

## Completion Criteria

Each item below is checked by reading the rendered SQL, not merely by exit code.

- [x] `alembic upgrade head --sql` exits 0 and the rendered SQL contains: `CREATE SCHEMA base`,
      `CREATE TYPE base.http_method`, `CREATE TYPE base.document_type`, the
      `base.set_updated_at()` function, exactly **20** `CREATE TABLE base.*` statements matching
      the 20-name checklist, and exactly **20** `CREATE TRIGGER ... _set_updated_at` statements
- [x] No object is referenced before its `CREATE`: reading the rendered statements top to
      bottom, every FK target table, both enum types and the trigger function appear before
      first use (RISK-002)
- [x] `alembic downgrade base --sql` exits 0 and contains a matching `DROP` for **every**
      `CREATE` in the upgrade render: 20 triggers, 20 tables, `base.set_updated_at()`,
      `base.document_type`, `base.http_method`, `DROP SCHEMA base` — diffed object-for-object
      (RISK-001)
- [x] `COMMENT ON` coverage: the schema, each of the 20 tables, the trigger function and each of
      the 20 triggers
- [x] `grep -c 'CREATE INDEX' /tmp/upgrade.sql` returns only implicit PK/unique-backing index
      statements — no explicitly created secondary index; the revision source contains no
      `op.create_index` and no `index=True` (RISK-013)
- [x] `grep -i "AT TIME ZONE 'utc'" ` over the revision and the rendered SQL returns nothing;
      all timestamp defaults render as `now()`
- [x] `base.article.document_id` is nullable with `ON DELETE CASCADE`;
      `base.admin_audit_log.api_key_id` is `ON DELETE RESTRICT` (and, per the
      2026-08-13 amendment above, nullable)
- [x] Every unique constraint from F-9b/c/d and both lookup-name uniques is present
- [x] Every generated identifier is ≤ 63 characters and is not a PostgreSQL reserved word
- [x] The string `uuid.uuidv7` appears nowhere in the file (RISK-011)
- [x] The final chosen widths for all non-PK string columns are recorded in the Investigation
      Notes of this file, so TASK-007/TASK-008 can transcribe them into `docs/db_schema.md`

## Notes

- Impact scope: this revision is the schema of record. Any later change to a width, constraint,
  enum name or FK action must be propagated in the same commit sequence to `docs/db_schema.md`
  (TASK-007/008), the pydantic models (TASK-011/012) and the fixtures (TASK-018…021), with the
  offline render re-run (RISK-020).
- Risk countermeasures carried by this task: **RISK-001** (complete, mirrored downgrade with the
  auditable object inventory 20 triggers / 20 tables / 1 function / 2 types / 1 schema),
  **RISK-002** (dependency-ordered DDL, schema-qualified raw SQL, identifier-length and
  reserved-word check, SQL read as SQL), **RISK-003** (20-name checklist), **RISK-013** (no
  secondary indexes), **RISK-016** (cascade retained on `article.document_id`), **RISK-017**
  (single shared helper for timestamps/triggers; no `AT TIME ZONE 'utc'`), **RISK-020** (schema
  freezes at the end of Phase 1).
- Scope boundary: exactly one revision file — do not add a second revision, do not modify
  `env.py`/`alembic.ini` (TASK-002's write set), do not touch `docs/specs/**` or
  `acceptance/**`.
