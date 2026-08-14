# Task: Code Review Remediation (iteration 2)

Work Plan ID: WP-001
Task ID: TASK-CODE-REVIEW-REMEDIATION
Created Date: 2026-08-13
Description: Restore the root `Makefile`'s default goal and make the seeding CLI's `environ` injection seam honour the supplied environment.
Acceptance Criteria Covered: AC-5, AC-9 (operational entrypoints only; both remain unverified without a container runtime)

## Implementation Content

Two verified findings from the final code review pass. Neither is a regression of an
iteration-1 finding: both iteration-1 findings (the `create_schema` docstring and
`docs/db_schema.md` §2/§3) are correctly remediated, and the QC and security remediations
were re-verified as non-regressing.

### Finding 1 (medium, correctness) — the root `Makefile` default goal is now `run-migrations`

- File: `/home/agent/workspace/Makefile`, lines 3-5 (first target in the file).
- Before TASK-024, the first target in the root `Makefile` was `scan-secrets`, which is
  therefore what a bare `make` at the repository root ran. TASK-024 prepended the two
  delegation targets, so GNU make's default goal - the first target in the file - is now
  `run-migrations`.
- Failure scenario: a developer runs `make` with no argument at the repository root with
  `POSTGRES_*` exported in the shell (the documented seeding/migration workflow exports
  them). `make -n` at the repository root confirms it expands to
  `make -C alembic run-migrations`, which builds the migrations image and runs
  `alembic <ALEMBIC_COMMAND> <ALEMBIC_REVISION>` against whatever database the ambient
  environment points at - including `downgrade`, if `ALEMBIC_COMMAND` is set to it. The
  previous default was a read-only secret scan. Neither SPEC-001 REQ-1.5/REQ-2.7 nor the
  §6b "Makefiles" decision asks for the default goal to change.
- Required fix: keep the default goal what it was. Either add an explicit
  `.DEFAULT_GOAL := scan-secrets` above the delegation targets, or move the two
  delegation targets below the existing `scan-secrets` target. An explicit
  `.DEFAULT_GOAL` is preferred: it stops the default from silently following target
  order again.

### Finding 2 (low, design) — `src.main.main(environ=...)` cannot override an incomplete process environment

- File: `/home/agent/workspace/scripts/seeding/src/main.py`, lines 216-240
  (`load_config`), reached from line 502.
- `load_config` imports `src.config` inside the function - correct, and required to keep
  `main`'s error handler reachable - but `src.config` builds its module-level `CONFIG`
  from `os.environ` at import time, *before* `src.config.load_config(environ)` is called.
  The supplied `environ` therefore only takes effect if the process environment already
  validates.
- Failure scenario, reproduced: in a process with `POSTGRES_HOST`/`POSTGRES_USER`/
  `POSTGRES_PASSWORD`/`POSTGRES_DB` unset, `main(["--yes"], connection_factory=...,
  environ={"POSTGRES_HOST": "h", "POSTGRES_USER": "u", "POSTGRES_PASSWORD": "p",
  "POSTGRES_DB": "d"})` returns `1` and logs
  `{"variables": ["POSTGRES_DB", "POSTGRES_HOST", "POSTGRES_PASSWORD", "POSTGRES_USER"], ...}`
  although the caller supplied a complete environment. The existing tests never see this
  because their `seeding` fixture places a valid environment in `os.environ` before
  importing the module.
- Impact is confined to the injection seam: the container path (process environment is
  the source) is unaffected, and no credential is leaked.
- Required fix: make the module-level `CONFIG` lazy in `scripts/seeding/src/config.py` -
  e.g. keep `load_config(environ)` as the only construction point and build the process
  environment instance on first call rather than at import - or document the seam's
  actual contract on `main`/`load_config` (the supplied `environ` overrides the argparse
  defaults only, and the process environment must independently validate). Whichever is
  chosen, add a test that calls `main(environ=<valid>)` with the `POSTGRES_*` variables
  removed from `os.environ`. Do not hoist the `src.config` import to module scope under
  any circumstances: that reintroduces the iteration-1 credential leak.

## Target Files

- [x] `/home/agent/workspace/Makefile`
- [x] `/home/agent/workspace/scripts/seeding/src/config.py`
- [x] `/home/agent/workspace/scripts/seeding/src/main.py`
- [x] `/home/agent/workspace/scripts/seeding/tests/test_main.py`

## Investigation Targets

- `/home/agent/workspace/Makefile` (target order; GNU make default-goal rule)
- `/home/agent/workspace/scripts/seeding/src/config.py` (`CONFIG`, `load_config`)
- `/home/agent/workspace/scripts/seeding/src/main.py` (`load_config`, `main`)
- `/home/agent/workspace/scripts/seeding/tests/test_main.py`
  (`test_main_imports_without_the_settings_environment`, `run_cli_process`)

## Investigation Notes

### Finding 1 - user-decided resolution (supersedes the suggested `.DEFAULT_GOAL` fix)

**Decision (user, 2026-08-13):** *remove* the two delegation targets from the root
`Makefile` entirely rather than adding `.DEFAULT_GOAL := scan-secrets`. Both targets had to
go: removing only `run-migrations` would have made `seed` - which truncates and reseeds a
database - the new first target and therefore the new default goal, i.e. the same hazard
with a different verb.

