package main

import (
	"errors"
	"fmt"
)

// The sentinel errors of this component. Callers match on them with errors.Is
// rather than inspecting the underlying config, driver or SQL errors, so that no
// implementation detail leaks past the layer that produced it ([GO-016]). They
// are collected here rather than next to the code that returns them so that the
// full set of failure modes the application distinguishes can be read in one
// place ([GO-017]).
var (
	// ErrInvalidConfig is returned when the application configuration cannot be
	// read or fails validation at startup.
	ErrInvalidConfig = errors.New("invalid application configuration")
	// ErrDatabaseUnavailable is returned by the persistence layer whenever the
	// database cannot be reached. Callers match on it with errors.Is instead of
	// inspecting driver errors, so that no database detail leaks past this
	// layer ([GO-016]).
	ErrDatabaseUnavailable = errors.New("database is unavailable")
	// ErrIDGeneration is returned when a new resource identifier could not be
	// generated.
	ErrIDGeneration = errors.New("unable to generate resource id")
	// ErrSpecDocumentNotFound is returned when a spec document cannot be
	// resolved: either the spec does not exist, the document does not exist, or
	// the document exists but is not linked to the given spec. Callers match on
	// it with errors.Is to answer such requests with a 404 instead of a 500
	// (REQ-4.8, REQ-4.9), which is what separates it from ErrDatabaseUnavailable
	// ([GO-016]).
	ErrSpecDocumentNotFound = errors.New("spec document not found")
	// ErrArticleNotFound is returned whenever an article cannot be resolved as
	// publicly visible: it does not exist, it has display set to false, it has
	// no linked document, or its linked document is restricted. The same
	// sentinel is returned for every one of those causes so that callers - and
	// through them the API - cannot disclose which of them applies (REQ-3.6,
	// REQ-3.7).
	ErrArticleNotFound = errors.New("article not found")
)

// Error codes returned in the "error" field of the shared error envelope. They
// mirror the HTTP status reason phrase of the response they accompany, so that
// clients can branch on a stable, generic value ([API-004], SPEC-002 §6.1.0).
const (
	errorCodeBadRequest          = "Bad Request"
	errorCodeNotFound            = "Not Found"
	errorCodeInternalServerError = "Internal Server Error"
)

// Fixed detail strings used by the non-validation envelopes. They are
// deliberately generic: neither reveals whether a resource exists, why it is
// unavailable, or anything about the database schema or internal architecture
// (SPEC-002 §6.1.0).
const (
	// notFoundDetails is shared by every 404 path (missing, hidden, doc-less and
	// restricted resources) so that the responses are indistinguishable
	// (SPEC-002 REQ-3.6, REQ-3.7, REQ-4.8, REQ-4.9, REQ-4.10).
	notFoundDetails = "The requested resource could not be found."
	// internalServerErrorDetails is the verbatim detail string mandated for
	// unhandled errors by SPEC-002 §7.
	internalServerErrorDetails = "Something went wrong."
)

// ErrorResponse is the envelope returned by every error response of this API.
// It serializes to exactly {"error": String, "details": String}: "error" carries
// the generic error code and "details" carries additional context that is safe
// to disclose (SPEC-002 §6.1.0, [API-002], [API-004]). Values must be produced
// via the constructors below rather than assembled at the call site, so that the
// information-hygiene guarantees hold for every endpoint.
type ErrorResponse struct {
	Error   string `json:"error"`
	Details string `json:"details"`
}

// NewBadRequestError returns the 400 Bad Request envelope for a request that
// failed validation. The field argument names the offending request field and
// the reason argument states why it was rejected (for example "comment" and
// "must not be empty"), which are combined into the "details" value as required
// by SPEC-002 §6.1.0. It must only be used for validation failures: the caller
// is responsible for passing a field name and reason that disclose nothing
// beyond the request the client itself submitted.
func NewBadRequestError(field, reason string) ErrorResponse {
	return ErrorResponse{
		Error:   errorCodeBadRequest,
		Details: fmt.Sprintf("%s: %s", field, reason),
	}
}

// NewNotFoundError returns the 404 Not Found envelope. It takes no arguments by
// design: a single, identical envelope is reused by every non-disclosure path so
// that clients cannot tell a missing resource apart from one that is hidden,
// has no linked document, or is restricted (SPEC-002 REQ-3.6, REQ-3.7, REQ-4.8,
// REQ-4.9, REQ-4.10).
func NewNotFoundError() ErrorResponse {
	return ErrorResponse{
		Error:   errorCodeNotFound,
		Details: notFoundDetails,
	}
}

// NewInternalServerError returns the fixed 500 Internal Server Error envelope
// defined by SPEC-002 §7. The err argument is the internal error that caused the
// failure: it is logged through the shared logger for operators and never
// reaches the client, so that SQL, schema names, driver text and wrapped
// internal errors cannot leak into the response ([API-004], SPEC-002 §6.1.0). A
// nil err is logged as well, since an unattributed failure is still worth
// recording.
func NewInternalServerError(err error) ErrorResponse {
	Logger().WithError(err).Error("request failed with an internal error")

	return ErrorResponse{
		Error:   errorCodeInternalServerError,
		Details: internalServerErrorDetails,
	}
}
