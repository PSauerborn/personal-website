# SPEC-002: API

**Spec ID**: SPEC-002

**Spec Date**: 2026-08-01

## 1. Spec Statement

As a frontend developer I want an API that I can use to access the database so that I can display data stored in the database.

## 2. Context and Background

The goal of this spec is to develop a Golang REST API that can be accessed by the frontend to serve CV, agent, and blog data stored in the PostgreSQL database. The API should surface the following public endpoints:

| Endpoint | Description | Request Body | Response Schema |
| -------- | ----------- | ------- | -------- |
| `GET /v1/health` | Executes health check on API and required services | N/A | § 6.1.1 |
| `GET /v1/version` | Fetches API version | N/A | § 6.1.2 |
| `GET /v1/cv` | Fetches CV data from DB, returning skills, experiences, and education. |  N/A | § 6.1.3 |
| `GET /v1/agents/list` | Fetches subagents used in development flow. | N/A | § 6.1.4  |
| `GET /v1/agents/specs/list` | Fetches list of specs available for display. Only spec metadata is returned. | N/A | § 6.1.5 |
| `GET /v1/agents/specs/:id/:document_id` | Fetches spec content using provided spec and document ID.   | N/A | § 6.1.6 |
| `POST /v1/messages` | Creates a new message in the database. Contact created if not already exists. | § 6.1.7 | § 6.1.7 |
| `GET /v1/articles/list` | Lists all articles available. Only article metadata is returned. | N/A | § 6.1.8 |
| `GET /v1/articles/:article_id/content` | Fetches article content using the provided article ID. | N/A | § 6.1.9 |
| `GET /v1/articles/:article_id/comments` | Lists all comments made against an article. | N/A | § 6.1.10 |
| `POST /v1/articles/:article_id/comment` | Creates a new comment against a provided article. | § 6.1.11 | § 6.1.11 |
| `GET /v1/projects/list` | Lists all projects. | N/A | § 6.1.12 |

## 3. Scope Definitions

### 3.1 In Scope

- Implementation of public REST API endpoints
- Implementation of DB interface used to interact with PostgreSQL data model
- API documentation

### 3.2 Out of Scope

- Updating of DB schema or alembic migrations
- Implementation of frontend
- Implementation of terraform or CI pipelines
- Implementation of Dockerfile(s) for deployment.

## 4. Requirements

### 4.1 - HTTP Layer

- **REQ-1.1**: The following routers must be attached to the main `gin` engine with the given prefixes: Base (`/v1`), CV (`/v1/cv`), Articles (`/v1/articles`), Agents (`/v1/agents`), Messages (`/v1/messages`), and Projects (`/v1/projects`).
- **REQ-1.2**: The API must have CORS enabled by default. See § 6.2 for CORS configuration.
- **REQ-1.3**: The base router must expose the `GET /v1/health` and `GET /v1/version` endpoints.
- **REQ-1.4**: All other router groups must be created from the base router group, ensuring that the routing prefix(es) are included on all endpoints.
- **REQ-1.5**: The `GET /v1/health` must validate the health/connection of the postgres connection as well as the health/responsiveness of the API. Requests that fail a database health check must be returned as a `500` response.

### 4.2 - CV Router

- **REQ-2.1**: The CV router must be mounted on the `/v1/cv` prefix and must expose the `GET /v1/cv` endpoint.
- **REQ-2.2**: `GET /v1/cv` must return the complete CV as a single response containing experience, education entries, and skills grouped by category. The response schema is defined in § 6.1.3.
- **REQ-2.3**: Each experience entry must be returned as a single aggregate containing its responsibilities and its stack items, joined from the underlying tables. The API must not require the caller to make additional requests to resolve responsibilities or stack items.
- **REQ-2.4**: Experience and education entries must be returned sorted by start date in descending order. Entries with a null end date must be treated as current roles/courses.
- **REQ-2.5**: An empty CV (no experience or education records) must return `200` with empty collections, and an empty skills map.
- **REQ-2.6**: Skills must be be grouped by their linked category and returned as a map, where each key is a category with a slice of strings value giving the skills. The slice must contain each mapped tech stack item. Tech stack items **not** mapped to a category must not be returned.

