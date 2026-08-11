# SPEC-004: Admin API Endpoints

**Spec ID**: SPEC-004

**Spec Date**: 2026-08-01

## 1. Spec Statement

As a admin I want a set of admin-authenticated endpoints that I can access with an API key so that I can access and manage resources stored in the database.

## 2. Context and Background

The goal of this spec is to develop the admin functionality within the REST API required to manage articles, specs, contacts, and more. The API should surface the following admin-authenticated endpoints:

| Endpoint | Description | Request Body | Response Schema |
| -------- | ----------- | ------- | -------- |
| `GET /v1/contacts/list` | Fetches a list of contacts. Admin only. |  N/A | § 6.1.12 |
| `GET /v1/messages/list` | Fetches a list of messages. Admin only.  | N/A | § 6.1.13 |
| `GET /v1/messages/:contact_ref` | Fetches a list of messages for a given contact (either ID or email). Admin only.  | N/A | § 6.1.14 |
| `POST /v1/articles` | Create a new article. Admin only.  | § 6.1.15 | § 6.1.15 |
| `PUT /v1/articles/:article_id` | Update article metadata. Admin only.  | § 6.1.15 | § 6.1.15 |
| `PUT /v1/articles/:article_id/content` | Update article file contents. Admin only.  | § 6.1.16 | § 6.1.16 |
| `PATCH /v1/articles/:article_id/visibility` | Toggle visibility of article. Admin only. | § 6.1.17 | § 6.1.17 |
| `DELETE /v1/articles/:article_id` | Delete article. Admin only.  | § 6.1.15 | § 6.1.15 |
| `POST /v1/agents/specs` | Create a new spec. Admin only. | § 6.1.18 | § 6.1.18 |
| `PUT /v1/agents/specs/:spec_id` | Update spec metadata. Admin only. | § 6.1.18 | § 6.1.18 |
| `PUT /v1/agents/specs/:spec_id/content` | Update spec file contents. Admin only. | § 6.1.19 | § 6.1.19 |
| `PATCH /v1/agents/specs/:spec_id/visibility` | Toggle visibility of spec. Admin only. | § 6.1.20 | § 6.1.20 |
| `DELETE /v1/agents/specs/:spec_id` | Delete a spec. Admin only. | § 6.1.18 | § 6.1.18 |
| `POST /v1/projects` | Create a new project. Admin only. | 6.1.21  | 6.1.21 |
| `PUT /v1/projects/:project_id` | Update project. Admin only. | N/A | N/A |
| `PATCH /v1/projects/:project_id` | Toggle visibility of project. Admin only. |6.1.22 | 6.1.22 |
| `DELETE /v1/projects/:project_id` | Delete a project. Admin only. | N/A | N/A |

Admin endpoint should be authenticated using API keys stored and maintained in the database.

## 3. Scope Definitions

### 3.1 In Scope

- Implementation of admin-authenticated REST API endpoints
- Implementation of DB interface used to interact with PostgreSQL data model
- Implementation of middleware to restrict admin endpoints
- API documentation

### 3.2 Out of Scope

- Updates to public REST API endpoints
- Updating of DB schema or alembic migrations
- Implementation of frontend
- Implementation of terraform or CI pipelines
- Implementation of Dockerfile(s) for deployment.

## 4. Requirements

### 4.1 - Admin Authentication

- **REQ-1.1**: Middleware must be created to restrict admin endpoints to requests that provide a valid API key in the `X-Api-Key` header.
- **REQ-1.2**: API keys must be hashed using `sha256` and compared against the list of pre-hashed API keys stored in the database. Requests that do not provide an API key, provide an invalid API key, or provide an expired API key **must** be rejected with a `403` response.
- **REQ-1.4**: The rejection response must **not** contain any details about why authentication failed.
- **REQ-1.5**: All requests made to admin endpoints must be recorded in the PostgreSQL table in the `base.admin_audit_log` table. The log entry must include the hashed API key used to make the request, the endpoint called, request and response bodies, and the status code of the request.
- **REQ-1.6**: Unauthenticated requests made to admin endpoints must also be recorded in the audit log table.

