package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stringPtr returns a pointer to the given string. It is used to build the
// nullable GithubLink field of the canned projects below.
func stringPtr(value string) *string {
	return &value
}

// TestListProjectsHandler covers every path through ListProjectsHandler: a
// populated listing, a project without a GitHub link, an empty listing and the
// persistence failure (SPEC-002 §6.1.12, AC-39, AC-40).
func TestListProjectsHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("returns the projects listing with the response schema of 6.1.12", func(t *testing.T) {
		db := &mockPersistenceLayer{
			projects: []Project{
				{
					ID:          "project-1",
					Name:        "Alpha",
					Description: "The first project",
					PrimaryLink: "https://alpha.example.com",
					GithubLink:  stringPtr("https://github.com/psauerborn/alpha"),
				},
			},
		}
		controller := NewController(db, Config{})

		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "/v1/projects/list", nil)

		response := controller.ListProjectsHandler(c)

		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, 1, db.projectsCalls)
		assert.Equal(t, c.Request.Context(), db.lastProjectsContext)
		assert.Equal(t, map[string]interface{}{
			"projects": []interface{}{
				map[string]interface{}{
					"id":           "project-1",
					"name":         "Alpha",
					"description":  "The first project",
					"primary_link": "https://alpha.example.com",
					"github_link":  "https://github.com/psauerborn/alpha",
				},
			},
		}, decodeJSONBody(t, response))
	})

	t.Run("serializes a project without a GitHub link as null", func(t *testing.T) {
		db := &mockPersistenceLayer{
			projects: []Project{
				{
					ID:          "project-2",
					Name:        "Beta",
					Description: "A project without a repository",
					PrimaryLink: "https://beta.example.com",
					GithubLink:  nil,
				},
			},
		}
		controller := NewController(db, Config{})

		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "/v1/projects/list", nil)

		response := controller.ListProjectsHandler(c)

		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, map[string]interface{}{
			"projects": []interface{}{
				map[string]interface{}{
					"id":           "project-2",
					"name":         "Beta",
					"description":  "A project without a repository",
					"primary_link": "https://beta.example.com",
					"github_link":  nil,
				},
			},
		}, decodeJSONBody(t, response))
	})

	t.Run("returns an empty list rather than null when no project is stored", func(t *testing.T) {
		db := &mockPersistenceLayer{projects: []Project{}}
		controller := NewController(db, Config{})

		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "/v1/projects/list", nil)

		response := controller.ListProjectsHandler(c)

		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, map[string]interface{}{"projects": []interface{}{}}, decodeJSONBody(t, response))
	})

	t.Run("returns the generic 500 envelope when the persistence layer fails", func(t *testing.T) {
		db := &mockPersistenceLayer{projectsErr: errors.New("relation base.project does not exist")}
		controller := NewController(db, Config{})

		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "/v1/projects/list", nil)

		response := controller.ListProjectsHandler(c)

		assert.Equal(t, http.StatusInternalServerError, response.Code)
		assert.Equal(t, ErrorResponse{
			Error:   errorCodeInternalServerError,
			Details: internalServerErrorDetails,
		}, response.Body)
	})
}

// TestListProjectsRoute asserts that the handler is reachable on
// GET /v1/projects/list through the engine returned by NewRouter (REQ-6.1).
func TestListProjectsRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("serves the projects listing on /v1/projects/list", func(t *testing.T) {
		db := &mockPersistenceLayer{
			projects: []Project{
				{
					ID:          "project-1",
					Name:        "Alpha",
					Description: "The first project",
					PrimaryLink: "https://alpha.example.com",
					GithubLink:  nil,
				},
			},
		}
		router := NewRouter(NewController(db, Config{}))

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v1/projects/list", nil))

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.projectsCalls)

		var body map[string]interface{}
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		assert.Equal(t, map[string]interface{}{
			"projects": []interface{}{
				map[string]interface{}{
					"id":           "project-1",
					"name":         "Alpha",
					"description":  "The first project",
					"primary_link": "https://alpha.example.com",
					"github_link":  nil,
				},
			},
		}, body)
	})
}

// decodeJSONBody serializes the body of the given response and decodes it back
// into a generic map, so that assertions are made against the JSON actually
// written to the client rather than against the Go values behind it.
func decodeJSONBody(t *testing.T, response JSONResponse) map[string]interface{} {
	t.Helper()

	raw, err := json.Marshal(response.Body)
	require.NoError(t, err)

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &body))
	return body
}
