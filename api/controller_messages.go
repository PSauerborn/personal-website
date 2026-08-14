package main

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Names of the request fields reported by the 400 responses of the message
// creation endpoint (SPEC-002 §6.1.0, §6.1.7), with messageBodyField standing
// for the request body as a whole when it cannot be parsed at all.
const (
	messageBodyField         = "body"
	messageEmailField        = "email"
	messageNameField         = "name"
	messageOrganizationField = "organization"
	messageMessageField      = "message"
)

// CreateMessageHandler serves POST /v1/messages. It records the submitted
// contact message and returns 201 with the identifier generated for it
// (REQ-5.2, SPEC-002 §6.1.7). The submitted details are sanitized before they
// are handed to the persistence layer - the email trimmed and lower-cased, the
// name and organization trimmed, their internal whitespace runs collapsed to a
// single space and the first letter of each word capitalized with the remainder
// of the word left exactly as submitted - so that contacts are not duplicated
// over casing or spacing differences (REQ-5.3). A
// malformed or oversized body, an invalid or over-long email, an empty or
// over-long name, an over-long organization and an empty or over-long message
// each yield a 400 naming the offending field and the reason (REQ-5.6,
// SPEC-002 §6.1.0). Any persistence
// failure yields the generic 500 envelope, with the underlying error logged
// rather than returned.
func (ct *Controller) CreateMessageHandler(c *gin.Context) JSONResponse {
	var request createMessageRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		Logger().WithError(err).Warn("unable to bind message request body")
		return NewJSONResponse(http.StatusBadRequest,
			NewBadRequestError(messageBodyField, "must be a valid JSON object"))
	}

	submission, errResponse, ok := validateMessageRequest(request)
	if !ok {
		return errResponse
	}

	messageID, err := ct.db.CreateMessage(c.Request.Context(), submission)
	if err != nil {
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	}

	return NewCreatedResponse("message_id", messageID)
}

// validateMessageRequest applies the validation chain of the message creation
// endpoint to the given bound request. Each field is sanitized first, then
// checked for emptiness on its sanitized value, and finally checked against the
// width of the column it is persisted into, so that the rules are applied in
// one order across every field (REQ-5.3, REQ-5.6). The request argument is the
// body as bound from the client. It returns the submission to persist - whose
// organization is nil when none was supplied, so that the contact is stored
// with a null organization rather than an empty string (AC-35) - together with
// the 400 response to serve and a flag reporting whether validation passed. The
// response value is only meaningful when that flag is false.
func validateMessageRequest(request createMessageRequest) (MessageSubmission, JSONResponse, bool) {
	email := SanitizeEmail(request.Email)
	name := SanitizeText(request.Name)
	organization := SanitizeText(request.Organization)

	if !IsValidEmail(email) {
		return MessageSubmission{}, newFieldError(messageEmailField, "must be a valid email address"), false
	}

	if !WithinLength(email, ContactEmailMaxLength) {
		return MessageSubmission{}, newLengthError(messageEmailField, ContactEmailMaxLength), false
	}

	if name == "" {
		return MessageSubmission{}, newFieldError(messageNameField, "must not be empty"), false
	}

	if !WithinLength(name, ContactNameMaxLength) {
		return MessageSubmission{}, newLengthError(messageNameField, ContactNameMaxLength), false
	}

	if !WithinLength(organization, ContactOrganizationMaxLength) {
		return MessageSubmission{}, newLengthError(messageOrganizationField, ContactOrganizationMaxLength), false
	}

	// the message body is stored as submitted rather than sanitized, since
	// sanitization applies to identity fields alone (REQ-5.3). The column it is
	// persisted into is an unbounded TEXT, so its upper bound is the explicit
	// MessageMaxLength policy rather than a column width (RISK-004).
	if IsEmpty(request.Message) {
		return MessageSubmission{}, newFieldError(messageMessageField, "must not be empty"), false
	}

	if !WithinLength(request.Message, MessageMaxLength) {
		return MessageSubmission{}, newLengthError(messageMessageField, MessageMaxLength), false
	}

	submission := MessageSubmission{
		Name:    name,
		Email:   email,
		Content: request.Message,
	}
	if organization != "" {
		submission.Organization = &organization
	}

	return submission, JSONResponse{}, true
}

// newFieldError returns the 400 response served for a request field that failed
// validation. The field argument names the offending field and the reason
// argument states why it was rejected; both are disclosed to the client, so
// neither may carry any internal detail (SPEC-002 §6.1.0).
func newFieldError(field, reason string) JSONResponse {
	return NewJSONResponse(http.StatusBadRequest, NewBadRequestError(field, reason))
}

// newLengthError returns the 400 response served for a request field that
// exceeded the width of the column it is persisted into. The field argument
// names the offending field and the limit argument is the maximum number of
// characters accepted, which is stated back to the client so that the
// submission can be corrected.
func newLengthError(field string, limit int) JSONResponse {
	return newFieldError(field, fmt.Sprintf("must be at most %d characters", limit))
}
