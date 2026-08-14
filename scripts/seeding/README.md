# Database Seeding

Seeds a migrated PostgreSQL database with the test fixtures used by the acceptance suite
and by local development (SPEC-001 §4.2, REQ-2.1 – REQ-2.8).

## 1. Purpose and Scope

The seeding component loads JSON fixtures from `scripts/seeding/fixtures/`, validates them
through `pydantic` **domain-aggregate** models, and inserts them into a database that has
already been migrated by the `alembic/` component. Seeding is atomic: every truncation and
every insert runs inside a single transaction, so the database is never left partially
seeded.

Scope of this component:

- the JSON domain fixtures and their sidecar document content files;
- the `pydantic` domain models that validate them;
- the persistence layer that computes the truncate set, flattens aggregates to table rows,
  de-duplicates shared lookup rows, orders inserts FK-safely, and executes them in one
  transaction;
- the `argparse` CLI and the container that runs it.

Out of scope: the schema itself (owned by `alembic/`, documented in `docs/db_schema.md`),
any provisioned PostgreSQL instance, and the acceptance suite itself (`acceptance/**` is a
read-only user input to this component).

This document is the **fixture contract**. It is derived from the acceptance suite and is
the specification that the domain models, the insert-order constant, and the fixture files
must conform to. Where it conflicts with an implementation, this document is authoritative
until it is amended.

## 2. Usage

Seeding always runs against an **already migrated** database: apply the `alembic/` component
first (`make -C alembic run-migrations`), then seed.

