# Task: Agent spec, subagent and project fixtures

Work Plan ID: WP-001
Task ID: TASK-019
Created Date: 2026-08-13
Description: Author the agent-spec domain fixture (specs + document links + owned documents) with its sidecar content files, plus the subagents and projects fixtures, and extend the shipped-fixture test to cover them.
Acceptance Criteria Covered: AC-6, AC-10

## Implementation Content

Author, exactly per the catalogue in `scripts/seeding/README.md` (TASK-009):

- **Agent specs** domain fixture: `agent_spec` rows, their `agent_spec_document_link` rows
  (with `document_type` from `spec|acceptance|other`) and the documents they own, plus the
  matching sidecar content files under `scripts/seeding/fixtures/documents/**`. Cover the cases
  the `@spec-002`/`@spec-004` agent-catalogue scenarios require, including a spec with more than
  one linked document and both visible and hidden specs (`display`).
- **Subagents** fixture: catalogue entries with representative `inputs`/`outputs` JSONB
  payloads, including at least one row with null `inputs`/`outputs`.
- **Projects** fixture: personal and company projects, including at least one with a null
  `github_link` and both `display` values.
- Rules (unchanged): IDs are **pre-generated UUIDv7 hex literals**; document `content` is a path
  relative to `scripts/seeding/fixtures/`; **no fixture supplies `size`**; sidecar content is
  non-empty and representative.
- If any document row here intentionally re-states a document already defined in the blog
  fixture, its payload must be **byte-identical** — the seeder de-duplicates on identical
  payloads and raises on conflicts. Prefer distinct documents unless the catalogue says
  otherwise.
- Extend `scripts/seeding/tests/test_fixtures.py` so the shipped-fixture harness also validates
  these three domains, asserting non-empty sidecar bytes and correct derived sizes for every new
  document.

## Target Files

- [x] scripts/seeding/fixtures/ (agent-spec, subagents and projects domain JSON files — names per the catalogue)
- [x] scripts/seeding/fixtures/documents/ (sidecar content files for the agent-spec documents)
- [x] scripts/seeding/tests/test_fixtures.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — agent-spec, subagent and project
  rows with their motivating scenarios; shared-document ownership)
- /home/agent/workspace/scripts/seeding/src/models.py (TASK-011/012 — the three aggregate models'
  field names, enum values and nullability)
- /home/agent/workspace/scripts/seeding/tests/test_fixtures.py (TASK-018 — the shipped-fixture
  harness to extend)
- /home/agent/workspace/acceptance/features/agent_catalogue.feature and
  /home/agent/workspace/acceptance/features/projects.feature (scenarios these rows satisfy —
  read-only)

## Investigation Notes

- `README.md` §4.3 fixes the agent-spec rows: `spec.sample` (two documents — `spec`/public and
  `other`/restricted), `spec.database` (`spec` + `acceptance`, the only `acceptance` user),
  `spec.restricted` (single restricted `spec` document), `spec.draft` (no documents),
  `spec.hidden_alpha` and `spec.hidden_beta` (`display` = false). Seven documents, all three
  `document_type` values and both `restricted` values exercised. §5.1 fixes the seven sidecar
  paths under `documents/specs/`.
- §4.7 fixes three subagents (`Sample Agent` with null `inputs`/`outputs`, `work-planner` and
  `task-executor` with JSON schemas); §4.8 fixes four projects, two visible and two hidden, with
  `Sample Project` and `Legacy Toolkit` carrying a null `github_link` and every `primary_link`
  on `https://`.
- `models.py`: `AgentSpecFixture` embeds `AgentSpecDocumentLinkFixture` rows (own `id`,
  `document_type`, nested `DocumentFixture`); `SubagentFixture.inputs`/`outputs` are optional
  `dict[str, Any]`; `ProjectFixture.github_link` is optional. `DocumentFixture` derives `size`
  and rejects a fixture-supplied one; `restricted` defaults to `true`, so public documents set
  it explicitly.
- `agent_catalogue.feature` refers to specs by *title*, satisfied by `display_name` (README C-2);
  `base.agent_spec` has no external spec-identifier column by user decision of 2026-08-13.
- The shipped-fixture harness keys five parametrised tests off `SHIPPED_DOMAINS`. Its
  sidecar test asserts at least one document per domain, which is false for `subagents.json`
  and `projects.json`, so that single test is now parametrised over the document-bearing
  subset instead.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-009 | Fixture catalogue derivation | blocks | Catalogue rows and file naming for these domains |
| TASK-012 | Domain-aggregate pydantic models | blocks | The agent-spec, subagent and project models |
| TASK-018 | Blog domain fixtures and shipped-fixture harness | blocks | The harness in `test_fixtures.py` and the shared document rows |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables; list the required rows per domain with motivating
      scenarios
- [x] Extend the shipped-fixture test to require these three domains and their sidecar bytes;
      run and confirm failure

### 2. Green Phase

- [x] Author the three fixture files and the agent-spec sidecar content files
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Keep the harness table-driven over domains; confirm tests still pass

## Completion Criteria

- [x] The agent-spec, subagents and projects fixture files exist with exactly the rows the
      catalogue requires, including a spec with multiple linked documents, a subagent with null
      `inputs`/`outputs`, and a project with a null `github_link`
- [x] Every agent-spec document row references an existing, non-empty sidecar file; derived
      `size` matches the byte length
- [x] `document_type` values are restricted to `spec|acceptance|other`
- [x] Any document defined in more than one domain file has a byte-identical payload
- [x] All IDs are 32-character pre-generated hex literals; no fixture supplies `size`
- [x] `acceptance/**` is unmodified
- [x] All added tests pass with no PostgreSQL binary present

## Notes

- Impact scope: `test_fixtures.py` is extended further by TASK-020 and TASK-021; document rows
  interact with the blog domain through the seeder's shared-row de-duplication.
- Risk countermeasures carried by this task: **RISK-004**, **RISK-005**, **RISK-008**
  (byte-identical shared document payloads — conflicting duplicates must raise, so do not create
  same-ID/different-payload rows), **RISK-009**, **RISK-011**, **RISK-019**.
- Scope boundary: does not modify `README.md`, models, loader or persistence code; does not edit
  the blog fixture authored in TASK-018.
