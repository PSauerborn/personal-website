# SPEC-001 — Acceptance Criteria

The criteria below are the ones a reviewer checks against a running database.
Each is either true or false; none of them is a matter of taste.

## Schema

- **AC-1.** Applying every migration against an empty database creates the
  `base` schema and every table it declares, in one transaction, with no manual
  step before or after.
- **AC-2.** Downgrading the initial revision leaves the database with no `base`
  schema, no enum types and no trigger functions belonging to it.
- **AC-3.** Every primary key column accepts a 32-character lower-case hex
  string and rejects anything else.
- **AC-4.** Every table carries `created_at` and `updated_at`, both defaulting
  to `now()`, and updating any row advances `updated_at` without the writer
  supplying it.

## Enumerations

- **AC-5.** The `document_type` enum admits exactly `spec`, `acceptance` and
  `other`, and rejects any other value at insert time rather than at read time.
- **AC-6.** The `http_method` enum admits exactly the five methods the admin API
  uses, in lower case.

## Referential integrity

- **AC-7.** Deleting a spec deletes its document links and leaves the documents
  themselves intact, because a document may outlive the spec that referenced it.
- **AC-8.** Deleting a contact deletes its messages: a message with no contact
  is not a record, it is a leak.
- **AC-9.** An audit-log entry may reference no API key, so that an
  unauthenticated admin request remains auditable.

## Content

- **AC-10.** Every entity linking to a document has at least one fixture whose
  document holds non-empty, representative content, and the stored size equals
  the byte length of that content.
- **AC-11.** Reading a document's content back returns the bytes that were
  written, unchanged: no encoding round-trip, no truncation, no normalisation of
  line endings.

## Seeding

- **AC-12.** Seeding a migrated database is atomic: a fixture that fails
  validation leaves the database exactly as it was, and validation completes
  before the first statement is issued.
- **AC-13.** Seeding twice in a row yields the same database state as seeding
  once.
