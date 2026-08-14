# Task: Seeding automation and README completion (`scripts/seeding/Makefile`, README)

Work Plan ID: WP-001
Task ID: TASK-023
Created Date: 2026-08-13
Description: Add the `seed` make target (build + `docker run` with `-e` pass-through) and complete `scripts/seeding/README.md` with usage, the CLI argument reference and the environment-variable contract.
Acceptance Criteria Covered: AC-9

## Implementation Content

- `scripts/seeding/Makefile`:
  - `seed` target that (1) builds the image with `--platform linux/amd64 --provenance=false`
    and (2) runs it with `-e` pass-through of `POSTGRES_HOST`, `POSTGRES_PORT`,
    `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` from the parent shell (REQ-2.7 —
    values are **not** hard-coded in the Makefile).
  - Targets declared `.PHONY`; follow the `make -C <COMPONENT>` monorepo convention. A `test`
    target running pytest and a `lint` target running `black`/`flake8` over
    `scripts/seeding/` may be added; `.pre-commit-config.yaml` must not be touched.
- Complete `scripts/seeding/README.md` (the fixture catalogue sections from TASK-009 stay
  intact — fill the placeholder sections):
  - **Usage**: `make -C scripts/seeding seed`, and running the CLI directly.
  - **CLI arguments**: every `argparse` argument, its meaning, and the fact that each defaults
    from the corresponding `POSTGRES_*` environment variable and can be overridden explicitly.
  - **Environment-variable contract**, with the `POSTGRES_*` rows **identical** to the table in
    `alembic/README.md` (RISK-015):

| Variable | Required | Default | Consumers |
| --- | --- | --- | --- |
| `POSTGRES_HOST` | yes | — | both containers |
| `POSTGRES_PORT` | no | `5432` | both containers |
| `POSTGRES_USER` | yes | — | both containers |
| `POSTGRES_PASSWORD` | yes | — (SecretStr) | both containers |
| `POSTGRES_DB` | yes | — | both containers |

  - **Testing**: the suite runs with no PostgreSQL binary or server; the image's tests stage
    enforces this.
  - **Verification status**: AC-6 … AC-10 are implemented but **unverified** in this changeset —
    no PostgreSQL instance is provisioned by user decision (RISK-022).

## Target Files

- [x] scripts/seeding/Makefile
- [x] scripts/seeding/README.md

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/Dockerfile (TASK-022 — build context, tag, entrypoint)
- /home/agent/workspace/scripts/seeding/src/main.py (TASK-017 — the exact argparse argument
  names and defaults to document)
- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — the existing catalogue sections
  and placeholder headings)
- /home/agent/workspace/alembic/README.md (TASK-006 — the environment table this one must match
  row-for-row)
- /home/agent/workspace/alembic/Makefile (TASK-006 — target style to mirror)
- Coding standards via the `coding-standards` skill: `general/MAKEFILES.md`

## Investigation Notes

- `alembic/Makefile` (TASK-006) is the structural model: `image_name`/`image_tag`/`image` and
  `platform` as overridable variables, a `build` target carrying
  `--platform $(platform) --provenance=false -t $(image) -f Dockerfile .`, a run target
  depending on `build` and using the value-less `docker run -e <NAME>` form, and a `lint`
  target running `black .` / `flake8 .`. Every target is `.PHONY`. The seeding `Makefile`
  mirrors this exactly, with `seed` in place of `run-migrations`, the five `POSTGRES_*`
  variables only (no `ALEMBIC_*`), and an added `test` target.
- `scripts/seeding/Dockerfile` (TASK-022): build context is `scripts/seeding/`, entrypoint is
  `["python", "-m", "src.main"]`, so arguments appended to `docker run` reach the CLI. The
  `tests` stage runs `python -m pytest` during the build and the runtime stage copies its
  sources from it, so the image cannot build unless the suite passes.
- `scripts/seeding/src/main.py` (TASK-017): six argparse arguments — `--host`, `--port`
  (`int`), `--user`, `--password` (`SecretStr`), `--dbname`, each defaulting to the matching
  `Config` field, plus `--fixtures-dir` (`Path`) defaulting to `DEFAULT_FIXTURES_ROOT` with no
  environment default. Settings are loaded before the parser is built, so a missing required
  variable fails the run regardless of the arguments supplied.
- `alembic/README.md` (TASK-006) environment table: the five `POSTGRES_*` rows were copied
  verbatim into `scripts/seeding/README.md` §2.4 (`—` / `5432` / `— (SecretStr)` values and
  the "both containers" consumer column preserved row for row).
- Standards read: `GENERAL.md` (GEN-003/GEN-004 — containerized build, make targets for
  build/test/lint) and `general/MAKEFILES.md` (MAKE-001).
