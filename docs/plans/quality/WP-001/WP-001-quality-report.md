# Quality Report: Database Migration and Seeding Components

Work Plan ID: WP-001
Created Date: 2026-08-13
Review Iteration: 2 (final re-review after QC remediation round 2, code-review and security remediation)

## Coding Standards Review

Standards selected from `standards-tree.yaml` by the languages, tools and topics present in the
WP-001 changeset (`*.py`, Dockerfiles, Makefiles, PostgreSQL schema definition via alembic).

Applicable Standards:

- `GENERAL.md`
- `python/GENERAL.md`
- `python/DOCKER.md`
- `general/DOCKER.md`
- `general/LOGGING.md`
- `general/MAKEFILES.md`
- `databases/POSTGRES.md`

Not applied: `general/API.md` (no REST API surface in this changeset), `databases/DYNAMODB.md`,
`golang/*`, `javascript/*`, `terraform/*`, `testing/ACCEPTANCE.md` (no acceptance artefacts in the
changeset).

### Approved Deviations (not counted as violations)

- `[PG-005]` waived for `base.article.document_id`. User decision 2026-08-13, `docs/db_schema.md` §7.
- `[PG-014]` waived for the four JSONB columns (`base.subagent.inputs`/`outputs`,
  `base.admin_audit_log.payload`/`response`). Spec-mandated, `docs/db_schema.md` §7.
- `base.admin_audit_log.api_key_id` nullable, deviating from SPEC-001 §6.1.9. User decision
  2026-08-13, `docs/db_schema.md` §7.
- `[PY-025]`–`[PY-028]` not applied to the `alembic/` component (no unit tests, binding user
  decision). `[DOCKER-005]` / the tests stage of `[PY-DOCKER-001]` follow from the same decision for
  `alembic/Dockerfile`.
- `.pre-commit-config.yaml` and `.flake8` deliberately untouched; `[GEN-005]` not assessed.
- Neither image was built (no container runtime). Both Dockerfiles assessed by inspection only.

### Iteration 1 Violations — Verification

All four violations from iteration 1 were re-checked against the current file contents.

| Rule ID | File | Verdict |
| --- | --- | --- |
| LOG-005 | `alembic/Dockerfile` | **Fixed** — `RUN mkdir -p /app/logs && chown migrations:migrations /app/logs` at line 68 runs before `USER migrations` (line 70), so `open_log_file`'s `mkdir`/`open` for the default `LOG_FILE=/app/logs/migrations.log` succeeds as uid 1000. Only the log directory changes owner; `alembic.ini`, `migrations/` and `src/` stay root-owned. The false claim in `alembic/src/config.py` is gone — lines 25-29 now describe the image step accurately and state the stdout-only fallback outside the image. |
| LOG-005 | `scripts/seeding/Dockerfile` | **Fixed** — same shape at line 104 (`chown seeding:seeding /app/logs`) ahead of `USER seeding` (line 106); comment at `scripts/seeding/src/config.py:43-47` corrected identically. |
| LOG-006 | `alembic/alembic.ini` | **Fixed** — `[handler_console]` (line 60) now carries `class = src.config.ConsoleHandler` and deliberately no `level` key; `[logger_alembic]` (line 53) is `DEBUG` so the handler performs the filtering. Verified by executing `fileConfig('alembic.ini')` with `LOG_LEVEL=WARNING`: the installed handler reports level `WARNING`, an INFO record on `alembic.runtime.migration` is dropped and a WARNING record is emitted. With `LOG_LEVEL` unset the handler falls back to `INFO`. |
| PY-024 | `scripts/seeding/src/config.py` | **Fixed** — module-level `CONFIG = Config()` at line 79, so the settings are validated at import. The fail-fast is reconciled with the CLI's error reporting by `src/main.py:238` importing the settings module inside `load_config()`, which keeps the `ValidationError` catchable at `src/main.py:503`. Verified: the full suite (273 tests) passes with every `POSTGRES_*` variable unset, and the subprocess acceptance test still asserts non-zero exit, no traceback, no password, and only `POSTGRES_HOST` named. |

### Assessment of the new `ConsoleHandler` (`alembic/src/config.py:68-96`)

Assessed on its merits, as requested. The approach is sound and no violation is raised against it:

