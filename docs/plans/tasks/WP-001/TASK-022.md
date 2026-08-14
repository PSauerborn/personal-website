# Task: Seeding container image with tests stage (`scripts/seeding/Dockerfile`, `.dockerignore`)

Work Plan ID: WP-001
Task ID: TASK-022
Created Date: 2026-08-13
Description: Build the two-stage seeding image — a tests stage running the pytest suite during the build and a Python 3.14 slim runtime stage running the seeding CLI — plus its `.dockerignore`.
Acceptance Criteria Covered: AC-9

## Implementation Content

- `scripts/seeding/Dockerfile`, two stages:
  - **tests stage**: installs `scripts/seeding/requirements.txt`, copies `src/`, `tests/` and
    `fixtures/`, and runs `pytest` as a build step. The build **fails** if any test fails. This
    stage is the enforcement mechanism for the no-PostgreSQL-binary rule: the image must contain
    **no** PostgreSQL server package, so any test requiring a server would fail here (RISK-012).
  - **runtime stage**: **Python 3.14 slim** (Debian-based), pinned explicitly by tag; installs
    runtime dependencies only; copies `src/` and `fixtures/` (including `fixtures/documents/**`
    — the sidecar files must be present in the image or seeding cannot read document content);
    no `tests/`; runs as a non-root user; entrypoint/CMD invokes `scripts/seeding/src/main.py`.
- `scripts/seeding/.dockerignore`: exclude VCS, caches, `acceptance/`, docs and anything not
  required by the build context — but **do not** exclude `fixtures/`.

The image must actually be built during this task with the mandated flags (RISK-010c):

```
docker build --platform linux/amd64 --provenance=false -t <local-tag> scripts/seeding/
```

## Target Files

- [x] scripts/seeding/Dockerfile
- [x] scripts/seeding/.dockerignore

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/requirements.txt (TASK-010 — runtime vs test
  dependencies)
- /home/agent/workspace/scripts/seeding/src/main.py (TASK-017 — the entrypoint module and how it
  locates the fixtures directory)
- /home/agent/workspace/alembic/Dockerfile (TASK-005 — the sibling image; keep base tag and
  conventions consistent)
- /home/agent/workspace/docs/plans/2026-08-13-WP-001.md ("Reference Contracts" → Docker/build
  contract; "Verification Strategy" → the tests stage is the enforcement mechanism)
- Coding standards via the `coding-standards` skill: `general/DOCKER.md`, `python/DOCKER.md`
  plus `examples/DOCKER/two-stage-build.md`

## Investigation Notes

### Environment constraint: no container runtime (user decision, 2026-08-13)

`docker`, `podman`, `nerdctl`, `buildx` and `img` are all absent from `PATH` and there is no
daemon socket (`/var/run/docker.sock` does not exist). The mandated
`docker build --platform linux/amd64 --provenance=false -t <tag> scripts/seeding/` therefore
**could not be executed**. The image is **implemented but unverified by an actual build**; every
completion criterion that depends on running a build or a container is marked UNVERIFIED below
rather than ticked. Everything verifiable without a daemon was verified on the host (see
"Host verification" below).

### Observations from the investigation targets

- `requirements.txt` pins runtime (`pydantic`, `pydantic-settings`, `psycopg[binary]==3.3.4`,
  `structlog`) and test (`pytest`, `pytest-postgresql`) dependencies in **one** file under the
  `# Runtime` and `# Test` headings. `psycopg[binary]` carries libpq in the wheel, so neither
  `libpq-dev` nor any PostgreSQL package is installed by any stage (RISK-012).
