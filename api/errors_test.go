package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestErrorResponse tests that the shared error envelope marshals to exactly the
// two fields defined by SPEC-002 §6.1.0, with no additional or renamed fields.
func TestErrorResponse(t *testing.T) {
	t.Run("marshals to error and details only", func(t *testing.T) {
		body, err := json.Marshal(ErrorResponse{Error: "Bad Request", Details: "comment: must not be empty"})

		assert.NoError(t, err)
		assert.JSONEq(t, `{"error":"Bad Request","details":"comment: must not be empty"}`, string(body))

		var fields map[string]any
		assert.NoError(t, json.Unmarshal(body, &fields))
		assert.Len(t, fields, 2)
		assert.Contains(t, fields, "error")
		assert.Contains(t, fields, "details")
	})

	t.Run("empty details is still serialized", func(t *testing.T) {
		body, err := json.Marshal(ErrorResponse{Error: "Not Found"})

		assert.NoError(t, err)
		assert.JSONEq(t, `{"error":"Not Found","details":""}`, string(body))
	})
}

// TestNewBadRequestError tests that validation failures name the failing field
// and the reason for the failure, as required by SPEC-002 §6.1.0.
func TestNewBadRequestError(t *testing.T) {
	t.Run("names the failing field and reason", func(t *testing.T) {
		response := NewBadRequestError("comment", "must not be empty")

		assert.Equal(t, "Bad Request", response.Error)
		assert.Equal(t, "comment: must not be empty", response.Details)
	})

	t.Run("marshals to the shared envelope", func(t *testing.T) {
		body, err := json.Marshal(NewBadRequestError("article_id", "must be a valid UUID"))

		assert.NoError(t, err)
		assert.JSONEq(t, `{"error":"Bad Request","details":"article_id: must be a valid UUID"}`, string(body))
	})
}

// TestNewNotFoundError tests that a single, generic 404 envelope is returned for
// every non-disclosure path, so that responses cannot be used to distinguish a
// missing resource from a hidden, doc-less or restricted one.
func TestNewNotFoundError(t *testing.T) {
	t.Run("returns the generic not found envelope", func(t *testing.T) {
		response := NewNotFoundError()

		assert.Equal(t, "Not Found", response.Error)
		assert.NotEmpty(t, response.Details)
	})

	t.Run("is byte identical regardless of the underlying cause", func(t *testing.T) {
		// each call site below stands in for one of the causes described by
		// REQ-3.6, REQ-3.7, REQ-4.8, REQ-4.9 and REQ-4.10
		missing, err := json.Marshal(NewNotFoundError())
		assert.NoError(t, err)

		for _, cause := range []string{"missing", "hidden", "doc-less", "restricted"} {
			t.Run(cause, func(t *testing.T) {
				body, err := json.Marshal(NewNotFoundError())

				assert.NoError(t, err)
				assert.Equal(t, string(missing), string(body))
			})
		}
	})

	t.Run("does not disclose the resource type", func(t *testing.T) {
		body, err := json.Marshal(NewNotFoundError())

		assert.NoError(t, err)
		for _, disclosure := range []string{"article", "spec", "document", "display", "restricted"} {
			assert.NotContains(t, strings.ToLower(string(body)), disclosure)
		}
	})
}

// TestNewInternalServerError tests that internal failures return the verbatim
// body defined by SPEC-002 §7 and never leak the underlying error.
func TestNewInternalServerError(t *testing.T) {
	t.Run("returns the verbatim internal server error body", func(t *testing.T) {
		body, err := json.Marshal(NewInternalServerError(nil))

		assert.NoError(t, err)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`, string(body))
	})

	t.Run("does not leak a wrapped database error", func(t *testing.T) {
		wrapped := fmt.Errorf("failed to fetch article: %w",
			errors.New(`ERROR: relation "articles" does not exist (SQLSTATE 42P01) on host=db.internal:5432`))

		response := NewInternalServerError(wrapped)
		body, err := json.Marshal(response)

		assert.NoError(t, err)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`, string(body))

		for _, leak := range []string{"SQLSTATE", "relation", "articles", "db.internal", "5432", "failed to fetch"} {
			assert.NotContains(t, string(body), leak)
		}
	})

	t.Run("is identical for every underlying error", func(t *testing.T) {
		first, err := json.Marshal(NewInternalServerError(errors.New("connection refused")))
		assert.NoError(t, err)

		second, err := json.Marshal(NewInternalServerError(errors.New("driver: bad connection")))
		assert.NoError(t, err)

		assert.Equal(t, string(first), string(second))
	})
}