### 4.2 - HTTP Layer

- **REQ-2.1**: The following additional routers must be attached to the main `gin` engine with the given prefixes: Contacts (`/v1/contacts`).

### 4.4 - Articles Router

- **REQ-4.1**: The existing articles router must be updated and must expose the following new endpoints:
    - `POST /v1/articles`
    - `PUT /v1/articles/:article_id/content`
    - `PATCH /v1/articles/:article_id/visibility`

- **REQ-4.2**: The endpoints listed in **REQ-4.1** must be registered behind the admin authentication middleware defined in § 4.1. All existing articles endpoints must remain public.
- **REQ-4.3**: `POST /v1/articles` must create a new article and topic links in a single transaction. The document row must not be created.
- **REQ-4.4**: `PUT /v1/articles/:article_id/content` must replace the content of the document linked to the article, updating the stored `size` accordingly. Article metadata must not be modified by this endpoint. The request must be of type `multi-part/form`. The filename must be retrieved from the form data.
- **REQ-4.5**: `PATCH /v1/articles/:article_id/visibility` must set the `display` flag of the given article to the value supplied in the request body. The endpoint must set the flag to the supplied value explicitly rather than inverting the current value, so that repeated requests are idempotent. No other article fields, and no linked document content, may be modified by this endpoint.
- **REQ-4.6**: `PATCH /v1/articles/:article_id/visibility` must return the updated article metadata so that the caller does not need to re-fetch the article to observe the new state.
- **REQ-4.7**: Any request referencing an `article_id` that does not exist must be rejected with a `404`.

### 4.5 - Agents Router

- **REQ-5.1**: The existing agents router must be updated and must expose the following new endpoints:
    - `POST /v1/agents/specs`
    - `PUT /v1/agents/specs/:spec_id`
    - `PATCH /v1/agents/specs/:spec_id/visibility`

- **REQ-5.2**: The endpoints listed in **REQ-5.1** must be registered behind the admin authentication middleware defined in § 4.1. All existing endpoints on the agents router group must remain public.
- **REQ-5.3**: A request for a spec ID that does not exist must be rejected with a `404`.
- **REQ-5.4**: `POST /v1/agents/specs` must create a new spec metadata. Newly created specs must be persisted with `display` set to `false` so that they are not exposed publicly before being explicitly published. The document row must not be created.
- **REQ-5.5**: `PUT /v1/agents/specs/:spec_id` must replace the content of the document linked to the spec, updating the stored `size` accordingly. Spec metadata must not be modified by this endpoint. The request must be of type `multi-part/form`. The filename must be retrieved from the form data from the `filename` field. The file contents itself must be retrieved from the `file` field.
- **REQ-5.6**: `PATCH /v1/agents/specs/:spec_id/visibility` must set the `display` flag of the given spec to the value supplied in the request body. The endpoint must set the flag to the supplied value explicitly rather than inverting the current value, so that repeated requests are idempotent. No other spec fields, and no linked document content, may be modified by this endpoint.
- **REQ-5.7**: `PATCH /v1/agents/specs/:spec_id/visibility` must return the updated spec metadata so that the caller does not need to re-fetch the spec to observe the new state.
- **REQ-5.8**: Any request referencing a `spec_id` that does not exist must be rejected with a `404`.
- **REQ-5.9**: `GET /v1/agents/specs/list` must accept an optional `?include_hidden=(true|false)` query parameter. If provided and set to `true`, the request must be treated as an admin endpoint. The API key provided must be validated, and the request must be logged in the audit log table.

### 4.6 - Messages Router

- **REQ-6.1**: The existing agents router must be updated and must expose the following new endpoints:
    - `GET /v1/messages/list`
    - `GET /v1/messages/:contact_ref`

