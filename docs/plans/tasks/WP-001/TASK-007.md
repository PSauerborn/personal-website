# Task: `docs/db_schema.md` part 1 — conventions and the first ten table definitions

Work Plan ID: WP-001
Task ID: TASK-007
Created Date: 2026-08-13
Description: Create `docs/db_schema.md` with its structure, schema-wide conventions, the auditable object inventory, and a Markdown table for ten of the twenty physical tables, transcribed **from the delivered revision**.
Acceptance Criteria Covered: AC-11

## Implementation Content

`docs/db_schema.md` is the only deliverable that closes an acceptance criterion in this
changeset (AC-11, verified by documentation review), and downstream specs read it as the
schema's source of truth. It must be authored **from
`alembic/migrations/versions/0001_initial_base_schema.py`**, table by table — not from
SPEC-001 §6.1 — so that it forms a second, independent transcription pass over the revision
(RISK-003, RISK-014).

This task delivers:

1. Title, purpose, and a pointer stating that the schema is defined by the single alembic
   revision `0001_initial_base_schema`.
2. **Conventions** section: `base` schema; PKs `VARCHAR(32)` (UUIDv7 hex, hyphens stripped, from
   stdlib `uuid.uuid7()` on Python 3.14 — never `uuid.uuidv7`); FK columns `VARCHAR(32)`;
   `created_at`/`updated_at` `TIMESTAMP WITH TIME ZONE` with `server_default now()` on every
   table; the `base.set_updated_at()` trigger function with a `{table}_set_updated_at` trigger
   per table; both named native enum types (`base.http_method` → `get|post|put|patch|delete`;
   `base.document_type` → `spec|acceptance|other`); and the rule that **no secondary indexes**
   exist beyond those implicitly backing PK/unique constraints.
3. **Object inventory** (auditable count for downgrade completeness — RISK-001): 20 tables,
   20 triggers, 1 trigger function, 2 enum types, 1 schema; with the statement that
   `downgrade base` drops all of them and leaves no residue.
4. A Markdown table for each of these **ten** tables — columns: field name, type/width,
   nullable, default, constraints (PK/FK with delete action/unique), plus a one-line entity
   description:
   `base.contact`, `base.message`, `base.topic`, `base.article`, `base.topic_article_link`,
   `base.article_comment`, `base.document`, `base.subagent`, `base.project`,
   `base.cv_education`.

For `base.article`, document explicitly that `document_id` is a **nullable FK with
`ON DELETE CASCADE`**, and state the consequence in prose: deleting a document deletes the
article metadata row. Downstream specs building document-deletion endpoints must see this
(RISK-016). The formal `[PG-005]` waiver note is added in TASK-008 — cross-reference it.

Types and widths must match the revision exactly, including whatever widths the executor
finally chose for non-PK string columns (recorded in TASK-003's Investigation Notes).

## Target Files

- [x] docs/db_schema.md

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/alembic/migrations/versions/0001_initial_base_schema.py (TASK-003 — the
  authoritative source; read every column definition, constraint and delete action)
- /home/agent/workspace/docs/plans/tasks/WP-001/TASK-003.md ("Investigation Notes" — the final
  chosen string widths and any refinements)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-3.1, REQ-3.2 — Markdown tables and Mermaid
  requirement; §6.1 entity descriptions for the prose only)
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Reference Contracts")

## Investigation Notes

### Source of truth

Authored from `alembic/migrations/versions/0001_initial_base_schema.py` (revision id `0001`,
`down_revision = None`), read column by column. TASK-003's Investigation Notes table was used
only as a cross-check of the widths; where the two were compared they agreed everywhere.

### Structural facts taken from the revision

- Schema `base`; `ID_LENGTH = 32` drives both `id_column()` (PK) and `fk_column()` (every FK), so
  all PK/FK columns are `VARCHAR(32)`, PKs non-nullable, FKs non-nullable unless declared
  otherwise (only `article.document_id` passes `nullable=True`).
- `timestamp_columns()` gives every table `created_at` and `updated_at`, both
  `TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()` (`sa.func.now()`, never
  `now() AT TIME ZONE 'utc'`).
- `base.set_updated_at()` is created once; `create_updated_at_trigger()` is applied in a loop
  over all 20 tables, producing triggers named `{table}_set_updated_at`
  (`BEFORE UPDATE ... FOR EACH ROW`).
- Enum types are declared with `create_type=False` and created/dropped explicitly:
  `base.http_method` (`get|post|put|patch|delete`) and `base.document_type`
  (`spec|acceptance|other`).
- No `op.create_index` and no `index=True` anywhere: the only indexes are those implicitly
  backing PK and unique constraints.
- Object inventory implied by `TABLES` plus the upgrade/downgrade bodies: 20 tables,
  20 triggers, 1 trigger function, 2 enum types, 1 schema. `downgrade` drops triggers, then
  tables in reverse dependency order, then the function, both enum types and the schema.

### Per-table extraction for this task's ten tables (red check)

