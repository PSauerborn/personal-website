# SPEC-001: Database and Schema

**Spec ID**: SPEC-001

**Spec Date**: 2026-08-04

## 1. Spec Statement

As an operator I want a PostgreSQL database schema and alembic migrations so that I can create, manage, and develop against the database storing client contact information and blog data.

## 2. Context and Background

This spec is the first in a series of specs to create a new personal website that will host CV data, client contact forms, agent indexes, blog data, and more. Much of this data needs to be persisted in PostgreSQL. The aim of this spec is to create a set of alembic migrations that defines the initial table definitions, and manages the database used by the API.

The following entities need to be stored in the postgres instance:

 - Contacts - clients (prospective or otherwise) that have gotten in touch via the website forms.
 - Contact requests - messages received by contacts regarding services, website content/feedback, or other.
 - Blog metadata - article metadata (title, topics, date, author etc)
 - Blog comments
 - Agent catalogue & specs used during development
 - Projects - personal and company projects with descriptions and links
 - CV data (Experience/Education/Skills)
 - Documents - generic document store
 - API Keys - used by admins to access admin restricted endpoints
 - Admin Audit Log - maintains audit trail of admin actions

Additionally, this spec defines a script that can be used to seed the database with a series of test fixtures for integration testing.

## 3. Scope Definitions

### 3.1 In Scope

 - PostgreSQL schema design
 - Implementation of alembic migrations
 - Database seeding script

### 3.2 Out of Scope

- Implementation of API, UI, or terraform

## 4. Requirements

### 4.1 - Alembic Migrations

- **REQ-1.1**: PostgreSQL tables must be created and managed via `alembic` and `sqlalchemy`. A single migration must be created that defines the initial tables.
- **REQ-1.2**: The `upgrade` command within the revision must create the `base` schema, and the tables required to model all required entities. See § 6.1 for a complete list of entities and their fields.
- **REQ-1.3**: The `downgrade` command within the revision must drop the created `base` schema and any residual entities (enum types, triggers etc).
- **REQ-1.4**: A dockerfile must be created that runs the alembic migrations via a python wrapper script. PostgreSQL connection settings must be provided as environment variables. This will be used to create a kubernetes job that runs database migrations in a future spec. The wrapper script must retrieve the revision ID from the `ALEMBIC_REVISION` environment variable. The alembic command i.e. `(upgrade|downgrade)` must be retrieved from the `ALEMBIC_COMMAND` environment variable. Both variables must be set. If either variable is not set, the wrapper script must raise an exception.
- **REQ-1.5**: A `Makefile` must be included to build and run the alembic migrations container. Environment variables for PostgreSQL connection details must be passed through from the parent shell to the container using the `-e` flag in the `docker run` command i.e. `docker run -e POSTGRES_HOST ...`. A single make command called `run-migrations` must be made available via the `Makefile`.

### 4.2 - Database Seeding Script

