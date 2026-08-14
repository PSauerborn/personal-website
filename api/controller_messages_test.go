package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// postMessage sends the given raw JSON body to POST /v1/messages through a
// fully constructed router, so that both the handler and its registration are
// exercised. The db argument is the persistence double backing the controller
// and the body argument is the verbatim request payload. It returns the
// recorded response.
func postMessage(db PersistenceLayer, body string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)

	router := NewRouter(NewController(db, Config{}))
	request := httptest.NewRequest(http.MethodPost, "/v1/messages", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

// decodeBody unmarshals the JSON body of the given recorder into a generic map
// so that individual response fields can be asserted. It fails the test when
// the body is not valid JSON.
func decodeBody(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var body map[string]any
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	return body
}

// TestCreateMessageHandler tests every path through the message creation
// endpoint: the identifier it returns for a new and for a known contact, the
// null passed to persistence for an omitted or whitespace-only organization, the
// sanitization applied before persistence, the client supplied server side
// fields it ignores, the field-level 400 envelopes returned for each malformed
// field, the generic 500 envelope returned on a persistence failure, and the
// paths served with and without a trailing slash (SPEC-002 §6.1.7, REQ-5.2,
// REQ-5.3, REQ-5.5, REQ-5.6).
func TestCreateMessageHandler(t *testing.T) {
	t.Run("new visitor submission returns 201 with the message id", func(t *testing.T) {
		db := &mockPersistenceLayer{createdMessageID: "msg-1"}

		recorder := postMessage(db, `{"email":"visitor@example.com","name":"Ada Lovelace",
			"organization":"Analytical Engines","message":"Hello there"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.JSONEq(t, `{"message_id":"msg-1"}`, recorder.Body.String())
		assert.Equal(t, 1, db.createMessageCalls)
		require.NotNil(t, db.lastMessageSubmission.Organization)
		assert.Equal(t, MessageSubmission{
			Name:         "Ada Lovelace",
			Email:        "visitor@example.com",
			Organization: db.lastMessageSubmission.Organization,
			Content:      "Hello there",
		}, db.lastMessageSubmission)
		assert.Equal(t, "Analytical Engines", *db.lastMessageSubmission.Organization)
	})

	t.Run("existing contact submission returns 201 with the message id", func(t *testing.T) {
		db := &mockPersistenceLayer{createdMessageID: "msg-2"}

		recorder := postMessage(db, `{"email":"returning@example.com","name":"Grace Hopper",
			"organization":"Navy","message":"Second message"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.JSONEq(t, `{"message_id":"msg-2"}`, recorder.Body.String())
		assert.Equal(t, "returning@example.com", db.lastMessageSubmission.Email)
		assert.Equal(t, "Second message", db.lastMessageSubmission.Content)
	})

	t.Run("submission without an organization passes null to persistence", func(t *testing.T) {
		db := &mockPersistenceLayer{createdMessageID: "msg-3"}

		recorder := postMessage(db,
			`{"email":"solo@example.com","name":"Alan Turing","message":"No org here"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.Equal(t, 1, db.createMessageCalls)
		assert.Nil(t, db.lastMessageSubmission.Organization)
	})

	t.Run("whitespace-only organization passes null to persistence", func(t *testing.T) {
		db := &mockPersistenceLayer{createdMessageID: "msg-4"}

		recorder := postMessage(db,
			`{"email":"solo@example.com","name":"Alan Turing","organization":"   ","message":"No org"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.Nil(t, db.lastMessageSubmission.Organization)
	})

	t.Run("submitted details are sanitized before persistence", func(t *testing.T) {
		db := &mockPersistenceLayer{createdMessageID: "msg-5"}

		recorder := postMessage(db, `{"email":"  Ada.Lovelace@Example.COM  ","name":"  ada   LOVELACE ",
			"organization":"  analytical   engines  ","message":"  Hello there  "}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.Equal(t, "ada.lovelace@example.com", db.lastMessageSubmission.Email)
		// only the first letter of each word is capitalized, so the interior
		// capitals of the submitted name are left untouched (REQ-5.3)
		assert.Equal(t, "Ada LOVELACE", db.lastMessageSubmission.Name)
		require.NotNil(t, db.lastMessageSubmission.Organization)
		assert.Equal(t, "Analytical Engines", *db.lastMessageSubmission.Organization)
	})

	t.Run("sanitization preserves the interior capitals of the name", func(t *testing.T) {
		cases := []struct {
			name      string
			submitted string
			expected  string
		}{
			{name: "interior capital is preserved", submitted: "Test McLovin", expected: "Test McLovin"},
			{name: "lower case name is capitalized per word", submitted: "test mclovin", expected: "Test Mclovin"},
			{name: "padded name with interior capital", submitted: "  Test   McLovin  ", expected: "Test McLovin"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				db := &mockPersistenceLayer{createdMessageID: "msg-7"}

				body := fmt.Sprintf(
					`{"email":"visitor@example.com","name":%q,"organization":"acme corp","message":"Hello"}`,
					testCase.submitted)
				recorder := postMessage(db, body)

				require.Equal(t, http.StatusCreated, recorder.Code)
				assert.Equal(t, testCase.expected, db.lastMessageSubmission.Name)
				require.NotNil(t, db.lastMessageSubmission.Organization)
				assert.Equal(t, "Acme Corp", *db.lastMessageSubmission.Organization)
			})
		}
	})

	t.Run("client supplied read and submitted_at values are ignored", func(t *testing.T) {
		db := &mockPersistenceLayer{createdMessageID: "msg-6"}

		recorder := postMessage(db, `{"email":"visitor@example.com","name":"Ada Lovelace",
			"message":"Hello there","read":true,"submitted_at":"1999-01-01T00:00:00Z","id":"forged"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.Equal(t, MessageSubmission{
			Name:    "Ada Lovelace",
			Email:   "visitor@example.com",
			Content: "Hello there",
		}, db.lastMessageSubmission)
	})

	t.Run("malformed submissions are rejected with 400 naming the field", func(t *testing.T) {
		cases := []struct {
			name  string
			body  string
			field string
		}{
			{
				name:  "malformed JSON",
				body:  `{"email":"visitor@example.com",`,
				field: "body",
			},
			{
				name:  "missing email",
				body:  `{"name":"Ada Lovelace","message":"Hello"}`,
				field: "email",
			},
			{
				name:  "invalid email",
				body:  `{"email":"not-an-email","name":"Ada Lovelace","message":"Hello"}`,
				field: "email",
			},
			{
				name:  "over-length email",
				body:  `{"email":"` + strings.Repeat("a", 320) + `@example.com","name":"Ada","message":"Hello"}`,
				field: "email",
			},
			{
				name:  "empty name",
				body:  `{"email":"visitor@example.com","name":"","message":"Hello"}`,
				field: "name",
			},
			{
				name:  "whitespace-only name",
				body:  `{"email":"visitor@example.com","name":"   ","message":"Hello"}`,
				field: "name",
			},
			{
				name:  "over-length name",
				body:  `{"email":"visitor@example.com","name":"` + strings.Repeat("a", 256) + `","message":"Hello"}`,
				field: "name",
			},
			{
				name: "over-length organization",
				body: `{"email":"visitor@example.com","name":"Ada","organization":"` +
					strings.Repeat("a", 256) + `","message":"Hello"}`,
				field: "organization",
			},
			{
				name:  "empty message",
				body:  `{"email":"visitor@example.com","name":"Ada Lovelace","message":""}`,
				field: "message",
			},
			{
				name:  "whitespace-only message",
				body:  `{"email":"visitor@example.com","name":"Ada Lovelace","message":"   \t  "}`,
				field: "message",
			},
			{
				name: "over-length message",
				body: `{"email":"visitor@example.com","name":"Ada Lovelace","message":"` +
					strings.Repeat("a", MessageMaxLength+1) + `"}`,
				field: "message",
			},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				db := &mockPersistenceLayer{createdMessageID: "msg-unused"}

				recorder := postMessage(db, testCase.body)

				assert.Equal(t, http.StatusBadRequest, recorder.Code)
				assert.Zero(t, db.createMessageCalls)

				body := decodeBody(t, recorder)
				assert.Equal(t, errorCodeBadRequest, body["error"])

				details, ok := body["details"].(string)
				require.True(t, ok)
				assert.True(t, strings.HasPrefix(details, testCase.field+": "), details)
				assert.NotEmpty(t, strings.TrimPrefix(details, testCase.field+": "))
			})
		}
	})

	t.Run("accepts a message exactly at the accepted maximum", func(t *testing.T) {
		db := &mockPersistenceLayer{createdMessageID: "msg-1"}

		recorder := postMessage(db, `{"email":"visitor@example.com","name":"Ada Lovelace","message":"`+
			strings.Repeat("a", MessageMaxLength)+`"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.Equal(t, 1, db.createMessageCalls)
	})

	t.Run("persistence failure returns the generic 500 envelope", func(t *testing.T) {
		db := &mockPersistenceLayer{createMessageErr: errors.New("relation base.message does not exist")}

		recorder := postMessage(db,
			`{"email":"visitor@example.com","name":"Ada Lovelace","message":"Hello there"}`)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.JSONEq(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
		assert.NotContains(t, recorder.Body.String(), "base.message")
	})

	t.Run("path without a trailing slash is served rather than redirected", func(t *testing.T) {
		db := &mockPersistenceLayer{createdMessageID: "msg-7"}

		recorder := postMessage(db,
			`{"email":"visitor@example.com","name":"Ada Lovelace","message":"Hello there"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.NotEqual(t, http.StatusMovedPermanently, recorder.Code)
		assert.NotEqual(t, http.StatusTemporaryRedirect, recorder.Code)
	})

	t.Run("path with a trailing slash is served as well", func(t *testing.T) {
		gin.SetMode(gin.TestMode)

		db := &mockPersistenceLayer{createdMessageID: "msg-8"}
		router := NewRouter(NewController(db, Config{}))

		request := httptest.NewRequest(http.MethodPost, "/v1/messages/", strings.NewReader(
			`{"email":"visitor@example.com","name":"Ada Lovelace","message":"Hello there"}`))
		request.Header.Set("Content-Type", "application/json")

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.JSONEq(t, `{"message_id":"msg-8"}`, recorder.Body.String())
	})
}
