# Task: Alembic component configuration model and dependencies

Work Plan ID: WP-001
Task ID: TASK-001
Created Date: 2026-08-13
Description: Create `alembic/src/config.py` (a `pydantic_settings` `Config` implementing the full `POSTGRES_*` / `ALEMBIC_*` environment contract, validated at startup) and `alembic/requirements.txt`.
Acceptance Criteria Covered: AC-1, AC-4

## Implementation Content

The alembic component is a brand-new root-level directory (`alembic/`, per SPEC-001 §6.2 and
binding decision F-5 in `docs/specs/SPEC-001-REVIEW.md` §6a). This task delivers its
configuration surface only — the settings model every other alembic file imports, plus the
pinned dependency list.

**Environment variable contract (fixed by the work plan's Reference Contracts — implement
verbatim, do not invent names or defaults):**

| Variable | Required | Default | Type notes |
| --- | --- | --- | --- |
| `POSTGRES_HOST` | yes | — | str |
| `POSTGRES_PORT` | no | `5432` | int |
| `POSTGRES_USER` | yes | — | str |
| `POSTGRES_PASSWORD` | yes | — | **`SecretStr`** |
| `POSTGRES_DB` | yes | — | str |
| `ALEMBIC_REVISION` | yes (no default; validation error if unset) | — | str |
| `ALEMBIC_COMMAND` | yes (no default; validation error if unset) | — | **`Literal["upgrade", "downgrade"]`** |

Requirements:

- A single `pydantic_settings.BaseSettings` subclass reading these variables; missing required
  variables must fail at config validation with an error naming the missing variable, before
  any work is attempted.
- `ALEMBIC_COMMAND` is constrained by a `Literal` type, not a hand-written branch (RISK-010b),
  so an invalid value is rejected by validation.
- `POSTGRES_PASSWORD` is `SecretStr` (RISK-015). Provide a helper that builds the SQLAlchemy
  connection URL from the settings; it must be the only place the password is unwrapped, and
  nothing in the module may log or `repr` the settings object or the URL.
- Expose a module-level accessor/instance the rest of the component imports (matching the
  seeding component's pattern so the two configs stay symmetric).
- `alembic/requirements.txt` pins: `alembic`, `sqlalchemy`, `psycopg` (v3), `pydantic`,
  `pydantic-settings`, `structlog`. No test dependencies — the alembic component ships without
  unit tests (binding decision 5). All pins must resolve on **Python 3.14**; if a pin has no
  3.14 wheel, surface the conflict rather than lowering the interpreter (RISK-011).

## Target Files

- [x] alembic/src/config.py
- [x] alembic/requirements.txt

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Reference Contracts" → environment
  variable contract table; "Failure Modes")
- /home/agent/workspace/docs/specs/SPEC-001-REVIEW.md (§6a and §6b — binding user decisions;
  §6b "Orchestrator decisions" F-7/F-8)
- /home/agent/workspace/docs/specs/SPEC-001.md (REQ-1.4 — `ALEMBIC_REVISION` / `ALEMBIC_COMMAND`
  must both be set or the wrapper raises)
- Coding standards via the `coding-standards` skill: `python/GENERAL.md` (config and logging
  statements, plus the config and logging examples)

## Investigation Notes

- WP-001 "Reference Contracts" (§ Environment variable contract, lines 376-388) matches the
  table in this task verbatim: `POSTGRES_HOST/USER/PASSWORD/DB` required, `POSTGRES_PORT`
  defaults to `5432`, `ALEMBIC_REVISION` and `ALEMBIC_COMMAND` required with no defaults and
  `ALEMBIC_COMMAND` restricted to `upgrade`|`downgrade`. No extra variables exist in the
  contract, so the model transcribes exactly seven fields.
- WP-001 "Failure Modes" requires: unset `ALEMBIC_*` → explicit error naming the variable;
  `ALEMBIC_COMMAND` outside the set → explicit error; any required `POSTGRES_*` unset →
  config validation failure at startup, before any work is attempted. All three are satisfied
  by `pydantic_settings` validation at import time (`CONFIG = Config()` module-level instance),
  whose `ValidationError` message lists the offending field name.
- SPEC-001 REQ-1.4: both `ALEMBIC_REVISION` and `ALEMBIC_COMMAND` must be set; the wrapper
  raises if either is missing. This task supplies the config that raises; `src/main.py`
  (TASK-003) consumes it.
- SPEC-001-REVIEW §6a F-5: root-level `alembic/` directory is the binding layout, so the new
  files are `alembic/src/config.py` and `alembic/requirements.txt` (no `infrastructure/`
  prefix). §6b: the alembic component ships without unit tests; Python 3.14 slim base is
  pinned for both images (drives the "pins must resolve on 3.14" requirement). §6b
  Orchestrator decision F-7 fixes the full `POSTGRES_*` set; F-8 applies to the seeder only
  (argparse defaults) and imposes nothing here beyond keeping the two configs symmetric.
- Coding standards `python/GENERAL.md` §4 Configuration: `[PY-020]`-`[PY-024]` — env-var
  configuration, validated at startup, in a dedicated `config.py`, via a `pydantic_settings`
  `BaseSettings` subclass named `Config`, with a global instance exposed to the application.
  `examples/GENERAL/config.md` shows the reference shape: `Annotated[...]` fields combining
  `StringConstraints(min_length=1)` with `Field(...)`, `SecretStr` for the password, and a
  module-level `CONFIG = Config()`. `[PY-019]` motivates the `min_length=1` constraints;
  `[PY-006]`/`[PY-007]`/`[PY-008]` require Google-style docstrings and full type hints on the
  URL helper. `[PY-045]` fixes `psycopg` (v3) as the PostgreSQL driver, matching the pin list.
