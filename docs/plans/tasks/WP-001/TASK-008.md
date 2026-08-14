# Task: `docs/db_schema.md` part 2 — remaining ten tables, Mermaid diagram, waivers and F-9 record

Work Plan ID: WP-001
Task ID: TASK-008
Created Date: 2026-08-13
Description: Complete `docs/db_schema.md` with the remaining ten table definitions, an entity/relationship narrative, a Mermaid diagram covering all 20 entities, both standards waiver notes, every F-9a–f resolution, and the verification-gap statement.
Acceptance Criteria Covered: AC-11

## Implementation Content

Continue the document started in TASK-007, still transcribing **from
`alembic/migrations/versions/0001_initial_base_schema.py`**.

1. A Markdown table (same layout as TASK-007's) for each of these **ten** tables:
   `base.cv_stack_item`, `base.cv_experience`, `base.cv_experience_responsibility`,
   `base.cv_stack_item_experience_link`, `base.cv_skill_category`,
   `base.cv_stack_item_category_link`, `base.api_key`, `base.admin_audit_log`,
   `base.agent_spec`, `base.agent_spec_document_link`.
2. **Entity/relationship narrative**: how the domains are modelled (contacts→messages;
   topics/articles/comments/documents; CV experience + responsibilities + stack items;
   CV skills categories; agent specs + document links; API keys + audit log; projects;
   subagents) and how shared resources (`base.document`, `base.cv_stack_item`) are referenced
   from more than one domain.
3. **Mermaid diagram** (`erDiagram` or equivalent) covering **all 20 entities** and their
   relationship cardinalities, including every link table.
4. **Waiver notes** (both mandatory, in the style of SPEC-001 §6.1.5):
   - `[PG-005]` waived for `base.article.document_id` — direct nullable FK with
     `ON DELETE CASCADE` retained (user decision F-4; the `SET NULL` alternative F-4b was
     declined). Restate the cascade consequence documented in TASK-007.
   - `[PG-014]` waived for `base.subagent.inputs` / `outputs` **and**
     `base.admin_audit_log.payload` / `response` — JSONB per SPEC-001 §6.1.5 / §6.1.9.
5. **F-9 resolution record** — an explicit list of every resolved gap with its final value:
   - F-9a: the chosen `VARCHAR(n)` widths vs `TEXT` for each non-PK string column (final
     values as implemented in the revision)
   - F-9b: unique constraint on `base.api_key.api_key`
   - F-9c: unique constraint on `base.cv_skill_category.category`
   - F-9d: unique constraint on `base.agent_spec_document_link (spec_id, document_id)` and on
     every other link tuple
   - F-9e: enum type names `base.http_method` and `base.document_type` with their value lists
   - F-9f: `base.admin_audit_log.api_key_id` is `ON DELETE RESTRICT`
   - lookup-name uniqueness on `base.topic.name` and `base.cv_stack_item.name`
6. **Verification status**: a short section recording that AC-1 … AC-10 are
   *implemented but unverified* in this changeset — the migration CI job and any provisioned
   PostgreSQL instance are explicitly out of scope by user decision — and that AC-11 is closed
   by review of this document (RISK-022).

## Target Files

- [x] docs/db_schema.md

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/alembic/migrations/versions/0001_initial_base_schema.py (TASK-003 — the
  authoritative source for the remaining ten tables and all constraints)
- /home/agent/workspace/docs/db_schema.md (TASK-007 — existing sections and table layout to
  continue consistently)
- /home/agent/workspace/docs/specs/SPEC-001-REVIEW.md (§6a F-4 waiver; §6b F-9a–f decisions and
  the "Verification gap" section; §6b orchestrator decision F-6 extending `[PG-014]`)
- /home/agent/workspace/docs/specs/SPEC-001.md (§6.1.5 — the style the waiver notes must follow;
  REQ-3.2 — Mermaid requirement)

## Investigation Notes

- **Revision** (`0001_initial_base_schema.py`): `TABLES` names exactly 20 tables. `docs/db_schema.md`
  part 1 documents ten of them (§4.1–4.10: contact, message, topic, document, article,
  topic_article_link, article_comment, subagent, cv_education, project). The remaining ten are
  exactly the ten listed in this task — red check passes.
- Shared helpers: `id_column()` → `VARCHAR(32)` NOT NULL PK; `fk_column()` → `VARCHAR(32)` with
  explicit nullability; `timestamp_columns()` → `created_at`/`updated_at`,
  `TIMESTAMP WITH TIME ZONE`, NOT NULL, `server_default now()`.
- Constraints extracted for the ten remaining tables (all verified line by line against the
  revision): `uq_cv_stack_item_name`, `uq_cv_skill_category_category`, `uq_api_key_api_key`,
  `uq_cv_stack_item_experience_link_stack_experience`,
  `uq_cv_stack_item_category_link_category_stack_item`,
  `uq_agent_spec_document_link_spec_id_document_id`. All FKs are `ON DELETE CASCADE` except
  `fk_admin_audit_log_api_key_id`, which is `ON DELETE RESTRICT`.
- `base.admin_audit_log.api_key_id` is **nullable** in the revision; its column COMMENT carries
  the user-approved rationale (acceptance suite requires audit rows for requests with no valid
  key). This is a deviation from SPEC-001 §6.1.9's default-non-nullable rule and is documented
  as a third deviation note.
- `base.agent_spec` has `display_name`, `description`, `display` only — no external spec
  identifier column. Deliberate: `display_name` carries the human-facing identifier.
- Enum types are declared with `create_type=False` and created/dropped explicitly:
  `base.http_method` (get/post/put/patch/delete), `base.document_type` (spec/acceptance/other).
- No disagreement between the revision and SPEC-001 §6.1 was found beyond the three recorded,
  user-approved deviations; no revision defect to surface.
- **SPEC-001-REVIEW.md**: §6a F-4 waives `[PG-005]` for `base.article.document_id` (F-4b
  `SET NULL` declined, cascade retained); §6b orchestrator decision F-6 extends the `[PG-014]`
  waiver to `base.admin_audit_log.payload`/`response`; §6b requires every F-9a–f decision to be
  recorded in `docs/db_schema.md`; the "Verification gap" section states AC-1 … AC-10 are
  unverifiable in this changeset and only AC-11 can be closed.
- **SPEC-001 §6.1.5** is the style model for the waiver notes (a short NOTE naming the columns
  and the standard); REQ-3.2 requires Markdown tables plus at least one Mermaid diagram
  covering all modelled entities.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-003 | Single initial migration revision for the `base` schema | blocks | The revision file this document transcribes |
| TASK-007 | `docs/db_schema.md` part 1 | blocks | The document skeleton, conventions, object inventory and first ten tables |

## Implementation Steps (TDD: Red-Green-Refactor)

Documentation task; the cycle is checklist verification against the revision.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables: the revision and the part-1 document
- [x] Red check: enumerate the 20 tables from the revision and confirm exactly ten are still
      undocumented; extract their columns, types, nullability, defaults and constraints, and
      record any disagreement with SPEC-001 §6.1 as a revision defect to surface

### 2. Green Phase

- [x] Add sections 1–6 above
- [x] Verify each new Markdown table against the revision line by line
- [x] Confirm the Mermaid block parses and names all 20 entities

### 3. Refactor Phase

- [x] Re-read the whole document for layout consistency between the two halves and for
      duplicate/contradictory statements; confirm every constraint mentioned exists in the
      revision

## Completion Criteria

- [x] All **20** tables from the revision appear as Markdown tables matching the migration
      exactly — verified by cross-checking the 20-name list against the document's headings
- [x] At least one Mermaid diagram covers all 20 entities and their relationship cardinalities,
      including every link table
- [x] The `[PG-005]` waiver note for `base.article.document_id` is present, with the
      `ON DELETE CASCADE` consequence stated
- [x] The `[PG-014]` waiver note covers `base.subagent.inputs`/`outputs` **and**
      `base.admin_audit_log.payload`/`response`
- [x] Every F-9a–f resolution is recorded with its final implemented value, including the
      chosen string widths
- [x] The verification-status section states AC-1 … AC-10 as implemented-but-unverified and
      names the waived mechanisms (migration CI job, provisioned PostgreSQL instance)
- [x] No statement in the document contradicts the revision

## Notes

- Impact scope: closes AC-11; consumed as the schema contract by SPEC-002/3/4 and by the
  seeding models and fixtures in Phase 3.
- Risk countermeasures carried by this task: **RISK-014** (per-table tables, Mermaid, both
  waivers, all F-9 resolutions with final widths), **RISK-003** (20-table cross-check),
  **RISK-001** (downgrade completeness auditable against the object inventory), **RISK-016**
  (cascade documented), **RISK-022** (verification gap recorded durably).
- Scope boundary: does not modify the revision or any other file; if the revision is wrong,
  surface it rather than documenting the intended behaviour.
