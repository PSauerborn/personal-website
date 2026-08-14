# Task: Migration automation and component README (`alembic/Makefile`, `alembic/README.md`)

Work Plan ID: WP-001
Task ID: TASK-006
Created Date: 2026-08-13
Description: Add the `run-migrations` make target (build + `docker run` with `-e` pass-through) and the alembic component README documenting usage and the full environment-variable contract.
Acceptance Criteria Covered: AC-5

## Implementation Content

- `alembic/Makefile`:
  - `run-migrations` target that (1) builds the image with
    `--platform linux/amd64 --provenance=false` and (2) runs it with `-e` pass-through of
    `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
    `ALEMBIC_REVISION`, `ALEMBIC_COMMAND` from the parent shell (REQ-1.5 —
    `docker run -e POSTGRES_HOST ...`, values are **not** hard-coded in the Makefile).
  - Targets declared `.PHONY`; follow the repo's `make -C <COMPONENT>` monorepo convention.
  - A `lint` target consistent with the pre-commit convention described in the root `README.md`
    may be added (`black`/`flake8` over `alembic/`), but `.pre-commit-config.yaml` itself must
    not be touched.
- `alembic/README.md`: component purpose, how to run migrations locally and via the container,
  and the environment-variable contract table **verbatim** as below (the same table appears in
  `scripts/seeding/README.md` for the `POSTGRES_*` rows; the two must not diverge — RISK-015):

| Variable | Required | Default | Consumers |
| --- | --- | --- | --- |
| `POSTGRES_HOST` | yes | — | both containers |
| `POSTGRES_PORT` | no | `5432` | both containers |
| `POSTGRES_USER` | yes | — | both containers |
| `POSTGRES_PASSWORD` | yes | — (SecretStr) | both containers |
| `POSTGRES_DB` | yes | — | both containers |
| `ALEMBIC_REVISION` | yes (no default; raise if unset) | — | migrations container |
| `ALEMBIC_COMMAND` | yes (`upgrade`\|`downgrade` only; raise if unset) | — | migrations container |

The README must also state that this component intentionally ships without unit tests
(binding decision 5) and that AC-1 … AC-5 are **implemented but unverified** in this
changeset — no migration CI job and no provisioned PostgreSQL instance are in scope
(RISK-022).

## Target Files

- [x] alembic/Makefile
- [x] alembic/README.md

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/alembic/Dockerfile (TASK-005 — build context, tag, entrypoint)
- /home/agent/workspace/alembic/src/config.py (TASK-001 — the exact variable names and defaults
  the README documents)
- /home/agent/workspace/Makefile (existing root targets `scan-secrets`, `claude` — style
  reference only; do not modify it in this task)
- /home/agent/workspace/README.md ("Makefiles" and "Precommit Checks" sections — the
  `make -C <COMPONENT>` convention)
- Coding standards via the `coding-standards` skill: `general/MAKEFILES.md`

## Investigation Notes

- `alembic/Dockerfile` (TASK-005): two-stage `python:3.14-slim` build, runtime entrypoint
  `CMD ["python", "src/main.py"]`, build context is the component directory (`COPY alembic.ini`,
  `migrations`, `src` are all relative to `alembic/`). The header already documents the mandated
  build invocation `docker build --platform linux/amd64 --provenance=false -t <tag> alembic/`.
  Because the Makefile runs inside `alembic/`, the target uses `-f Dockerfile .` for the same
  context. No connection setting is baked into the image, so every value must be passed at run
  time.
- `alembic/src/config.py` (TASK-001): pydantic-settings `Config` with `POSTGRES_HOST`,
  `POSTGRES_USER`, `POSTGRES_DB` as required non-empty strings, `POSTGRES_PASSWORD` as a required
  `SecretStr`, `POSTGRES_PORT` as the only defaulted field (`5432`, `0 < port <= 65535`),
  `ALEMBIC_REVISION` as a required non-empty string and `ALEMBIC_COMMAND` as
  `Literal["upgrade", "downgrade"]`. `CONFIG = Config()` is constructed at import time, so a
  missing variable fails before any migration runs. This matches the contract table row-for-row.
- Root `Makefile`: lowercase variable names (`claude_agents_version`), `.PHONY` declared
  immediately above each target, backslash-continued `docker build` / `docker run` recipes.
  Followed here for style; the root file itself is untouched.
- Root `README.md`: pre-commit invokes `make -C <COMPONENT> lint` per component, and each
  component README is expected to list its available `make` commands. A `lint` target
  (`black`/`flake8`) is therefore provided and documented; `.pre-commit-config.yaml` is untouched.
- Coding standards: `GENERAL.md` (GEN-001/GEN-004) and `general/MAKEFILES.md` (MAKE-001) — keep
  the Makefile minimal and limited to build/run/lint automation. No other standards node matched
  (no Go/Python/Docker source is authored by this task).
- **No container runtime in this environment**: `docker`, `podman` and `nerdctl` are all absent
  from `PATH` and there is no daemon socket. The Red-phase `make -C alembic run-migrations` was
  run before implementation and failed with `No rule to make target 'run-migrations'` (exit 2),
  but the Green-phase execution of `docker build` and `docker run` could **not** be performed.
  The target is therefore **implemented but unverified by execution**. Verification was done by
  inspection and by `make -n run-migrations`, whose expansion confirms the mandated
  `--platform linux/amd64 --provenance=false` flags and the value-less `-e` pass-through of all
  seven `POSTGRES_*`/`ALEMBIC_*` variables, with no credential or connection value hard-coded.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-005 | Migration container image | blocks | The image the `run-migrations` target builds and runs |

## Implementation Steps (TDD: Red-Green-Refactor)

No unit tests for this component (binding decision 5); the Red-Green cycle is driven by
executing the make target.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverable: `alembic/Dockerfile`
- [x] Red check: run `make -C alembic run-migrations` and confirm it fails (no target yet) —
      failed with `No rule to make target 'run-migrations'` (exit 2)

### 2. Green Phase

- [ ] **UNVERIFIED (no container runtime in this environment — `docker`/`podman`/`nerdctl` absent
      from PATH, no daemon socket)** Implement the target; run `make -C alembic run-migrations`
      with no `POSTGRES_*` set and confirm the build succeeds and the container run exits
      non-zero naming the missing variable (a live database is out of scope, so this is the
      expected end state). The target is implemented; only its execution could not be performed.
      `make -n run-migrations` confirms the recipe expands to the mandated build flags and the
      seven-variable `-e` pass-through.
- [x] Write the README with the contract table above

### 3. Refactor Phase

- [x] Tidy the Makefile (`.PHONY`, variables for image tag); re-run the target — `.PHONY`
      declared for `build`, `run-migrations` and `lint`, image tag driven by
      `image_name`/`image_tag`/`image` variables; re-checked via `make -n` (execution not
      possible, see above)

## Completion Criteria

- [ ] **UNVERIFIED BY EXECUTION (no container runtime available in this environment)**
      `make -C alembic run-migrations` builds the image with
      `--platform linux/amd64 --provenance=false` and issues a `docker run` with `-e`
      pass-through for all seven variables. Verified by inspection and by `make -n
      run-migrations`, which expands to exactly those flags and the seven `-e` variables; the
      build and run themselves were not executed.
- [x] No credential or connection value is hard-coded in the Makefile
- [x] `alembic/README.md` contains the environment-variable table exactly as specified above,
      with required/optional status and defaults
- [x] `alembic/README.md` states the no-unit-tests decision and records AC-1 … AC-5 as
      implemented-but-unverified with the waived mechanisms named
- [x] Existing root `Makefile` targets are untouched by this task (`git status` shows no
      modification to the root `Makefile`)

## Notes

- Impact scope: `README.md` (TASK-024) links to this component; the contract table here must
  match `scripts/seeding/README.md` (TASK-023) row-for-row on the `POSTGRES_*` variables.
- Risk countermeasures carried by this task: **RISK-010** (build flags mandated in the target),
  **RISK-015** (identical documented contract across both components), **RISK-022** (the
  verification gap is recorded in a durable artifact, not only in the workflow transcript).
- Scope boundary: `.pre-commit-config.yaml`, `.flake8`, the root `Makefile` and `README.md` are
  not modified here (TASK-024 owns the root files).
