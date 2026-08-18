package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// testSubagents returns a canned subagent catalogue whose first entry declares
// both schemas and whose second declares neither, so that the `{}` guarantee of
// REQ-4.2 is covered by the same fixture.
func testSubagents() []Subagent {
	return []Subagent{
		{
			ID:          "agent-1",
			Name:        "spec-writer",
			Description: "writes specs",
			Inputs:      map[string]any{"prompt": "string"},
			Outputs:     map[string]any{"spec": "string"},
		},
		{
			ID:          "agent-2",
			Name:        "task-executor",
			Description: "executes tasks",
			Inputs:      map[string]any{},
			Outputs:     map[string]any{},
		},
	}
}

// testAgentSpec returns a listable spec — one unrestricted primary document and
// one unrestricted supporting document — that the spec listing tests mutate to
// exercise a single rule at a time.
func testAgentSpec() AgentSpec {
	return AgentSpec{
		ID:          "spec-1",
		DisplayName: "SPEC-001",
		Description: "the first spec",
		Documents: []AgentSpecDocument{
			{DocumentID: "doc-1", Filename: "SPEC-001.md", DocumentType: DocumentTypeSpec},
			{DocumentID: "doc-2", Filename: "AC-001.md", DocumentType: DocumentTypeAcceptance},
		},
	}
}

// decodeSpecs decodes the body of a spec listing response into its specs.
func decodeSpecs(t *testing.T, body []byte) []AgentSpec {
	t.Helper()

	var payload struct {
		Specs []AgentSpec `json:"specs"`
	}
	assert.NoError(t, json.Unmarshal(body, &payload))
	return payload.Specs
}

// TestListAgentsHandler tests the subagent catalogue endpoint defined by
// SPEC-002 §6.1.4 (REQ-4.2, AC-25, AC-26).
func TestListAgentsHandler(t *testing.T) {
	t.Run("returns 200 and the catalogue in the documented shape", func(t *testing.T) {
		db := &mockPersistenceLayer{subagents: testSubagents()}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListAgentsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.subagentsCalls)

		var payload struct {
			Agents []map[string]any `json:"agents"`
		}
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
		assert.Len(t, payload.Agents, 2)
		assert.Equal(t, map[string]any{
			"id":          "agent-1",
			"name":        "spec-writer",
			"description": "writes specs",
			"inputs":      map[string]any{"prompt": "string"},
			"outputs":     map[string]any{"spec": "string"},
		}, payload.Agents[0])
	})

	t.Run("passes the request context to the persistence layer", func(t *testing.T) {
		db := &mockPersistenceLayer{subagents: testSubagents()}
		controller := NewController(db, testConfig())

		serveHandler(controller.ListAgentsHandler)

		assert.NotNil(t, db.lastSubagentsContext)
	})

	t.Run("returns empty schema objects for an agent without declared schemas", func(t *testing.T) {
		db := &mockPersistenceLayer{subagents: testSubagents()}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListAgentsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Body.String(), `"inputs":{},"outputs":{}`)
		assert.NotContains(t, recorder.Body.String(), "null")
	})

	t.Run("returns an empty list when the catalogue is empty", func(t *testing.T) {
		db := &mockPersistenceLayer{subagents: []Subagent{}}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListAgentsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, `{"agents":[]}`, recorder.Body.String())
	})

	t.Run("returns 500 and the generic envelope when the catalogue cannot be read", func(t *testing.T) {
		db := &mockPersistenceLayer{subagents: testSubagents(), subagentsErr: fmt.Errorf(
			"%w: unable to query subagents", ErrDatabaseUnavailable)}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListAgentsHandler)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
	})

	t.Run("logs the underlying error without leaking it to the caller", func(t *testing.T) {
		db := &mockPersistenceLayer{subagentsErr: errors.New("relation base.subagent does not exist")}
		controller := NewController(db, testConfig())

		var recorder *httptest.ResponseRecorder
		logs := captureLogs(func() {
			recorder = serveHandler(controller.ListAgentsHandler)
		})

		assert.Contains(t, logs, "relation base.subagent does not exist")
		assert.NotContains(t, recorder.Body.String(), "base.subagent")
	})
}