### 4.3 - Articles Router

- **REQ-3.1**: The articles router must be mounted on the `/v1/articles` prefix and must expose the endpoints:
    - `GET /v1/articles/list`
    - `GET /v1/articles/:article_id/content`
    - `GET /v1/articles/:article_id/comments`
    - `POST /v1/articles/:article_id/comment`

- **REQ-3.2**: `GET /v1/articles/list` must return article metadata only (never document content), including the topics linked to each article. Articles with `display` set to `false` must be excluded from the public listing. Articles that do not have a document linked must not be returned.
- **REQ-3.3**: `GET /v1/articles/:article_id/content` must return the content of the `Document` linked to the article via the `document_id` attribute.
- **REQ-3.4**: `GET /v1/articles/:article_id/comments` must return all comments recorded against the given article, sorted by creation time in ascending order. An article with no comments must return `200` with an empty collection.
- **REQ-3.5**: `POST /v1/articles/:article_id/comment` must create a new comment against the given article. The comment author is optional; where omitted the comment must be persisted with a null author. If provided, the comment author must be sanitized (whitespace trimmed, first letter of each word capitalized). Empty comments must be rejected with a `400` response.
- **REQ-3.6**: Any request referencing an `article_id` that does not exist must be rejected with a `404`.
- **REQ-3.7**: Articles with `display` set to `false`, and articles that do not have a document linked, must be treated as non-existent by all endpoints in this router. Requests referencing them must be rejected with the same `404` response as REQ-3.6, so that the API does not disclose whether the article exists.

### 4.4 - Agents Router

- **REQ-4.1**: The agents router must be mounted on the `/v1/agents` prefix and must expose the endpoints:
    - `GET /v1/agents/list`
    - `GET /v1/agents/specs/list`
    - `GET /v1/agents/specs/:id/:document_id`

- **REQ-4.2**: `GET /v1/agents/list` must return the complete subagent catalogue, including the `inputs` and `outputs` schemas for each agent. Agents with no declared input or output schema must return an empty object for those fields rather than omitting them.
- **REQ-4.3**: `GET /v1/agents/specs/list` must return spec metadata only and must not return spec content.
- **REQ-4.4**: Specs must by linked to one or more documents, each of which have a `document_type` attribute. Each spec must be linked to at most **one** document with `document_type=spec`. This is the primary spec document associated with the spec. Any number of additional supporting documents (including those with `document_type=acceptance`) can be attached to a spec. Each metadata entry returned by `GET /v1/agents/specs/list` must list all documents linked to each spec.
- **REQ-4.5**: Specs with a primary spec document that is marked as `restricted` must **not** be included in the `GET /v1/agents/specs/list` response.
- **REQ-4.6**: Specs with a supporting document that is marked as `restricted` must be included in the `GET /v1/agents/specs/list` response. The document list for that spec must **not** include any supporting documents that are marked as `restricted`.
- **REQ-4.7**: Specs with `display` set to `false` must not be returned to non-admin users. Specs that do not have a document with document type `spec` linked must not be returned.
- **REQ-4.8**: `GET /v1/agents/specs/:id/:document_id` must return the content of a given file linked to the spec, identified by spec ID `:id` and document ID `:document_id`. Specs are stored as `Document` entities and must be resolved through the persistence layer. If either the spec ID or document ID does not exist, the request must be rejected with a `404` response. If the document ID provided exists, but is not linked to the spec with provided spec ID, the request must be rejected with a `404` response.
- **REQ-4.9**: A request for a spec ID that does not exist must be rejected with a `404`.
- **REQ-4.10**: If the document specified by `GET /v1/agents/specs/:id/:document_id` has `restricted=true`, it must **not** be returned by the API. The API must reject the request with a `404`.