- **REQ-6.2**: The endpoints listed in **REQ-6.1** must be registered behind the admin authentication middleware defined in § 4.1. All existing articles endpoints must remain public.
- **REQ-6.3**: `GET /v1/messages/list` must return all messages sorted by `submitted_at` in descending order. Messages must include the contact details, not just the contact ID.
- **REQ-6.4**: `GET /v1/messages/:contact_ref` must return all messages belonging to the given contact. `:contact_ref` can be either the contact ID or email. If an email is provided, it must be converted to lowercase. A request for a contact ID that does not exist must be rejected with a `404`.

### 4.7 - Contacts Router

- **REQ-7.1**: The contacts router must be mounted on the `/v1/contacts` prefix and must expose the `GET /v1/contacts/list` endpoint.
- **REQ-7.2**: `GET /v1/contacts/list` must be registered behind the admin authentication middleware defined in § 4.1.
- **REQ-7.3**: `GET /v1/contacts/list` must return all contacts. Contacts with no organization recorded must return null for that field rather than omitting it.
- **REQ-7.4**: An empty contacts table must return `200` with an empty collection, not `404`.

### 4.8 - Persistence Layer

- **REQ-8.1**: The source code must define a `Persistence` interface declaring all functions required to access and manage database resources.
- **REQ-8.2**: A `PostgresPersistence` implementation of the `Persistence` interface must be created for the PostgreSQL database.
- **REQ-8.3**: The `Persistence` interface must expose a `HealthCheck() error` function that returns the health status of the persistence layer.
- **REQ-8.4**: All database operations that require multiple write steps **must** use a transaction to ensure that DB operations remain atomic.
- **REQ-8.5**: All interactions with the database **must** occur via the defined interface implementation.
- **REQ-8.6**: Domain data models must be defined separately from API request/response models.

### 4.9 - Documentation

- **REQ-9.1**: The existing OpenAPI documentation for the API stored at `docs/openapi.yaml` must be updated with the new endpoints.
- **REQ-9.2**: The existing Postman collection at `docs/postman/collection.json` must be updated with the new endpoints..

### 4.10 - Projects Router

- **REQ-10.1**: The existing projects router must be updated and must expose the following new endpoints:
    - `POST /v1/projects`
    - `PATCH /v1/projects/:project_id/visibility`

- **REQ-10.2**: The endpoints listed in **REQ-10.1** must be registered behind the admin authentication middleware defined in § 4.1. All existing projects endpoints must remain public.
- **REQ-10.3**: `POST /v1/projects` must create a new project. Newly created projects must be created with `display=false`. Names must be sanitized and converted to title format.
- **REQ-10.4**: Links provided when creating a project must be be validated using a regex to make sure they are valid HTTPS urls. If an invalid link is provided, the API must reject the request with a `400` status code.
- **REQ-10.5**: `PATCH /v1/projects/:project_id/visibility` must update the `display` attribute of the project with the specified project ID using the value provided in the request body.
- **REQ-10.6**: Project IDs provided when toggling a projects visibility must be validated. If the ID does not exist, the API must reject the request with a `404` response.

## 5. Acceptance Criteria

Acceptance criteria live in `acceptance/features/`, organized by capability rather
than by spec. Scenarios verifying this spec are tagged `@spec-004` and can be run
in isolation using `godog --tags='@spec-004'`.

Feature files are cross-cutting by design — feature files contain scenarios tagged with other spec IDs. Scenarios can also be tagged with multiple specs IDs. The tag, not the file, is the unit of ownership. Only scenarios tagged with `@spec-004` should be considered included as acceptance criteria for this spec.

The following table maps scenarios to requirements.

