package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// testRouter returns a router built on a controller backed by the given mocked
// persistence layer, so that the tests below exercise the real engine without
// requiring a database ([GO-030]).
func testRouter(db PersistenceLayer) *gin.Engine {
	gin.SetMode(gin.TestMode)

	return NewRouter(NewController(db, testConfig()))
}

// serveRequest runs a single request through the given engine and returns the
// recorded response. The origin argument is sent as the Origin header when it
// is non-empty, which is what turns the request into a CORS request.
func serveRequest(router *gin.Engine, method, path, origin string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, nil)
	if origin != "" {
		request.Header.Set("Origin", origin)
	}

	if method == http.MethodOptions {
		request.Header.Set("Access-Control-Request-Method", http.MethodGet)
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	return recorder
}

// TestNewRouter tests the engine returned by the router constructor: the CORS
// behaviour required by SPEC-002 §6.2 (AC-1, AC-2, AC-3) and the base router
// endpoints of REQ-1.3 served end to end (AC-4, AC-5, AC-6).
func TestNewRouter(t *testing.T) {
	t.Run("returns an engine", func(t *testing.T) {
		assert.NotNil(t, testRouter(&mockPersistenceLayer{}))
	})

	t.Run("answers a preflight from an allowed origin with 204", func(t *testing.T) {
		for _, origin := range []string{
			"http://localhost:9000",
			"https://psauerborn.dev",
			"https://dev.psauerborn.dev",
		} {
			recorder := serveRequest(testRouter(&mockPersistenceLayer{}),
				http.MethodOptions, "/v1/health", origin)

			assert.Equal(t, http.StatusNoContent, recorder.Code)
			assert.Equal(t, origin, recorder.Header().Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("advertises the configured methods and headers on a preflight", func(t *testing.T) {
		recorder := serveRequest(testRouter(&mockPersistenceLayer{}),
			http.MethodOptions, "/v1/health", "https://psauerborn.dev")

		assert.ElementsMatch(t, []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
			splitHeaderValues(recorder.Header().Get("Access-Control-Allow-Methods")))
		assert.ElementsMatch(t, []string{"Content-Type", "Accept", "Accept-Language", "Content-Language"},
			splitHeaderValues(recorder.Header().Get("Access-Control-Allow-Headers")))
	})

	t.Run("answers a preflight from a disallowed origin with 204 and no allow origin header", func(t *testing.T) {
		for _, origin := range []string{
			"https://evil.com",
			"http://localhost:9001",
			"https://psauerborn.dev.evil.com",
		} {
			recorder := serveRequest(testRouter(&mockPersistenceLayer{}),
				http.MethodOptions, "/v1/health", origin)

			assert.Equal(t, http.StatusNoContent, recorder.Code)
			assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
			// Without Vary a shared cache would key this response on the bare
			// URL and replay it to an allowed origin, which would then receive a
			// response carrying no Access-Control-Allow-Origin header.
			assert.Contains(t, splitHeaderValues(recorder.Header().Get("Vary")), "Origin",
				"responses on the CORS bypass path must vary on Origin")
		}
	})

	t.Run("echoes the origin of a simple request from an allowed origin", func(t *testing.T) {
		recorder := serveRequest(testRouter(&mockPersistenceLayer{}),
			http.MethodGet, "/v1/health", "http://localhost:9000")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, "http://localhost:9000", recorder.Header().Get("Access-Control-Allow-Origin"))
		assert.Contains(t, splitHeaderValues(recorder.Header().Get("Vary")), "Origin",
			"responses to an allowed origin must vary on Origin")
	})

	t.Run("does not allow the origin of a simple request from a disallowed origin", func(t *testing.T) {
		recorder := serveRequest(testRouter(&mockPersistenceLayer{}),
			http.MethodGet, "/v1/health", "https://evil.com")

		assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
		assert.Contains(t, splitHeaderValues(recorder.Header().Get("Vary")), "Origin",
			"responses on the CORS bypass path must vary on Origin")
	})

	t.Run("serves requests without an origin header unchanged", func(t *testing.T) {
		recorder := serveRequest(testRouter(&mockPersistenceLayer{}), http.MethodGet, "/v1/health", "")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("serves the health endpoint on the base group", func(t *testing.T) {
		db := &mockPersistenceLayer{}

		recorder := serveRequest(testRouter(db), http.MethodGet, "/v1/health", "")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.healthCheckCalls)

		var body map[string]string
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]string{"status": "OK"}, body)
	})

	t.Run("serves 500 on the health endpoint when the database is unreachable", func(t *testing.T) {
		db := &mockPersistenceLayer{healthCheckErr: ErrDatabaseUnavailable}

		var recorder *httptest.ResponseRecorder
		captureLogs(func() {
			recorder = serveRequest(testRouter(db), http.MethodGet, "/v1/health", "")
		})

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
	})

	t.Run("serves the version endpoint on the base group", func(t *testing.T) {
		recorder := serveRequest(testRouter(&mockPersistenceLayer{}), http.MethodGet, "/v1/version", "")

		assert.Equal(t, http.StatusOK, recorder.Code)

		var body map[string]string
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]string{"version": testConfig().Version}, body)
	})

	t.Run("does not serve the base endpoints outside the /v1 prefix", func(t *testing.T) {
		for _, path := range []string{"/health", "/version"} {
			recorder := serveRequest(testRouter(&mockPersistenceLayer{}), http.MethodGet, path, "")

			assert.Equal(t, http.StatusNotFound, recorder.Code)
		}
	})
}

