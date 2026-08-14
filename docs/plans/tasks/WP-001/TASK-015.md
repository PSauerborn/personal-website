# Task: Persistence planning functions — flatten, de-duplicate, truncate set, FK order, SQL build

Work Plan ID: WP-001
Task ID: TASK-015
Created Date: 2026-08-13
Description: Implement the pure functions of `scripts/seeding/src/persistence.py` that turn validated domain aggregates into an ordered, de-duplicated, FK-safe set of table rows plus the truncate set and the SQL statements; with tests in `scripts/seeding/tests/test_persistence.py`.
Acceptance Criteria Covered: AC-6, AC-7, AC-8

## Implementation Content

All functions in this task are **pure** — no connection, no I/O — so every decision is unit
testable without a server.

1. **Flatten**: convert each validated domain aggregate into per-table row dicts for the
   physical tables it covers (e.g. the blog aggregate yields `document`, `topic`, `article`,
   `topic_article_link`, `article_comment` rows).
2. **De-duplicate shared lookup rows** (`base.document`, `base.cv_stack_item`): on an ID
   collision, compare the **full payloads**. Identical → collapse to one row. Conflicting →
   raise an explicit error naming the table, the ID and the differing fields. Never
   last-write-wins (RISK-008).
3. **Link check**: every cross-file ID reference (CV skills → `cv_stack_item`, admin audit log →
   `api_key`, agent-spec document links → `document`, and every FK column generally) must
   resolve to a row present in the flattened set; an unresolved reference raises before any
   database interaction.
4. **Truncate set**: exactly the tables receiving **at least one** row. A table receiving zero
   rows must never appear in the truncate set (cascade side-effects are permitted per REQ-2.5,
   but direct truncation is not).
5. **Insert order**: return the FK-safe table order. The order is the one written down
   independently in `scripts/seeding/README.md` (TASK-009) — the module must produce that order,
   and the test must assert against the README's constant rather than against a re-derivation by
   the same code (RISK-007).
6. **SQL build**: build the `TRUNCATE ... CASCADE` statements and the parameterised `INSERT`
   statements. Values must be passed as parameters — never string-interpolated into SQL. The
   `base.document.content` value must be passed as **bytes** so BYTEA round-trips byte-identically.

## Target Files

- [x] scripts/seeding/src/persistence.py
- [x] scripts/seeding/tests/test_persistence.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — the written FK-safe insert order
  constant and the shared-lookup ownership rules)
- /home/agent/workspace/scripts/seeding/src/models.py (TASK-011/012 — aggregate shapes to
  flatten)
- /home/agent/workspace/alembic/migrations/versions/0001_initial_base_schema.py (column names
  per table and the FK graph the order must satisfy)
- /home/agent/workspace/scripts/seeding/tests/conftest.py (TASK-010 — recorder fixtures)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-2.5 — truncate/insert semantics)
- Coding standards via the `coding-standards` skill: `python/GENERAL.md`
  (persistence-postgres example), `databases/POSTGRES.md`

## Investigation Notes

- `scripts/seeding/README.md` §6 writes the FK-safe order as a 20-entry list identical to the
  revision's `TABLES` tuple; the test module carries that list as its own constant
  (`README_INSERT_ORDER`) and asserts `persistence.INSERT_ORDER` against it (RISK-007).
  Truncation order is that list reversed.
- `src/models.py` nests owned rows and omits the parent FK column (`contact_id`, `article_id`,
  `experience_id`, `spec_id`); flattening restores them from the parent's `id`. Only
  `CvStackItemCategoryLinkFixture.stack_item_id` and `AdminAuditLogFixture.api_key_id` are
  ID-only references, and `api_key_id` is nullable (user decision 2026-08-13), so a null value
  is a valid reference, not an unresolved one.
- **Amendment (2026-08-13, spans TASK-012 and TASK-015).** The first implementation derived
  `base.topic_article_link.id` as a truncated `md5(f'{article_id}:{topic_id}')`, because blog
  topics were embedded bare `TopicFixture` records supplying no link id. That violated
  SPEC-001 §6.1 (primary keys must be UUIDv7 hex literals — an md5 digest is not one) and
  REQ-2.3 (ID fields used as primary keys must be present in **all** fixtures), and was a
  weak-hash smell a security review would flag. Fixed by giving the association its own
  fixture-supplied id: `ArticleFixture.topics` is now `list[ArticleTopicLinkFixture]`, an
  explicit link wrapper `{id, topic}` mirroring `CvStackItemExperienceLinkFixture`, which
  keeps `extra="forbid"` meaningful and leaves the embedded `TopicFixture` de-duplicable on
  its own `id`. `persistence.link_id`, the `hashlib` import and the now-unused `ID_LENGTH`
  constant were deleted; the flattener takes the link id from the fixture.
