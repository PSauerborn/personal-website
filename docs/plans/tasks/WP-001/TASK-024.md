# Task: Repository README amendment and root Makefile delegation targets

Work Plan ID: WP-001
Task ID: TASK-024
Created Date: 2026-08-13
Description: Update the root `README.md` (directory tree, TOC, component prose) to match the delivered `alembic/` and `scripts/seeding/` layout, and optionally add thin root `Makefile` delegation targets for `run-migrations` and `seed`.

## Implementation Content

Binding decision F-5 (`docs/specs/SPEC-001-REVIEW.md` §6a): SPEC-001 §6.2's root-level
`alembic/` and `scripts/seeding/` stand, and `README.md` is amended so the documented layout
matches. The current README documents `infrastructure/alembic` and a shell-script `scripts`
directory — both now wrong.

- `README.md`:
  - **ASCII directory tree**: replace `infrastructure/alembic` with a root-level `alembic`
    entry, and show `scripts/seeding` (with `fixtures/`) instead of the generic `scripts` shell
    helper description. Leave the other (still aspirational) entries alone.
  - **Table of Contents**: update the component links so they match the amended section
    headings (the `infrastructure/alembic` link must not dangle).
  - **Component prose**: replace the `infrastructure/alembic` section with an `alembic` section
    describing the migration component (single revision creating the `base` schema, the wrapper
    entrypoint, the `run-migrations` target, and a pointer to `alembic/README.md` and
    `docs/db_schema.md`); rewrite the `scripts` section to describe the Python seeding component
    (validated JSON domain fixtures with sidecar document content, the transactional seeder, the
    `seed` target, and a pointer to `scripts/seeding/README.md`).
- Root `Makefile` (optional but preferred): add thin delegation targets

  ```make
  .PHONY: run-migrations
  run-migrations:
  	$(MAKE) -C alembic run-migrations

  .PHONY: seed
  seed:
  	$(MAKE) -C scripts/seeding seed
  ```

  The existing `scan-secrets` and `claude` targets and the claude version variables must remain
  **byte-identical**.

`.pre-commit-config.yaml` and `.flake8` are not touched.

## Target Files

- [x] README.md
- [x] Makefile

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/README.md (current TOC, the ASCII tree at lines ~25–38, the
  `infrastructure/alembic` and `scripts` component sections)
- /home/agent/workspace/Makefile (existing `scan-secrets` and `claude` targets to preserve)
- /home/agent/workspace/alembic/README.md and /home/agent/workspace/scripts/seeding/README.md
  (TASK-006 / TASK-023 — the component descriptions and make targets to reference)
- /home/agent/workspace/docs/specs/SPEC-001-REVIEW.md (§6a F-5 decision; §6b "README scope"
  orchestrator decision — tree, TOC and prose, not tree-only)

## Investigation Notes

- `README.md` (before): TOC line 10 links `infrastructure/alembic` → `#alembic`; the ASCII tree
  (lines 25–38) nests `alembic` under `infrastructure` and shows a bare `scripts # Helper
  scripts for development and deployment`; the prose has an `#### infrastructure/alembic`
  section (line 72) and a `#### scripts` section (line 67) describing "a collection of shell
  scripts". All four statements contradict the delivered layout.
- `README.md` also documents `infrastructure/manifests`, `infrastructure/terraform`, `api` and
  `web`, none of which exist yet in this greenfield repo. They are forward-looking descriptions
  of components later specs deliver and are deliberately left untouched — only the two
  statements this changeset contradicts (alembic's location and the `scripts` description) are
  corrected.
- `Makefile` (before): a `scan-secrets` target, the three `claude_*` version variables and a
  `claude` target. Nothing else — `make run-migrations` and `make seed` both fail from the root
  with "No rule to make target" (red check confirmed).
- `alembic/README.md`: component holds the table definitions and the `alembic` revisions; the
  container entrypoint is the `src/main.py` wrapper driving `alembic` programmatically, with
  configuration validated at import time; targets are `build`, `run-migrations`, `lint`; run as
  `make -C alembic <target>`; ships intentionally without unit tests (binding decision 5).
- `scripts/seeding/README.md`: loads JSON fixtures from `scripts/seeding/fixtures/`, validates
  them through `pydantic` domain-aggregate models, and inserts them into an already-migrated
  database inside a single transaction; document `content` fields are paths to sidecar files
  under `fixtures/documents/` read as bytes; targets are `build`, `seed`, `test`, `lint`; run as
  `make -C scripts/seeding <target>`.
- Delivered layout on disk: `alembic/{Dockerfile,Makefile,README.md,alembic.ini,migrations,
  requirements.txt,src}` and `scripts/seeding/{Dockerfile,Makefile,README.md,fixtures,
  requirements.txt,src,tests}` with ten domain JSON files plus `fixtures/documents/`.
- `docs/specs/SPEC-001-REVIEW.md` line 254 (F-5) and line 283 ("README scope") confirm the
  amendment covers the tree, the TOC links **and** the affected prose sections.
- Standards consulted: `GENERAL.md` (`GEN-004` — makefiles define common targets) and
  `general/MAKEFILES.md` (`MAKE-001` — automate repository-inherent actions). The root
  delegation targets are thin `$(MAKE) -C` wrappers, adding no logic of their own.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-006 | Migration automation and component README | blocks | `alembic/Makefile` `run-migrations` target and component README |
| TASK-023 | Seeding automation and README completion | blocks | `scripts/seeding/Makefile` `seed` target and component README |

## Implementation Steps (TDD: Red-Green-Refactor)

Documentation/automation task; the cycle is verification against the delivered layout.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables (both component Makefiles and READMEs)
- [x] Red check: list every README statement that contradicts the delivered tree (the
      `infrastructure/alembic` prose, the tree entry, the TOC link, the `scripts` prose) and
      confirm `make run-migrations` / `make seed` from the repo root currently fail

### 2. Green Phase

- [x] Apply the README amendments and add the two delegation targets
- [x] Run `make run-migrations` and `make seed` from the repo root and confirm they delegate to
      the component Makefiles (the container run will still exit non-zero without a database —
      that is expected)
- [x] Run `make scan-secrets`-style inspection or diff the root `Makefile` to confirm the
      pre-existing targets are unchanged

### 3. Refactor Phase

- [x] Re-read the README top to bottom for internal consistency (tree ↔ TOC ↔ prose)

## Completion Criteria

- [x] The README ASCII tree shows root-level `alembic/` and `scripts/seeding/` (with
      `fixtures/`) and no longer shows `infrastructure/alembic`
- [x] Every TOC entry resolves to an existing heading; no dangling `infrastructure/alembic` link
- [x] The `alembic` and `scripts` component prose sections describe the delivered components and
      point at `alembic/README.md`, `scripts/seeding/README.md` and `docs/db_schema.md`
- [x] `make run-migrations` and `make seed` from the repo root delegate to the component
      Makefiles via `make -C`
- [x] The existing `scan-secrets` and `claude` targets and their variables are unchanged
- [x] `.pre-commit-config.yaml`, `.flake8`, `acceptance/**` and `docs/specs/**` are unmodified

## Notes

- Impact scope: repository-level documentation inherited by SPEC-002+.
- Risk countermeasures carried by this task: **RISK-018** (hard scope boundary — only
  `README.md` and the root `Makefile` delegation targets are touched; no compose file, no CI
  workflow, no PostgreSQL provisioning is added to close the verification gap).
- Scope boundary: preserve the existing root `Makefile` targets byte-for-byte; do not modify any
  component file.
