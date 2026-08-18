package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// contentTypeOctetStream is the content type used for the endpoints that serve
// raw document content instead of a JSON payload (SPEC-002 §6.1.6, §6.1.9).
const contentTypeOctetStream = "binary/octet-stream"

// JSONResponse is the value returned by every handler of this API. It carries
// the HTTP status code together with the payload to write ([GO-API-004]). Two
// payload shapes are supported: a JSON body, serialized with the
// "application/json" content type, and raw content, written verbatim with the
// content type given in ContentType. Handlers should build values via the
// constructors below rather than populating the fields directly, so that the
// status codes and content types of SPEC-002 §6.1 are applied consistently.
type JSONResponse struct {
	// Code is the HTTP status code of the response.
	Code int
	// Body is the payload serialized as JSON. It is ignored for raw responses.
	Body interface{}
	// RawContent is the payload written verbatim for raw responses.
	RawContent []byte
	// ContentType is set only for raw responses; an empty value marks the
	// response as a JSON response.
	ContentType string
}

// Send writes the response to the client through the given gin context. JSON
// payloads are written with the "application/json" content type, raw payloads
// with their own content type and their bytes unmodified.
func (r JSONResponse) Send(c *gin.Context) {
	if r.ContentType != "" {
		c.Data(r.Code, r.ContentType, r.RawContent)
		return
	}

	c.JSON(r.Code, r.Body)
}

// NewJSONResponse returns a JSON response with the given status code and body.
// It is the general purpose constructor, used for the status codes that have no
// dedicated constructor below — most notably the error responses, whose
// envelopes from errors.go are carried as ordinary bodies (SPEC-002 §6.1.0).
func NewJSONResponse(code int, body interface{}) JSONResponse {
	return JSONResponse{
		Code: code,
		Body: body,
	}
}

// NewOKResponse returns a 200 OK response with the given body serialized as
// JSON. It implements the default response of SPEC-002 §6.1, and takes the body
// as an argument since each endpoint defines its own payload schema.
func NewOKResponse(body interface{}) JSONResponse {
	return NewJSONResponse(http.StatusOK, body)
}

// NewCreatedResponse returns a 201 Created response whose body is the single
// identifier of the created resource. The field argument names the JSON field
// to write and the id argument is the generated identifier, yielding the
// {"message_id": ...} and {"comment_id": ...} bodies of SPEC-002 §6.1.7 and
// §6.1.11.
func NewCreatedResponse(field, id string) JSONResponse {
	return JSONResponse{
		Code: http.StatusCreated,
		Body: gin.H{field: id},
	}
}

// NewRawContentResponse returns a 200 OK response that writes the given content
// verbatim as "binary/octet-stream" rather than as JSON. It serves the raw
// document endpoints of SPEC-002 §6.1.6 and §6.1.9.
func NewRawContentResponse(content []byte) JSONResponse {
	return JSONResponse{
		Code:        http.StatusOK,
		RawContent:  content,
		ContentType: contentTypeOctetStream,
	}
}

// Handler adapts a handler of the signature mandated by [GO-API-004] into a
// gin.HandlerFunc that can be registered on a router. The handler argument is
// the controller function to wrap: it is invoked with the request context and
// its returned JSONResponse is written to the client. Keeping the write logic
// here allows endpoint registrations to stay minimal.
func Handler(handler func(c *gin.Context) JSONResponse) gin.HandlerFunc {
	return func(c *gin.Context) {
		handler(c).Send(c)
	}
}

// The domain models of this component follow. They are the values the
// persistence layer returns, and are declared here rather than next to the
// statements that populate them so that the storage schema of the whole
// application can be read in one place ([GO-010]). Their fields carry
// `validate` tags describing which of them must always be populated ([GO-012]);
// nullable columns, collections that may legitimately be empty and boolean
// flags are deliberately left untagged, since `required` rejects nil, an empty
// slice and false alike.

