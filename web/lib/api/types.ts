/**
 * Response and request types of the psauerborn.dev API, hand-derived from
 * `docs/openapi.yaml`.
 *
 * The declarations follow the schema names of the specification so a type can
 * be checked against its source without a mapping step, and their nullability
 * mirrors the specification exactly: a field is `| null` only where the schema
 * marks it `nullable: true`, and optional only where the schema leaves it out
 * of `required`. Collections that the API guarantees to be empty rather than
 * null (skill groups, agent input/output schemas, spec documents, article
 * topics) are therefore non-nullable.
 *
 * These are structural types only. Fetching lives in the resource modules and
 * failures are raised by `./client` as `ApiError`/`ApiNotFoundError`.
 */

/** Generic error code accompanying a failing response. */
export type ErrorCode = 'Bad Request' | 'Not Found' | 'Internal Server Error';

/** The envelope returned by every error response of the API. */
export interface ErrorResponse {
  error: ErrorCode;
  /** Context safe to disclose; validation failures carry `<field>: <reason>`. */
  details: string;
}

/** Response of `GET /health`. */
export interface HealthResponse {
  status: 'OK';
}

/** Response of `GET /version`. */
export interface VersionResponse {
  version: string;
}

/**
 * Tech stack items grouped by skill category, keyed by category name. An
 * uncategorized CV yields an empty object rather than a null.
 */
export type CVSkills = Record<string, string[]>;

/** A single work experience entry of the CV. */
export interface CVExperience {
  id: string;
  organization: string;
  job_title: string;
  /** ISO8601 timestamp at which the role started. */
  start_date: string;
  /** ISO8601 timestamp at which the role ended, or null for a current role. */
  end_date: string | null;
  description: string;
  tech_stack: string[];
  responsibilities: string[];
}

/** A single education entry of the CV. */
export interface CVEducation {
  id: string;
  institution: string;
  /** Type of certificate, for example BSc, Masters or PhD. */
  certificate: string;
  /** ISO8601 timestamp at which the course started. */
  start_date: string;
  /** ISO8601 timestamp at which the course ended, or null when ongoing. */
  end_date: string | null;
}

/** Response of `GET /v1/cv`. Both collections are ordered most recent first. */
export interface CVResponse {
  skills: CVSkills;
  experience: CVExperience[];
  education: CVEducation[];
}

/**
 * Declared input or output schema of an agent. An agent that declares none
 * yields an empty object rather than a null.
 */
export type AgentSchema = Record<string, unknown>;

/** A single published agent. */
export interface Agent {
  id: string;
  name: string;
  description: string;
  inputs: AgentSchema;
  outputs: AgentSchema;
}

/** Response of `GET /v1/agents`. */
export interface AgentListResponse {
  agents: Agent[];
}

/** Role of a document within a spec. A spec carries at most one `spec` document. */
export type SpecDocumentType = 'spec' | 'acceptance' | 'other';

/** A document linked to a spec that may be disclosed. */
export interface AgentSpecDocument {
  /**
   * Identifier to pass to `GET /v1/agents/specs/{id}/{document_id}` to read the
   * content of the document.
   */
  document_id: string;
  filename: string;
  document_type: SpecDocumentType;
}

/** A single agent spec. */
export interface AgentSpec {
  id: string;
  display_name: string;
  description: string;
  /** Disclosable documents of the spec; restricted ones are omitted. */
  documents: AgentSpecDocument[];
}

/** Response of `GET /v1/agents/specs`. */
export interface SpecListResponse {
  specs: AgentSpec[];
}

/** Vocabulary alias for `AgentSpec`. */
export type Spec = AgentSpec;

/** Vocabulary alias for `AgentSpecDocument`. */
export type SpecDocument = AgentSpecDocument;

/** A single article as it appears in the article list. */
export interface ArticleListEntry {
  id: string;
  title: string;
  description: string;
  author: string;
  /** Topics linked to the article; empty when it has none. */
  topics: string[];
  /** ISO8601 timestamp at which the article was authored. */
  created_at: string;
}

/** Vocabulary alias for `ArticleListEntry`. */
export type ArticleSummary = ArticleListEntry;

/** Response of `GET /v1/articles`. */
export interface ArticleListResponse {
  articles: ArticleListEntry[];
}

/** A single comment recorded against an article. */
export interface ArticleComment {
  /** Author of the comment, or null when it was posted anonymously. */
  author: string | null;
  comment: string;
  /** ISO8601 timestamp at which the comment was recorded. */
  created_at: string;
}

/** Response of `GET /v1/articles/{article_id}/comments`, oldest comment first. */
export interface ArticleCommentListResponse {
  article_id: string;
  comments: ArticleComment[];
}

/** Body of `POST /v1/articles/{article_id}/comments`. */
export interface CreateCommentRequest {
  /** Optional: an absent or empty value records the comment anonymously. */
  author?: string;
  comment: string;
}

/** Response of `POST /v1/articles/{article_id}/comments`. */
export interface CreateCommentResponse {
  comment_id: string;
}

/** Body of `POST /v1/messages`. */
export interface CreateMessageRequest {
  email: string;
  name: string;
  /** Optional: an absent or empty value is stored as null. */
  organization?: string;
  message: string;
}

/** Response of `POST /v1/messages`. */
export interface CreateMessageResponse {
  message_id: string;
}

/** A single project. */
export interface Project {
  id: string;
  name: string;
  description: string;
  /** Primary link of the project, for example its landing page. */
  primary_link: string;
  /** Link to the GitHub repository of the project, or null when it has none. */
  github_link: string | null;
}

/** Response of `GET /v1/projects`. */
export interface ProjectListResponse {
  projects: Project[];
}