- **Every link table now carries a fixture-supplied `id`, and no table's id is derived
  anywhere in `persistence.py`.** `tests/test_persistence.py` pins this two ways: every id in
  a full plan must appear verbatim among the ids the aggregates declare, and the module source
  must contain no `hashlib`/`md5` reference and expose no `link_id`. `tests/test_models.py`
  pins that a topic association without an `id` is a validation error, that the nested topic's
  own `id` is still required, and that a bare (unwrapped) topic is rejected.
- Consequential edits outside the two task write sets: `scripts/seeding/README.md` §5.2 gained
  the explicit-link-id rule so TASK-018 authors link ids, and one synthetic blog payload in
  `tests/test_fixtures.py` (TASK-014) was reshaped to the new aggregate — without it the
  seeding suite could not pass.
- Revision 0001 column names drive `TABLE_COLUMNS`; `base.article_comment.created_at` is
  `NOT NULL` with a server default, so a comment without an explicit `created_at` must omit the
  column from its INSERT rather than pass `NULL`.
- `psycopg` does not adapt a bare `dict` to JSONB, so `subagent.inputs`/`outputs` and
  `admin_audit_log.payload`/`response` are wrapped in `psycopg.types.json.Jsonb` at
  statement-build time (never at flatten time, so rows stay comparable for de-duplication).
- Standards read: `GENERAL.md`, `python/GENERAL.md` (+ `examples/GENERAL/persistence-postgres.md`),
  `databases/POSTGRES.md`. `[PY-042]` (client as first argument) applies to TASK-016's executor,
  not to these pure planning functions.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-012 | Domain-aggregate pydantic models for all fixture domains | blocks | The aggregate models being flattened |
| TASK-009 | Fixture catalogue derivation | blocks | The independently written FK-safe insert order and ownership rules |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables; copy the README's FK-safe order into the test module as an
      explicit expected constant (do not import it from the implementation)
- [x] Write failing tests covering:
      - flattening one aggregate of each domain into the expected per-table rows
      - de-duplication: identical duplicate collapses to one row; conflicting duplicate raises;
        two distinct rows are both kept — for both `document` and `cv_stack_item`
      - unresolved cross-file ID reference raises
      - truncate set contains only tables receiving ≥ 1 row (negative test: a table with zero
        rows is absent)
      - computed insert order equals the README constant, and satisfies each required pair
        (`document` < `article`; `article` < `topic_article_link`, `article_comment`;
        `topic` < `topic_article_link`; `api_key` < `admin_audit_log`;
        `cv_stack_item`, `cv_experience` < `cv_stack_item_experience_link`;
        `cv_skill_category` < `cv_stack_item_category_link`;
        `agent_spec`, `document` < `agent_spec_document_link`; `contact` < `message`)
      - SQL build: statements are parameterised (no interpolated literals) and document content
        is carried as bytes
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Add minimal implementation to pass the tests
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Improve structure while keeping every function pure; confirm tests still pass;
      `black`/`flake8` clean

## Completion Criteria

- [x] Conflicting shared-lookup duplicates raise an explicit error naming table, ID and
      differing fields; identical duplicates collapse to exactly one row
- [x] An ID reference that resolves to no defined row raises, with no database interaction
      anywhere in the module
- [x] The truncate set equals exactly the set of tables receiving at least one row; a zero-row
      table is provably absent
- [x] The computed insert order equals the FK-safe order written in
      `scripts/seeding/README.md` and satisfies every ordering pair listed above
- [x] All SQL is parameterised; no fixture value is interpolated into a statement string;
      document content is passed as `bytes`
- [x] Every function in this task is pure — the module opens no connection
- [x] All added tests pass with no PostgreSQL binary present
- [x] `black` and `flake8` clean

## Notes

- Impact scope: TASK-016 adds the transactional executor to the same module; TASK-017 calls both.
- Risk countermeasures carried by this task: **RISK-007** (order asserted against the
  independently written README constant, plus a zero-row negative test), **RISK-008**
  (payload-comparing de-duplication with all three cases tested; unresolved references raise
  before any DB interaction), **RISK-012** (pure functions tested directly, no server).
- Scope boundary: does not modify `models.py`, `fixtures.py`, `config.py`, `conftest.py`, the
  README, or any fixture data.