// CVExperience is a single work experience entry of the CV, returned as a
// complete aggregate: its responsibilities and tech stack items are resolved
// inside the persistence layer, so that callers never need a follow-up call
// (REQ-2.3). EndDate is nil while the role is current (REQ-2.4). The field names
// match the payload of SPEC-002 §6.1.3 one for one, so the model is serialized
// directly rather than duplicated into an identical DTO ([GO-013]).
type CVExperience struct {
	// ID is the identifier of the base.cv_experience row.
	ID string `json:"id" validate:"required"`
	// Organization is the employer the role was held at.
	Organization string `json:"organization" validate:"required"`
	// JobTitle is the title of the role.
	JobTitle string `json:"job_title" validate:"required"`
	// StartDate is the day the role started.
	StartDate time.Time `json:"start_date" validate:"required"`
	// EndDate is the day the role ended, or nil for a current role.
	EndDate *time.Time `json:"end_date"`
	// Description describes the role.
	Description string `json:"description" validate:"required"`
	// TechStack holds the names of the technologies used in the role. It is
	// always non-nil, and empty when the role has no linked stack items.
	TechStack []string `json:"tech_stack"`
	// Responsibilities holds the responsibilities held during the role. It is
	// always non-nil, and empty when the role has none.
	Responsibilities []string `json:"responsibilities"`
}

// CVEducation is a single education entry of the CV. EndDate is nil while the
// course is ongoing (REQ-2.4). Its fields match SPEC-002 §6.1.3.
type CVEducation struct {
	// ID is the identifier of the base.cv_education row.
	ID string `json:"id" validate:"required"`
	// Institution is the institution the certificate was obtained at.
	Institution string `json:"institution" validate:"required"`
	// Certificate is the type of certificate obtained.
	Certificate string `json:"certificate" validate:"required"`
	// StartDate is the day the course started.
	StartDate time.Time `json:"start_date" validate:"required"`
	// EndDate is the day the course ended, or nil for an ongoing course.
	EndDate *time.Time `json:"end_date"`
}

// CVSkills maps a skill category onto the ordered names of the tech stack items
// linked to it (REQ-2.6).
type CVSkills map[string][]string

// Project is the domain model of a personal or company project shown on the
// website, as stored in base.project (docs/db_schema.md §4.10). GithubLink is a
// pointer because the underlying column is nullable: projects without a GitHub
// repository must be serialized with a null link rather than an empty string.
type Project struct {
	ID          string  `json:"id" validate:"required"`
	Name        string  `json:"name" validate:"required"`
	Description string  `json:"description" validate:"required"`
	PrimaryLink string  `json:"primary_link" validate:"required"`
	GithubLink  *string `json:"github_link"`
}

// Subagent is a catalogue entry of the subagents used in the spec-driven
// development workflow, as stored in base.subagent (docs/db_schema.md §4.8).
// Its fields match the payload of SPEC-002 §6.1.4 one for one. Inputs and
// Outputs are always non-nil: an agent that declares no schema carries an empty
// map, so that it is serialized as `{}` rather than as null (REQ-4.2).
type Subagent struct {
	// ID is the identifier of the base.subagent row.
	ID string `json:"id" validate:"required"`
	// Name is the name of the subagent.
	Name string `json:"name" validate:"required"`
	// Description describes what the subagent does.
	Description string `json:"description" validate:"required"`
	// Inputs is the declared input schema of the subagent, empty when none is
	// declared.
	Inputs map[string]any `json:"inputs"`
	// Outputs is the declared output schema of the subagent, empty when none is
	// declared.
	Outputs map[string]any `json:"outputs"`
}

