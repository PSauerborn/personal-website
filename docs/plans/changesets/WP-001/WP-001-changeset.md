# Changeset: SPEC-001 — Database Enabler (PostgreSQL schema, migrations and seeding)

Work Plan ID: WP-001
Created Date: 2026-08-14
Author: documenter

## Summary

Implements SPEC-001, the database enabler: a single alembic revision that creates and drops
the twenty-table `base` PostgreSQL schema, a containerised migration runner, a
pydantic-validated JSON fixture corpus with a transactional seeding script, Dockerfiles and
component `Makefile` targets for both, and `docs/db_schema.md` as the schema of record. The
changeset is almost entirely new files; the only pre-existing files it modifies are
`README.md`, `.gitignore` and `.secrets.baseline`.

## Verification Status

**AC-11 is met.** AC-1 … AC-10 are **implemented but unverified**: the migration CI job was
user-waived, no PostgreSQL instance was provisioned in this environment, and no container
runtime exists, so neither the `alembic/` nor the `scripts/seeding/` image was ever built and
neither component's `make run-migrations` / `make seed` target was ever executed against a
real database. This is recorded durably in `docs/db_schema.md` §10 and in both component
READMEs (`alembic/README.md` "Verification Status", `scripts/seeding/README.md` §2.7); it is
restated here so the claim is not quietly dropped from the changeset record.

## Changes

### Added

- `alembic/` — a single alembic revision (`0001_initial_base_schema.py`) creating the `base`
  schema, two named enum types, one shared `updated_at` trigger function, all twenty tables and
  their triggers, with a matching `downgrade`. A thin `src/main.py` entrypoint drives `alembic`
  programmatically from environment variables validated by `src/config.py`; a `Dockerfile`,
  `.dockerignore`, `Makefile` (`build`, `run-migrations`, `lint`) and `README.md` complete the
  component.
- `scripts/seeding/` — a pydantic-validated, domain-aggregate JSON fixture corpus (ten files)
  covering all twenty tables, with sidecar Markdown document content, a persistence layer that
  computes an FK-safe insert order and de-duplicates shared lookup rows, and an `argparse` CLI
  (`src/main.py`) requiring an explicit `--yes` opt-in for the destructive truncate-and-reseed
  run. A `Dockerfile`, `.dockerignore`, `Makefile` (`build`, `seed`, `test`, `lint`) and
  `README.md` complete the component. 274 tests run against a fake connection factory; no
  PostgreSQL binary is present in the test image.
- `docs/db_schema.md` — the schema of record: full column tables for all twenty entities, a
  Mermaid ERD, the standards-waiver/deviation notes, resolved schema gaps, and the verification
  status section described above.

### Changed

- `README.md` — documents the `alembic` and `scripts/seeding` components and records that
  applying migrations and seeding the database are invoked as component `Makefile` targets:
  `make -C alembic run-migrations` and `make -C scripts/seeding seed`.
- `.gitignore` — added Python build-artefact entries (`__pycache__/`, `*.py[cod]`) so the two
  new Python components do not commit compiled bytecode.
- `.secrets.baseline` — regenerated and audited to include the two new components (118
  additions, 0 drops).

## Deviations from SPEC-001 / Coding Standards (user-approved)

Three deviations exist, all recorded in `docs/db_schema.md` §7:

1. **`[PG-005]` waived for `base.article.document_id`.** A direct, nullable foreign key with
   `ON DELETE CASCADE` to `base.document` is used instead of a link table. Consequence: deleting
   a document deletes the article metadata row that points at it, not just its body.
2. **`[PG-014]` waived for four `JSONB` columns**: `base.subagent.inputs`,
   `base.subagent.outputs`, `base.admin_audit_log.payload`, `base.admin_audit_log.response`.
3. **`base.admin_audit_log.api_key_id` made nullable**, deviating from SPEC-001 §6.1.9's
   default-non-nullable rule, to satisfy the acceptance suite's unauthenticated-admin-request
   audit scenario (and every "invalid API key" example), which requires an audit row for a
   request with no valid key. The FK itself is unchanged: `ON DELETE RESTRICT` still applies to
   non-null values.

## Defects Found and Fixed During the Workflow