- `src/config.py` ends with a module-level `CONFIG = load_config()`, so *importing* the package
  validates the environment. This import-time validation is what makes the container fail fast:
  `python -m src.main` with no `POSTGRES_*` set aborts during import with a pydantic
  `ValidationError` naming `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
  and exits 1. The test suite works around the same import-time validation via `importlib` inside
  fixtures that set a valid environment first, so the suite needs no real credentials.
- `src/main.py` uses absolute `src.*` imports and `src/fixtures.py` resolves
  `DEFAULT_FIXTURES_ROOT = Path(__file__).resolve().parent.parent / "fixtures"`. Consequences for
  the image: the component root (`/app`) must be on `sys.path`, so the entrypoint is
  `python -m src.main` (not `python src/main.py`, which would put `/app/src` on `sys.path` and
  break the `src.*` imports), and `fixtures/` must sit beside `src/` in `/app`.
- `alembic/Dockerfile` (sibling): `python:3.14-slim` for both stages, dependency virtualenv at
  `/opt/venv` built in a `builder` stage, non-root system user uid/gid 1000, `WORKDIR /app`. The
  seeding image keeps these conventions and adds the tests stage.
- Standards applied: `GENERAL.md`, `general/DOCKER.md` (DOCKER-002 multi-stage, DOCKER-003 exclude
  non-essential files, DOCKER-004 mandated build flags documented in the file header, DOCKER-005
  test stage, DOCKER-006 slim base), `python/DOCKER.md` (PY-DOCKER-001/002) and
  `python/examples/DOCKER/two-stage-build.md`.

### Design decisions

- **Three stages, `builder` -> `tests` -> `runtime`, all `python:3.14-slim`.** `builder` creates
  `/opt/venv` with the **runtime section only** of `requirements.txt` (split with
  `sed '/^# Test$/,$d'`), guarded by an import smoke check so a runtime pin that drifted below the
  `# Test` heading fails the build. `tests` extends `builder`, adds the test pins into the venv,
  copies `src/`, `fixtures/`, `tests/` and runs `python -m pytest`.
- **The tests stage cannot be pruned.** BuildKit only builds stages the final target references,
  so the runtime stage takes the application sources from the tests stage
  (`COPY --from=tests /app/src`, `COPY --from=tests /app/fixtures`) while the virtualenv comes
  from `builder`. A plain `docker build` of the default (last) stage therefore must run the suite,
  and a failing test fails the build (RISK-012 enforcement).
- **No `tests/` in the runtime stage**; the whole `fixtures/` tree including `fixtures/documents/`
  ships. `ENTRYPOINT ["python", "-m", "src.main"]` also lets `docker run <img> --dbname x` reach
  the CLI. Non-root system user `seeding` (uid/gid 1000).

### Host verification (performed; no daemon required)

1. **Full suite, as the tests stage runs it**: `python -m pytest` from the component root with an
   empty environment (`env -i`, no `POSTGRES_*`) - **255 passed**. Repeated against an emulated
   `/app` layout (`src/`, `fixtures/`, `tests/` only) - **255 passed**. No test requests a
   server-spawning `pytest-postgresql` fixture; no `postgres` binary is present on the host either.
2. **Failing test fails the stage**: appending `def test_deliberate_breakage(): assert False` to a
   *scratchpad copy* of `tests/test_config.py` produced `1 failed, 255 passed` and pytest exit
   code **1**, which is what would abort the `RUN python -m pytest` layer. The repository test
   files were never modified (verified: the repo suite is unchanged at 255 passed).
3. **Build context vs `.dockerignore`**: reproducing the context with the ignore patterns applied
   yields all 22 fixture files (10 domain JSON files plus 12 `fixtures/documents/**/*.md`
   sidecars), all 5 `src/` modules, all 6 `tests/` files and `requirements.txt`; only caches,
   `README.md`, `Makefile` and the container definitions are dropped. Nothing either stage needs
   is excluded. `.dockerignore` deliberately carries no blanket `*.md` rule, which would have
   stripped the document sidecars.
4. **Runtime layout**: from an emulated runtime `/app` containing only `src/` and `fixtures/`,
   `DEFAULT_FIXTURES_ROOT` resolves to `/app/fixtures` and `load_fixtures()` loads all 10 domain
   files - i.e. the runtime stage's file set is sufficient.
5. **No-env run (host emulation of the container process)**: `python -m src.main` with no
   `POSTGRES_*` set exits **1** with the import-time `ValidationError` naming `POSTGRES_HOST`,
   `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`.
6. **Requirements split**: `sed '/^# Test$/,$d' requirements.txt` yields exactly the four runtime
   pins; `pytest`/`pytest-postgresql` are excluded from the shipped virtualenv.
7. **Static read of the Dockerfile** against the mandated
   `docker build --platform linux/amd64 --provenance=false -t <tag> scripts/seeding/`: the build
   context is the component directory, every `COPY` source is context-relative
   (`requirements.txt`, `src`, `fixtures`, `tests`), the base tag is pinned `python:3.14-slim` in
   every stage, and no `apt-get`/PostgreSQL package appears anywhere. The invocation is recorded
   in the Dockerfile header (DOCKER-004).