- `contact`: name VARCHAR(255) NOT NULL; email VARCHAR(320) NOT NULL `uq_contact_email`;
  organization VARCHAR(255) NULL.
- `message`: contact_id VARCHAR(32) NOT NULL FK → `base.contact.id` ON DELETE CASCADE;
  content TEXT NOT NULL; read BOOLEAN NOT NULL DEFAULT false; submitted_at TIMESTAMPTZ NOT NULL.
- `topic`: name VARCHAR(128) NOT NULL `uq_topic_name`; description TEXT NULL.
- `document`: filename VARCHAR(255) NOT NULL; size INTEGER NOT NULL; restricted BOOLEAN NOT NULL
  DEFAULT true; content BYTEA (`sa.LargeBinary`) NOT NULL. No ownership columns.
- `article`: author VARCHAR(255) NOT NULL; display BOOLEAN NOT NULL DEFAULT true;
  title VARCHAR(255) NOT NULL; description TEXT NOT NULL; document_id VARCHAR(32) **NULL**
  FK → `base.document.id` **ON DELETE CASCADE**; authored_at TIMESTAMPTZ NOT NULL.
- `topic_article_link`: topic_id, article_id VARCHAR(32) NOT NULL, both FKs ON DELETE CASCADE;
  `uq_topic_article_link_topic_id_article_id`.
- `article_comment`: comment TEXT NOT NULL; author VARCHAR(255) NULL; article_id VARCHAR(32)
  NOT NULL FK → `base.article.id` ON DELETE CASCADE.
- `subagent`: name VARCHAR(128) NOT NULL (no unique constraint); description TEXT NOT NULL;
  inputs, outputs JSONB NULL ([PG-014] waiver).
- `project`: name VARCHAR(255) NOT NULL; description TEXT NOT NULL; primary_link VARCHAR(512)
  NOT NULL; github_link VARCHAR(512) NULL; display BOOLEAN NOT NULL DEFAULT true.
- `cv_education`: institution VARCHAR(255) NOT NULL; certificate VARCHAR(128) NOT NULL;
  start_date DATE NOT NULL; end_date DATE NULL.

### Revision vs SPEC-001 §6.1 — discrepancies found

No column-level disagreement between the revision and SPEC-001 §6.1 was found for any of the ten
tables: every name, type class, nullability and delete action in the revision matches §6.1, with
the widths being the F-9a refinements the spec left open. Two defects are in the **spec** text,
not in the revision, and are recorded in the document's Conventions section:

- §6.1 line 113 names `uuid.uuidv7`, which is not a real stdlib API; the revision's comments and
  this document use `uuid.uuid7()` (Python 3.14).
- §6.1 line 119 reads "are nan exception"; the intended meaning is "are an exception", i.e.
  implicit PK/unique-backing indexes are the only permitted indexes.

Ordering note: the revision's `TABLES` tuple places `document` before `article`
(`contact, message, topic, document, article, ...`), while SPEC-001 §6.1 introduces the article
group before the document entity. That is a presentation difference only; the document follows
the revision's FK-dependency order.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-003 | Single initial migration revision for the `base` schema | blocks | The revision file that this document transcribes, and its recorded final widths |

## Implementation Steps (TDD: Red-Green-Refactor)

This is a documentation task; the Red-Green cycle is a checklist verification against the
revision rather than an automated test.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverable: the revision file, in full
- [x] Red check: list the ten tables above and, for each, extract from the revision the exact
      column names, types/widths, nullability, defaults and constraints — record any place
      where the revision disagrees with SPEC-001 §6.1 (a disagreement is a defect in the
      revision, to be surfaced, **not** papered over in the document)

### 2. Green Phase

- [x] Write the document sections 1–4 above
- [x] Verify each of the ten Markdown tables against the revision line by line

### 3. Refactor Phase

- [x] Normalise table formatting/wording so all twenty tables (this task's ten and TASK-008's
      ten) will share one layout; confirm the Markdown renders

## Completion Criteria

- [x] `docs/db_schema.md` exists and contains the Conventions and Object Inventory sections as
      specified (20 tables / 20 triggers / 1 function / 2 enum types / 1 schema)
- [x] Each of the ten named tables appears as a Markdown table whose column names,
      types/widths, nullability, defaults and constraints match the revision exactly
- [x] `base.article.document_id` is documented as nullable with `ON DELETE CASCADE`, with the
      cascade consequence stated in prose
- [x] Both enum type names and their value lists appear in Conventions
- [x] The document states that no secondary indexes exist beyond implicit PK/unique-backing
      indexes
- [x] No discrepancy with the revision remains unresolved or undocumented

## Notes

- Impact scope: TASK-008 continues this same file; SPEC-002/3/4 authors read it as the schema
  contract.
- Risk countermeasures carried by this task: **RISK-014** (authored from the revision, not from
  the spec), **RISK-003** (second independent transcription pass), **RISK-001** (object
  inventory is auditable), **RISK-016** (cascade consequence documented).
- Scope boundary: does not modify the revision. If the revision is wrong, surface it — do not
  "fix" it here (that would be a TASK-003 change, propagated per RISK-020).
