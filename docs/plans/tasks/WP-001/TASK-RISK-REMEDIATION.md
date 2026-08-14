# Task: Risk Remediation — downgrade must drop the `base` schema (RISK-001)

Work Plan ID: WP-001
Task ID: TASK-RISK-REMEDIATION
Created Date: 2026-08-13
Description: Close the single mitigation deviation found by `risk-reviewer` against
`docs/plans/risk/WP-001/WP-001-risk-plan.md`: the initial revision's `downgrade` leaves the
`base` schema behind, contrary to RISK-001's countermeasure and to the residue claim in
`docs/db_schema.md`.

## Implementation Content

RISK-001 (severity Critical in the risk plan) requires `downgrade` to be the literal mirror of
`upgrade`, ending with an explicit `DROP SCHEMA base`. The delivered revision drops all other
object classes correctly (20 triggers, 20 tables in reverse FK order, `base.set_updated_at()`,
both enum types), but `drop_schema()` wraps `DROP SCHEMA base RESTRICT` in a `DO $$` guard that
skips the drop whenever `base.alembic_version` exists — and `env.py` deliberately places
alembic's version table in `base`. During any real `alembic downgrade base` the guard therefore
suppresses the drop and the schema survives, which is an outright failure of AC-2 ("leaves no
table, schema, enum type, or sequence created by the upgrade").

The remediation makes the schema drop unconditional, keeps `upgrade`/`downgrade` symmetric, and
corrects the documentation claim so `docs/db_schema.md` matches the delivered revision.

One acceptable shape (the executor may choose another that satisfies the completion criteria):
move alembic's version table out of the migrated schema (`version_table_schema` in
`alembic/migrations/env.py`, in both offline and online configuration) so that `base` contains
only revision-owned objects, then emit a plain `DROP SCHEMA base RESTRICT` as the final
statement of `downgrade`. If the version table stays in `base`, the downgrade must instead drop
it explicitly before the schema drop; a silently-skipping guard is not acceptable.

## Target Files

- [x] `alembic/migrations/versions/0001_initial_base_schema.py`
- [x] `alembic/migrations/env.py`
- [x] `docs/db_schema.md`

## Investigation Targets

- `alembic/migrations/versions/0001_initial_base_schema.py` (`drop_schema`, lines 232-259; `downgrade`, lines 1173-1196)
- `alembic/migrations/env.py` (`VERSION_TABLE_SCHEMA`, line 31; both `context.configure` calls)
- `docs/db_schema.md` (§3 Object Inventory, lines 70-95 — the "leaves no residue" claim)
- `docs/plans/tasks/WP-001/TASK-003.md` (lines 111-116, 245-249 — how the offline renders were invoked and what was counted)

## Change Category

`Change Category: bug-fix, boundary-change`

## Resolution

**Resolved by `TASK-CODE-REVIEW-REMEDIATION` (findings 1 and 2), not executed separately.**
That remediation shares this defect's root cause: `VERSION_TABLE_SCHEMA = "base"` in
`alembic/migrations/env.py`. It applied the shape suggested above — `version_table_schema` was
dropped from both the offline and the online `context.configure` call, so alembic's version
table is created in the connection's default schema, and `drop_schema()` in
`alembic/migrations/versions/0001_initial_base_schema.py` now emits an unconditional
`DROP SCHEMA base RESTRICT` with no `DO $$` guard. `docs/db_schema.md` §3 was corrected to state
the unconditional drop and to name `alembic_version`'s location outside `base`, and
`alembic/README.md` documents the new bookkeeping location as this task's Notes require.

Verification (both from `alembic/`, dummy `POSTGRES_*`, no server, both exit 0):
`python -m alembic upgrade head --sql` emits `CREATE SCHEMA IF NOT EXISTS base` as its first
`base`-related statement (the version table is now unqualified), and
`python -m alembic downgrade head:base --sql` ends with `DROP SCHEMA base RESTRICT;` followed
only by alembic's `DELETE FROM alembic_version …`. Object counts are unchanged: 1 schema,
2 enum types, 1 trigger function, 20 tables, 20 triggers, 0 secondary indexes.

Every completion criterion of this task is met by that change; no separate execution of this
task is required.

## Investigation Notes