// corsRecorder runs a single request carrying the given method and origin
// through an engine whose only registered middleware is CORSMiddleware, and
// returns the recorded response together with a flag reporting whether the
// request reached the endpoint behind it. Exercising the middleware on its own
// engine - rather than through NewRouter - keeps the assertions below about the
// middleware itself, and lets them distinguish a request that was terminated by
// the middleware from one that was passed through.
func corsRecorder(method, origin string) (*httptest.ResponseRecorder, bool) {
	gin.SetMode(gin.TestMode)

	served := false
	router := gin.New()
	router.Use(CORSMiddleware())
	router.Handle(method, "/resource", func(c *gin.Context) {
		served = true
		c.Status(http.StatusOK)
	})

	request := httptest.NewRequest(method, "/resource", nil)
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	if method == http.MethodOptions {
		request.Header.Set("Access-Control-Request-Method", http.MethodGet)
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	return recorder, served
}

// TestCORSMiddleware tests the middleware returned by CORSMiddleware in
// isolation, covering each path through it: a request from an allowed origin is
// answered with that origin echoed back, a request from a disallowed origin is
// answered without any CORS header, a preflight from a disallowed origin is
// terminated with 204 rather than reaching the endpoint, and a request carrying
// no Origin header passes through untouched (SPEC-002 §6.2, AC-1, AC-2, AC-3).
func TestCORSMiddleware(t *testing.T) {
	t.Run("allows a request from an allowed origin", func(t *testing.T) {
		for _, origin := range corsAllowedOrigins {
			recorder, served := corsRecorder(http.MethodGet, origin)

			assert.True(t, served, "a request from an allowed origin must reach the endpoint")
			assert.Equal(t, http.StatusOK, recorder.Code)
			assert.Equal(t, origin, recorder.Header().Get("Access-Control-Allow-Origin"))
			assert.Contains(t, splitHeaderValues(recorder.Header().Get("Vary")), "Origin")
		}
	})

	t.Run("answers a preflight from an allowed origin with 204", func(t *testing.T) {
		recorder, served := corsRecorder(http.MethodOptions, corsAllowedOrigins[0])

		assert.False(t, served, "a preflight must be answered by the middleware")
		assert.Equal(t, http.StatusNoContent, recorder.Code)
		assert.Equal(t, corsAllowedOrigins[0], recorder.Header().Get("Access-Control-Allow-Origin"))
		assert.ElementsMatch(t, corsAllowedMethods,
			splitHeaderValues(recorder.Header().Get("Access-Control-Allow-Methods")))
		assert.ElementsMatch(t, corsAllowedHeaders,
			splitHeaderValues(recorder.Header().Get("Access-Control-Allow-Headers")))
	})

	t.Run("writes no CORS headers for a disallowed origin", func(t *testing.T) {
		for _, origin := range []string{
			"https://evil.com",
			"http://localhost:9001",
			"https://psauerborn.dev.evil.com",
		} {
			recorder, served := corsRecorder(http.MethodGet, origin)

			// the request itself is still served: it is the missing
			// Access-Control-Allow-Origin header that makes the browser reject
			// the response, and answering it any differently would disclose
			// which origins the API knows about.
			assert.True(t, served)
			assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
			assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Methods"))
			assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Headers"))
			assert.Contains(t, splitHeaderValues(recorder.Header().Get("Vary")), "Origin",
				"responses on the CORS bypass path must vary on Origin")
		}
	})

	t.Run("terminates a preflight from a disallowed origin with 204", func(t *testing.T) {
		recorder, served := corsRecorder(http.MethodOptions, "https://evil.com")

		assert.False(t, served, "a disallowed preflight must never reach the endpoint")
		assert.Equal(t, http.StatusNoContent, recorder.Code)
		assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
		assert.Contains(t, splitHeaderValues(recorder.Header().Get("Vary")), "Origin")
	})

	t.Run("passes a request without an origin header through", func(t *testing.T) {
		recorder, served := corsRecorder(http.MethodGet, "")

		assert.True(t, served, "a request without an Origin header must reach the endpoint")
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
	})
}

// postBody performs a POST request carrying the given raw body against the given
// path on a router backed by a mocked persistence layer, and returns the
// recorded response. The body is written verbatim so that the size limit can be
// exercised exactly as a client would trip it.
func postBody(db PersistenceLayer, path string, body []byte) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)

	router := NewRouter(NewController(db, testConfig()))
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	return recorder
}

