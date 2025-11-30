package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHealthCheckHandler(t *testing.T) {

	t.Run("Healthy Database", func(t *testing.T) {
		persistence := &TestPersistence{
			Healthy: true,
		}

		response := HealthCheckHandler(nil, persistence)
		if response.Code != 200 {
			t.Errorf("Expected status code 200, got %d", response.Code)
		}
	})

	t.Run("Unhealthy Database", func(t *testing.T) {
		persistence := &TestPersistence{
			Healthy: false,
		}

		response := HealthCheckHandler(nil, persistence)
		if response.Code != 500 {
			t.Errorf("Expected status code 500, got %d", response.Code)
		}
	})
}

func TestVersionHandler(t *testing.T) {
	config := &Config{
		APIVersion: "1.0.0",
	}

	response := VersionHandler(nil, config)
	if response.Code != 200 {
		t.Errorf("Expected status code 200, got %d", response.Code)
	}

	payload, ok := response.Payload.(gin.H)
	if !ok {
		t.Fatalf("Expected payload to be of type gin.H")
	}

	version, exists := payload["version"]
	if !exists {
		t.Fatalf("Expected 'version' key in payload")
	}

	if version != "1.0.0" {
		t.Errorf("Expected version '1.0.0', got '%s'", version)
	}
}

func TestResumeHandler(t *testing.T) {
	t.Run("Valid Resume Path", func(t *testing.T) {
		config := &Config{
			ResumePath: "etc/resume.pdf",
		}
		data, err := ResumeHandler(nil, config)
		if err != nil {
			t.Errorf("Expected no error, got %v", err)
		}
		if len(data) == 0 {
			t.Errorf("Expected non-empty resume data")
		}
	})

	t.Run("Invalid Resume Path", func(t *testing.T) {
		config := &Config{
			ResumePath: "invalid/path/to/resume.pdf",
		}
		_, err := ResumeHandler(nil, config)
		if err == nil {
			t.Errorf("Expected error for invalid resume path, got nil")
		}
	})
}

func TestStatsHandler(t *testing.T) {
	persistence := &TestPersistence{}

	response := StatsHandler(nil, persistence)
	if response.Code != 200 {
		t.Errorf("Expected status code 200, got %d", response.Code)
	}
}

func TestListContactsHandler(t *testing.T) {

	t.Run("No Contacts", func(t *testing.T) {
		persistence := &TestPersistence{
			Contacts: make(map[string]Contact),
		}

		response := ListContactsHandler(nil, persistence)
		if response.Code != 200 {
			t.Errorf("Expected status code 200, got %d", response.Code)
		}

		payload, ok := response.Payload.(gin.H)
		if !ok {
			t.Fatalf("Expected payload to be of type gin.H")
		}

		contacts, exists := payload["data"].([]Contact)
		if !exists {
			t.Fatalf("Expected 'data' key in payload")
		}

		if len(contacts) != 0 {
			t.Errorf("Expected 0 contacts, got %d", len(contacts))
		}
	})

	t.Run("With Contacts", func(t *testing.T) {
		persistence := &TestPersistence{
			Contacts: map[string]Contact{
				"1": {Id: "1", Name: "John Doe", Email: "john@example.com"},
				"2": {Id: "2", Name: "Jane Doe", Email: "jane@example.com"},
				"3": {Id: "3", Name: "Jim Beam", Email: "jim@example.com"},
			},
		}

		response := ListContactsHandler(nil, persistence)
		if response.Code != 200 {
			t.Errorf("Expected status code 200, got %d", response.Code)
		}

		payload, ok := response.Payload.(gin.H)
		if !ok {
			t.Fatalf("Expected payload to be of type gin.H")
		}

		contacts, exists := payload["data"].([]Contact)
		if !exists {
			t.Fatalf("Expected 'data' key in payload")
		}

		if len(contacts) != 3 {
			t.Errorf("Expected 3 contacts, got %d", len(contacts))
		}
	})
}

func TestListContactRequestsHandler(t *testing.T) {
	persistence := &TestPersistence{
		ContactRequests: map[string][]ContactRequest{
			"1": {
				{Id: "req1", ContactId: "1", Message: "Hello"},
				{Id: "req2", ContactId: "1", Message: "Need help"},
			},
			"2": {
				{Id: "req3", ContactId: "2", Message: "Inquiry"},
			},
		},
	}

	response := ListContactRequestsHandler(nil, persistence)
	if response.Code != 200 {
		t.Errorf("Expected status code 200, got %d", response.Code)
	}

	payload, ok := response.Payload.(gin.H)
	if !ok {
		t.Fatalf("Expected payload to be of type gin.H")
	}

	requests, exists := payload["data"].([]ContactRequest)
	if !exists {
		t.Fatalf("Expected 'data' key in payload")
	}

	if len(requests) != 3 {
		t.Errorf("Expected 3 contact requests, got %d", len(requests))
	}
}

func TestContactHandler(t *testing.T) {
	t.Run("Create New Contact and Request", func(t *testing.T) {
		persistence := &TestPersistence{
			Contacts:        make(map[string]Contact),
			ContactRequests: make(map[string][]ContactRequest),
		}

		body := ContactRequestBody{
			Name:    "Alice",
			Email:   "alice@example.com",
			Message: "Foo bar",
		}

		encoded, _ := json.Marshal(body)

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		// set request body
		ctx.Request = httptest.NewRequest(
			"POST", "/api/contact", bytes.NewBuffer(encoded))

		if _, exists := persistence.Contacts["1"]; exists {
			t.Errorf("Expected contact with ID '1' to not exist")
		}

		response := ContactHandler(ctx, persistence)
		if response.Code != 201 {
			t.Errorf("Expected status code 201, got %d", response.Code)
		}

		if _, exists := persistence.Contacts["1"]; !exists {
			t.Errorf("Expected contact with ID '1' to exist")
		}
	})

	t.Run("Use Existing Contact and Create Request", func(t *testing.T) {
		persistence := &TestPersistence{
			Contacts: map[string]Contact{
				"1": {Id: "1", Name: "Alice", Email: "alice@example.com"},
			},
			ContactRequests: make(map[string][]ContactRequest),
		}

		body := ContactRequestBody{
			Name:    "Alice",
			Email:   "alice@example.com",
			Message: "Hello again",
		}

		encoded, _ := json.Marshal(body)

		writer := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(writer)
		// set request body
		ctx.Request = httptest.NewRequest(
			"POST", "/api/contact", bytes.NewBuffer(encoded))

		if _, exists := persistence.Contacts["1"]; !exists {
			t.Errorf("Expected contact with ID '1' to exist")
		}

		response := ContactHandler(ctx, persistence)
		if response.Code != 201 {
			t.Errorf("Expected status code 201, got %d", response.Code)
		}
	})
}