- Red evidence (before the fix): `python -m alembic downgrade head:base --sql` emitted the
  schema drop only inside `DO $$ … IF NOT EXISTS (… relname = 'alembic_version') … END IF; $$;`,
  immediately followed by `DELETE FROM base.alembic_version WHERE …` — proof that the version
  table is present when the guard is evaluated, so the guard is always false at runtime.
- The upgrade render showed the same root cause from the other side: `CREATE TABLE
  base.alembic_version (…)` was the first statement, ahead of `CREATE SCHEMA IF NOT EXISTS base`
  (the critical `upgrade`-on-empty-database defect recorded as finding 1 of the code review).
- Sweep: the `DO $$` guard in `drop_schema` was the revision's only conditional statement; every
  other drop is unconditional, and both `context.configure` calls agreed on `base` as the
  version-table schema, so a single constant governed both modes.

## Task Dependencies

(None — the revision and `env.py` are already delivered.)

## Remediation Context

- Source: risk-reviewer
- Finding / failing command: RISK-001 deviation — `alembic downgrade head:base --sql` renders no
  unconditional `DROP SCHEMA base`; the schema drop is emitted only inside a `DO $$` guard that
  is false whenever `base.alembic_version` exists (`env.py:31` puts it there).
- Evidence: `alembic/migrations/versions/0001_initial_base_schema.py:245-259` renders
  `IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class ... relname = 'alembic_version') THEN
  DROP SCHEMA base RESTRICT; END IF;`, while `alembic/migrations/env.py:31` sets
  `VERSION_TABLE_SCHEMA = "base"`. `docs/db_schema.md:72-75` claims the downgrade drops all
  listed objects and "leaves no residue".
- Verification: from `alembic/`, with a dummy `POSTGRES_*` configuration and no server, run
  `alembic upgrade head --sql` and `alembic downgrade head:base --sql`; the downgrade render
  must contain an unconditional `DROP SCHEMA base` statement (no `DO $$` guard around it) and a
  matching `DROP` for every `CREATE` in the upgrade render (20 triggers, 20 tables,
  `base.set_updated_at()`, `base.http_method`, `base.document_type`, the schema). Both renders
  must exit 0.

This remediation has no unit-testable behaviour change (the alembic component ships without a
test suite by binding decision 5): reproduce the failure by reading the current downgrade render,
apply the fix, and re-run the Verification renders until they pass.

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Sweep the adjacent boundary: confirm no other object created by `upgrade` is dropped
      conditionally, and that the offline and online `context.configure` calls agree on where
      the version table lives
- [x] Render the current downgrade (`alembic downgrade head:base --sql`) and record that no
      unconditional `DROP SCHEMA base` is emitted

### 2. Green Phase

- [x] Make the schema drop unconditional (see Implementation Content) without changing any other
      object's drop order
- [x] Re-render upgrade and downgrade and confirm the object-for-object mirror, including the
      schema

### 3. Refactor Phase

- [x] Update `docs/db_schema.md` §3 so the residue statement matches the delivered downgrade
- [x] Re-run both renders and confirm the output is unchanged by the documentation edit

## Completion Criteria

- [x] `downgrade` emits an unconditional `DROP SCHEMA base` as its final statement; no
      `DO $$`-guarded skip of any object drop remains in the revision
- [x] The rendered downgrade SQL contains a matching `DROP` for every `CREATE` in the rendered
      upgrade SQL: 20 triggers, 20 tables, `base.set_updated_at()`, `base.http_method`,
      `base.document_type` and the `base` schema
- [x] `alembic/migrations/env.py` states unambiguously, in both offline and online mode, where
      alembic's version table lives, and that location does not defeat the schema drop
- [x] `docs/db_schema.md` §3 describes the downgrade behaviour as delivered
- [x] Verification command from Remediation Context passes

## Notes

- Impact scope: the migration component only. Moving the version table out of `base` changes
  where alembic bookkeeping is stored for any already-migrated database, so state the new
  location explicitly in `alembic/README.md` if it changes.
- Scope boundary: preserve unchanged — `docs/specs/**` and `acceptance/**` (read-only user
  inputs), `scripts/seeding/**` (unaffected by this deviation), `.pre-commit-config.yaml`,
  `.flake8`, and the root `Makefile`'s `scan-secrets`/`claude` targets. Do not add a
  docker-compose file, a CI workflow or any PostgreSQL provisioning to verify this change
  (RISK-018): the offline render remains the verification gate.
