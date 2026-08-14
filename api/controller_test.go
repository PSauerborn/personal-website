package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

// testConfig returns a configuration carrying a deliberately non-default version
// string, so that a hard-coded version in VersionHandler fails the tests.
func testConfig() Config {
	return Config{Version: "v9.9.9-test"}
}

// captureLogs redirects the shared logger to an in-memory buffer for the
// duration of the given function and returns everything that was logged.
func captureLogs(fn func()) string {
	var buffer bytes.Buffer

	logger := Logger()
	logger.SetOutput(&buffer)
	defer logger.SetOutput(os.Stdout)

	fn()

	return buffer.String()
}

// TestNewController tests that the controller stores the persistence singleton
// and the configuration it was constructed with ([GO-API-002]).
func TestNewController(t *testing.T) {
	t.Run("stores the persistence layer and configuration", func(t *testing.T) {
		db := &mockPersistenceLayer{}

		controller := NewController(db, testConfig())

		assert.NotNil(t, controller)
		assert.Same(t, db, controller.db)
		assert.Equal(t, testConfig(), controller.config)
	})
}

// TestHealthHandler tests both paths through the health endpoint defined by
// SPEC-002 §6.1.1 (AC-4, AC-6, REQ-1.5).
func TestHealthHandler(t *testing.T) {
	t.Run("returns 200 and the OK status when the database is healthy", func(t *testing.T) {
		db := &mockPersistenceLayer{}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.HealthHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.healthCheckCalls)

		var body map[string]string
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]string{"status": "OK"}, body)
	})

	t.Run("passes the request context to the health check", func(t *testing.T) {
		db := &mockPersistenceLayer{}
		controller := NewController(db, testConfig())

		serveHandler(controller.HealthHandler)

		assert.NotNil(t, db.lastHealthContext)
	})

	t.Run("returns 500 and the generic envelope when the health check fails", func(t *testing.T) {
		db := &mockPersistenceLayer{healthCheckErr: fmt.Errorf("%w: ping failed", ErrDatabaseUnavailable)}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.HealthHandler)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
	})

	t.Run("does not leak the underlying error to the caller", func(t *testing.T) {
		db := &mockPersistenceLayer{healthCheckErr: errors.New(
			`dial tcp db.internal:5432: connect: connection refused (SQLSTATE 08006)`)}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.HealthHandler)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		for _, leak := range []string{"dial tcp", "db.internal", "5432", "SQLSTATE", "connection refused"} {
			assert.NotContains(t, recorder.Body.String(), leak)
		}
	})

	t.Run("logs the underlying error", func(t *testing.T) {
		db := &mockPersistenceLayer{healthCheckErr: errors.New("connection refused")}
		controller := NewController(db, testConfig())

		logs := captureLogs(func() {
			serveHandler(controller.HealthHandler)
		})

		assert.Contains(t, logs, "connection refused")
	})
}

// TestVersionHandler tests that the version endpoint serves the configured
// version verbatim, as defined by SPEC-002 §6.1.2 (AC-5).
func TestVersionHandler(t *testing.T) {
	t.Run("returns 200 and the configured version", func(t *testing.T) {
		controller := NewController(&mockPersistenceLayer{}, testConfig())

		recorder := serveHandler(controller.VersionHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)

		var body map[string]string
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]string{"version": "v9.9.9-test"}, body)
	})

	t.Run("reads the version from config rather than a literal", func(t *testing.T) {
		controller := NewController(&mockPersistenceLayer{}, Config{Version: "v2.0.0-rc1"})

		recorder := serveHandler(controller.VersionHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)

		var body map[string]string
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]string{"version": "v2.0.0-rc1"}, body)
	})

	t.Run("does not query the persistence layer", func(t *testing.T) {
		db := &mockPersistenceLayer{}
		controller := NewController(db, testConfig())

		serveHandler(controller.VersionHandler)

		assert.Equal(t, 0, db.healthCheckCalls)
	})
}
