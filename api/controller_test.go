package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestHealthHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {

		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		response := controller.HealthCheckHandler(nil)
		assert.Equal(t, 200, response.Code)
	})

	t.Run("unhealthy", func(t *testing.T) {
		db := NewTestPersistence(false)
		controller := &Controller{
			db: db,
		}

		response := controller.HealthCheckHandler(nil)
		assert.Equal(t, 500, response.Code)
	})
}

func TestVersionHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		config := &Config{
			APIVersion: "v1",
		}
		controller := &Controller{
			config: config,
		}

		response := controller.VersionHandler(nil)
		assert.Equal(t, 200, response.Code)

		payload, ok := response.Payload.(gin.H)
		assert.True(t, ok)
		assert.Equal(t, "v1", payload["version"])
	})
}

func TestResumeHandler(t *testing.T) {
	t.Run("success default json", func(t *testing.T) {
		config := &Config{
			APIVersion:     "v1",
			ResumePathJSON: "etc/resume.json",
			ResumePathPDF:  "etc/resume.pdf",
		}
		controller := &Controller{
			config: config,
		}

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)

		response := controller.ResumeHandler(ctx)
		assert.Equal(t, 200, response.Code)

		payload, ok := response.Payload.(gin.H)
		assert.True(t, ok)

		resume, ok := payload["data"].(map[string]any)
		assert.True(t, ok)
		assert.NotEmpty(t, resume)
	})

	t.Run("success default", func(t *testing.T) {
		config := &Config{
			APIVersion:     "v1",
			ResumePathJSON: "etc/resume.json",
			ResumePathPDF:  "etc/resume.pdf",
		}
		controller := &Controller{
			config: config,
		}

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("GET", "/resume?format=json", nil)

		response := controller.ResumeHandler(ctx)
		assert.Equal(t, 200, response.Code)

		payload, ok := response.Payload.(gin.H)
		assert.True(t, ok)

		resume, ok := payload["data"].(map[string]any)
		assert.True(t, ok)
		assert.NotEmpty(t, resume)
	})

	t.Run("success pdf", func(t *testing.T) {
		config := &Config{
			APIVersion:     "v1",
			ResumePathJSON: "etc/resume.json",
			ResumePathPDF:  "etc/resume.pdf",
		}
		controller := &Controller{
			config: config,
		}

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("GET", "/resume?format=pdf", nil)

		response := controller.ResumeHandler(ctx)
		assert.Equal(t, 200, response.Code)

		payload, ok := response.Payload.(gin.H)
		assert.True(t, ok)

		resume, ok := payload["data"].(string)
		assert.True(t, ok)
		assert.NotEmpty(t, resume)
	})

	t.Run("invalid format", func(t *testing.T) {
		config := &Config{
			APIVersion:     "v1",
			ResumePathJSON: "etc/resume.json",
			ResumePathPDF:  "etc/resume.pdf",
		}
		controller := &Controller{
			config: config,
		}

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("GET", "/resume?format=xml", nil)

		response := controller.ResumeHandler(ctx)
		assert.Equal(t, 400, response.Code)
	})
}

func TestContactHandler(t *testing.T) {
	t.Run("success new contact", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		encoded, _ := json.Marshal(NewContactRequestBody{
			Email:   "test.mclovin@example.com",
			Name:    "Test McLovin",
			Message: "Hello",
		})
		buffer := bytes.NewBuffer(encoded)

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("POST", "/contact", buffer)

		_, exists := db.ContactsByEmail()["test.mclovin@example.com"]
		assert.False(t, exists)

		requests, exists := db.ContactRequestsByEmail()["test.mclovin@example.com"]
		assert.False(t, exists)
		assert.Empty(t, requests)

		response := controller.ContactHandler(ctx)
		assert.Equal(t, 201, response.Code)

		_, exists = db.ContactsByEmail()["test.mclovin@example.com"]
		assert.True(t, exists)

		requests, exists = db.ContactRequestsByEmail()["test.mclovin@example.com"]
		assert.True(t, exists)
		assert.Len(t, requests, 1)
	})

	t.Run("success existing contact", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		encoded, _ := json.Marshal(NewContactRequestBody{
			Email:   "john.doe@example.com",
			Name:    "John Doe",
			Message: "Hello Again (repeat message)",
		})
		buffer := bytes.NewBuffer(encoded)

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("POST", "/contact", buffer)

		_, exists := db.ContactsByEmail()["john.doe@example.com"]
		assert.True(t, exists)

		requests := db.ContactRequestsByEmail()["john.doe@example.com"]
		assert.Len(t, requests, 2)

		response := controller.ContactHandler(ctx)
		assert.Equal(t, 201, response.Code)

		_, exists = db.ContactsByEmail()["john.doe@example.com"]
		assert.True(t, exists)

		requests = db.ContactRequestsByEmail()["john.doe@example.com"]
		assert.Len(t, requests, 3)
	})

	t.Run("invalid email address", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		encoded, _ := json.Marshal(NewContactRequestBody{
			Email:   "invalid-email",
			Name:    "John Doe",
			Message: "Hello",
		})
		buffer := bytes.NewBuffer(encoded)

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("POST", "/contact", buffer)

		response := controller.ContactHandler(ctx)
		assert.Equal(t, 400, response.Code)
	})

	t.Run("empty message", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		encoded, _ := json.Marshal(NewContactRequestBody{
			Email:   "test.mclovin@example.com",
			Name:    "John Doe",
			Message: "",
		})
		buffer := bytes.NewBuffer(encoded)

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("POST", "/contact", buffer)

		response := controller.ContactHandler(ctx)
		assert.Equal(t, 400, response.Code)
	})

	t.Run("empty name", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		encoded, _ := json.Marshal(NewContactRequestBody{
			Email:   "test.mclovin@example.com",
			Name:    "",
			Message: "Hello",
		})
		buffer := bytes.NewBuffer(encoded)

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("POST", "/contact", buffer)

		response := controller.ContactHandler(ctx)
		assert.Equal(t, 400, response.Code)
	})

	t.Run("empty email", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		encoded, _ := json.Marshal(NewContactRequestBody{
			Email:   "",
			Name:    "John Doe",
			Message: "Hello",
		})
		buffer := bytes.NewBuffer(encoded)

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("POST", "/contact", buffer)

		response := controller.ContactHandler(ctx)
		assert.Equal(t, 400, response.Code)
	})
}

func TestListContactsHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("GET", "/contacts", nil)

		response := controller.ListContactsHandler(ctx)
		assert.Equal(t, 200, response.Code)

		payload, ok := response.Payload.(gin.H)
		assert.True(t, ok)

		contacts, ok := payload["data"].([]Contact)
		assert.True(t, ok)
		assert.Len(t, contacts, 5)
	})
}

func TestListContactRequestsHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		db := NewTestPersistence(true)
		controller := &Controller{
			db: db,
		}

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		ctx.Request = httptest.NewRequest("GET", "/contact-requests", nil)

		response := controller.ListContactRequestsHandler(ctx)
		assert.Equal(t, 200, response.Code)

		payload, ok := response.Payload.(gin.H)
		assert.True(t, ok)

		contacts, ok := payload["data"].([]ContactRequest)
		assert.True(t, ok)
		assert.Len(t, contacts, 6)
	})
}