- **REQ-2.1**: A python script must be created that seeds a PostgreSQL instance with test fixtures defined as JSON files. The python script must define a `pydantic` model for each domain-level entity, load the local JSON fixtures, and validate them via the `pydantic` models. The validated fixtures must then be inserted into the PostgreSQL table via the `psycopg` library.
- **REQ-2.2**: The script must use `argparse` to expose a `main` function via a command-line CLI. The CLI must accept the postgres connection details as arguments. Once ran, the JSON fixtures must be loaded from disk, parsed using the pydantic models, and inserted into the DB.
- **REQ-2.3**: Fixtures must be stored in JSON format as an array of objects. Fixtures must be seeded for all entities. JSON fixtures must be defined at the domain level, not the table level. For example, a complete CV experience entry is created by joining four tables (see § 6.1.6 for details) - the JSON fixtures must contain a single, constructed CV experience rather than 4 separate files for each table. Create separate files for separate domains. ID fields used for PKs must be present in all fixtures. See § 6.1 for details on PK generation.
- **REQ-2.4**: Data models must be defined using `pydantic` in python. Fixtures in local JSON files must be parsed and validated as `pydantic` models. `pydantic` models must be defined as the domain-aggregate entities, not one-model-per-table.
- **REQ-2.5**: The script must truncate every table that receives at least one row from any fixture file using `TRUNCATE ... CASCADE`. Tables not being seeded must not be truncated directly, but may be emptied as a cascade effect. Truncations should occur once per table before the first record is inserted. All inserts and truncations must occur in a single transaction committed to ensure that seeding is atomic and does not produce partially-seeded databases. This ensures that no database operations are executed unless all fixtures are successfully parsed, validated, and linked. The order of inserts must respect foreign key constraints defined on tables.
- **REQ-2.6**: A dockerfile must be created that runs the seeding script. PostgreSQL connection settings must be provided as environment variables. This will be used to create a kubernetes job that runs database seeding in a future spec.
- **REQ-2.7**: A `Makefile` must be included to build and run the seeding script container via a `seed` make target. Environment variables for PostgreSQL connection details must be passed through from the parent shell to the container using the `-e` flag in the `docker run` command i.e. `docker run -e POSTGRES_HOST ...`.
- **REQ-2.8**: Representative mock document contents must be created to entities that link back to the `base.document` table.

### 4.3 - Schema Documentation