- The root `Makefile` is now byte-identical to `HEAD`: `git diff Makefile` is empty, the
  pre-existing `scan-secrets` / `claude` targets and the three `claude_*` version variables
  are untouched, and `scan-secrets` is once again the first target and the default goal.
  `make -n` at the repository root expands to the `detect-secrets scan` / `detect-secrets
  audit` recipe.
- Spec compliance is unaffected: REQ-1.5 (`run-migrations`) and REQ-2.7 (`seed`) are
  satisfied by the component Makefiles, invoked as `make -C alembic run-migrations` and
  `make -C scripts/seeding seed`. Both still expand correctly, with the mandated
  `--platform linux/amd64 --provenance=false` build flags and the `-e` variable
  pass-through. This is also the `make -C <COMPONENT> <target>` convention the repository
  README documents for the pre-commit hooks.
- Documentation written by TASK-024 about the removed targets was corrected in
  `README.md`: the "Makefiles" section now states that each component's targets are invoked
  through its own Makefile via `make -C <COMPONENT> <target>`, and the two component
  sections name `make -C alembic run-migrations` / `make -C scripts/seeding seed`. The rest
  of the TASK-024 README work (directory tree, TOC links, component sections) is unchanged.
  `alembic/README.md` and `scripts/seeding/README.md` already used the `make -C` form and
  made no claim about running the targets from the repository root, so neither needed a
  change.

### Finding 2 - where the fix had to go

- `scripts/seeding/src/config.py` keeps `CONFIG = Config()` at module scope: `[PY-024]`
  **MUST** requires the global instance, and `[PY-021]` requires start-up validation.
  Making `CONFIG` lazy would additionally have broken
  `tests/test_config.py::test_config_module_import_reports_a_missing_variable` and
  `::test_config_module_builds_the_settings_at_import_time`, and `tests/test_config.py` is
  not in this task's Target Files.
- The actual defect is that `src.main.load_config` performed its deferred
  `from src.config import ...` under the *process* environment; that import validates the
  whole contract, so a complete `environ` supplied by a caller was rejected whenever the
  process environment was incomplete. The fix therefore lives in
  `scripts/seeding/src/main.py`: a new `injected_environment` context manager installs the
  supplied mapping for the duration of the deferred import and the `load_settings(environ)`
  call, and always restores the previous environment. The import stays inside the function,
  so the iteration-1 credential leak is not reintroduced.
- Sibling seam swept: `alembic/src/main.py::load_config` takes no `environ` argument at all
  (it returns `src.config.CONFIG`), so it has no injection seam and cannot exhibit this
  defect. No change made there.

### Verification

- `make -n` (repository root) -> `detect-secrets scan ... / detect-secrets audit`;
  `git diff Makefile` empty.
- `make -C alembic -n run-migrations` and `make -C scripts/seeding -n seed` expand as before.
- `python3 -m pytest` in `scripts/seeding`: 274 passed (273 baseline + 1 new test).
- `python3 -m black --check src tests` and `python3 -m flake8 src tests`: clean.

## Change Category

`Change Category: bug-fix, boundary-change`

## Remediation Context

- Source: code-reviewer
- Finding / failing command: `make -n` at the repository root expands to
  `make -C alembic run-migrations`; `main(environ=<complete>)` with an incomplete process
  environment returns `1`.
- Evidence: `make -n` output `make -C alembic run-migrations` / `docker build ...`;
  `git show HEAD:Makefile` shows `scan-secrets` as the previous first target. Seeding:
  `env -u POSTGRES_HOST -u POSTGRES_USER -u POSTGRES_PASSWORD -u POSTGRES_DB` +
  `main(environ=<complete>)` logs `"invalid seeding configuration"` and returns `1`.
- Verification: `make -n` at the repository root expands to the `detect-secrets` recipe;
  `python3 -m pytest` in `scripts/seeding` passes with the new test.

## Implementation Steps

Finding 1 has no testable behaviour change in the Python suite: reproduce with `make -n`,
apply the fix, re-run `make -n`. Finding 2 follows the TDD cycle below.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Sweep the sibling seam in `alembic/src/main.py` (`load_config`) for the same class
      of defect before changing anything
- [x] Write the failing test: `main(environ=<complete>)` with the `POSTGRES_*` variables
      deleted from `os.environ` and `src.config` evicted from `sys.modules`
- [x] Run tests and confirm failure

### 2. Green Phase

- [x] Apply the minimal fix (in `scripts/seeding/src/main.py` - see Investigation Notes)
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Update the module docstrings of `src/config.py` and `src/main.py` so they describe
      the injected-environment construction accurately
- [x] Confirm the whole suite still passes

## Completion Criteria

- [x] `make -n` at the repository root expands to the `detect-secrets` recipe, and
      the component targets are invoked as `make -C alembic run-migrations` /
      `make -C scripts/seeding seed` (user decision: the root delegation targets were
      removed)
- [x] `main(environ=<complete>)` succeeds in a process with no `POSTGRES_*` variables set
- [x] A missing `POSTGRES_*` variable still produces a non-zero exit with a single
      structured error line naming only the variable, no traceback and no password
      (`test_cli_reports_a_missing_variable_by_name_and_exits_non_zero` still passes)
- [x] All added tests pass

## Notes

- Impact scope: repository-root `make` invocations; the seeding CLI's configuration seam
  and its test suite.
- Scope boundary: `alembic/migrations/**`, `docs/db_schema.md` and both Dockerfiles must
  stay unchanged - all were re-verified as correct in this review pass. The `src.config`
  import in `scripts/seeding/src/main.py` must remain inside a function.