// TestListSpecsHandler tests the spec listing endpoint defined by SPEC-002
// §6.1.5 together with the full visibility rule set (REQ-4.3 - REQ-4.7, AC-27 -
// AC-30).
func TestListSpecsHandler(t *testing.T) {
	t.Run("returns 200 and the spec metadata in the documented shape", func(t *testing.T) {
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{testAgentSpec()}}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListSpecsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.agentSpecsCalls)

		var payload struct {
			Specs []map[string]any `json:"specs"`
		}
		assert.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
		assert.Len(t, payload.Specs, 1)
		assert.Equal(t, map[string]any{
			"id":           "spec-1",
			"display_name": "SPEC-001",
			"description":  "the first spec",
			"documents": []any{
				map[string]any{"document_id": "doc-1", "filename": "SPEC-001.md", "document_type": "spec"},
				map[string]any{"document_id": "doc-2", "filename": "AC-001.md", "document_type": "acceptance"},
			},
		}, payload.Specs[0])
	})

	t.Run("passes the request context to the persistence layer", func(t *testing.T) {
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{testAgentSpec()}}
		controller := NewController(db, testConfig())

		serveHandler(controller.ListSpecsHandler)

		assert.NotNil(t, db.lastAgentSpecsContext)
	})

	t.Run("returns an empty list when no spec is displayed", func(t *testing.T) {
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{}}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListSpecsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, `{"specs":[]}`, recorder.Body.String())
	})

	t.Run("does not list a spec without a primary spec document", func(t *testing.T) {
		spec := testAgentSpec()
		spec.Documents = []AgentSpecDocument{
			{DocumentID: "doc-2", Filename: "AC-001.md", DocumentType: DocumentTypeAcceptance},
			{DocumentID: "doc-3", Filename: "notes.md", DocumentType: DocumentTypeOther},
		}
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{spec}}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListSpecsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Empty(t, decodeSpecs(t, recorder.Body.Bytes()))
	})

	t.Run("does not list a spec whose primary document is restricted", func(t *testing.T) {
		spec := testAgentSpec()
		spec.Documents[0].Restricted = true
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{spec}}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListSpecsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Empty(t, decodeSpecs(t, recorder.Body.Bytes()))
		assert.NotContains(t, recorder.Body.String(), "SPEC-001.md")
	})

	t.Run("lists a spec with a restricted supporting document without that document", func(t *testing.T) {
		spec := testAgentSpec()
		spec.Documents = append(spec.Documents, AgentSpecDocument{
			DocumentID:   "doc-3",
			Filename:     "internal-notes.md",
			DocumentType: DocumentTypeOther,
			Restricted:   true,
		})
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{spec}}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListSpecsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)

		specs := decodeSpecs(t, recorder.Body.Bytes())
		assert.Len(t, specs, 1)
		assert.Equal(t, "spec-1", specs[0].ID)
		assert.Len(t, specs[0].Documents, 2)
		assert.NotContains(t, recorder.Body.String(), "internal-notes.md")
	})

	t.Run("omits a spec with more than one primary document and logs a warning", func(t *testing.T) {
		spec := testAgentSpec()
		spec.Documents = append(spec.Documents, AgentSpecDocument{
			DocumentID:   "doc-3",
			Filename:     "SPEC-001-v2.md",
			DocumentType: DocumentTypeSpec,
		})
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{spec, {
			ID:          "spec-2",
			DisplayName: "SPEC-002",
			Description: "the second spec",
			Documents: []AgentSpecDocument{
				{DocumentID: "doc-4", Filename: "SPEC-002.md", DocumentType: DocumentTypeSpec},
			},
		}}}
		controller := NewController(db, testConfig())

		var recorder *httptest.ResponseRecorder
		logs := captureLogs(func() {
			recorder = serveHandler(controller.ListSpecsHandler)
		})

		assert.Equal(t, http.StatusOK, recorder.Code)

		specs := decodeSpecs(t, recorder.Body.Bytes())
		assert.Len(t, specs, 1)
		assert.Equal(t, "spec-2", specs[0].ID)
		assert.Contains(t, logs, "spec-1")
		assert.Contains(t, logs, "warning")
	})

	t.Run("never serializes the restricted flag", func(t *testing.T) {
		spec := testAgentSpec()
		spec.Documents[1].Restricted = true
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{spec}}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListSpecsHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.NotContains(t, recorder.Body.String(), "restricted")
		assert.NotContains(t, recorder.Body.String(), "Restricted")
	})

	t.Run("returns 500 and the generic envelope when the specs cannot be read", func(t *testing.T) {
		db := &mockPersistenceLayer{agentSpecs: []AgentSpec{testAgentSpec()}, agentSpecsErr: fmt.Errorf(
			"%w: unable to query agent specs", ErrDatabaseUnavailable)}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.ListSpecsHandler)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
	})

	t.Run("logs the underlying error without leaking it to the caller", func(t *testing.T) {
		db := &mockPersistenceLayer{agentSpecsErr: errors.New("relation base.agent_spec does not exist")}
		controller := NewController(db, testConfig())

		var recorder *httptest.ResponseRecorder
		logs := captureLogs(func() {
			recorder = serveHandler(controller.ListSpecsHandler)
		})

		assert.Contains(t, logs, "relation base.agent_spec does not exist")
		assert.NotContains(t, recorder.Body.String(), "base.agent_spec")
	})
}