// AgentSpecDocument is a single document linked to an agent spec through
// base.agent_spec_document_link. Restricted is carried for the caller to apply
// the visibility rules of REQ-4.5 and REQ-4.6 and is never serialized, since
// the payload of SPEC-002 §6.1.5 does not expose it.
type AgentSpecDocument struct {
	// DocumentID is the identifier of the base.document row.
	DocumentID string `json:"document_id" validate:"required"`
	// Filename is the name of the document file.
	Filename string `json:"filename" validate:"required"`
	// DocumentType is the role the document plays for the spec: one of
	// DocumentTypeSpec, DocumentTypeAcceptance or DocumentTypeOther.
	DocumentType string `json:"document_type" validate:"required,oneof=spec acceptance other"`
	// Restricted reports whether the document is restricted.
	Restricted bool `json:"-"`
}

// AgentSpec is the metadata of a spec used by the agents to generate the site,
// as stored in base.agent_spec (docs/db_schema.md §4.19), returned as a
// complete aggregate together with all of its linked documents so that callers
// never need a follow-up call (REQ-4.4). Its fields match SPEC-002 §6.1.5. The
// spec content itself is never part of this model (REQ-4.3).
type AgentSpec struct {
	// ID is the identifier of the base.agent_spec row.
	ID string `json:"id" validate:"required"`
	// DisplayName is the name of the spec as shown on the website.
	DisplayName string `json:"display_name" validate:"required"`
	// Description describes what the spec provides.
	Description string `json:"description" validate:"required"`
	// Documents holds every document linked to the spec, restricted documents
	// included. It is always non-nil.
	Documents []AgentSpecDocument `json:"documents"`
}

// SpecDocument is the content of a single document linked to a spec, returned
// as a domain model so that the filename and the restricted flag travel with
// the bytes ([GO-040]). Restricted lets the caller reject restricted documents
// with a 404 (REQ-4.10).
type SpecDocument struct {
	// Filename is the name of the document file.
	Filename string `validate:"required"`
	// Content is the raw content of the document as stored in the BYTEA column.
	Content []byte
	// Restricted reports whether the document is restricted.
	Restricted bool
}

// Article is the listing metadata of a blog article as returned by the article
// listing endpoint (SPEC-002 §6.1.8). The article body is never part of it: it
// lives in the linked document and is served by the content endpoint. AuthoredAt
// carries the base.article authored_at column, which is the date the listing
// exposes as created_at on the wire.
type Article struct {
	ID          string    `json:"id" validate:"required"`
	Title       string    `json:"title" validate:"required"`
	Description string    `json:"description" validate:"required"`
	Author      string    `json:"author" validate:"required"`
	Topics      []string  `json:"topics"`
	AuthoredAt  time.Time `json:"created_at" validate:"required"`
}

// ArticleComment is a single comment recorded against a blog article as
// returned by the comment listing endpoint (SPEC-002 §6.1.10). Author is a
// pointer because the underlying column is nullable: comments may be posted
// anonymously, in which case the author is null rather than an empty string
// (REQ-3.5). CreatedAt is set by the database clock.
type ArticleComment struct {
	Author    *string   `json:"author"`
	Comment   string    `json:"comment" validate:"required"`
	CreatedAt time.Time `json:"created_at" validate:"required"`
}

// MessageSubmission carries the already sanitized details of a contact form
// submission into the persistence layer (REQ-5.3). It deliberately holds no
// read flag, timestamp or identifier: those are server side values that this
// layer generates itself, so that no client supplied value can reach the
// database (REQ-5.5, [GO-041]).
type MessageSubmission struct {
	// Name is the sanitized name of the sender.
	Name string `validate:"required"`
	// Email is the sanitized email address of the sender; it identifies the
	// contact the message is attached to (REQ-5.2).
	Email string `validate:"required,email"`
	// Organization is the optional organization of the sender. A nil value is
	// persisted as SQL NULL.
	Organization *string
	// Content is the message body.
	Content string `validate:"required"`
}

// The request and response DTOs of this component follow. They are declared
// separately from the domain models above so that the API schema stays
// decoupled from the storage schema ([GO-013]), and are collected here for the
// same reason the domain models are ([GO-010]). The request DTOs deliberately
// carry neither `binding` nor `validate` constraints: their bodies are bound
// tolerantly and then run through the shared validation chain, so that every
// rejection can name the offending field and the reason it failed as the 400
// envelopes of SPEC-002 §6.1.0 require, rather than surfacing the binder's own
// error text.

