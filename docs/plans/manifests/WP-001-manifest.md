# Execution Manifest: WP-001

Work Plan ID: WP-001
Last Updated: 2026-08-14 (workflow complete — 24 tasks + 4 remediation rounds executed, reviewed, and documented)

Maintained by the orchestrator: append a row to Task Results after each `task-executor` completion (from the executor's JSON response) and keep the Changeset section deduplicated. Downstream reviewers and the documenter treat this file as the definitive changeset for the work plan — they do not re-derive it from task files.

## Task Results

| Task ID | Status | Files Modified | Tests Added |
| --- | --- | --- | --- |
| TASK-001 | completed | `alembic/src/config.py`, `alembic/requirements.txt` | _(none — binding decision 5: no test suite for the alembic component)_ |
| TASK-010 | completed | `scripts/seeding/requirements.txt`, `scripts/seeding/tests/conftest.py` | `scripts/seeding/tests/conftest.py` |
| TASK-002 | completed | `alembic/alembic.ini`, `alembic/migrations/env.py`, `alembic/migrations/script.py.mako` | _(none)_ |
| TASK-013 | completed | `scripts/seeding/src/config.py`, `scripts/seeding/tests/test_config.py` | `scripts/seeding/tests/test_config.py` (22 tests) |
| TASK-003 | completed | `alembic/migrations/versions/0001_initial_base_schema.py` | _(none — offline SQL render gate only)_ |
| TASK-004 | completed | `alembic/src/main.py` | _(none)_ |
| TASK-007 | completed | `docs/db_schema.md` | _(none — AST diff against the revision)_ |
| TASK-009 | completed | `scripts/seeding/README.md` | _(none)_ |
| TASK-003 (amendment) | completed | `alembic/migrations/versions/0001_initial_base_schema.py` | _(none)_ — `admin_audit_log.api_key_id` made nullable per the 2026-08-13 user decision on conflict C-1 |
| TASK-005 | completed (build unverified) | `alembic/Dockerfile`, `alembic/.dockerignore` | _(none)_ — files written; `docker build` could not run, no container runtime in this environment |
| TASK-011 | completed | `scripts/seeding/src/models.py`, `scripts/seeding/tests/test_models.py` | `scripts/seeding/tests/test_models.py` (25 tests) |
| TASK-008 | completed | `docs/db_schema.md` | _(none)_ — **closes AC-11** |
| TASK-012 | completed | `scripts/seeding/src/models.py`, `scripts/seeding/tests/test_models.py` | `scripts/seeding/tests/test_models.py` (65 tests; 112 total in suite) |
| TASK-006 | completed (target unverified) | `alembic/Makefile`, `alembic/README.md` | _(none)_ — recipe verified via `make -n`; `make run-migrations` not executed, no container runtime |
| TASK-014 | completed | `scripts/seeding/src/fixtures.py`, `scripts/seeding/tests/test_fixtures.py` | `scripts/seeding/tests/test_fixtures.py` (15 tests; 127 total) |
| TASK-015 | completed | `scripts/seeding/src/persistence.py`, `scripts/seeding/tests/test_persistence.py` | `scripts/seeding/tests/test_persistence.py` (34 tests; 161 total) |
| TASK-012/015 (amendment) | completed | `scripts/seeding/src/models.py`, `scripts/seeding/src/persistence.py`, `scripts/seeding/tests/test_models.py`, `scripts/seeding/tests/test_persistence.py`, `scripts/seeding/tests/test_fixtures.py`, `scripts/seeding/README.md` | Replaced the md5-derived `topic_article_link.id` with an explicit fixture-supplied link id (SPEC-001 §6.1 + REQ-2.3 violation). 166 total |
| TASK-016 | completed | `scripts/seeding/src/persistence.py`, `scripts/seeding/tests/test_persistence.py` | `scripts/seeding/tests/test_persistence.py` (10 executor tests) |
| TASK-018 | completed | `scripts/seeding/fixtures/blog.json`, `scripts/seeding/fixtures/documents/blog/*.md` (5 files), `scripts/seeding/tests/test_fixtures.py` | `scripts/seeding/tests/test_fixtures.py` (7 tests; 182 total) |
| TASK-017 | completed | `scripts/seeding/src/main.py`, `scripts/seeding/tests/test_main.py` | `scripts/seeding/tests/test_main.py` (16 tests; 215 total) |
| TASK-019 | completed | `scripts/seeding/fixtures/agent_specs.json`, `subagents.json`, `projects.json`, `fixtures/documents/specs/*.md` (7 files), `tests/test_fixtures.py` | 4 tests |
| TASK-020 | completed | `scripts/seeding/fixtures/contacts.json`, `api_keys.json`, `admin_audit_log.json`, `tests/test_fixtures.py` | 4 tests (231 total) |
| TASK-021 | completed | `scripts/seeding/fixtures/cv_experience.json`, `cv_skills.json`, `cv_education.json`, `tests/test_fixtures.py` | whole-corpus capstone tests (255 total) |
| TASK-022 | completed (build unverified) | `scripts/seeding/Dockerfile`, `scripts/seeding/.dockerignore` | _(none)_ — suite run on host as the tests stage would; `docker build` not executed |
| TASK-023 | completed (target unverified) | `scripts/seeding/Makefile`, `scripts/seeding/README.md` | _(none)_ — `make -n seed` verified; `make seed` not executed |
| TASK-024 | completed | `README.md`, `Makefile` | _(none)_ |
| TASK-CODE-REVIEW-REMEDIATION | completed | `alembic/migrations/env.py`, `alembic/migrations/versions/0001_initial_base_schema.py`, `alembic/README.md`, `docs/db_schema.md`, `scripts/seeding/src/config.py`, `scripts/seeding/src/persistence.py`, `scripts/seeding/tests/test_config.py`, `scripts/seeding/tests/test_main.py`, `scripts/seeding/tests/test_persistence.py`, `.gitignore` | 1 test (256 total). **Fixed the critical `version_table_schema` defect** and the unreachable `DROP SCHEMA`; also resolved TASK-RISK-REMEDIATION (RISK-001) |
| TASK-QC-REMEDIATION | completed | `alembic/migrations/versions/0001_initial_base_schema.py`, `alembic/src/config.py`, `alembic/src/main.py`, `scripts/seeding/src/config.py`, `scripts/seeding/src/main.py`, `scripts/seeding/tests/test_config.py`, `scripts/seeding/tests/test_main.py` | 10 tests (266 total). Enum `COMMENT ON TYPE`, structlog JSON config, `LOG_LEVEL`/`LOG_FILE` |
| TASK-SEC-REMEDIATION | completed | `scripts/seeding/src/main.py`, `scripts/seeding/tests/test_main.py`, `scripts/seeding/Makefile`, `scripts/seeding/README.md`, `scripts/seeding/Dockerfile`, `alembic/src/main.py`, `alembic/Makefile`, `alembic/README.md`, `alembic/Dockerfile`, `.secrets.baseline` | 5 tests (271 total). `--yes` destructive opt-in, encoded-password redaction, baseline regenerated (118 additions, 0 drops); SEC-004 digest pinning deferred — no runtime to resolve a digest |
| TASK-RISK-REMEDIATION | resolved by code-review remediation | _(no separate changes)_ | RISK-001 closed |
| TASK-CODE-REVIEW-REMEDIATION (iter 2) | completed | `alembic/migrations/versions/0001_initial_base_schema.py`, `docs/db_schema.md` | Docstring/doc corrections; renders byte-identical (md5 verified) |
| TASK-QC-REMEDIATION (iter 2) | completed | `alembic/Dockerfile`, `alembic/alembic.ini`, `alembic/src/config.py`, `scripts/seeding/Dockerfile`, `scripts/seeding/src/config.py`, `scripts/seeding/src/main.py`, `scripts/seeding/tests/test_config.py`, `scripts/seeding/tests/test_main.py` | Log dir ownership, `ConsoleHandler` for `LOG_LEVEL`, `[PY-024]` global `CONFIG` (273 total) |
| TASK-SEC-REMEDIATION (iter 2) | completed | `alembic/src/main.py` | 4th DSN password rendering `quote(safe=" +")`; 13 doctests |

## Review Outcome (loop closed at the 2-iteration cap)

| Reviewer | Iteration 2 result |
| --- | --- |
| validation-runner | **PASS** — 273 tests, 13 doctests, black/flake8 clean both components, both offline render gates exit 0, pre-commit hooks pass |
| security-reviewer | **PASS** — 0 findings |
| risk-reviewer | **PASS** — all 22 risks mitigated, 0 deviations |
| quality-controller | 2 SHOULD-level findings outstanding (reviewer recommends accepting) |
| code-reviewer | 2 findings outstanding (1 medium, 1 low) |

### Post-loop user decision (2026-08-13)

Findings 1 and 2 were resolved after the loop closed:

- **Finding 1** — the user chose **removal** over `.DEFAULT_GOAL`. BOTH root delegation targets (`run-migrations` and `seed`) were removed; removing only `run-migrations` would have left `seed` as the default goal, which truncates and reseeds — the same hazard with a different verb. `Makefile` is now byte-identical to HEAD and `make -n` expands to the `detect-secrets` recipe. REQ-1.5 and REQ-2.7 remain satisfied by the component Makefiles (`make -C alembic run-migrations`, `make -C scripts/seeding seed`), matching the README's documented convention. `README.md` was corrected accordingly.
- **Finding 2** — fixed in `scripts/seeding/src/main.py` via an `injected_environment` context manager wrapping the deferred `src.config` import, keeping the import function-local (so the iteration-1 credential leak is not reintroduced) and `CONFIG` module-global (so `[PY-024]` stays satisfied). Suite now 274.

Findings 3 and 4 (the two SHOULD-level `alembic.ini` logging nits) are **accepted as outstanding**, per the quality-controller's own recommendation.

### Outstanding findings at loop close

1. **MEDIUM — `Makefile:4`** (code-review). TASK-024 prepended the delegation targets above `scan-secrets`, changing GNU make's default goal. A bare `make` now expands to `make -C alembic run-migrations` instead of the read-only secret scan; with `POSTGRES_*`/`ALEMBIC_COMMAND` exported it mutates the ambient database. Fix: `.DEFAULT_GOAL := scan-secrets`, or move the delegation targets below `scan-secrets`.
2. **LOW — `scripts/seeding/src/main.py:238`** (code-review). `src.config` builds module-level `CONFIG` from `os.environ` at import, so `main(environ=...)` cannot override an incomplete process environment. Container path and credential handling unaffected; the tests miss it because their fixture sets a valid `os.environ` before import.
3. **SHOULD — `alembic/alembic.ini:60`** (QC, `[LOG-005]`). The only handler writes to stderr, so alembic's own `Running upgrade` records never reach `LOG_FILE`.
4. **SHOULD — `alembic/alembic.ini:66`** (QC, `[LOG-002]`). `[formatter_generic]` is plain text with no timestamp, so one run emits two log formats on two streams.

## Changeset

Deduplicated union of all files modified across tasks, with the tasks that touched each.

### Migration component — `alembic/` (all new)

- `alembic/alembic.ini` — TASK-002
- `alembic/migrations/env.py` — TASK-002
- `alembic/migrations/script.py.mako` — TASK-002
- `alembic/migrations/versions/0001_initial_base_schema.py` — TASK-003, TASK-003 (amendment)
- `alembic/src/config.py` — TASK-001
- `alembic/src/main.py` — TASK-004
- `alembic/requirements.txt` — TASK-001
- `alembic/Dockerfile` — TASK-005
- `alembic/.dockerignore` — TASK-005
- `alembic/Makefile` — TASK-006
- `alembic/README.md` — TASK-006

### Seeding component — `scripts/seeding/` (all new)

- `scripts/seeding/src/config.py` — TASK-013
- `scripts/seeding/src/models.py` — TASK-011, TASK-012, amendment
- `scripts/seeding/src/fixtures.py` — TASK-014
- `scripts/seeding/src/persistence.py` — TASK-015, TASK-016, amendment
- `scripts/seeding/src/main.py` — TASK-017
- `scripts/seeding/tests/conftest.py` — TASK-010
- `scripts/seeding/tests/test_config.py` — TASK-013
- `scripts/seeding/tests/test_models.py` — TASK-011, TASK-012, amendment
- `scripts/seeding/tests/test_fixtures.py` — TASK-014, TASK-018, TASK-019, TASK-020, TASK-021, amendment
- `scripts/seeding/tests/test_persistence.py` — TASK-015, TASK-016, amendment
- `scripts/seeding/tests/test_main.py` — TASK-017
- `scripts/seeding/requirements.txt` — TASK-010
- `scripts/seeding/Dockerfile` — TASK-022
- `scripts/seeding/.dockerignore` — TASK-022
- `scripts/seeding/Makefile` — TASK-023
- `scripts/seeding/README.md` — TASK-009, amendment, TASK-023

### Fixtures — `scripts/seeding/fixtures/` (all new)

- `blog.json` — TASK-018
- `agent_specs.json`, `subagents.json`, `projects.json` — TASK-019
- `contacts.json`, `api_keys.json`, `admin_audit_log.json` — TASK-020
- `cv_experience.json`, `cv_skills.json`, `cv_education.json` — TASK-021
- `documents/blog/*.md` (5 sidecars) — TASK-018
- `documents/specs/*.md` (7 sidecars) — TASK-019

### Documentation

- `docs/db_schema.md` — TASK-007, TASK-008 (new)
- `README.md` — TASK-024 (modified)
- `Makefile` — TASK-024 (modified)

## Reviewer Attention

Raised during execution, for the review stage:

- **Files added to the changeset by remediation**: `.gitignore` (Python entries) and `.secrets.baseline` (regenerated and audited).
- ~~**`.gitignore` has no Python entries.**~~ RESOLVED by code-review remediation.
- _(original note)_ **`.gitignore` has no Python entries.** 13 `__pycache__/*.pyc` artifacts under `alembic/` and `scripts/seeding/` are currently untracked and would be committed. `.gitignore` was not in the approved plan scope, so no task edited it. Suggested fix: add `__pycache__/` and `*.pyc`.
- **No container runtime** exists in this environment (docker/podman/nerdctl/buildx/img all absent, no daemon socket). Both Dockerfiles, both component Makefile targets and the root delegation targets are authored and inspected but never executed — verified by `make -n` expansion and by running the underlying entrypoints directly on the host. User-approved on 2026-08-13.
- **TASK-003 / AC-2**: `downgrade` ends with a guarded `DROP SCHEMA base RESTRICT` that skips while alembic's `base.alembic_version` table still exists. Since the version table lives in the `base` schema, a real `alembic downgrade base` may leave the `base` schema in place. AC-2 asserts the downgrade "leaves no table, schema, enum type, or sequence created by the upgrade" — and AC-2 is unverifiable in this changeset (no database). Code review should assess this deliberately.

## Out-of-Scope Changes Observed (not made by this work plan)

Recorded for transparency; **no task in WP-001 has modified or will modify these files**. `docs/specs/**` is read-only for this changeset.

- `docs/specs/SPEC-004.md` — modified by an external source during this session (+11/-5 as of the final check). Not made by any WP-001 task; left untouched throughout.
- `docs/specs/SPEC-005.md` — a 0-byte file appeared at 19:56:55 (before wave 1 was launched) and was subsequently removed by the same external source. Not made by any WP-001 task.

Both files continued changing while WP-001 executed, consistent with a concurrent spec-authoring session in this workspace. `git diff --stat acceptance` was empty throughout: no feature file was ever modified.

## Execution Schedule

24 task files, scheduled into waves by dependency and disjoint Target Files (Parallel Execution Guard).

| Wave | Tasks | Rationale |
| --- | --- | --- |
| 1 | TASK-001, TASK-010 | No dependencies; disjoint write sets (`alembic/` vs `scripts/seeding/`) |
| 2 | TASK-002, TASK-013 | Both unblocked by wave 1; disjoint |
| 3 | TASK-003 | Sole successor of TASK-002; the critical revision (RISK-001, RISK-002) |
| 4 | TASK-004, TASK-007, TASK-009 | All unblocked by TASK-003; disjoint (`alembic/src/main.py`, `docs/db_schema.md`, `scripts/seeding/README.md`) |
| 5 | TASK-005, TASK-008, TASK-011 | Disjoint (`alembic/Dockerfile`, `docs/db_schema.md`, `seeding/src/models.py`) |
| 6 | TASK-006, TASK-012 | Disjoint (`alembic/Makefile`+README, `seeding/src/models.py`) |
| 7 | TASK-014, TASK-015 | Disjoint (`fixtures.py`+`test_fixtures.py`, `persistence.py`+`test_persistence.py`) |
| 8 | TASK-016, TASK-018 | Disjoint (`persistence.py`, `fixtures/`+`test_fixtures.py`) |
| 9 | TASK-017, TASK-019 | Disjoint (`src/main.py`+`test_main.py`, `fixtures/`+`test_fixtures.py`) |
| 10 | TASK-020 | Serial: shares `fixtures/` and `test_fixtures.py` with TASK-019/021 |
| 11 | TASK-021 | Serial: same write set as TASK-020 |
| 12 | TASK-022 | Depends on TASK-017, TASK-021 |
| 13 | TASK-023 | Depends on TASK-006, TASK-022 |
| 14 | TASK-024 | Depends on TASK-006, TASK-023 |