| Criterion ID | Requirement ID | Scenario (tagged `@spec-004`) |
| ------------ | -------------- | ----------------------------- |
| AC-1 | REQ-1.1, REQ-1.2, REQ-1.4, REQ-7.2 | The API rejects unauthenticated requests to admin endpoints |
| AC-2 | REQ-1.1, REQ-2.1, REQ-7.1, REQ-7.3 | Contacts are accessible by admin users that provide an API key |
| AC-3 | REQ-1.5 | An authenticated admin request is recorded in the audit log |
| AC-4 | REQ-1.6 | An unauthenticated admin request is recorded in the audit log |
| AC-5 | REQ-7.3 | Contacts with no organization are returned with a null organization |
| AC-6 | REQ-7.4 | An empty contacts table returns an empty collection |
| AC-7 | REQ-1.2, REQ-6.2 | The API rejects unauthenticated requests to message endpoints |
| AC-8 | REQ-6.1, REQ-6.3 | An admin lists all messages |
| AC-9 | REQ-6.1, REQ-6.4 | An admin lists the messages belonging to a contact |
| AC-10 | REQ-6.4 | An admin lists messages for a contact that does not exist |
| AC-11 | REQ-1.2, REQ-4.2 | The API rejects unauthenticated requests to create blog posts |
| AC-12 | REQ-4.2 | The API rejects unauthenticated content and visibility updates to blog posts |
| AC-13 | REQ-4.2 | Existing blog post endpoints remain public |
| AC-14 | REQ-4.1, REQ-4.3 | An admin creates a new blog post |
| AC-15 | REQ-4.1, REQ-4.4 | An admin replaces the content of a blog post |
| AC-16 | REQ-4.1, REQ-4.5, REQ-4.6 | An admin sets the visibility of a blog post |
| AC-17 | REQ-4.7 | An admin request references a blog post that does not exist |
| AC-18 | REQ-1.2, REQ-5.2 | The API rejects unauthenticated requests to create specs |
| AC-19 | REQ-5.2 | The API rejects unauthenticated content and visibility updates to specs |
| AC-20 | REQ-5.2 | Existing spec endpoints remain public |
| AC-21 | REQ-5.1, REQ-5.4 | An admin creates a new spec |
| AC-22 | REQ-5.1, REQ-5.5 | An admin replaces the content of a spec |
| AC-23 | REQ-5.1, REQ-5.6, REQ-5.7 | An admin sets the visibility of a spec |
| AC-24 | REQ-5.3, REQ-5.8 | An admin request references a spec that does not exist |
| AC-25 | REQ-5.9 | Hidden specs are listed when an admin includes hidden specs |
| AC-26 | REQ-5.9 | Hidden specs are not listed without a valid API key |
| AC-27 | REQ-5.9 | Listing specs without including hidden specs remains public |
| AC-28 | REQ-4.1, REQ-4.4 | An admin uploads the initial content for a blog post |
| AC-29 | REQ-5.1, REQ-5.5 | An admin uploads the initial content for a spec |
| AC-30 | REQ-1.2, REQ-10.2 | The API rejects unauthenticated requests to create projects |
| AC-31 | REQ-10.2 | The API rejects unauthenticated visibility updates to projects |
| AC-32 | REQ-10.2 | Existing project endpoints remain public |
| AC-33 | REQ-10.1, REQ-10.3 | An admin creates a new project |
| AC-34 | REQ-10.3 | Project names are sanitized and converted to title format |
| AC-35 | REQ-10.4 | The API rejects a project created with an invalid link |
| AC-36 | REQ-10.1, REQ-10.5 | An admin sets the visibility of a project |
| AC-37 | REQ-10.6 | An admin request references a project that does not exist |

The persistence-layer requirements (REQ-8.1 – REQ-8.6) and documentation requirements
(REQ-9.1, REQ-9.2) are not observable through the API and are intentionally not mapped
to scenarios; they are verified by code inspection.


## 6. Contracts and Constraints

API requests and responses must be submitted/return as `content-type: application/json` respectively with status code `200` unless unless explicitly specified otherwise.

### 6.1 - API Response Schemas

#### 6.1.12 - `GET /v1/contacts/list`

**Request Schema**: N/A

**Response Schema**

```jsonc
{
    "contacts": [
        {
            "id": "String",
            "name": "String",
            "email": "String",
            "organization": "String", // nullable,
            "created_at": "Datetime", // iso8601 string
        }
    ]
}
```