// CVResponse is the payload of GET /v1/cv (SPEC-002 §6.1.3). The complete CV is
// served as a single response, so that callers never need a follow-up request to
// resolve any part of it (REQ-2.2, REQ-2.3). Its fields carry the domain models
// of the persistence layer directly rather than a per-entry DTO: those models are
// already declared with the field names of §6.1.3 one for one, so an additional
// mapping layer would only duplicate the same schema in a second place ([GO-013]).
type CVResponse struct {
	// Skills maps a skill category onto the names of the stack items linked to
	// it. It is never nil, so that an uncategorized CV serializes as {} rather
	// than as null (REQ-2.5, REQ-2.6).
	Skills CVSkills `json:"skills"`
	// Experience holds the work experience entries, most recent first. It is
	// never nil, so that an empty CV serializes as [] rather than as null
	// (REQ-2.4, REQ-2.5).
	Experience []CVExperience `json:"experience"`
	// Education holds the education entries, most recent first. It is never
	// nil, for the same reason as Experience.
	Education []CVEducation `json:"education"`
}

// ProjectDTO is the representation of a single project in the projects listing
// response (SPEC-002 §6.1.12). It is defined separately from the Project domain
// model so that the API schema stays decoupled from the storage layer
// ([GO-013]). GithubLink is a pointer so that a project without a GitHub
// repository is serialized with a null link rather than an empty string
// (AC-40). Its fields are declared in the order and with the types of Project,
// so that a project is converted into it rather than copied field by field.
type ProjectDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	PrimaryLink string  `json:"primary_link"`
	GithubLink  *string `json:"github_link"`
}

// articleListEntry is the wire representation of a single article in the
// listing response (SPEC-002 §6.1.8). It is kept separate from the Article
// domain model so that the API contract stays decoupled from the storage
// representation ([GO-013]). AuthoredAt carries the base.article authored_at
// column - the authoring timestamp rather than the created_at audit column -
// and is serialized under the created_at field name the contract of §6.1.8
// names, which is the same name the domain model exposes it under.
type articleListEntry struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Author      string    `json:"author"`
	Topics      []string  `json:"topics"`
	AuthoredAt  time.Time `json:"created_at"`
}

// articleCommentEntry is the wire representation of a single comment in the
// comment listing response (SPEC-002 §6.1.10). It is kept separate from the
// ArticleComment domain model so that the API contract is decoupled from the
// storage representation ([GO-013]). Author is a pointer so that a comment
// posted anonymously serializes as null rather than as an empty string, and
// CreatedAt serializes as an ISO8601 timestamp.
type articleCommentEntry struct {
	Author    *string   `json:"author"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"created_at"`
}

// createCommentRequest is the body accepted by the comment creation endpoint
// (SPEC-002 §6.1.11). Both fields are plain strings and carry no binding tags on
// purpose: the body is bound tolerantly, so an absent author and an absent
// comment alike arrive as the empty string and are then run through the shared
// validation chain, which yields the field-level 400 envelopes of §6.1.0 rather
// than the binder's own error text.
type createCommentRequest struct {
	Author  string `json:"author"`
	Comment string `json:"comment"`
}

// createMessageRequest is the body accepted by the message creation endpoint
// (SPEC-002 §6.1.7). Its fields carry plain json tags and no binding
// constraints: binding is deliberately tolerant, so that fields the client
// sends beyond this schema - a forged "read" or "submitted_at" among them - are
// silently dropped rather than rejected or forwarded (REQ-5.5, [GO-013]).
// Validation is applied by validateMessageRequest instead, so that every
// rejection can name the offending field and the reason it failed.
type createMessageRequest struct {
	Email        string `json:"email"`
	Name         string `json:"name"`
	Organization string `json:"organization"`
	Message      string `json:"message"`
}
