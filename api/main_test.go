package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAdminAuthentication(t *testing.T) {
	t.Run("valid api key", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
			config: &Config{
				APIVersion: "v1",
			},
		}

		writer := httptest.NewRecorder()
		request := httptest.NewRequest("GET", "/v1/admin/contacts", nil)
		request.Header.Set("X-API-Key", "sk_test_valid_key_1234567890abcdef")

		router := NewRouter(controller)
		router.ServeHTTP(writer, request)

		assert.Equal(t, http.StatusOK, writer.Code)
	})

	t.Run("invalid api key", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
			config: &Config{
				APIVersion: "v1",
			},
		}

		writer := httptest.NewRecorder()
		request := httptest.NewRequest("GET", "/v1/admin/contacts", nil)
		request.Header.Set("X-API-Key", "not-a-valid-key")

		router := NewRouter(controller)
		router.ServeHTTP(writer, request)

		assert.Equal(t, http.StatusForbidden, writer.Code)
	})

	t.Run("missing api key", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
			config: &Config{
				APIVersion: "v1",
			},
		}

		writer := httptest.NewRecorder()
		request := httptest.NewRequest("GET", "/v1/admin/contacts", nil)

		router := NewRouter(controller)
		router.ServeHTTP(writer, request)

		assert.Equal(t, http.StatusForbidden, writer.Code)
	})

	t.Run("expired api key", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
			config: &Config{
				APIVersion: "v1",
			},
		}

		writer := httptest.NewRecorder()
		request := httptest.NewRequest("GET", "/v1/admin/contacts", nil)
		request.Header.Set("X-API-Key", "sk_test_expired_key_expired12345")

		router := NewRouter(controller)
		router.ServeHTTP(writer, request)

		assert.Equal(t, http.StatusForbidden, writer.Code)
	})
}