- The constraint is real. `migrations/env.py` hands `alembic.ini` to `logging.config.fileConfig`,
  which reads `level` keys literally and cannot interpolate the environment; the `class` key is the
  one hook in that file format that resolves to code. With `migrations/env.py` outside the
  remediating agent's write set, this is the minimal mechanism that satisfies `[LOG-006]`.
- Import ordering is safe. `migrations/env.py` puts the component root on `sys.path` (lines 28-30)
  and imports `src.config` (line 32) before calling `fileConfig` (line 37), so the dotted class path
  resolves. Executed and confirmed above.
- `[GEN-001]`/`[GEN-002]`: 15 lines and one class; the alternative (an entrypoint that rewrites
  `alembic.ini`, or a second settings source) is strictly more complex.
- `[PY-006]`/`[PY-007]`/`[PY-008]`: Google-style docstring naming the function first, full type
  hints on `stream` and the return. `black` and `flake8` are clean across both components.
- `[PY-038]` is not violated: the component's *own* logging is `structlog` (`src/main.py`). This
  class governs the stdlib records emitted by the alembic library itself, which structlog does not
  produce.

### Regression Check on the Other Landed Remediations

- `alembic/src/main.py` — the fourth password rendering (`quote(secret, safe=" +")`,
  `secret_renderings` line 241) is documented in the function docstring and exercised by the
  doctest examples at lines 274-298. Google-style docstrings, type hints and single-purpose
  functions are intact; `[PY-006]`–`[PY-008]` still hold.
- `docs/db_schema.md` §2/§3 and the revision docstrings — documentation-only, no standards surface
  touched. §7 still records all three approved deviations.
- Tooling gates: `black --check` reports 15 files unchanged; `flake8` exits 0 over `alembic/` and
  `scripts/seeding/` (`[PY-003]`, `[PY-004]`).

### Coding Standards Violations

Total Violations: 2

Both are **SHOULD**-level and both anchor to the same handler section of `alembic/alembic.ini`.
Neither was introduced by the iteration-1 remediation; both are residual properties of the alembic
component's stdlib logging path. They are recorded as outstanding, non-blocking findings — see
"Severity and Recommendation" below.

| Standards File | Rule ID | File Path | Line | Description |
| --- | --- | --- | --- | --- |
| `general/LOGGING.md` | LOG-005 | `alembic/alembic.ini` | 60 | `[handler_console]` is the only handler configured, and it writes to `sys.stderr` (line 62). The alembic library's own progress records — `Running upgrade <rev> -> <rev>`, emitted by `alembic.runtime.migration` at INFO — therefore never reach `LOG_FILE`. The `TeeStream` file sink in `alembic/src/main.py` only carries the wrapper's own four events (start, configuration loaded, completed/failed), so `/app/logs/migrations.log` records that a migration ran but not which revisions were applied — the part of a migration log most worth inspecting after the fact. Conformance: add a second handler that appends to `LOG_FILE`, using the same `class`-key mechanism as `ConsoleHandler` (a `logging.FileHandler` subclass reading `CONFIG.LOG_FILE`), and add it to the `keys` list of the `[handlers]` section and to `[logger_root]`'s `handlers`. |
| `general/LOGGING.md` | LOG-002 | `alembic/alembic.ini` | 66 | `[formatter_generic]` renders alembic's records as `%(levelname)-5.5s [%(name)s] %(message)s` — plain text, not the JSON that `[LOG-002]` sets as the default, and with no `timestamp` field, so the lines also fall short of the minimum field set in `[LOG-003]`. The wrapper's own events in the same run *are* JSON (`structlog` `JSONRenderer`, `alembic/src/main.py:167`), so a single migration run emits two different log formats on two different streams. Conformance: render these records as JSON with `message`/`timestamp`/`level`, e.g. by routing them through `structlog.stdlib.ProcessorFormatter` in place of `[formatter_generic]`. |

### Severity and Recommendation

Both findings are `SHOULD`-level deviations confined to the alembic component's third-party log
stream; no `MUST` rule is violated anywhere in the changeset, and every iteration-1 violation is
genuinely closed. Neither finding affects migration correctness, credential handling (the redaction
path is untouched by them) or the seeding component. The recommendation is to **accept them as
outstanding** rather than open a further remediation cycle: no `TASK-QC-REMEDIATION.md` is issued
for this iteration.