- Repo `.flake8`: `max-line-length = 88`, `extend-ignore = E203, W503` (black-compatible).
- No `alembic/` or `scripts/seeding/` directory exists yet; this task creates the first files
  under `alembic/`.

## Task Dependencies

(None.)

## Implementation Steps (TDD: Red-Green-Refactor)

The alembic component ships **without unit tests** by binding decision 5 — do not add a test
suite under `alembic/`. The Red phase below is the equivalent static/manual check.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Verify/create contract definitions: transcribe the environment contract table above into
      the settings model field-by-field
- [x] Red check: with the module written but before it is wired up, run
      `python -c "from alembic.src.config import ..."` (or the equivalent import from within
      `alembic/`) with **no** environment variables set and confirm a validation error that
      names the missing variable; then with `ALEMBIC_COMMAND=bogus` and confirm the `Literal`
      rejects it

### 2. Green Phase

- [x] Add minimal implementation so that, with all seven variables set to valid values, the
      settings object constructs and the connection-URL helper returns a well-formed URL
- [x] Re-run the checks above and record the exact error messages

Recorded results (run from `alembic/` as `python -c "import src.config"` with a clean
environment via `env -i`):

- No variables set → `pydantic_core._pydantic_core.ValidationError: 6 validation errors for
  Config`, one `Field required [type=missing, ...]` entry per variable, naming
  `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `ALEMBIC_REVISION`
  and `ALEMBIC_COMMAND` (`POSTGRES_PORT` correctly absent — it defaults).
- Only `ALEMBIC_REVISION` omitted → `1 validation error for Config` / `ALEMBIC_REVISION` /
  `Field required [type=missing, ...]`.
- `ALEMBIC_COMMAND=bogus` → `1 validation error for Config` / `ALEMBIC_COMMAND` /
  `Input should be 'upgrade' or 'downgrade' [type=literal_error, input_value='bogus', ...]`.
- `POSTGRES_PASSWORD=""` → `POSTGRES_PASSWORD` / `Value should have at least 1 item after
  validation, not 0 [type=too_short, ...]`.
- All six required variables set → constructs successfully; `CONFIG.POSTGRES_PORT` is `5432`,
  `repr(CONFIG.POSTGRES_PASSWORD)` renders `**********`, and `postgres_connection_url()`
  returns `postgresql+psycopg://u%40x:p%40ss%2Fword@db:5432/d` for user `u@x` / password
  `p@ss/word` (credentials correctly percent-encoded by `sqlalchemy.engine.URL`).

### 3. Refactor Phase

- [x] Improve code (keep the checks passing); run `black` and `flake8` (repo `.flake8`,
      max-line-length 88) over the new file

`black --check` reports "1 file would be left unchanged"; `flake8` reports no findings.

## Completion Criteria

- [x] Constructing the config with `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
      `POSTGRES_DB`, `ALEMBIC_REVISION`, `ALEMBIC_COMMAND` set succeeds; `POSTGRES_PORT`
      defaults to `5432` when unset
- [x] Omitting any of `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
      `ALEMBIC_REVISION`, `ALEMBIC_COMMAND` raises a validation error whose message names the
      missing variable
- [x] `ALEMBIC_COMMAND` outside `{upgrade, downgrade}` is rejected by the `Literal` type
- [x] `POSTGRES_PASSWORD` is typed `SecretStr`; no log call, `print`, or f-string in the module
      renders the password or the whole settings object
- [x] `black` and `flake8` clean

Pinned versions in `alembic/requirements.txt` (`alembic==1.19.1`, `sqlalchemy==2.0.52`,
`psycopg[binary]==3.3.4`, `pydantic==2.13.4`, `pydantic-settings==2.15.0`,
`structlog==26.1.0`) were each confirmed to have a Python 3.14 wheel via
`pip download --only-binary=:all: --python-version 3.14 --abi cp314`, including the compiled
transitive distributions `pydantic-core==2.46.4` and `psycopg-binary==3.3.4` (RISK-011). The
`[binary]` extra on `psycopg` is still psycopg v3 and avoids requiring `libpq` build tooling
in the slim runtime image.

## Notes

- Impact scope: every other file under `alembic/` imports this config (`env.py`, `src/main.py`);
  the same contract is re-implemented independently in `scripts/seeding/src/config.py`
  (TASK-013) and must not diverge (RISK-015).
- Risk countermeasures carried by this task: **RISK-010** (`Literal` for `ALEMBIC_COMMAND`;
  fail-fast naming the missing variable — this component has no automated coverage, so code
  review is the primary gate), **RISK-015** (identical contract in both components; `SecretStr`
  password; never log the settings object), **RISK-011** (Python 3.14-compatible pins only).
- Scope boundary: do not touch `docs/specs/**`, `acceptance/**`, `.flake8`,
  `.pre-commit-config.yaml`, or the root `Makefile`. Do not add a CI workflow or a
  docker-compose file — the verification gap is reported, not closed (RISK-018).