- **REQ-3.1**: The database schema must be accompanied with comprehensive MD documentation that documents table schemas (fields, types, etc) as well as the entities (incl how they are modeled, and they're relationships to each other).
- **REQ-3.2**: Documentation must be provided in Markdown format in the `docs/db_schema.md` file. Markdown tables must be used to clearly display table schemas. Mermaid diagrams must be used to display a graph of all the modeled entities, and how the relationships are modelled between them.

## 5. Acceptance Criteria

This spec is an **enabler**: it delivers a database schema, migrations, and a seeding
script, none of which are observable through a user- or API-facing interface. The
acceptance suite in `acceptance/features/` is a black-box HTTP suite that runs against
a deployed API, with no database-level access. No scenario in that suite can assert against this spec's
deliverables directly.

**No scenarios are tagged `@spec-001`, and none should be.** Behavioural acceptance is
provided transitively by SPEC-002/3 via the API and UI acceptance criteria. The migrations and the seeding script are hard
preconditions for that suite, and every `@spec-002/3` scenario fails if either is broken.
The nullability and foreign-key constraints defined in § 6.1 are exercised specifically
by the `@spec-002/3` scenarios.

| Criterion ID | Requirement ID | Scenario (tagged `@spec-001`) |
| ------------ | -------------- | ----------------------------- |
| — | — | None — this spec is verified by the operational gates in § 5.1 |

### 5.1 Additional Acceptance Criteria

The requirements in § 4 are verified by the gates below rather than by Gherkin
scenarios. Each is binary and automatable. The `Verified by` column names the mechanism;
mechanisms marked **(to be created)** are themselves deliverables of this spec, since no
pipeline currently runs `alembic`.

| Criterion ID | Requirement | Criterion | Verified by |
| ------------ | ----------- | --------- | ----------- |
| AC-1 | REQ-1.1, REQ-1.2 | `alembic upgrade head` against an empty database exits `0` and creates the `base` schema plus every table, constraint, and enum type modelled in § 6.1, from a single revision. | Migration CI job **(to be created)** |
| AC-2 | REQ-1.3 | `alembic downgrade base` against a fully migrated database exits `0` and leaves no table, schema, enum type, or sequence created by the upgrade. | Migration CI job **(to be created)** |
| AC-3 | REQ-1.2, REQ-1.3 | An `upgrade head` → `downgrade base` → `upgrade head` round trip exits `0` at every step, and the schema after the second upgrade is byte-identical to the first (compared via `pg_dump --schema-only`). | Migration CI job **(to be created)** |
| AC-4 | REQ-1.4 | The migrations container exits non-zero with an explicit error naming the missing variable when either `ALEMBIC_REVISION` or `ALEMBIC_COMMAND` is unset. | Migration CI job **(to be created)** |
| AC-5 | REQ-1.4, REQ-1.5 | `make run-migrations` builds the migrations image, passes the `POSTGRES_*` variables through from the parent shell, runs the wrapper with the configured revision and command, exits `0`, and leaves the database at the requested revision. | `make run-migrations` **(to be created)** |
| AC-6 | REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.5 | Seeding a migrated database with valid fixtures exits `0`, truncates only tables receiving at least one row, and inserts every fixture record in foreign-key-safe order. | `make seed` **(to be created)** |
| AC-7 | REQ-2.4, REQ-2.5 | Seeding with a fixture that violates its `pydantic` model raises `ValidationError`, exits non-zero, and leaves the database byte-identical to its pre-run state — no partial writes. | `make seed` **(to be created)** |
| AC-8 | REQ-2.5 | Re-running the seeding script against an already-seeded database yields the same final row set as the first run. | `make seed` **(to be created)** |
| AC-9 | REQ-2.6, REQ-2.7 | `make seed` builds the seeding image, passes the `POSTGRES_*` variables through from the parent shell, and exits `0` with the database populated. | `make seed` **(to be created)** |
| AC-10 | REQ-2.8 | Every entity linking to `base.document` has at least one fixture carrying non-empty representative content, and that content is byte-identical when read back. | `make seed` **(to be created)** |
| AC-11 | REQ-3.1, REQ-3.2 | `docs/db_schema.md` exists, documents every table in § 6.1 as a Markdown table with field names and types, and contains at least one Mermaid diagram covering all modelled entities and their relationships. | Documentation review |

## 6. Contracts and Constraints

### 6.1 - Entities

The following entities need to be modelled. Data schemas are provided in JSON format. Columns must be assumed to be non-nullable unless explicitly marked as nullable.

All ID fields used for primary keys must be UUIDs with hyphens removed, stored as strings. UUIDv7 must be used to generate UUIDs for PKs. PKs must be stored as `VARCHAR(32)` types. UUIDs must be generated using the `uuid.uuidv7` function from the python `uuid` standard library module.

Timestamp fields must be stored as UTC date-time aware `TIMESTAMP WITH TIME ZONE` types, with `UTC` as the timezone.

All tables must following coding standard conventions and add the `created_at` and `updated_at` columns, with the appropriate triggers. Refer to coding standards for more details.

Secondary indexes must not be created on any tables or columns. The implicit indexes backing primary-key and unique constraints are nan exception.

#### 6.1.1 Contact

**Description**: Entity modeling people that have requested to be contacted via the website. Contains basic contact information such as email address, name, and organization.

**Data Model**:

```jsonc
// table name: base.contact
// entity description: contacts that have submitted one or more messages

{
    "id": "String", // ID of contact. Used as PK in table
    "name": "String", // name of contact.
    "email": "String", // email of contact. Must be unique. Enforce with constrain.
    "organization": "String", // organization of contact. optional, null if not provided.
}
```

#### 6.1.2 Message

**Description**: Entity modelling message that has been received from a contact. Links back to contact via `contact_id` attribute.

**Data Model**:

```jsonc
// table name: base.message
// entity description: messages submitted by contacts

// - foreign key constraints on contact_id. cascade on delete.
{
    "id": "String", // ID of message. Used as PK in table
    "contact_id": "String", // ID of contact that message belongs to.
    "content": "String", // content of message
    "read": "Boolean", // boolean flag; true if message has been marked as read else false. default to false
    "submitted_at": "Timestamp" // ISO8601 string
}
```

#### 6.1.3 Article

**Description**: Entity modeling a blog articles including comments.. Blog article contents are represented as `Document` entities, and must be linked back to articles via the `document_id` column. A table for topics must be created, and a link table linking one or more topics to an article.

**Data Model**:

```jsonc
// table name: base.topic
// entity description: topis for articles i.e. news, infrastructure, terraform, python, pipelines etc. name must be unique.

// - uniqueness constraint on name.
{
    "id": "String",
    "name": "String",
    "description": "String", // optional, null if not present
}
```

```jsonc
// table name: base.article
// entity description: article metadata including title, author, and description.

// - foreign key constraint on document_id. cascade on delete.
{
    "id": "String", // ID of article. Used as PK in table
    "author": "String", // author of article
    "display": "Boolean", // boolean flag used to control article visibility. default to true
    "title": "String", // title of article
    "description": "String", // short description of contents
    "document_id": "String", // ID of document containing content, nullable
    "authored_at": "Timestamp" // ISO8601 string
}
```

```jsonc
// table name: base.topic_article_link
// entity description: links topics to articles

// - unique constraint on (topic_id, article_id)
// - foreign key constraint on topic_id. cascade on delete.
// - foreign key constraint on article_id. cascade on delete.
{
    "id": "String", //
    "topic_id": "String", // links back to topic lookup table
    "article_id": "String" // links back to article ID
}
```

```jsonc
// table name: base.article_comment
// entity description: comments made on articles

// - foreign key constraint on article_id. cascade on delete.
{
    "id": "String",
    "comment": "String",
    "author": "String", // nullable
    "article_id": "String" // links back to article
}
```

#### 6.1.4 Document

**Description**: Entity modeling generic blob store. Blobs are linked back to other resources via explicit link columns or separate link tables. This ensures that the document table does not require additional link attributes.

**Data Model**:

```jsonc
// table name: base.document
// entity description: raw document content
{
    "id": "String",
    "filename": "String",
    "size": "Int", // size of file in bytes
    "restricted": "Boolean", // false if file is public, true if restricted to admins. default is true.
    "content": "Binary" // blob stored in PG server as BYTEA type
}
```

#### 6.1.5 Subagent

**Description**: Entity modeling subagent used in agentic, spec-driven workflow. Used to populate agent catalogue in UI.

**Data Model**:

```jsonc
// table name: base.subagent
// entity description: agent catalogue entry
{
    "id": "String", // ID of subagent
    "name": "String", // name of subagent
    "description": "String", // agent description
    "inputs": "JSONb", // input schema for agent. nullable.
    "outputs": "JSONb" // output schema for agent. nullable.
}
```

**NOTE**: the `JSONb` columns in the subagent table go against coding standard `[PG-014]`.

#### 6.1.6 CV Experience

**Description**: Entity modeling an entry in an experience section of a CV. Each CV entry has a series of stack items associated with them. Stack items are shared across experiences and must be stored in a lookup table. A link table must be maintained that links a CV experience item with 0 or more stack items.

**Data Model**:

```jsonc
// table name: base.cv_stack_item
// entity description: stack items related to a work experience i.e. golang, terraform, aws

// - uniqueness constraint on name
{
    "id": "String",
    "name": "String"
}
```

```jsonc
// table name: base.cv_experience
// entity description: work experience entry for a CV
{
    "id": "String",
    "organization": "String",
    "job_title": "String",
    "start_date": "Date",
    "end_date": "Date", // nullable if current
    "description": "String"
}
```

```jsonc
// table name: base.cv_experience_responsibility
// entity description: responsibility for a CV work experience entry.

// - foreign key constraint on experience_id. cascade on delete.
{
    "id": "String",
    "experience_id": "String", // links back to cv experience
    "description": "String", // free text field describing job responsibility
}
```

```jsonc
// table name: base.cv_stack_item_experience_link
// entity description: links a series of stack items to a given experience

// - unique constraint on (stack_item_id, experience_id)
// - foreign key constraint on stack_item_id. cascade on delete.
// - foreign key constraint on experience_id. cascade on delete.
{
    "id": "String", //
    "stack_item_id": "String", // links back stack item lookup table
    "experience_id": "String" // links back to cv experience
}
```

#### 6.1.7 CV Education

**Description**: Entity modeling an entry in an education section of a CV

**Data Model**:

```jsonc
// table name: base.cv_education
// entity description: education entry on CV
{
    "id": "String",
    "institution": "String",
    "certificate": "String", // type of certificate i.e. bsc, masters, phd
    "start_date": "Date",
    "end_date": "Date", // nullable if current
}
```

#### 6.1.8 API Keys

**Description**: API keys are used by admin users to access restricted admin features.

**Data Model**:

```jsonc
// table name: base.api_key
// entity description: API keys used by admins to authenticate
{
    "id": "String",
    "api_key": "String", // hashed API key using sha256. Do not store plaintext.
    "description": "String",
    "issued_at": "Timestamp",
    "expires_at": "Timestamp", // nullable
    "issued_for": "String" // user API key was issued to
}
```

#### 6.1.9 Admin Audit Log

**Description**: Requests made to admin endpoints are logged in PostgreSQL to track which functions are being accessed.

**Data Model**:

```jsonc
// table name: base.admin_audit_log
// entity description: audit log entries for admin authenticated requests

//  - foreign key constraint on api_key_id. do not cascade on delete
{
    "id": "String",
    "api_key_id": "String",
    "endpoint": "String",
    "method": "Enum", // Postgres native ENUM (get|post|put|patch|delete)
    "status_code": "Integer",
    "payload": "JSONb", // nullable
    "response": "JSONb", // nullable
}
```

#### 6.1.10 Agent Specs

**Description**: Specs used by agents during development process to create website. Specs can have multiple documents linked in addition to the primary MD document. Acceptance criteria for instance are stored separately.

**Data Model**:

```jsonc
// table name: base.agent_spec
// entity description: metadata for spec document used by agents to generate code.
{
    "id": "String",
    "display_name": "String",
    "description": "String", // description of what spec provided
    "display": "Boolean", // boolean flag used to control spec visibility. default to true
}
```

```jsonc
// table name: base.agent_spec_document_link
// entity description: link table linking documents to specs. specs can have one
// or more documents linked.

// - foreign key constraint on document_id. cascade on delete.
// - foreign key constraint on spec_id. cascade on delete.
{
    "id": "String",
    "spec_id": "String", // links back to base.agent_spec table
    "document_id": "String", // links back to base.document table
    "document_type": "Enum" // Postgres native enum, one of (spec|acceptance|other)
}
```

#### 6.1.11 CV Skills

**Description**: CV skills grouped by category i.e. Programming Languages, CI/CD, Database Technologies

**Data Model**:

```jsonc
// table name: base.cv_skill_category
// entity used to store categories for CV skill groupings
{
    "id": "String",
    "category": "String", // i.e. Programming Languages, CI/CD, Database Technologies
}
```

```jsonc
// table name: base.cv_stack_item_category_link
// entity used to link skill groupings to stack item entries

// - foreign key constraint on category_id. cascade on delete.
// - foreign key constraint on stack_item_id. cascade on delete.
// - uniqueness constraint on (category_id, stack_item_id)
{
    "id": "String",
    "category_id": "String",
    "stack_item_id": "String"
}
```

#### 6.1.12 Projects

**Description**: Personal and company projects, with descriptions, and links.

**Data Model**:

```jsonc
// table name: base.project
// entity used to store company and personal projects

{
    "id": "String",
    "name": "String",
    "description": "String",
    "primary_link": "String",
    "github_link": "String", // nullable
    "display": "Boolean", // default to true
}
```

### 6.2 - Directories

Use the following local directories for source code:

 - `alembic/` for alembic migrations
 - `scripts/seeding/` for seeding script
 - `scripts/seeding/fixtures/` for JSON fixtures

## 7. Edge Cases and Error Handling

N/A

## 8. Infrastructure Requirements

N/A

## 9. External Resources

N/A