> **Warning — never seed a non-development database.** A run is unconditionally destructive: it
> truncates every seeded table and reinstalls the fixture corpus, which includes API keys whose
> plaintexts are published in [§4.9](#49-api_keysjson). Pointing the CLI or the image at a
> shared, staging or production database therefore destroys its data *and* installs credentials
> that anyone with read access to this repository can authenticate with. Because the container
> accepts whatever `POSTGRES_HOST`/`POSTGRES_DB` it is handed, seeding is opt-in: the CLI
> refuses to run unless `--yes` is supplied, and reports the target host and database in a
> structured error before any fixture is read and before a connection is opened.

### 2.1 Via the container

The `seed` target builds the image and runs it against the database described by the current
shell environment:

```bash
$ export POSTGRES_HOST=localhost
$ export POSTGRES_USER=postgres
$ export POSTGRES_PASSWORD=<password>
$ export POSTGRES_DB=postgres

$ make -C scripts/seeding seed
```

The image is always built with `--platform linux/amd64` (the cluster nodes are amd64) and
`--provenance=false` (the target registry does not support provenance attestations). The
variables are handed to the container with the value-less `docker run -e <NAME>` form, so
their values are read from the parent shell and never appear in the `Makefile`, the image or
the repository (REQ-2.7).

The `seed` target supplies the `--yes` opt-in on the command line, which is what makes the
documented development workflow a single command; a bare `docker run` of the image without it
refuses and exits non-zero.

The container entrypoint is `python -m src.main`, so any argument appended to the `docker run`
command line reaches the CLI directly:

```bash
$ docker run --rm \
    -e POSTGRES_HOST -e POSTGRES_PORT -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB \
    database-seeding:latest --yes --dbname other_database
```

### 2.2 Running the CLI directly

Install the pinned dependencies and export the variables documented in
[§2.4](#24-environment-variable-contract), then run the module from the component directory.
It must be run with `-m` so that the absolute `src.*` imports resolve:

```bash
$ pip install -r requirements.txt

$ export POSTGRES_HOST=localhost
$ export POSTGRES_USER=postgres
$ export POSTGRES_PASSWORD=<password>
$ export POSTGRES_DB=postgres

$ cd scripts/seeding && python -m src.main --yes
```

Without `--yes` the run is refused: nothing is read from disk, no connection is opened, a single
structured error naming the target host and database is logged, and the process exits non-zero.

A run either seeds everything or nothing: fixtures are loaded, validated and linked entirely
on disk **before** the connection is opened, and every truncation and insert then runs inside
one transaction with a single commit (REQ-2.5, AC-7). Any failure — invalid configuration,
invalid fixture, unresolved reference, unreachable database, failing statement — is reported
as one structured `structlog` error event and exits non-zero. Configuration problems are
reported by variable **name** only; no log line carries a value, a DSN or the password.

### 2.3 CLI arguments

Every connection argument defaults to the matching validated setting, which is the whole of
the environment-to-CLI bridge: omitting an argument uses the environment variable, supplying
one overrides it for that run. The settings are loaded and validated **before** the parser is
built, so a missing required variable fails the run even when the corresponding argument would
have overridden it.

| Argument | Meaning | Default |
| --- | --- | --- |
| `--host` | Hostname of the PostgreSQL instance | `POSTGRES_HOST` |
| `--port` | Port of the PostgreSQL instance (parsed as `int`) | `POSTGRES_PORT` (itself defaulting to `5432`) |
| `--user` | User to connect as | `POSTGRES_USER` |
| `--password` | Password of the user (parsed as a `SecretStr`, so an explicitly supplied value is masked exactly like the environment-sourced one) | `POSTGRES_PASSWORD` |
| `--dbname` | Name of the database to seed | `POSTGRES_DB` |
| `--yes` | Confirms the destructive run. Without it the CLI refuses, logs one structured error naming the target host and database, and exits non-zero | off (the run is refused) |
| `--fixtures-dir` | Root directory holding the JSON fixture files and the `documents/` sidecar tree | the `fixtures` directory shipped beside `src/` (`src.fixtures.DEFAULT_FIXTURES_ROOT`) |

`--yes` and `--fixtures-dir` are the only arguments with no environment default. `--yes` is
deliberately a flag and not a variable: an opt-in that can be set once in a shell profile, a CI
secret or a Kubernetes manifest is not an opt-in. `--fixtures-dir` needs none because the
fixture corpus ships inside the image, so the shipped tree is used unless a run explicitly
points elsewhere.

`--help` prints the same reference:

```bash
$ python -m src.main --help
```

### 2.4 Environment-variable contract

| Variable | Required | Default | Consumers |
| --- | --- | --- | --- |
| `POSTGRES_HOST` | yes | — | both containers |
| `POSTGRES_PORT` | no | `5432` | both containers |
| `POSTGRES_USER` | yes | — | both containers |
| `POSTGRES_PASSWORD` | yes | — (SecretStr) | both containers |
| `POSTGRES_DB` | yes | — | both containers |
| `LOG_LEVEL` | no | `INFO` | both containers |
| `LOG_FILE` | no | `/app/logs/seeding.log` (this container; `/app/logs/migrations.log` in the migrations container) | both containers |

"Both containers" refers to this seeding container and the migrations container documented in
`alembic/README.md`. These seven rows are shared between the two components and **must not
diverge** (RISK-015) — only the default of `LOG_FILE` is per-container, since each writes its own
file; `alembic/README.md` additionally documents `ALEMBIC_REVISION` and `ALEMBIC_COMMAND`, which
this component does not read.

Notes on the contract:

* `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` are required and
  have no defaults. A missing value raises a validation error at start-up naming the variable.
* `POSTGRES_PORT` is the only variable with a default (`5432`) and must be a valid port number.
* `POSTGRES_PASSWORD` is held as a pydantic `SecretStr` and is unwrapped in exactly one place,
  when the connection is opened. It is never logged.
* `LOG_LEVEL` and `LOG_FILE` are optional and carry defaults, so a deployment that predates them
  keeps working unchanged. `LOG_LEVEL` names the lowest level that is emitted (matched
  case-insensitively; an unknown name falls back to `INFO`), and `LOG_FILE` names the file the
  rendered JSON lines are appended to *in addition to* stdout. A log file that cannot be created
  or written degrades to stdout only rather than failing the run.

### 2.5 Make targets

| Target | Description |
| --- | --- |
| `build` | Builds the seeding image with the mandated `--platform`/`--provenance` flags |
| `seed` | Builds the image and runs it against the environment's database, supplying the `--yes` destructive-run opt-in |
| `test` | Runs the `pytest` suite over the component |
| `lint` | Runs `black` and `flake8` over the component |

All targets follow the monorepo convention and are run as `make -C scripts/seeding <target>`.

### 2.6 Testing

```bash
$ make -C scripts/seeding test
```

The suite runs with **no PostgreSQL binary and no PostgreSQL server** (RISK-012): the database
is always a recording fake injected as a connection factory, and every test that touches the
settings or the entrypoint supplies its own environment. The image's `tests` stage is the
enforcement mechanism — the suite runs during the build in an image where no `postgres`
executable exists and no server package is installed, so a test that requested a
server-spawning fixture would fail the build. The runtime stage copies its sources from the
tests stage, so the image cannot be built at all unless the suite passes.

### 2.7 Verification status

AC-6 … AC-10 are **implemented but unverified** in this changeset. The mechanisms that would
verify them are out of scope here:

* There is **no provisioned PostgreSQL instance** by user decision (RISK-022), so no fixture
  has been inserted into, truncated from, or read back out of a real database. The atomicity
  guarantee (AC-7) and the byte-identical document round-trip (AC-10) are therefore backed by
  unit tests against a fake connection, not by execution against PostgreSQL.
* The container image has **not been built or executed** in the authoring environment, as no
  container runtime was available there. The `Dockerfile` and the `Makefile` recipes are
  verified by inspection and by `make -n` expansion only, which also means the `tests` stage
  has not actually run.

Until a target database and a container runtime exist, treat the acceptance criteria of this
component as claims backed by review and by the offline unit suite, not by execution.

### 2.8 Outstanding: pin the base image by digest

Both `FROM python:3.14-slim` lines in this component's `Dockerfile` (the `builder`/`tests` base
and the `runtime` base) are still pinned by **mutable tag**. Two builds of the same commit can
therefore resolve to different base images, which is how a compromised or regressed upstream
publish reaches an image that holds database credentials at run time, with no change to this
repository and no signal in review. The Python dependency pins in `requirements.txt` are exact
and are not affected; only the base layer is unpinned.

This is **not fixed in this changeset**: resolving a digest requires pulling the image, and no
container runtime exists in the authoring environment. Inventing a digest would be worse than
leaving the tag, so the requirement is recorded here and must be carried out in an environment
that has a runtime:

```bash
$ docker pull python:3.14-slim
$ docker inspect --format '{{index .RepoDigests 0}}' python:3.14-slim
python@sha256:<digest>
```

Then rewrite **every** `FROM` line in this component's `Dockerfile` — and in `alembic/Dockerfile`
— as `FROM python:3.14-slim@sha256:<digest> AS <stage>`, keeping the human-readable tag in front
of the digest. All stages of a Dockerfile must carry the *same* digest, and both components
should be refreshed together so the two images share a base. Repeat this procedure whenever the
base image is deliberately upgraded; the digest is the only thing that changes.

## 3. Derivation and Coverage

The catalogue below was derived by reading **all six** feature files in
`acceptance/features/` and **all three** requirement tags. The scenario census read and
covered by this catalogue is complete:

| Feature file | `@spec-002` | `@spec-003` | `@spec-004` | Total |
| --- | --- | --- | --- | --- |
| `agent_catalogue.feature` | 8 | 0 | 11 | 19 |
| `api.feature` | 6 | 0 | 2 | 8 |
| `blog.feature` | 13 | 0 | 7 | 20 |
| `contacts.feature` | 6 | 3 | 8 | 17 |
| `cv.feature` | 7 | 2 | 0 | 9 |
| `projects.feature` | 2 | 0 | 8 | 10 |
| **Total** | **42** | **5** | **36** | **83** |

`Scenario Outline`s are counted once each; every `Examples` row was considered when
deriving the rows below.

### 3.1 Seed data vs. scenario-managed state

Not every scenario precondition is seed data. Three classes of precondition are explicitly
**not** satisfied by fixtures:

1. **Negative preconditions** — `Given no blog post exists with the ID "…"`,
   `Given no contact exists with email "test@example.com"`, `Given no contacts exist`,
   `Given no experience or education entries exist`,
   `Given the blog post "Sample Post" has no comments`. These require *absence*; the
   fixtures satisfy them by never using the reserved literals in §3.2 and by leaving the
   named rows out.
2. **Mutating preconditions** — the same entity is required in two different states by two
   different scenarios (e.g. `blog.feature` needs "Sample Post" marked *visible* in one
   scenario and *hidden* in another; `agent_catalogue.feature` and `projects.feature` do
   the same for "Sample Spec" and "Sample Project"). A single fixture row cannot hold both
   states. The fixtures provide the row in its **baseline** state (recorded per row below);
   the step definitions are responsible for driving it to the state the scenario names.
3. **Runtime side effects** — audit-log entries asserted by
   `api.feature` and `agent_catalogue.feature` are written by the API while the scenario
   runs. Fixtures seed audit-log rows only to satisfy REQ-2.3 ("fixtures must be seeded for
   all entities"), never to satisfy those assertions.
4. **Data-free scenarios** — the six `@spec-002` scenarios in `api.feature` (health ×2,
   version, CORS preflight ×2, CORS on a real request), the six contact-submission
   `@spec-002` scenarios in `contacts.feature`, and the three `@spec-003` contact-form
   scenarios presuppose no persisted data at all. They are covered by this catalogue in the
   sense that it deliberately provides nothing for them.

### 3.2 Reserved literals — must never appear in a fixture

These values appear in `Given no … exists` steps. A fixture using one of them would make
the owning scenario fail:

| Literal | Reserved by |
| --- | --- |
| `3f2a9c1de4b7482ba6c10e5d8c714b39` | `blog.feature` — "A request is made against a blog post that does not exist", "An admin request references a blog post that does not exist"; `contacts.feature` — "An admin lists messages for a contact that does not exist" |
| `9b4d2f7ac1e34d59b8a61c0f5e372d48` | `agent_catalogue.feature` — "A request is made against a spec that does not exist", "An admin request references a spec that does not exist" |
| `7c1e5a9db2f6470c93d84b1a6e05c827` | `projects.feature` — "An admin request references a project that does not exist" |
| `test@example.com` (and any case variant) | `contacts.feature` — "A new visitor submits a contact message", "A visitor submits a contact message without an organization", "Submitted contact details are sanitized before persistence", "Client supplied read and submitted_at values are ignored" all require this contact to be **absent**, while four `@spec-004` scenarios require it to be **present**. The two are irreconcilable in seed data, so the address is owned entirely by the acceptance suite's own setup/teardown and no fixture contact may use it. |

### 3.3 Fixture identifiers

Every fixture record carries an explicit `id` (REQ-2.3): a UUIDv7 generated with
`uuid.uuid7().hex` (Python 3.14), stored as a 32-character hyphen-free hex string. This
catalogue refers to rows by **symbolic key** (e.g. `article.sample_post`); the concrete
UUIDv7 literal is assigned once, at fixture-authoring time, and is frozen from that moment
— see §7.

## 4. Fixture Catalogue

Ten domain-aggregate JSON files under `scripts/seeding/fixtures/`, one per domain. This
confirms the work plan's proposed decomposition unchanged; between them they cover all
twenty tables of SPEC-001 §6.1 exactly once as an owner.

| File | Tables owned |
| --- | --- |
| `contacts.json` | `contact`, `message` |
| `blog.json` | `topic`, `article`, `topic_article_link`, `article_comment`, `document` (shared) |
| `agent_specs.json` | `agent_spec`, `agent_spec_document_link`, `document` (shared) |
| `cv_experience.json` | `cv_experience`, `cv_experience_responsibility`, `cv_stack_item` (shared), `cv_stack_item_experience_link` |
| `cv_skills.json` | `cv_skill_category`, `cv_stack_item_category_link` |
| `cv_education.json` | `cv_education` |
| `subagents.json` | `subagent` |
| `projects.json` | `project` |
| `api_keys.json` | `api_key` |
| `admin_audit_log.json` | `admin_audit_log` |

Each file is a JSON **array of objects** (REQ-2.3), one object per domain aggregate.

Throughout, "cited by" names the feature file and scenario that motivates the row.

### 4.1 `contacts.json` — contact + its messages

Aggregate: one `contact` with an embedded array of its `message` rows.

| Key | `name` / `email` / `organization` | Messages | Distinguishing attribute | Cited by |
| --- | --- | --- | --- | --- |
| `contact.ada` | Ada Lovelace / `ada.lovelace@example.org` / `Analytical Engines Ltd` | 3, distinct `submitted_at`, `read` mixed | Contact **with** an organization; multiple messages from one contact | `contacts.feature` — "An admin lists the messages belonging to a contact" (needs a contact whose messages can be isolated); "An admin lists all messages" |
| `contact.grace` | Grace Hopper / `grace.hopper@example.net` / `null` | 2, distinct `submitted_at` | Contact with a **null** organization | `contacts.feature` — "Contacts with no organization are returned with a null organization" |
| `contact.alan` | Alan Turing / `alan.turing@example.com` / `Bletchley Park` | 1, `read` = `true` | Third contact, so "other contacts have also submitted messages" holds; exercises `read` = true | `contacts.feature` — "An admin lists the messages belonging to a contact"; "An admin lists all messages"; "Contacts are accessible by admin users that provide an API key" |

Rules:

- Six `message` rows in total, every `submitted_at` distinct, so
  `contacts.feature` — "An admin lists all messages" ("ordered by submission time in
  descending order") is deterministic against seed data. `submitted_at` is a required
  non-defaulted column and is always fixture-supplied.
- No fixture contact may use `test@example.com` (§3.2). Emails are stored lower-cased, as
  the sanitisation scenarios require of API-created contacts.
- `contact.email` is unique; the three addresses differ.

### 4.2 `blog.json` — topics + articles + comments + owned documents

Aggregate: one `article` with its embedded topic references, its `article_comment` rows and
its owned `document`. Topics are declared once in the file and referenced by the articles.

Topics: `golang`, `postgres`, `terraform`, `kubernetes`. Cited by `blog.feature` — "A
request is made to list blog posts" ("each blog post in the list includes the topics linked
to it"); the names `golang` and `postgres` are the ones the admin-create scenario uses.

| Key | Title | `display` | Document | Topics | Comments | Cited by |
| --- | --- | --- | --- | --- | --- | --- |
| `article.sample_post` | Sample Post | `true` (baseline; see §3.1 class 2) | `documents/blog/sample-post.md`, `restricted` = `false` | golang, postgres | 3 — see below | `blog.feature` — "A request is made to get the content of a visible blog post"; "…of a hidden blog post"; "A request is made to create a new comment"; "…anonymous comment"; "A submitted comment author is sanitized…"; "The API rejects an empty comment"; "A request is made to list comments associated with a visible blog post"; "…hidden blog post"; "Comments are returned oldest first"; "An admin uploads the initial content…"; "An admin replaces the content of a blog post"; "An admin sets the visibility of a blog post"; "The API rejects unauthenticated content and visibility updates to blog posts" |
| `article.scaling_postgres` | Scaling Postgres Connections | `true` | `documents/blog/scaling-postgres-connections.md`, `restricted` = `false` | postgres | 1 | `blog.feature` — "A request is made to list blog posts" (needs a *collection* of visible posts) |
| `article.terraform_layout` | Terraform Module Layout | `true` | `documents/blog/terraform-module-layout.md`, `restricted` = `false` | terraform, golang | **0** | `blog.feature` — "A request is made to list comments for a blog post that has none"; "A request is made to list blog posts" |
| `article.k8s_operators` | Hidden Draft: Kubernetes Operators | `false` | `documents/blog/kubernetes-operators.md`, `restricted` = `false` | kubernetes | 0 | `blog.feature` — "A request is made to list blog posts" (needs a *collection* of hidden posts, and asserts they are excluded) |
| `article.unpublished_notes` | Unpublished Notes | `false` | `documents/blog/unpublished-notes.md`, `restricted` = `false` | kubernetes, golang | 0 | `blog.feature` — "A request is made to list blog posts" (second hidden post) |
| `article.draft_post` | Draft Post | `true` | **none** (`document_id` = `null`) | golang | 0 | `blog.feature` — "A blog post without a linked document is not listed" |

Comments on `article.sample_post` (all `article_comment` rows in the file):

| Key | `author` | Distinguishing attribute | Cited by |
| --- | --- | --- | --- |
| `comment.sample_post_1` | `John Doe` | Named author, oldest | `blog.feature` — "A request is made to list comments associated with a visible blog post" |
| `comment.sample_post_2` | `null` | **Anonymous** comment, so the null-author read path is covered by seed data | `blog.feature` — "A request is made to create a new anonymous comment" ("the comment is persisted with a null author") |
| `comment.sample_post_3` | `Jane Doe` | Newest | `blog.feature` — "Comments are returned oldest first" |
| `comment.scaling_postgres_1` | `Grace Hopper` | Comment on a second article, so comment lists are per-article | `blog.feature` — "A request is made to list comments associated with a visible blog post" |

Rules:

- Every `article.authored_at` is distinct and fixture-supplied.
- The three `article.sample_post` comments carry distinct, ascending explicit `created_at`
  values (see assumption **A-3** in §5).
- All five blog documents are `restricted` = `false`: blog content is served publicly, and
  `base.document.restricted` defaults to `true`, so the value must be supplied explicitly.
- `article.display` and `article.document_id` are the only two attributes the list endpoint
  filters on, and both filters have a positive and a negative fixture row.

### 4.3 `agent_specs.json` — spec + document links + owned documents

Aggregate: one `agent_spec` with an embedded array of `{document, document_type}` links.

| Key | `display_name` | `display` | Linked documents (`document_type`, `restricted`) | Cited by |
| --- | --- | --- | --- | --- |
| `spec.sample` | Sample Spec | `true` (baseline; §3.1 class 2) | `documents/specs/sample-spec.md` (`spec`, `false`) **and** `documents/specs/sample-spec-notes.md` (`other`, `true`) | `agent_catalogue.feature` — "A restricted document is omitted from the spec"; "A request is made to get the content of a spec"; "An admin uploads the initial content for a spec"; "An admin replaces the content of a spec"; "An admin sets the visibility of a spec"; "The API rejects unauthenticated content and visibility updates to specs" |
| `spec.database` | SPEC-001 Database and Schema | `true` | `documents/specs/spec-001-database.md` (`spec`, `false`) **and** `documents/specs/spec-001-acceptance.md` (`acceptance`, `false`) | `agent_catalogue.feature` — "A request is made to list specs" (needs a *collection* of visible specs; "each metadata entry includes the non-restricted documents linked to the spec"); also the only row exercising the `acceptance` enum value |
| `spec.restricted` | Restricted Spec | `true` | `documents/specs/restricted-spec.md` (`spec`, **`true`**) | `agent_catalogue.feature` — "A spec with a linked spec document that is restricted is not listed" |
| `spec.draft` | Draft Spec | `true` | **none** | `agent_catalogue.feature` — "A spec without a linked spec document is not listed" |
| `spec.hidden_alpha` | Hidden Spec Alpha | `false` | `documents/specs/hidden-spec-alpha.md` (`spec`, `false`) | `agent_catalogue.feature` — "A request is made to list specs" (needs a *collection* of hidden specs); "Hidden specs are listed when an admin includes hidden specs" |
| `spec.hidden_beta` | Hidden Spec Beta | `false` | `documents/specs/hidden-spec-beta.md` (`spec`, `false`) | `agent_catalogue.feature` — "Hidden specs are not listed without a valid API key"; "Listing specs without including hidden specs remains public" (second hidden spec) |

Rules:

- The scenarios refer to specs by *title*; the schema's nearest column is
  `agent_spec.display_name`, which therefore carries the title literal (resolution **C-2**
  in §8).
- Seven `document` rows are owned by this file. The three `document_type` enum values
  (`spec`, `acceptance`, `other`) and both `restricted` values are all exercised.
- `spec.sample` is the only spec with both a non-restricted and a restricted document, which
  is exactly the shape "A restricted document is omitted from the spec" asserts on.

### 4.4 `cv_experience.json` — experiences + responsibilities + owned stack items + links

Aggregate: one `cv_experience` with embedded `cv_experience_responsibility` rows and stack
item references. **This file owns every `cv_stack_item` row** (§5).

Stack items owned: `Go`, `Python`, `Kubernetes`, `Terraform`, `PostgreSQL`.
Cited by `cv.feature` — "Headline skills are grouped by category" (names Go, Python,
Kubernetes) and "Tech stack items without a category are not returned as skills" (names
Terraform).

| Key | `job_title` @ `organization` | `start_date` → `end_date` | Responsibilities | Stack items | Cited by |
| --- | --- | --- | --- | --- | --- |
| `experience.senior_engineer` | Senior Engineer @ Acme Cloud GmbH | 2022-03-01 → **`null`** | 3 | Go, Kubernetes, Terraform | `cv.feature` — "Experience entries are returned as complete aggregates" (named "Senior Engineer", must have both responsibilities and stack items); "An ongoing role is returned as current" (null `end_date`) |
| `experience.platform_engineer` | Platform Engineer @ Beta Systems AG | 2019-01-01 → 2022-02-28 | 2 | Python, PostgreSQL | `cv.feature` — "Entries are ordered by start date, most recent first" (`experience` row of the Examples table); "A request is made to retrieve CV" (needs a *collection*) |
| `experience.software_engineer` | Software Engineer @ Gamma Labs | 2016-09-01 → 2018-12-31 | 2 | Python, Go | `cv.feature` — "Entries are ordered by start date, most recent first" (three distinct start dates make the ordering unambiguous) |

Rules:

- All three `start_date` values are distinct.
- Exactly one entry has a null `end_date`; the other two are closed.
- `Terraform` is linked to an experience but deliberately **not** to any skill category
  (§4.5), which is what makes the uncategorised-skill scenario meaningful.
- Seven `cv_stack_item_experience_link` rows result; the link tuple is unique per pair.

### 4.5 `cv_skills.json` — categories + stack-item ID references

Aggregate: one `cv_skill_category` with an array of **stack item ID references only**. This
file never defines a `cv_stack_item` row (§5); an ID that no fixture defines is a linking
error before any database write.

| Key | `category` | Stack items referenced | Cited by |
| --- | --- | --- | --- |
| `skill_category.languages` | Languages | Go, Python | `cv.feature` — "Headline skills are grouped by category" ("the skills contain the category 'Languages' with the items 'Go' and 'Python'") |
| `skill_category.infrastructure` | Infrastructure | Kubernetes | `cv.feature` — "Headline skills are grouped by category" ("the category 'Infrastructure' with the item 'Kubernetes'") |
| `skill_category.databases` | Databases | PostgreSQL | `cv.feature` — "A request is made to retrieve CV" ("the response body contains a map of skills" — a third category proves the grouping is a map, not a fixed pair) |

`Terraform` is intentionally referenced by **no** category — cited by `cv.feature` — "Tech
stack items without a category are not returned as skills".

### 4.6 `cv_education.json`

| Key | `certificate` @ `institution` | `start_date` → `end_date` | Cited by |
| --- | --- | --- | --- |
| `education.pgcert` | Postgraduate Certificate @ Open University | 2025-01-01 → **`null`** | `cv.feature` — "A request is made to retrieve CV"; covers the nullable `end_date` on the education side |
| `education.msc` | MSc @ TU Munich | 2014-10-01 → 2016-07-31 | `cv.feature` — "Entries are ordered by start date, most recent first" (`education` row of the Examples table) |
| `education.bsc` | BSc @ University of Bristol | 2011-09-01 → 2014-06-30 | `cv.feature` — "Entries are ordered by start date, most recent first" (three distinct start dates); "A request is made to retrieve CV" (needs a *collection*) |

### 4.7 `subagents.json`

| Key | `name` | `inputs` / `outputs` | Cited by |
| --- | --- | --- | --- |
| `subagent.sample_agent` | Sample Agent | **`null` / `null`** | `agent_catalogue.feature` — "A subagent without declared schemas returns empty schema objects" (the row must exist with *no declared* schemas) |
| `subagent.work_planner` | work-planner | JSON object / JSON object | `agent_catalogue.feature` — "A request is made to list subagents" ("each subagent in the list includes its inputs and outputs schemas") |
| `subagent.task_executor` | task-executor | JSON object / JSON object | `agent_catalogue.feature` — "A request is made to list subagents" ("the response contains the complete subagent catalogue" — needs more than one populated entry) |

### 4.8 `projects.json`

| Key | `name` | `display` | `github_link` | Cited by |
| --- | --- | --- | --- | --- |
| `project.sample` | Sample Project | `true` (baseline; §3.1 class 2) | **`null`** | `projects.feature` — "A project without a GitHub link is listed" ("returned with a null GitHub link"); "An admin sets the visibility of a project"; "The API rejects unauthenticated visibility updates to projects" |
| `project.personal_website` | Personal Website | `true` | `https://github.com/example/personal-website` | `projects.feature` — "A request is made to list projects" (needs a *collection* of visible projects); "Existing project endpoints remain public" |
| `project.homelab` | Homelab Automation | `false` | `https://github.com/example/homelab` | `projects.feature` — "A request is made to list projects" (needs a *collection* of hidden projects, asserted to be excluded) |
| `project.legacy_toolkit` | Legacy Toolkit | `false` | `null` | `projects.feature` — "A request is made to list projects" (second hidden project) |

All `primary_link` values use `https://`; `projects.feature` — "The API rejects a project
created with an invalid link" rejects `http://` and non-`https` GitHub schemes, so fixtures
must not contain data the API itself would refuse.

### 4.9 `api_keys.json`

Every `@spec-004` scenario opens with `Given that <a valid|an invalid|an expired|no> API key
is provided`. "Invalid" and "none" need no row; "valid" and "expired" each need one. Keys
are stored as the SHA-256 hex digest of the plaintext — plaintext is never stored — so the
plaintext must be published here for the acceptance suite to be able to send it. These are
throwaway development credentials for a seeded test database and carry no production value.

| Key | Plaintext | `api_key` (SHA-256 hex) | `expires_at` | `issued_for` | Cited by |
| --- | --- | --- | --- | --- | --- |
| `api_key.valid` | `acceptance-valid-key` | `75952bd375671a21940e6f19fd474070e93f7b4abd3e2f7a0c2a161b4d296e31` | `null` (never expires) | acceptance-suite | Every `Given that a valid API key is provided` step — e.g. `contacts.feature` "Contacts are accessible by admin users that provide an API key"; `agent_catalogue.feature` "An admin creates a new spec"; `blog.feature` "An admin creates a new blog post"; `projects.feature` "An admin creates a new project"; `api.feature` "An authenticated admin request is recorded in the audit log" |
| `api_key.expired` | `acceptance-expired-key` | `d664cc4ea16e25955b662e2509da7563a657cf6d990d274bf32c6f874262ed74` | `2020-01-01T00:00:00Z` (past) | acceptance-suite | Every `Given that an expired API key is provided` example — `blog.feature`, `agent_catalogue.feature`, `contacts.feature` (×2), `projects.feature` (×2) unauthenticated-rejection outlines; `agent_catalogue.feature` "Hidden specs are not listed without a valid API key" |
| `api_key.rotating` | `acceptance-rotating-key` | `09d5568fa45a317420a97d578398c77b8d9999651715afe313342f809f3be77f` | `2999-01-01T00:00:00Z` (future) | acceptance-suite | Proves an expiry check compares against `now()` rather than merely testing `expires_at IS NULL`; the "valid" and "expired" scenarios above are otherwise satisfiable by a null check alone |

`issued_at` is fixture-supplied on all three (non-defaulted, `NOT NULL`).

### 4.10 `admin_audit_log.json`

No scenario presupposes a pre-existing audit-log row — every audit assertion is about an
entry the API writes during the scenario (§3.1 class 3). These rows exist to satisfy
REQ-2.3 ("fixtures must be seeded for all entities") and to prove the `api_key` → audit-log
FK path. A row references an `api_key` row **by ID only**; the `api_key` rows are owned
by `api_keys.json`.

| Key | `api_key_id` → | `method` / `endpoint` / `status_code` | `payload` / `response` | Cited by |
| --- | --- | --- | --- | --- |
| `audit.list_contacts` | `api_key.valid` | `get` / `/v1/admin/contacts` / `200` | `null` / JSON object | REQ-2.3; shape mirrors `api.feature` — "An authenticated admin request is recorded in the audit log" (endpoint, status code, response body) |
| `audit.create_project` | `api_key.valid` | `post` / `/v1/admin/projects` / `201` | JSON object / JSON object | REQ-2.3; exercises the non-null `payload` path and a second `http_method` enum value |
| `audit.unauthenticated` | **`null`** | `get` / `/v1/admin/contacts` / `403` | `null` / `null` | REQ-2.3; shape mirrors `api.feature` — "An unauthenticated admin request is recorded in the audit log". Exercises the nullable `api_key_id` path resolved as **C-1** in §8, and the rejected-request status code |

Three rows. `audit.unauthenticated` is the only row with a null `api_key_id`, and is also the
only row with both a null `payload` and a null `response`: a request rejected before it is
authenticated has no body worth recording on either side.

## 5. Sidecar Document Content and Shared-Lookup Ownership

### 5.1 Sidecar document rule (binding decision F-1)

A fixture's document `content` field is **a path relative to `scripts/seeding/fixtures/`**,
not inline content. The seeder resolves the path, reads the file as **bytes**, and inserts
those bytes into `base.document.content` (`BYTEA`).

`base.document.size` is **derived** from the byte length of the sidecar file and must
**never** be supplied by a fixture. A fixture that supplies `size` is rejected by the
document model.

Further rules:

- A path that escapes `scripts/seeding/fixtures/`, does not exist, or resolves to an empty
  file is a validation error raised **before** any database interaction.
- `base.document.restricted` defaults to `true` in the schema; any public document must set
  it to `false` explicitly.

Entities that reference `base.document`, and therefore the files that must exist under
`scripts/seeding/fixtures/documents/**` (AC-10 — every entity linking to `base.document`
carries at least one fixture with non-empty representative content):

| Owner | Sidecar file | `restricted` |
| --- | --- | --- |
| `article.sample_post` | `documents/blog/sample-post.md` | `false` |
| `article.scaling_postgres` | `documents/blog/scaling-postgres-connections.md` | `false` |
| `article.terraform_layout` | `documents/blog/terraform-module-layout.md` | `false` |
| `article.k8s_operators` | `documents/blog/kubernetes-operators.md` | `false` |
| `article.unpublished_notes` | `documents/blog/unpublished-notes.md` | `false` |
| `spec.sample` (`spec`) | `documents/specs/sample-spec.md` | `false` |
| `spec.sample` (`other`) | `documents/specs/sample-spec-notes.md` | `true` |
| `spec.database` (`spec`) | `documents/specs/spec-001-database.md` | `false` |
| `spec.database` (`acceptance`) | `documents/specs/spec-001-acceptance.md` | `false` |
| `spec.restricted` (`spec`) | `documents/specs/restricted-spec.md` | `true` |
| `spec.hidden_alpha` (`spec`) | `documents/specs/hidden-spec-alpha.md` | `false` |
| `spec.hidden_beta` (`spec`) | `documents/specs/hidden-spec-beta.md` | `false` |

Twelve sidecar files: five blog documents and seven spec documents. `article.draft_post` and
`spec.draft` deliberately have none. Every file must contain non-empty, representative
Markdown — `blog.feature` — "A request is made to get the content of a visible blog post"
and `agent_catalogue.feature` — "A request is made to get the content of a spec" both assert
the response body is the full content, byte-for-byte.

### 5.2 Shared-lookup ownership

> **Orchestrator assumption, not a user decision** (SPEC-001-REVIEW §6b, F-3; RISK-008).
> The rules in this subsection were chosen by the implementation, are open to user
> override, and should be reviewed as such.

- **A-1 — `base.cv_stack_item` is owned by `cv_experience.json`.** `cv_skills.json`
  references stack items **by ID only** and never defines one. Rationale: stack items are
  attributes of an experience first and skills second; `cv.feature` — "Tech stack items
  without a category are not returned as skills" requires an item to exist without a
  category, which only works if ownership sits on the experience side.
- **A-2 — `base.document` is shared between `blog.json` and `agent_specs.json`.** Each
  document row is owned by exactly one aggregate in exactly one file, but two files insert
  into the same table.
- **De-duplication rule.** The seeder de-duplicates shared rows so each is inserted exactly
  **once**, keyed on the primary-key `id`. Two records with the same `id` and byte-identical
  payloads collapse to one insert; two records with the same `id` and **conflicting**
  payloads raise an error. Silent last-write-wins is forbidden.
- **Link rows carry their own explicit ID.** Every row of every link table —
  `topic_article_link` included — is authored with its **own** pre-generated UUIDv7 hex
  literal, distinct from the IDs it joins (SPEC-001 §6.1: primary keys are UUIDv7; REQ-2.3:
  ID fields used as primary keys are present in **all** fixtures). The seeder therefore
  derives **no** identifier for any table: a topic association in `blog.json` is authored as
  `{"id": <link id>, "topic": {...}}`, and an association without an `id` is a validation
  error. The `topic` object keeps its own `id` and is de-duplicated on it as a shared lookup.
- **A-3 — explicit `created_at` on ordering-sensitive rows.** `created_at` is a server
  default of `now()`, which in PostgreSQL is the *transaction* timestamp; because all
  fixtures are inserted in a single transaction (REQ-2.5), every seeded row would otherwise
  share one `created_at`. `blog.feature` — "Comments are returned oldest first" orders by
  creation time, so the `article_comment` rows in `blog.json` supply explicit, distinct,
  ascending `created_at` values, and the comment model accepts an optional `created_at`. No
  other table needs this: message ordering uses the fixture-supplied `submitted_at`, CV
  ordering uses `start_date`, and article ordering uses `authored_at`.

## 6. FK-Safe Cross-File Insert Order

The fixtures are decomposed by domain, not by table, so the seeder flattens every aggregate
across every file into table rows and inserts them in one order. That order is the constant
below. It is derived here from the foreign-key graph of
`alembic/migrations/versions/0001_initial_base_schema.py` and is **written here rather than
re-derived in code**: `tests/test_persistence.py` asserts the seeder's order against this
list, so the two must be independent statements of the same fact.

The order is also the truncation order reversed: `TRUNCATE ... CASCADE` runs against the
tables receiving at least one row, and inserts then run parents-before-children in exactly
this sequence.

```text
 1. contact
 2. message
 3. topic
 4. document
 5. article
 6. topic_article_link
 7. article_comment
 8. subagent
 9. cv_stack_item
10. cv_experience
11. cv_experience_responsibility
12. cv_stack_item_experience_link
13. cv_education
14. api_key
15. admin_audit_log
16. agent_spec
17. agent_spec_document_link
18. cv_skill_category
19. cv_stack_item_category_link
20. project
```

All twenty tables of SPEC-001 §6.1 appear exactly once. Every ordering constraint imposed by
the revision's FK graph is satisfied:

| Constraint | Positions | Satisfied |
| --- | --- | --- |
| `contact` before `message` | 1 → 2 | yes |
| `document` before `article` | 4 → 5 | yes |
| `topic` before `topic_article_link` | 3 → 6 | yes |
| `article` before `topic_article_link` | 5 → 6 | yes |
| `article` before `article_comment` | 5 → 7 | yes |
| `cv_experience` before `cv_experience_responsibility` | 10 → 11 | yes |
| `cv_stack_item` before `cv_stack_item_experience_link` | 9 → 12 | yes |
| `cv_experience` before `cv_stack_item_experience_link` | 10 → 12 | yes |
| `api_key` before `admin_audit_log` | 14 → 15 | yes |
| `agent_spec` before `agent_spec_document_link` | 16 → 17 | yes |
| `document` before `agent_spec_document_link` | 4 → 17 | yes |
| `cv_skill_category` before `cv_stack_item_category_link` | 18 → 19 | yes |
| `cv_stack_item` before `cv_stack_item_category_link` | 9 → 19 | yes |

`topic`, `document`, `subagent`, `cv_stack_item`, `cv_experience`, `cv_education`,
`api_key`, `agent_spec`, `cv_skill_category`, `contact` and `project` have no outbound
foreign keys and are unconstrained beyond the pairs above; their relative positions are
fixed by this list so that the order is a single, stable constant rather than one of several
valid topological sorts.

## 7. Fixture ID Stability

Fixture IDs are **pre-generated UUIDv7 hex literals**, written into the JSON files as
constants. They are never generated at seed time.

These IDs, together with the fixture file names and the domain decomposition in §4, are a
**published contract**. SPEC-002, SPEC-003 and SPEC-004 tests pin to them. Consequently:

- an ID, once assigned to a row, is never changed or renumbered;
- a fixture file is never renamed and the domains are never re-decomposed;
- rows may be **added**; removing or repurposing an existing row is a breaking change;
- any of the above requires a coordinated downstream change, agreed before it is made.

The reserved literals in §3.2 are permanently excluded from the ID space.

## 8. Surfaced User-Input Conflicts — Resolutions

The following scenario expectations could not be represented by the SPEC-001 §6.1 schema as
originally written. They were surfaced here rather than worked around: no feature file, no
scenario and no spec was modified. **All three were resolved by the user on 2026-08-13**, and
the entries below record the decisions rather than the open questions.

- **C-1 — an unauthenticated admin request cannot be audited. Resolved: `api_key_id` is
  nullable.**
  `api.feature` — "An unauthenticated admin request is recorded in the audit log" requires an
  `admin_audit_log` entry for a request made with **no** API key (403), and notably does not
  assert a hashed key on that entry. The same applies to every `an invalid API key` example,
  which by definition matches no `api_key` row. As originally specified,
  `base.admin_audit_log.api_key_id` was `NOT NULL` with an `ON DELETE RESTRICT` FK to
  `base.api_key`, so neither request could be recorded.
  **Decision (user, 2026-08-13): make `base.admin_audit_log.api_key_id` NULLABLE**, in
  preference to introducing a sentinel `api_key` row. A null `api_key_id` denotes a request
  that carried no API key or an unrecognised one; the FK and its `ON DELETE RESTRICT`
  behaviour are unchanged for non-null values. The initial revision, the `alembic/` models and
  this component's models all carry that nullability, and `admin_audit_log.json` seeds the
  `audit.unauthenticated` row (§4.10) exercising it. No further action is required before
  SPEC-004's audit middleware is built.
- **C-2 — `spec_id` has no column. Resolved: `display_name` carries the identifier.**
  `agent_catalogue.feature` — "An admin creates a new spec" posts `spec_id: SPEC-101` and then
  asserts "a new spec is created with the ID 'SPEC-101'". `base.agent_spec` has only `id` (a
  UUIDv7 hex PK), `display_name`, `description` and `display`. `SPEC-101` is not a UUIDv7, so
  it cannot be the PK without violating §6.1's ID rule.
  **Decision (user, 2026-08-13): `base.agent_spec` deliberately has no external
  spec-identifier column**; `display_name` carries the human-facing identifier, which is also
  how the "a spec with the title …" steps are satisfied. The catalogue in §4.3 is therefore
  correct as authored, and no schema change is pending.
- **C-3 — the site-owner personal details have no entity. Resolved: static UI content.**
  `cv.feature` — "The homepage displays the personal details header" requires a name, an email
  address, a phone number and a headline summary for the site owner. SPEC-001 §6.1 models no
  such entity.
  **Decision (user, 2026-08-13): the CV personal-details header is deliberately not an
  entity** — it is static content owned by the SPEC-003 UI, not served from the database. No
  fixture, and no schema addition, is required for it.