### 4.5 - Messages Router

- **REQ-5.1**: The messages router must be mounted on the `/v1/messages` prefix and must expose the endpoints:
    - `POST /v1/messages`

- **REQ-5.2**: `POST /v1/messages` must accept the contact details alongside the message content. Where a contact with the supplied email address does not already exist it must be created in the `base.contact` table; where it does exist, the message must be linked to the existing contact and no duplicate contact may be created. Existence must be determined entirely by the email address.
- **REQ-5.3**: All email addresses **must** be converted to lower case before database insertion/lookup to ensure that duplicate contacts are not created due to casing differences. Inputs must be sanitized before inserting into the database (trim trailing whitespace, emails to lowercase, names and Orgs must have first letter capitalized).
- **REQ-5.4**: Contact creation and message creation in `POST /v1/messages` must occur within a single transaction so that a failure to persist the message does not leave an orphaned contact.
- **REQ-5.5**: New messages must be persisted with `read` set to `false` and `submitted_at` set to the server-side UTC receipt time. Client-supplied values for either field must be ignored.
- **REQ-5.6**: Requests that fail validation (invalid email regex, empty message or name) must be rejected with a `400` response.

### 4.6 - Projects Router

- **REQ-6.1**: The projects router must be mounted on the `/v1/projects` prefix and must expose the endpoints:
    - `GET /v1/projects/list`

- **REQ-6.2**: The `GET /v1/projects/list` must list all available projects. Projects that have `display=false` must **not** be returned.

### 4.7 - Documentation

- **REQ-7.1**: All endpoints must be documented in an OpenAPI compatible format. Documentation must be stored at `docs/openapi.yaml`.
- **REQ-7.2**: A Postman collection must be created for all endpoints. The collection must be stored at `docs/postman/collection.json`.

## 5. Acceptance Criteria

Acceptance criteria live in `acceptance/features/`, organized by capability rather
than by spec. Scenarios verifying this spec are tagged `@spec-002` and can be run
in isolation using `godog --tags='@spec-002'`.

Feature files are cross-cutting by design — feature files contain scenarios tagged with other spec IDs. Scenarios can also be tagged with multiple specs IDs. The tag, not the file, is the unit of ownership. Only scenarios tagged with `@spec-002` should be considered included as acceptance criteria for this spec.

The following table maps scenarios to requirements.