#### 6.1.13 - `GET /v1/messages/list`

**Request Schema**: N/A

**Response Schema**

```jsonc
{
    "messages": [
        {
            "id": "String",
            "contact_id": "String",
            "contact_email": "String",
            "message": "String",
            "read": "Boolean",
            "received_at": "String",
        }
    ]
}
```

#### 6.1.14 - `GET /v1/messages/:contact_ref`

**Request Schema**: N/A

**Response Schema**

```jsonc
{
    "messages": [
        {
            "id": "String",
            "contact_id": "String",
            "contact_email": "String",
            "message": "String",
            "read": "Boolean",
            "received_at": "String",
        }
    ]
}
```

#### 6.1.15 - `POST /v1/articles`

**Request Schema**:

```jsonc
{
    "title": "String",
    "description": "String",
    "topics": [] // array of strings
}
```

**Response Schema**

```jsonc
// response status code: 201
{
    "article_id": "String",
}
```

#### 6.1.16 - `PUT /v1/articles/:article_id/content`

**Request Schema**:

`Content-Type: multipart/form-data`

| Part | Type | Required | Content-Type | Description |
| ---- | ---- | -------- | ------------ | ----------- |
| `file` | File | Yes | `application/octet-stream` | Replacement content for the document linked to the article. The stored `size` must be derived from the uploaded byte length, not from a client-supplied value. |
| `filename` | Text | Yes | `text/plain` | Filename recorded against the document. |

**Response Schema**

```jsonc
{
    "article_id": "String"
}
```

#### 6.1.17 - `PATCH /v1/articles/:article_id/visibility`

**Request Schema**:

```jsonc
{
    "visible": "Boolean" // either true or false
}
```

**Response Schema**

```jsonc
{
    "article_id": "String"
}
```

#### 6.1.18 - `POST /v1/agents/specs`

**Request Schema**:

```jsonc
{
    "spec_id": "String",
    "description": "String", // description of what spec provided
}
```

**Response Schema**

```jsonc
// response status code: 201
{
    "spec_id": "String"
}
```

#### 6.1.19 - `PUT /v1/agents/specs/:spec_id/content`

**Request Schema**:

`Content-Type: multipart/form-data`

| Part | Type | Required | Content-Type | Description |
| ---- | ---- | -------- | ------------ | ----------- |
| `file` | File | Yes | `application/octet-stream` | Replacement content for the document linked to the article. The stored `size` must be derived from the uploaded byte length, not from a client-supplied value. |
| `filename` | Text | Yes | `text/plain` | Filename recorded against the document. |

**Response Schema**

```jsonc
{
    "spec_id": "String"
}
```

#### 6.1.20 - `PATCH /v1/agents/specs/:spec_id/visibility`

**Request Schema**:

```jsonc
{
    "visible": "Boolean" // either true or false
}
```

**Response Schema**

```jsonc
{
    "spec_id": "String"
}
```

#### 6.1.21 - `POST /v1/projects`

**Request Schema**:

```jsonc
{
    "name": "String",
    "description": "String",
    "primary_link": "String",
    "github_link": "String" // nullable
}
```

**Response Schema**

```jsonc
{
    "spec_id": "String"
}
```

#### 6.1.22 - `PATCH /v1/projects/:projects_id/visibility`

**Request Schema**:

```jsonc
{
    "visible": "Boolean" // either true or false
}
```

**Response Schema**

```jsonc
{
    "spec_id": "String"
}
```

## 7. Edge Cases and Error Handling

N/A

## 8. Infrastructure Requirements

Infrastructure for deployment is provided in a separate spec.

## 9. External Resources

| Filepath | Description | When to use |
|----------|-------------|-------------|
| docs/db_schema.md | DB schema definitions for PostgreSQL tables. | Use when developing code that interacts with DB. |
| docs/openapi.yaml | OpenAPI schema documenting existing endpoints. | |
