# SPEC-003: UI

**Spec ID**: SPEC-003

**Spec Date**: 2026-08-11

## 1. Spec Statement

As a site owner I want a personal website that presents my CV, blog articles, and agentic development workflow so that prospective clients and collaborators can evaluate my experience and get in touch with me.

## 2. Context and Background

The goal of this spec is to develop a server-side rendered react application that integrates with the API developed in SPEC-002 to display CV data, contact forms, and blog articles. The application is built on the Next.js App Router, which provides the routing, server rendering, and data fetching layer. Route definitions are given in § 6.1. The application should consist of the following pages/views:

| Page | Component | Description |
| ---- | --------- | ----------- |
| Homepage | Personal details display | Display of personal details, and professional overview. |
| Homepage | CV display | Display of CV data fetched from API, including skills, experiences, and education.  |
| Homepage | Agentic development summary | Summary of agentic development principles and experience. Link to main agents page. |
| Homepage | Contact form | Contact form that prospective clients, and other can use to submit contact messages. |
| Agents | Agentic development workflow + catalogue | Dedicated section for agentic development. Display agentic workflow (spec driven development, acceptance criteria), subagent catalogue, and the historic specs used to create the website. |
| Projects | Project index | List of projects, with descriptions and links, including optional GitHub links. |
| Blog | Blog overview | Displays blog article metadata. Includes client-side search that allows users to search by topics and keywords. |
| Blog Post | | Displays a blog article content, including blog header built from metadata, content displayed from Markdown, and comments section.

## 3. Scope Definitions

### 3.1 In Scope

- Design and implement home page
- Design and implement blog page
- Design and implement blog content page
- Design and implement agents page
- Design and implement projects page
- Design and implement not found page

### 3.2 Out of Scope

- Updates to API
- Updates to data model or database schema
- Deployment

## 4. Requirements

Multiple requirement reference pre-existing initial designs. These should be used as guides for implementation where referenced, but must **not** be treated as production-ready components.

### 4.0 General

- **REQ-1.1**: The application must be server-side rendered using the Next.js App Router. Pages must be rendered on the server so that fully populated markup is delivered to crawlers. This helps to optimize site content for SEO.
- **REQ-1.2**: The application must be built using shadcn/ui and Tailwind. Ensure that styling functionality (SCSS, CSS etc) is kept modular and shared across components so that changes can be made to all components by updating a single source.
- **REQ-1.3**: Routes must be defined as App Router segments under `app/`, matching the route table in § 6.1. Each route must resolve to a `page.tsx` in the corresponding segment directory.
- **REQ-1.4**: A shared root layout (`app/layout.tsx`) must define the HTML shell, global stylesheet import, fonts, and the site-wide navigation and footer. Page components must not re-declare these.
- **REQ-1.5**: Data required to render SEO-critical content must be fetched in Server Components, on the server, and must not be fetched from the browser after hydration. This applies to CV data, article metadata, article content, project entries, the subagent catalogue, and the spec listing.
- **REQ-1.6**: Components must only be marked `"use client"` where client-side interactivity is required. In this application that is limited to the contact form, the blog index search filter, and the blog post comments section.
- **REQ-1.7**: Mutating requests (`POST /v1/messages` and `POST /v1/articles/:article_id/comment`) must be issued from the browser directly to the API, relying on the CORS configuration defined in SPEC-002 § 6.2. The frontend must not proxy these requests through its own route handlers.
- **REQ-1.8**: The blog post route must be a dynamic segment (`app/blog/[article_id]/page.tsx`). Requests for an `article_id` that the API rejects with a `404` must render the Next.js not-found page.
- **REQ-1.9**: Every route must define page metadata via the App Router `metadata` export or `generateMetadata` function, providing at minimum a title and description. Blog post metadata must be derived from the article metadata returned by the API.

### 4.1 Personal Details

- **REQ-2.1**: The homepage must have a personal details header that displays basic information such as name, email address, phone number, and a headline summary of professional experience and interests.

### 4.2 CV Display

`docs/plans/designs/DS-004-CV/` contains initial designs that must be followed when building the CV display.

- **REQ-2.2**: The homepage must have a dedicated section for CV contents. Headline skills must be displayed first, followed by a timeline of CV entries, and finally a timeline of education entries.

### 4.3 Agentic Summary

- **REQ-2.3**: The homepage must have a dedicated section summarizing the `subagents-dev` development workflow. The section must be short and only include a summary (spec driven development driven by acceptance criteria, indexed coding standards, and subagent orchestration). A link must be provided to the main agents page.

### 4.4 Contact Form

- **REQ-2.4**: The homepage must have a contact form that visitors can use to submit a message. The contact form must include name, email, organization (optional), and message.
- **REQ-2.5**: The contact form must be validated. Names and messages must be non-empty strings, and emails must match a valid email regex.

### 4.5 Agent Catalogue

`docs/plans/designs/DS-004-AGENTS/` contains initial designs that must be followed when building the agent catalogue.