| Criterion ID | Requirement ID | Scenario (tagged `@spec-002`) |
| ------------ | -------------- | ----------------------------- |
| AC-1         | REQ-1.2     | A preflight request is made from an allowed origin |
| AC-2         | REQ-1.2     | A preflight request is made from a disallowed origin |
| AC-3         | REQ-1.2     | A request is made from an allowed origin |
| AC-4         | REQ-1.3     | A request is made to check the health of the API |
| AC-5         | REQ-1.3     | A request is made to check the version of the API |
| AC-6         | REQ-1.5     | A request is made to check the health of the API when some dependent services are down |
| AC-7         | REQ-2.2     | A request is made to retrieve CV |
| AC-8         | REQ-2.3     | Experience entries are returned as complete aggregates |
| AC-9         | REQ-2.4     | Entries are ordered by start date, most recent first |
| AC-10        | REQ-2.4     | An ongoing role is returned as current |
| AC-11        | REQ-2.5     | An empty CV returns empty collections |
| AC-12        | REQ-2.6     | Headline skills are grouped by category |
| AC-13        | REQ-2.6     | Tech stack items without a category are not returned as skills |
| AC-14        | REQ-3.2     | A request is made to list blog posts |
| AC-15        | REQ-3.2     | A blog post without a linked document is not listed |
| AC-16        | REQ-3.3     | A request is made to get the content of a visible blog post |
| AC-17        | REQ-3.4     | A request is made to list comments associated with a visible blog post |
| AC-18        | REQ-3.4     | Comments are returned oldest first |
| AC-19        | REQ-3.4     | A request is made to list comments for a blog post that has none |
| AC-20        | REQ-3.5     | A request is made to create a new comment |
| AC-21        | REQ-3.5     | A request is made to create a new anonymous comment |
| AC-22        | REQ-3.6     | A request is made against a blog post that does not exist |
| AC-23        | REQ-3.7     | A request is made to get the content of a hidden blog post |
| AC-24        | REQ-3.7     | A request is made to list comments associated with a hidden blog post |
| AC-25        | REQ-4.2     | A request is made to list subagents |
| AC-26        | REQ-4.2     | A subagent without declared schemas returns empty schema objects |
| AC-27        | REQ-4.3, REQ-4.4, REQ-4.6, REQ-4.7 | A request is made to list specs |
| AC-28        | REQ-4.7     | A spec without a linked spec document is not listed |
| AC-29        | REQ-4.5     | A spec with a linked spec document that is restricted is not listed |
| AC-30        | REQ-4.6     | A restricted document is omitted from the spec |
| AC-31        | REQ-4.8     | A request is made to get the content of a spec |
| AC-32        | REQ-4.9     | A request is made against a spec that does not exist |
| AC-33        | REQ-5.2     | A new visitor submits a contact message |
| AC-34        | REQ-5.2     | An existing contact submits a contact message |
| AC-35        | REQ-5.2     | A visitor submits a contact message without an organization |
| AC-36        | REQ-5.3     | Submitted contact details are sanitized before persistence |
| AC-37        | REQ-5.6     | The API rejects malformed submissions |
| AC-38        | REQ-5.5     | Client supplied read and submitted_at values are ignored |
| AC-39        | REQ-6.2     | A request is made to list projects |
| AC-40        | REQ-6.2     | A project without a GitHub link is listed |
| AC-41        | REQ-3.5     | A submitted comment author is sanitized before persistence |
| AC-42        | REQ-3.5     | The API rejects an empty comment |


### 5.1 Additional Acceptance Criteria

| Criterion ID | Requirement ID | Description |
| AC-42 | REQ-7.1 | OpenAPI documentation for **all** endpoints located at `docs/openapi.yaml` |
| AC-43 | REQ-7.2 | Postman collection for **all** endpoints located at `docs/postman/collection.json` |


## 6. Contracts and Constraints

### 6.1 - API Response Schemas

API requests and responses must be submitted/return as `content-type: application/json` respectively with status code `200` unless unless explicitly specified otherwise.


#### 6.1.0

Error responses must use the following envelope:

```jsonc
{
    "error": "String", //. Error code i.e. Internal Server Error, Bad Request etc
    "details": "String" // details on why the response failed
}
```

The `details` attribute must not contain any sensitive information, or details that provide insights into the structure of the API, database schema, or other internal architecture. If in doubt, a generic error message must be returned.

`4xx` error responses due to request body validation must include the name of the field that failed to be validates, as well as the reason for failure.

#### 6.1.1 - `GET /v1/health`

**Request Schema**: N/A

**Response Schema**

```jsonc
// status code: 200
{
    "status": "OK"
}
```

```jsonc
// status code: 500
{
    "error": "Internal Server Error",
    "details": "Something went wrong" // details on why service is unavailable
}
```

#### 6.1.2 - `GET /v1/version`

**Request Schema**: N/A

**Response Schema**

```jsonc
// status code: 200
{
    "version": "v1"
}
```

#### 6.1.3 - `GET /v1/cv`

**Request Schema**: N/A

**Response Schema**

```jsonc
// status code: 200
{
    "skills": {
        "category1": [],
        "category2": []
    },
    "experience": [
        {
            "id": "String",
            "start_date": "Date",
            "end_date": "Date", // nullable if current
            "organization": "String",
            "job_title": "String",
            "description": "String",
            "tech_stack": [], // string array of tech stacks
            "responsibilities": [] // string array of job responsibilities
        }
    ],
    "education": [
        {
            "id": "String",
            "institution": "String",
            "certificate": "String", // type of certificate i.e. bsc, masters, phd
            "start_date": "Date",
            "end_date": "Date", // nullable if current
        }
    ]
}
```


