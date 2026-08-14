# Task: Contacts, API key and admin audit log fixtures

Work Plan ID: WP-001
Task ID: TASK-020
Created Date: 2026-08-13
Description: Author the contacts (contact + messages), API keys, and admin audit log domain fixtures, and extend the shipped-fixture test to cover them.
Acceptance Criteria Covered: AC-6

## Implementation Content

Author, exactly per the catalogue in `scripts/seeding/README.md` (TASK-009):

- **Contacts** domain fixture: contacts with their messages. Cover the cases the
  `@spec-002`/`@spec-004` contacts scenarios require — at minimum a contact with an
  `organization` and one with it null, and messages in both `read` states.
- **API keys** fixture: the keys the `@spec-004` admin scenarios authenticate with. `api_key`
  values are **sha256 hashes**, never plaintext keys, and are unique across rows (F-9b). Include
  at least one row with a null `expires_at` and, if any scenario needs it, an expired key.
- **Admin audit log** fixture: entries referencing API-key IDs **by reference only** — the audit
  log fixture must not define API keys. `method` values come from `get|post|put|patch|delete`;
  `payload`/`response` are JSONB and nullable (include at least one row with both null).
- Rules (unchanged): IDs are **pre-generated UUIDv7 hex literals**; every referenced API-key ID
  must exist in the API keys fixture, otherwise linking fails before any DB interaction.
- Extend `scripts/seeding/tests/test_fixtures.py` so the shipped-fixture harness validates these
  three domains.

## Target Files

- [x] scripts/seeding/fixtures/ (contacts, api keys and admin audit log domain JSON files — names per the catalogue)
- [x] scripts/seeding/tests/test_fixtures.py

## Investigation Targets

Files to read before starting implementation (file path, with optional search hint):

- /home/agent/workspace/scripts/seeding/README.md (TASK-009 — required rows with motivating
  scenarios; the audit-log-references-api-key rule)
- /home/agent/workspace/scripts/seeding/src/models.py (TASK-012 — the three aggregate models'
  field names, enum values and nullability)
- /home/agent/workspace/scripts/seeding/tests/test_fixtures.py (TASK-018/019 — the harness to
  extend)
- /home/agent/workspace/acceptance/features/contacts.feature and
  /home/agent/workspace/acceptance/features/api.feature (scenarios these rows satisfy —
  read-only)

## Investigation Notes

- `README.md` §4.1 fixes the contacts rows: `contact.ada` (3 messages, `read` mixed,
  organization `Analytical Engines Ltd`), `contact.grace` (2 messages, **null** organization),
  `contact.alan` (1 message, `read` = `true`). Six messages in total, every `submitted_at`
  distinct so the descending-order assertion of `contacts.feature` — "An admin lists all
  messages" is deterministic. Emails are stored lower-cased and none may be
  `test@example.com` (§3.2).
- `README.md` §4.9 fixes the three API keys and publishes both the plaintext (for the
  acceptance suite) and the SHA-256 digest. Only the **digest** goes into the fixture:
  `api_key.valid` (null `expires_at`), `api_key.expired` (`2020-01-01`), `api_key.rotating`
  (`2999-01-01`, which proves the expiry check compares against `now()` rather than testing
  `expires_at IS NULL`). `issued_at` is fixture-supplied on all three.
- `README.md` §4.10 fixes two audit rows (`audit.list_contacts`, `audit.create_project`), each
  referencing an API key **by ID only**. §8 C-1 recorded that an unauthenticated request could
  not be audited under a `NOT NULL` `api_key_id`; the 2026-08-13 user decision made the column
  nullable, and `AdminAuditLogFixture.api_key_id` is `FixtureId | None = None` accordingly. A
  third row, `audit.unauthenticated`, is therefore authored for the 403 request of
  `api.feature` — "An unauthenticated admin request is recorded in the audit log", with a null
  `api_key_id` and both `payload` and `response` null. README §4.10 predates that decision and
  is not in this task's write set.
- `src/models.py`: `ContactFixture` embeds `messages` (`MessageFixture`: `content`, `read`
  defaulting to `False`, required `submitted_at`); `ApiKeyFixture` constrains `api_key` to
  `^[0-9a-f]{64}$`; `AdminAuditLogFixture` carries `api_key_id` (nullable), `endpoint`,
  `method` (the `HttpMethod` enum: `get|post|put|patch|delete`), `status_code` (100-599) and
  the nullable JSONB `payload`/`response`. `extra="forbid"` on every model means the audit-log
  fixture structurally cannot define an API key.
- `tests/test_fixtures.py`: the shipped harness is parametrised over `SHIPPED_DOMAINS`; the
  three new files are appended there. `DOCUMENT_BEARING_DOMAINS` is untouched — none of these
  three domains owns a `base.document` row.
- `acceptance/features/api.feature` audit assertions are all about entries the API writes at
  run time (§3.1 class 3); the fixture rows exist for REQ-2.3 and to prove the FK path.

## Task Dependencies

| Task ID | Title | Dependency Type | Deliverable Consumed |
| --- | --- | --- | --- |
| TASK-009 | Fixture catalogue derivation | blocks | Catalogue rows and file naming for these domains |
| TASK-012 | Domain-aggregate pydantic models | blocks | The contacts, API key and audit log models |
| TASK-019 | Agent spec, subagent and project fixtures | blocks | The extended shipped-fixture harness in `test_fixtures.py` |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read all Investigation Targets and record key observations
- [x] Review dependency deliverables; list required rows per domain with motivating scenarios
- [x] Extend the shipped-fixture test to require these three domains; run and confirm failure

### 2. Green Phase

- [x] Author the three fixture files
- [x] Run only the added tests and confirm they pass

### 3. Refactor Phase

- [x] Keep the harness table-driven; confirm tests still pass

## Completion Criteria

- [x] The contacts, API keys and admin audit log fixture files exist with exactly the rows the
      catalogue requires, including a contact with a null `organization`, messages in both
      `read` states, an API key with a null `expires_at`, and an audit log row with null
      `payload` and `response`
- [x] Every `api_key` value is a sha256 hash (64 hex characters), unique across rows; no
      plaintext key appears
- [x] Every `api_key_id` in the audit log fixture resolves to a row in the API keys fixture;
      the audit log fixture defines no API keys of its own
- [x] `method` values are restricted to `get|post|put|patch|delete`
- [x] All IDs are 32-character pre-generated hex literals
- [x] `acceptance/**` is unmodified
- [x] All added tests pass with no PostgreSQL binary present

## Notes

- Impact scope: `test_fixtures.py` is completed by TASK-021, which adds the whole-corpus
  cross-reference test.
- Risk countermeasures carried by this task: **RISK-004**, **RISK-005**, **RISK-008**
  (cross-file ID references must resolve), **RISK-011** (pre-generated ID literals),
  **RISK-019**.
- Scope boundary: does not modify `README.md`, models, loader or persistence code; does not edit
  fixtures authored by TASK-018/019. Never store a plaintext API key.