### Still UNVERIFIED (requires a container runtime)

- Actual execution of `docker build ... scripts/seeding/` (exit 0, tests stage output).
- Actual `docker run` of the runtime image with no environment.
- These must be executed once a container runtime is available; no code change is expected.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-017 | Seeding CLI entrypoint | blocks | The entrypoint the runtime stage runs |
| TASK-021 | CV domain fixtures and whole-corpus cross-reference test | blocks | The complete fixture corpus and full test suite the tests stage must pass |

## Implementation Steps (TDD: Red-Green-Refactor)

The Red-Green cycle is driven by the image build, which runs the existing pytest suite.

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables (TASK-017 entrypoint, TASK-021 fixture corpus and 255-test
      suite)
- [ ] **UNVERIFIED (no container runtime)**: Red check: run the mandated `docker build` and
      confirm it fails (no Dockerfile yet)

### 2. Green Phase

- [x] Write the Dockerfile and `.dockerignore` — **build execution UNVERIFIED (no container
      runtime)**; the suite the tests stage runs was executed on the host instead (255 passed with
      an empty environment), and the emulated build context was checked for completeness
- [x] Confirm the entrypoint exits non-zero with the config validation error naming the missing
      variables — verified on the host as `python -m src.main` in the emulated runtime layout
      (exit 1, names all four `POSTGRES_*` variables); **the `docker run` itself is UNVERIFIED
      (no container runtime)**

### 3. Refactor Phase

- [x] Tighten layers/caching and the ignore list (venv split so the runtime stage carries runtime
      pins only; sources copied from the tests stage so the stage cannot be pruned) — **rebuild
      UNVERIFIED (no container runtime)**

## Completion Criteria

- [ ] **UNVERIFIED — no container runtime exists in this environment (`docker`, `podman`,
      `nerdctl`, `buildx`, `img` all absent; no daemon socket).**
      `docker build --platform linux/amd64 --provenance=false -t <tag> scripts/seeding/` exits 0
      and the tests stage runs the full pytest suite during the build. Substitute evidence: the
      suite the tests stage runs passes on the host (255 passed, empty environment), and the
      runtime stage copies its sources from the tests stage so the stage cannot be pruned.
- [ ] **UNVERIFIED — no container runtime.** Deliberately breaking a test causes the *build* to
      fail. Substitute evidence: a deliberate breakage in a scratchpad copy of the suite makes
      `python -m pytest` exit 1 (`1 failed, 255 passed`), which aborts the `RUN` layer; the
      repository tests were left untouched.
- [x] Neither stage installs a PostgreSQL server package (no `apt-get`/`libpq-dev` anywhere;
      `psycopg[binary]` supplies libpq), and no test requests a server-spawning fixture — the
      whole suite passes on a host with no `postgres` binary
- [x] The runtime stage pins an explicit **`python:3.14-slim`** tag and contains `src/` and the
      full `fixtures/` tree (22 files, including `documents/**`) but not `tests/`
- [x] The container runs as a non-root user (system user/group `seeding`, uid/gid 1000)
- [ ] **UNVERIFIED — no container runtime.** Running the runtime *image* with no environment set
      exits non-zero naming the missing variable. Substitute evidence: the same command in the
      emulated runtime layout exits 1 naming `POSTGRES_HOST`, `POSTGRES_USER`,
      `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- [x] Verification evidence and the explicit UNVERIFIED items are recorded in Investigation Notes
      (Phase 3 completion evidence)

## Notes

- Impact scope: `scripts/seeding/Makefile` (TASK-023) builds and runs this image.
- Risk countermeasures carried by this task: **RISK-012** (tests stage in a postgres-free image
  is the enforcement mechanism), **RISK-010** (image actually built with the mandated flags),
  **RISK-011** (explicit 3.14 slim tag; never lower the base image), **RISK-005** (the fixtures
  shipped in the image are exactly the catalogued corpus).
- Scope boundary: no `docker-compose.yml`, no `.github/workflows/**`, no PostgreSQL provisioning
  (RISK-018). Do not modify Python sources, tests, or fixtures.
