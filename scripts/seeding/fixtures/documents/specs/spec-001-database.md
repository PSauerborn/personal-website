# SPEC-001 — Database and Schema

The database is the first component of this site to be specified, because every
other component is a projection of it. The API serves rows, the frontend renders
what the API serves, and the acceptance suite asserts against both. A schema
that is wrong in the small is wrong everywhere else in the large.

## 1. Principles

- **One schema, one namespace.** Every table lives in the `base` schema. The
  public schema is left empty, so a missing search path fails loudly rather than
  resolving to a half-populated namespace.
- **UUIDv7 primary keys.** Every primary key is a UUIDv7 stored as 32 lower-case
  hex characters without hyphens. The keys are time-ordered, so index locality
  survives insert-heavy workloads, and they are opaque, so nothing downstream is
  tempted to infer meaning from an integer sequence.
- **Nullability is a statement.** A nullable column means "this may legitimately
  be unset", never "we have not decided yet". An unset value is `NULL`, never an
  empty string.
- **Timestamps are server-side.** `created_at` and `updated_at` default to
  `now()` and are maintained by a trigger. Application code does not set them,
  which means it cannot forget to.

## 2. Entities

The schema divides into five groups:

1. **Content** — articles, topics, comments and the documents holding article
   bodies.
2. **Catalogue** — agent specs, the documents linked to them, and the subagent
   registry.
3. **CV** — experiences, their responsibilities, the technology stack, and the
   skill categories that group it.
4. **Contact** — contacts and the messages they submit.
5. **Administration** — API keys and the audit log of authenticated admin
   requests.

Documents are shared: an article body and a spec document are rows of the same
`document` table, distinguished only by which entity links to them. Content is
stored as `BYTEA` and served back verbatim, and `size` is the byte length of
that content, recorded at write time so that a listing never has to read the
body to describe it.

## 3. Links

Many-to-many relationships are modelled with explicit link tables, each with its
own primary key rather than a composite of the two sides. A link is a row like
any other: it can be audited, referenced and deleted without the surrounding
code having to reconstruct a compound identifier.

Documents linked to a spec additionally carry a type — `spec`, `acceptance` or
`other` — because the role a document plays for a spec is a property of the
relationship, not of the document.

## 4. Restriction and Visibility

Two independent flags control what a visitor sees:

- `display` on the owning entity decides whether the entity is listed at all;
- `restricted` on a document decides whether that document is described to
  anyone without an API key.

They are deliberately separate. A visible spec may carry a restricted
attachment, and a hidden spec may consist entirely of public documents that
simply are not ready to be advertised.

## 5. Migrations

The schema is owned by Alembic. Every change is a numbered revision, revisions
are never edited after they are merged, and the initial revision creates the
full schema in one transaction. Downgrade paths exist and are exercised, because
a migration that cannot be reversed is a migration nobody dares to run.