// oversizedJSONBody returns a syntactically valid JSON body for the given field
// that exceeds maxRequestBodyBytes, so that the request is refused on its size
// alone rather than on its content.
func oversizedJSONBody(field string) []byte {
	return []byte(fmt.Sprintf(`{%q: %q}`, field, strings.Repeat("a", maxRequestBodyBytes+1)))
}

// TestBodyLimitMiddleware tests that the unauthenticated write endpoints refuse
// a request body larger than the configured limit with the shared 400 body
// envelope, so that no caller can pin an unbounded body in the process heap
// (RISK-004).
func TestBodyLimitMiddleware(t *testing.T) {
	writeEndpoints := map[string]string{
		"/v1/messages":                   messageMessageField,
		"/v1/messages/":                  messageMessageField,
		"/v1/articles/article-1/comment": commentCommentField,
	}

	for path, field := range writeEndpoints {
		t.Run(fmt.Sprintf("refuses an oversized body on POST %s", path), func(t *testing.T) {
			db := &mockPersistenceLayer{createdMessageID: "message-1", createdCommentID: "comment-1"}

			var recorder *httptest.ResponseRecorder
			captureLogs(func() {
				recorder = postBody(db, path, oversizedJSONBody(field))
			})

			assert.Equal(t, http.StatusBadRequest, recorder.Code)
			assert.JSONEq(t, `{"error": "Bad Request", "details": "body: must be a valid JSON object"}`,
				recorder.Body.String())
		})

		t.Run(fmt.Sprintf("serves a body within the limit on POST %s", path), func(t *testing.T) {
			db := &mockPersistenceLayer{createdMessageID: "message-1", createdCommentID: "comment-1"}

			recorder := postBody(db, path, []byte(fmt.Sprintf(
				`{"email": "a@example.com", "name": "Pascal", %q: "hello"}`, field)))

			assert.Equal(t, http.StatusCreated, recorder.Code)
		})
	}

	t.Run("bounds the body well below the memory a request may pin", func(t *testing.T) {
		assert.Positive(t, maxRequestBodyBytes)
		assert.LessOrEqual(t, maxRequestBodyBytes, 1<<20,
			"the limit must stay small enough that concurrent requests cannot exhaust the process heap")
	})
}

// splitHeaderValues splits a comma separated header value into its individual
// entries, so that assertions can compare the advertised sets irrespective of
// the order in which the middleware serializes them.
func splitHeaderValues(value string) []string {
	if value == "" {
		return nil
	}

	values := strings.Split(value, ",")
	for i, entry := range values {
		values[i] = strings.TrimSpace(entry)
	}

	return values
}