- **REQ-3.1**: The agents page must have a dedicated section to display the agentic development workflow used to create this project, as well as a catalogue of subagents used, and the specs used to generate the website itself.
- **REQ-3.2**: The agentic workflow section must cover subagent orchestration outlined in the `subagents-dev` plugin, including a graphical representation of the full workflow.
- **REQ-3.3**: The agent catalogue must include a full list of subagents used to develop the website, documenting their purpose, inputs and outputs.
- **REQ-3.4**: The agentic workflow section must provide a list of specs that were used to create the website. Specs must include the acceptance criteria used to generate the website, API, and CI components.
- **REQ-3.5**: A github link to the agents repository must be provided.

### 4.6 Blog Page

`docs/plans/designs/DS-004-BLOG/` contains initial designs that must be followed when building the blog index.

- **REQ-4.1**: The blog index page must display the metadata for all available blog articles.
- **REQ-4.2**: The blog index page must have a client-side search that visitors can use to filter articles on keywords and topics.
- **REQ-4.3**: Blog metadata must not contain any of the content of the blog file, nor any of the comments.

### 4.7 Blog Post Page

- **REQ-4.1**: The `/blog/[article_id]` must display the article header, as well as the document content for the article with ID `[article_id`. The API returns a markdown file as a `octet-stream/binary` response. The contents of the markdown file must be rendered on the page.

### 4.8 Dockerfile

- **REQ-5.1**: A dockerfile must be created that runs the node server required to serve application data.

## 5. Acceptance Criteria

Acceptance criteria live in `acceptance/features/`, organized by capability rather
than by spec. Scenarios verifying this spec are tagged `@spec-003` and can be run
in isolation using `godog --tags='@spec-003'`.

Feature files are cross-cutting by design — feature files contain scenarios tagged with other spec IDs. Scenarios can also be tagged with multiple specs IDs. The tag, not the file, is the unit of ownership. Only scenarios tagged with `@spec-003` should be considered included as acceptance criteria for this spec.

The following table maps scenarios to requirements.

| Criterion ID | Requirement ID | Scenario (tagged `@spec-003`) |
| ------------ | -------------- | ----------------------------- |

### 5.1 Additional Acceptance Criteria

None

## 6. Contracts and Constraints

### 6.1 Route Table

The following routes must be implemented as App Router segments. "Rendering" describes
how the segment is rendered on the server; "API dependencies" lists the SPEC-002
endpoints called server-side during that render.

| Route | Segment file | Page | Rendering | API dependencies (server-side) |
| ----- | ------------ | ---- | --------- | ------------------------------ |
| `/` | `app/page.tsx` | Homepage | Dynamic | `GET /v1/cv` |
| `/agents` | `app/agents/page.tsx` | Agents | Dynamic | `GET /v1/agents/list`, `GET /v1/agents/specs/list` |
| `/projects` | `app/projects/page.tsx` | Projects | Dynamic | `GET /v1/projects/list` |
| `/blog` | `app/blog/page.tsx` | Blog overview | Dynamic | `GET /v1/articles/list` |
| `/blog/[article_id]` | `app/blog/[article_id]/page.tsx` | Blog post | Dynamic | `GET /v1/articles/list`, `GET /v1/articles/:article_id/content` |

Supporting segments:

| Segment file | Purpose |
| ------------ | ------- |
| `app/layout.tsx` | Root layout — HTML shell, global stylesheet, fonts, navigation, footer |
| `app/not-found.tsx` | 404 page, rendered for unknown routes and unresolvable article IDs |
| `app/error.tsx` | Error boundary, rendered when a server-side API call fails |

### 6.2 Client Boundaries

The following components must be client components. All other components must render
on the server.

| Component | Route(s) | Reason |
| --------- | -------- | ------ |
| Contact form | `/` | Form state, validation, `POST /v1/messages` |
| Blog search filter | `/blog` | Client-side keyword and topic filtering (REQ-4.2) |
| Comments section | `/blog/[article_id]` | `GET /v1/articles/:article_id/comments` on mount, `POST /v1/articles/:article_id/comment` on submit |

### 6.3 API Base URL

The API base URL must be supplied by environment variable. Two values are required
because the API is called from two different network positions:

| Variable | Used by | Description |
| -------- | ------- | ----------- |
| `API_BASE_URL` | Server Components | Internal address of the API, resolved from the application server |
| `NEXT_PUBLIC_API_BASE_URL` | Client components | Public address of the API, resolved from the browser. Must be an origin present in the SPEC-002 § 6.2 CORS allowlist |

## 7. Edge Cases and Error Handling

N/A

## 8. Infrastructure Requirements

N/A

## 9. External Resources

| Filepath | Description | When to use |
|----------|-------------|-------------|
| docs/openapi.yaml | REST API definition and documentation in OpenAPI format | Use when writing code that interacts with the API |
| docs/external-documents/app.scss | SCSS configuration file | Use when designing and building FE components. |