#### 6.1.4 - `GET /v1/agents/list`

**Request Schema**: N/A

**Response Schema**

```jsonc
{
    "agents": [
        {
            "id": "String", // ID of subagent
            "name": "String", // name of subagent
            "description": "String", // agent description
            "inputs": {},
            "outputs": {}
        }
    ]
}
```

#### 6.1.5 - `GET /v1/agents/specs/list`

**Request Schema**: N/A

**Response Schema**

```jsonc
{
    "specs": [
        {
            "id": "String",
            "display_name": "String",
            "description": "String", // description of what spec provided
            "documents": [
                {
                    "filename": "String",
                    "document_id": "String",
                    "document_type": "Enum", // either sec, acceptance, or other
                }
            ]
        }
    ]
}
```

#### 6.1.6 - `GET /v1/agents/specs/:id/:document_id`

**Request Schema**: N/A

**Response Schema**

Raw binary content must be returned as `binary/octet-stream` content type.

#### 6.1.7 - `POST /v1/messages`

**Request Schema**:

```jsonc
{
    "email": "String", // must be converted to lowercase
    "name": "String", // must be sanitized
    "organization": "String", // nullable,
    "message": "String",
}
```

**Response Schema**

```jsonc
// response status code: 201
{
    "message_id": "String" // ID of message inserted into DB
}
```

#### 6.1.8 - `GET /v1/articles/list`

**Request Schema**: N/A

**Response Schema**

```jsonc
{
    "articles": [
        {
            "id": "String",
            "title": "String",
            "description": "String",
            "author": "String",
            "topics": [], // array of strings
            "created_at": "String", // ISO8601 timestamp
        }
    ]
}
```

#### 6.1.9 - `GET /v1/articles/:article_id/content`

**Request Schema**: N/A

**Response Schema**

Raw binary content must be returned as `binary/octet-stream` content type.

#### 6.1.10 - `GET /v1/articles/:article_id/comments`

**Request Schema**: N/A

**Response Schema**

```jsonc
{
    "article_id": "String",
    "comments": [
        {
            "author": "String", // nullable
            "comment": "String",
            "created_at": "Datetime" // ISO8601 string
        }
    ]
}
```

#### 6.1.11 - `POST /v1/articles/:article_id/comment`

**Request Schema**:

```jsonc
{
    "author": "String", //nullable
    "comment": "String", // must be non-empty string
}
```

**Response Schema**

```jsonc
// response status code: 201
{
    "comment_id": "String"
}
```

#### 6.1.12 - `GET /v1/projects/list`

**Request Schema**: N/A

**Response Schema**

```jsonc
{
    "projects": [
        {
            "id": "String",
            "name": "String",
            "description": "String",
            "primary_link": "String",
            "github_link": "String", // nullable
        }
    ]
}
```

### 6.2 - CORS Configuration

CORS endpoints must return a `204` error code.

**Allowed Origins**:

- http://localhost:9000 - local development URL
- https://psauerborn.dev - production domain
- https://dev.psauerborn.dev - development domain

**Allowed Headers**:

- Content-Type
- Accept
- Accept-Language
- Content-Language

**Allowed Methods**:

- GET
- POST
- PATCH
- PUT
- DELETE
- OPTIONS

## 7. Edge Cases and Error Handling

- **Unhandled error when processing requests**: Unhandled errors such as database health errors must be returned as `500` responses with `{error: 'Internal Server Error', 'details': 'Something went wrong.'}`.
- **Malformed request bodies**: Malformed request bodies must be rejected with a `400` response and must include a reason for th rejection.

## 8. Infrastructure Requirements

Infrastructure for deployment is provided in a separate spec.

## 9. External Resources

| Filepath | Description | When to use |
|----------|-------------|-------------|
| docs/db_schema.md | DB schema definitions for PostgreSQL tables. | Use when developing code that interacts with DB. |