- **Critical — `version_table_schema` misconfiguration.** An earlier iteration set
  `version_table_schema = "base"`, which would have made `alembic upgrade head` fail against an
  empty database (alembic creates its version table before any revision body runs, and never
  creates a schema for it), and made the revision's guarded `DROP SCHEMA` permanently
  unreachable. Fixed by leaving `version_table_schema` unset, so `alembic_version` lives outside
  `base` in the connection's default schema, and by making the final `DROP SCHEMA base
  RESTRICT` unconditional.
- **`base.topic_article_link.id` derived from md5.** An earlier iteration derived this link
  table's primary key from an md5 hash, violating SPEC-001 §6.1's UUIDv7 requirement and
  REQ-2.3. Fixed by requiring every link row (including `topic_article_link`) to carry its own
  explicit, fixture-supplied UUIDv7 hex literal.

## Findings Accepted as Outstanding

- **`[LOG-005]` (`alembic/alembic.ini`, SHOULD).** The only configured handler writes to
  stderr, so alembic's own `Running upgrade` progress records never reach `LOG_FILE`.
- **`[LOG-002]` (`alembic/alembic.ini`, SHOULD).** `[formatter_generic]` renders plain text with
  no timestamp, rather than JSON, so one run emits two log formats on two streams.
- **SEC-004 — base-image digest pinning (deferred).** Both Dockerfiles still pin `FROM
  python:3.14-slim` by mutable tag. Resolving a digest requires pulling the image, and no
  container runtime exists in this environment, so the fix is documented (with the exact
  `docker pull` / `docker inspect` procedure) in both component READMEs but not applied.

## Where the Make Targets Live

`run-migrations` and `seed` are **component** `Makefile` targets, not root delegation targets:
`make -C alembic run-migrations` and `make -C scripts/seeding seed`. Root delegation targets
were authored during the work plan and then deliberately removed by user decision, because
prepending them above `scan-secrets` changed GNU make's default goal to a destructive target — a
bare `make` would otherwise have expanded to a migration or seeding run instead of the read-only
secret scan. The root `Makefile` is therefore byte-identical to `HEAD` and is not part of this
changeset.

## New Files

| File Path | Description |
| --------- | ----------- |
| `alembic/alembic.ini` | Alembic configuration; no `version_table_schema` set (deliberate) |
| `alembic/migrations/env.py` | Alembic environment/runtime configuration |
| `alembic/migrations/script.py.mako` | Revision template |
| `alembic/migrations/versions/0001_initial_base_schema.py` | The single revision creating/dropping the `base` schema |
| `alembic/src/config.py` | Pydantic-validated environment configuration |
| `alembic/src/main.py` | Container entrypoint driving `alembic` programmatically |
| `alembic/requirements.txt` | Pinned dependencies |
| `alembic/Dockerfile` | Migration image (base pinned by tag; digest pinning deferred) |
| `alembic/.dockerignore` | Build context exclusions |
| `alembic/Makefile` | `build`, `run-migrations`, `lint` targets |
| `alembic/README.md` | Component overview, env-var contract, verification status |
| `scripts/seeding/src/config.py` | Pydantic-validated environment configuration |
| `scripts/seeding/src/models.py` | Domain-aggregate pydantic models |
| `scripts/seeding/src/fixtures.py` | Fixture loading and validation |
| `scripts/seeding/src/persistence.py` | FK-safe flatten/de-dup/insert-order/transaction logic |
| `scripts/seeding/src/main.py` | `argparse` CLI entrypoint (`--yes` opt-in) |
| `scripts/seeding/tests/*.py` | Unit test suite (274 tests) against a fake connection factory |
| `scripts/seeding/requirements.txt` | Pinned dependencies |
| `scripts/seeding/Dockerfile` | Seeding image with a `tests` build stage |
| `scripts/seeding/.dockerignore` | Build context exclusions |
| `scripts/seeding/Makefile` | `build`, `seed`, `test`, `lint` targets |
| `scripts/seeding/README.md` | Fixture contract, CLI reference, verification status |
| `scripts/seeding/fixtures/*.json` | Ten domain-aggregate fixture files covering all twenty tables |
| `scripts/seeding/fixtures/documents/blog/*.md` | Five blog-article sidecar documents |
| `scripts/seeding/fixtures/documents/specs/*.md` | Seven agent-spec sidecar documents |
| `docs/db_schema.md` | Schema of record: tables, ERD, waivers, resolved gaps, verification status |