- README staleness corrections made (README is in the write set):
  - §4.10 now lists **three** rows; `audit.unauthenticated` (null `api_key_id`, null
    `payload`, null `response`, `403`) was added to match the delivered
    `fixtures/admin_audit_log.json`.
  - §8 rewritten from open conflicts into resolutions: C-1 (`base.admin_audit_log.api_key_id`
    made NULLABLE), C-2 (no external spec-identifier column; `display_name` carries the
    human-facing identifier) and C-3 (CV personal-details header is static SPEC-003 UI
    content), all recorded as decided by the user on 2026-08-13. The §4.3 cross-reference to
    C-2 was reworded from "conflict" to "resolution".
- Drift check against the delivered code and fixtures (no other drift found):
  - `src/persistence.py` `INSERT_ORDER` matches the twenty-entry list in §6 element for
    element, in order.
  - The §5.2 explicit-link-id rule holds: every flattener writes `link.id` for
    `topic_article_link`, `agent_spec_document_link`, `cv_stack_item_experience_link` and
    `cv_stack_item_category_link`; the seeder derives no identifier for any table.
  - The §4 row lists match the ten shipped fixture files exactly (contacts 3/6 messages,
    blog 6 articles + 4 comments + 4 topics, agent_specs 6, cv_experience 3 with 5 owned
    stack items, cv_skills 3 categories, cv_education 3, subagents 3, projects 4, api_keys 3),
    as do the twelve sidecars under `fixtures/documents/`.
- Environment: **no container runtime exists** in this environment (`docker`, `podman`,
  `nerdctl` all absent; user decision of 2026-08-13). `make seed` was therefore not executed;
  the recipe was verified by `make -n seed` expansion instead.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-022 | Seeding container image with tests stage | blocks | The image the `seed` target builds and runs |
| TASK-006 | Migration automation and component README | informs | The environment-variable table this README must match |

## Implementation Steps (TDD: Red-Green-Refactor)

The Red-Green cycle is driven by executing the make target.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables
- [x] Red check: run `make -C scripts/seeding seed` and confirm it fails (no target yet) —
      `make: *** No rule to make target 'seed'.  Stop.` (exit 2)

### 2. Green Phase

- [ ] **UNVERIFIED (no container runtime)** — Implement the target; run
      `make -C scripts/seeding seed` with no `POSTGRES_*` set and confirm the image builds
      (tests stage passing) and the container run exits non-zero naming the missing variable.
      The target is implemented, but `make seed` was **not executed**: this environment has no
      container runtime at all (`docker`, `podman`, `nerdctl`, `buildx`, `img` absent, no
      daemon socket) by user decision of 2026-08-13. Verified instead by `make -n seed`, whose
      expansion is exactly the mandated `docker build --platform linux/amd64
      --provenance=false` followed by `docker run --rm` with the value-less `-e` form for all
      five `POSTGRES_*` variables. The offline suite passes via `make -C scripts/seeding test`
      (255 passed), which is the same suite the image's tests stage runs.
- [x] Complete the README sections above

### 3. Refactor Phase

- [x] Tidy the Makefile (`.PHONY`, image tag variable); re-run `make -n seed` (the target
      itself is unrunnable here — see above)
- [x] Re-read the README end to end for consistency between the catalogue and the new sections

## Completion Criteria

- [ ] **UNVERIFIED (build execution)** — `make -C scripts/seeding seed` builds the image with
      `--platform linux/amd64 --provenance=false` and issues a `docker run` with `-e`
      pass-through for all five `POSTGRES_*` variables. The recipe is authored and its
      expansion verified with `make -n seed`; the build itself was not executed because no
      container runtime exists in this environment
- [x] No credential or connection value is hard-coded in the Makefile — the only variables are
      `image_name`, `image_tag`, `image`, `python_bin` and `platform`; every `-e` is value-less
- [x] `scripts/seeding/README.md` documents every `argparse` argument with its
      environment-variable default and override behaviour (§2.3, all six arguments)
- [x] The `POSTGRES_*` table in this README matches the one in `alembic/README.md` row-for-row
- [x] The README still contains the complete fixture catalogue, ownership rules, insert order
      and ID-stability statement from TASK-009, and the file list matches
      `scripts/seeding/fixtures/` exactly (§4.10 corrected to the delivered three rows; §8
      rewritten as resolutions)
- [x] The README records AC-6 … AC-10 as implemented-but-unverified with the waived mechanism
      named (§2.7 — no provisioned PostgreSQL instance, no container runtime)
- [x] Existing root `Makefile` targets are untouched by this task

## Notes

- Impact scope: `README.md` (TASK-024) links to this component.
- Risk countermeasures carried by this task: **RISK-005** (README enumerates the actually
  shipped fixture files with no drift), **RISK-015** (identical contract across both component
  READMEs), **RISK-010** (mandated build flags in the target), **RISK-022** (verification gap
  recorded durably).
- Scope boundary: `.pre-commit-config.yaml`, `.flake8`, the root `Makefile` and root `README.md`
  are not modified here. Do not delete or rewrite the TASK-009 catalogue sections.
