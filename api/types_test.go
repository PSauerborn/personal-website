package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// serveHandler runs the given handler through the Handler adapter on a throw
// away gin engine and returns the recorded response. It keeps the tests below
// focused on the response that reaches the client rather than on gin wiring.
func serveHandler(handler func(c *gin.Context) JSONResponse) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.GET("/test", Handler(handler))

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/test", nil))

	return recorder
}

// TestNewJSONResponse tests that the general purpose constructor carries the
// given status code and body through unchanged.
func TestNewJSONResponse(t *testing.T) {
	t.Run("carries the given code and body", func(t *testing.T) {
		response := NewJSONResponse(http.StatusAccepted, gin.H{"status": "OK"})

		assert.Equal(t, http.StatusAccepted, response.Code)
		assert.Equal(t, gin.H{"status": "OK"}, response.Body)
		assert.Empty(t, response.ContentType)
		assert.Nil(t, response.RawContent)
	})
}

// TestNewOKResponse tests that the constructor defaults to status 200 and
// serializes the given body as JSON (SPEC-002 §6.1).
func TestNewOKResponse(t *testing.T) {
	t.Run("defaults to status 200 and a JSON body", func(t *testing.T) {
		response := NewOKResponse(gin.H{"version": "v1"})

		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, gin.H{"version": "v1"}, response.Body)
		assert.Empty(t, response.ContentType)
	})
}

// TestNewCreatedResponse tests that the constructor returns 201 with the single
// identifier body of SPEC-002 §6.1.7 and §6.1.11, under the field name it is
// given.
func TestNewCreatedResponse(t *testing.T) {
	t.Run("returns 201 with the message ID body", func(t *testing.T) {
		response := NewCreatedResponse("message_id", "message-1")

		assert.Equal(t, http.StatusCreated, response.Code)
		assert.Equal(t, gin.H{"message_id": "message-1"}, response.Body)
	})

	t.Run("returns 201 with the comment ID body", func(t *testing.T) {
		response := NewCreatedResponse("comment_id", "comment-1")

		assert.Equal(t, http.StatusCreated, response.Code)
		assert.Equal(t, gin.H{"comment_id": "comment-1"}, response.Body)
	})
}

// TestNewRawContentResponse tests that the constructor returns 200 with the
// content written verbatim under the binary/octet-stream content type
// (SPEC-002 §6.1.6, §6.1.9).
func TestNewRawContentResponse(t *testing.T) {
	t.Run("returns 200 with the octet-stream content type", func(t *testing.T) {
		response := NewRawContentResponse([]byte("# Some Document"))

		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, contentTypeOctetStream, response.ContentType)
		assert.Equal(t, []byte("# Some Document"), response.RawContent)
		assert.Nil(t, response.Body)
	})
}

// TestHandler tests every response shape the adapter writes to the client: JSON
// bodies with a 200 and a 201 status, raw content served unmodified as
// binary/octet-stream, and an error envelope with its own status code
// ([GO-API-004]).
func TestHandler(t *testing.T) {
	t.Run("writes a JSON 200 response", func(t *testing.T) {
		recorder := serveHandler(func(c *gin.Context) JSONResponse {
			return NewOKResponse(gin.H{"status": "OK"})
		})

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, "application/json; charset=utf-8", recorder.Header().Get("Content-Type"))

		var body map[string]string
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]string{"status": "OK"}, body)
	})

	t.Run("writes a JSON 201 response", func(t *testing.T) {
		recorder := serveHandler(func(c *gin.Context) JSONResponse {
			return NewCreatedResponse("message_id", "message-1")
		})

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.Equal(t, "application/json; charset=utf-8", recorder.Header().Get("Content-Type"))

		var body map[string]string
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]string{"message_id": "message-1"}, body)
	})

	t.Run("writes raw content unmodified as binary/octet-stream", func(t *testing.T) {
		content := []byte{0x00, 0x01, 0x02, 'r', 'a', 'w', 0xff}

		recorder := serveHandler(func(c *gin.Context) JSONResponse {
			return NewRawContentResponse(content)
		})

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, contentTypeOctetStream, recorder.Header().Get("Content-Type"))
		assert.Equal(t, content, recorder.Body.Bytes())
	})

	t.Run("writes an error envelope with the given status code", func(t *testing.T) {
		recorder := serveHandler(func(c *gin.Context) JSONResponse {
			return NewJSONResponse(http.StatusNotFound, NewNotFoundError())
		})

		assert.Equal(t, http.StatusNotFound, recorder.Code)
		assert.Equal(t, "application/json; charset=utf-8", recorder.Header().Get("Content-Type"))

		var body map[string]string
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]string{
			"error":   "Not Found",
			"details": notFoundDetails,
		}, body)
	})
}