// testSpecDocument returns a canned spec document that is linked to a spec and
// not restricted, and is therefore served as raw content.
func testSpecDocument() SpecDocument {
	return SpecDocument{
		Filename: "SPEC-001.md",
		Content:  []byte("# SPEC-001\n\nthe raw content of the spec\n"),
	}
}

// serveSpecDocument serves a spec content request against the given persistence
// layer and returns the recorded response. The request is built through the gin
// engine rather than through the shared serveHandler, since the endpoint is
// driven by the :id and :document_id path parameters, which serveHandler cannot
// supply.
func serveSpecDocument(t *testing.T, db PersistenceLayer, specID, documentID string) *httptest.ResponseRecorder {
	t.Helper()

	gin.SetMode(gin.TestMode)
	router := NewRouter(NewController(db, testConfig()))

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(
		http.MethodGet, fmt.Sprintf("/v1/agents/specs/%s/%s", specID, documentID), nil))
	return recorder
}

// TestGetSpecDocumentHandler tests the spec content endpoint defined by SPEC-002
// §6.1.6 (REQ-4.8 - REQ-4.10, AC-31, AC-32). The six rejection causes — an
// unknown spec, an unknown document, a document that is not linked to the spec,
// a document of a hidden spec, a document of a spec whose primary document is
// restricted, and a restricted document — are swept together, since their
// responses must be indistinguishable.
func TestGetSpecDocumentHandler(t *testing.T) {
	t.Run("returns 200 and the raw document content as binary/octet-stream", func(t *testing.T) {
		document := testSpecDocument()
		db := &mockPersistenceLayer{specDocument: document}

		recorder := serveSpecDocument(t, db, "spec-1", "doc-1")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, document.Content, recorder.Body.Bytes())
		assert.Equal(t, contentTypeOctetStream, recorder.Header().Get("Content-Type"))
	})

	t.Run("resolves the document by the spec and document path parameters", func(t *testing.T) {
		db := &mockPersistenceLayer{specDocument: testSpecDocument()}

		serveSpecDocument(t, db, "spec-7", "doc-9")

		assert.Equal(t, 1, db.specDocumentCalls)
		assert.Equal(t, "spec-7", db.lastSpecID)
		assert.Equal(t, "doc-9", db.lastDocumentID)
		assert.NotNil(t, db.lastSpecDocumentContext)
	})

	t.Run("never wraps the content in JSON", func(t *testing.T) {
		db := &mockPersistenceLayer{specDocument: testSpecDocument()}

		recorder := serveSpecDocument(t, db, "spec-1", "doc-1")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.NotContains(t, recorder.Header().Get("Content-Type"), "application/json")
		assert.NotContains(t, recorder.Body.String(), "SPEC-001.md")
	})

	// Each rejection cause is exercised through the mock state it produces: the
	// persistence layer reports an unknown spec, an unknown document, an
	// unlinked document, a hidden spec and a spec whose primary document is
	// restricted as the same sentinel — the last two because the visibility
	// predicate lives in the statement itself — while a restricted document is
	// returned as content the handler itself must refuse.
	rejections := map[string]*mockPersistenceLayer{
		"the spec does not exist": {specDocumentErr: fmt.Errorf(
			"%w: no document doc-1 linked to spec spec-1", ErrSpecDocumentNotFound)},
		"the spec is hidden": {specDocumentErr: fmt.Errorf(
			"%w: no document doc-1 linked to spec spec-hidden", ErrSpecDocumentNotFound)},
		"the primary document of the spec is restricted": {specDocumentErr: fmt.Errorf(
			"%w: no document doc-3 linked to spec spec-private", ErrSpecDocumentNotFound)},
		"the document does not exist": {specDocumentErr: fmt.Errorf(
			"%w: no document doc-404 linked to spec spec-1", ErrSpecDocumentNotFound)},
		"the document is not linked to the spec": {specDocumentErr: fmt.Errorf(
			"%w: no document doc-2 linked to spec spec-1", ErrSpecDocumentNotFound)},
		"the document is restricted": {specDocument: SpecDocument{
			Filename:   "internal-notes.md",
			Content:    []byte("restricted content"),
			Restricted: true,
		}},
	}

	for cause, db := range rejections {
		t.Run(fmt.Sprintf("returns 404 and the generic envelope when %s", cause), func(t *testing.T) {
			recorder := serveSpecDocument(t, db, "spec-1", "doc-1")

			assert.Equal(t, http.StatusNotFound, recorder.Code)
			assert.Equal(t, `{"error":"Not Found","details":"The requested resource could not be found."}`,
				recorder.Body.String())
			assert.NotContains(t, recorder.Body.String(), "restricted content")
			assert.NotContains(t, recorder.Body.String(), "internal-notes.md")
		})
	}

	t.Run("answers every rejection cause with a byte-identical response", func(t *testing.T) {
		responses := make(map[string]string, len(rejections))
		for cause, db := range rejections {
			recorder := serveSpecDocument(t, db, "spec-1", "doc-1")
			responses[cause] = fmt.Sprintf("%d|%s|%s",
				recorder.Code, recorder.Header().Get("Content-Type"), recorder.Body.String())
		}

		assert.Len(t, responses, 6)
		distinct := make(map[string]struct{}, 1)
		for _, response := range responses {
			distinct[response] = struct{}{}
		}
		assert.Len(t, distinct, 1)
	})

	t.Run("returns 500 and the generic envelope when the document cannot be read", func(t *testing.T) {
		db := &mockPersistenceLayer{specDocument: testSpecDocument(), specDocumentErr: fmt.Errorf(
			"%w: unable to query spec document", ErrDatabaseUnavailable)}

		recorder := serveSpecDocument(t, db, "spec-1", "doc-1")

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
	})

	t.Run("logs the underlying error without leaking it to the caller", func(t *testing.T) {
		db := &mockPersistenceLayer{specDocumentErr: errors.New("relation base.document does not exist")}

		var recorder *httptest.ResponseRecorder
		logs := captureLogs(func() {
			recorder = serveSpecDocument(t, db, "spec-1", "doc-1")
		})

		assert.Contains(t, logs, "relation base.document does not exist")
		assert.NotContains(t, recorder.Body.String(), "base.document")
	})
}

// TestAgentsRoutes tests that the agents group is mounted on the /v1/agents
// prefix with both listing endpoints registered (REQ-4.1).
func TestAgentsRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	routes := map[string]string{
		"/v1/agents/list":       "agents",
		"/v1/agents/specs/list": "specs",
	}

	for path, field := range routes {
		t.Run(fmt.Sprintf("serves GET %s", path), func(t *testing.T) {
			router := NewRouter(NewController(&mockPersistenceLayer{}, testConfig()))

			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))

			assert.Equal(t, http.StatusOK, recorder.Code)
			assert.Contains(t, recorder.Body.String(), fmt.Sprintf(`"%s":[]`, field))
		})
	}

	t.Run("serves GET /v1/agents/specs/:id/:document_id", func(t *testing.T) {
		db := &mockPersistenceLayer{specDocument: testSpecDocument()}
		router := NewRouter(NewController(db, testConfig()))

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(
			http.MethodGet, "/v1/agents/specs/spec-1/doc-1", nil))

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.specDocumentCalls)
	})
}
