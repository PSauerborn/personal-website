package main

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// The names of the path parameters of the spec content endpoint, as registered
// in router.go (SPEC-002 §6.1.6).
const (
	// specIDParam names the spec id parameter of /v1/agents/specs/:id/...
	specIDParam = "id"
	// documentIDParam names the document id parameter of the same route.
	documentIDParam = "document_id"
)

// ListAgentsHandler serves GET /v1/agents/list. It returns 200 with the
// complete subagent catalogue, each entry carrying its declared input and
// output schemas (REQ-4.2, SPEC-002 §6.1.4). Agents that declare no schema are
// served with an empty object rather than a null or a missing field, which the
// persistence layer guarantees by returning empty, non-nil schema maps (AC-26).
// An empty catalogue yields {"agents": []}. A persistence failure yields the
// fixed 500 envelope, with the underlying error logged for operators and never
// disclosed to the client (SPEC-002 §7).
func (ct *Controller) ListAgentsHandler(c *gin.Context) JSONResponse {
	agents, err := ct.db.GetSubagents(c.Request.Context())
	if err != nil {
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	}

	// The catalogue is serialized through a slice that is guaranteed to be
	// non-nil here rather than relying on the persistence layer to never return
	// a nil one, so that an empty catalogue is always written as [].
	if agents == nil {
		agents = make([]Subagent, 0)
	}

	return NewOKResponse(gin.H{"agents": agents})
}

// ListSpecsHandler serves GET /v1/agents/specs/list. It returns 200 with the
// metadata of every listable spec together with its visible documents, and
// never with the spec content itself (REQ-4.3, REQ-4.4, SPEC-002 §6.1.5). Which
// specs and documents are listable is decided by listableSpecs; specs with
// `display = false` are already excluded by the persistence layer, for every
// caller alike, so no authentication, admin or API-key branch exists on this
// path (REQ-4.7). No spec to list yields {"specs": []}. A persistence failure
// yields the fixed 500 envelope, with the underlying error logged for operators
// and never disclosed to the client (SPEC-002 §7).
func (ct *Controller) ListSpecsHandler(c *gin.Context) JSONResponse {
	specs, err := ct.db.GetAgentSpecs(c.Request.Context())
	if err != nil {
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	}

	return NewOKResponse(gin.H{"specs": listableSpecs(specs)})
}

// GetSpecDocumentHandler serves GET /v1/agents/specs/:id/:document_id. It
// returns 200 with the content of the requested document written verbatim as
// "binary/octet-stream", never wrapped in JSON (REQ-4.8, SPEC-002 §6.1.6,
// AC-31).
//
// Every request that must not be served is answered with the identical 404 of
// specDocumentNotFound: a spec that does not exist (REQ-4.9, AC-32), a document
// that does not exist, a document that exists but is not linked to the given
// spec (REQ-4.8), a document of a spec flagged `display = false` (REQ-4.7) and
// a document of a spec whose primary document is restricted (REQ-4.5) — the
// persistence layer reports all five as ErrSpecDocumentNotFound, since the
// visibility predicate is applied by the statement itself rather than here —
// and a document flagged as restricted, which is resolved but refused here
// (REQ-4.10). No response discloses which of the six applies, nor whether the
// spec or the document exists at all.
//
// Any other persistence failure yields the fixed 500 envelope, with the
// underlying error logged for operators and never disclosed (SPEC-002 §7).
func (ct *Controller) GetSpecDocumentHandler(c *gin.Context) JSONResponse {
	document, err := ct.db.GetSpecDocument(
		c.Request.Context(), c.Param(specIDParam), c.Param(documentIDParam))
	switch {
	case errors.Is(err, ErrSpecDocumentNotFound):
		return specDocumentNotFound()
	case err != nil:
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	case document.Restricted:
		return specDocumentNotFound()
	}

	return NewRawContentResponse(document.Content)
}

// specDocumentNotFound returns the 404 response of the spec content endpoint.
// It is the single construction site of that response, so that the unresolvable
// and the restricted document are answered with byte-identical envelopes and
// cannot be told apart by the caller (REQ-4.8, REQ-4.9, REQ-4.10).
func specDocumentNotFound() JSONResponse {
	return NewJSONResponse(http.StatusNotFound, NewNotFoundError())
}

// listableSpecs returns the subset of the given specs that may be listed, each
// carrying only the documents that may be disclosed. It applies the visibility
// rules of SPEC-002 in one place, so that the handler stays a transport shell:
//
//   - a spec without a primary (`document_type = spec`) document is dropped, as
//     it is not a spec that can be read at all (REQ-4.7, AC-28);
//   - a spec carrying more than one primary document violates the at-most-one
//     invariant of REQ-4.4 and is therefore malformed: it is dropped and logged
//     as a warning naming the spec, since guessing which of the documents is the
//     real one could disclose a restricted document;
//   - a spec whose primary document is restricted is dropped entirely, so that
//     neither it nor its supporting documents are disclosed (REQ-4.5, AC-29);
//   - restricted supporting documents are stripped from the documents of a spec
//     that is otherwise listed (REQ-4.6, AC-30).
//
// The returned slice is always non-nil, so that an empty result serializes as
// [] rather than as null.
func listableSpecs(specs []AgentSpec) []AgentSpec {
	listable := make([]AgentSpec, 0, len(specs))
	for _, spec := range specs {
		primaries := primaryDocuments(spec)
		switch {
		case len(primaries) == 0:
			continue
		case len(primaries) > 1:
			Logger().WithFields(map[string]any{
				"spec_id":           spec.ID,
				"spec_display_name": spec.DisplayName,
				"primary_documents": len(primaries),
			}).Warn("spec carries more than one primary spec document and is not listed")
			continue
		case primaries[0].Restricted:
			continue
		}

		spec.Documents = visibleDocuments(spec.Documents)
		listable = append(listable, spec)
	}
	return listable
}

// primaryDocuments returns the primary spec documents of the given spec, of
// which a well-formed spec carries exactly one (REQ-4.4). It is kept separate
// from the filtering itself so that both the missing and the duplicated primary
// document are decided on the same value.
func primaryDocuments(spec AgentSpec) []AgentSpecDocument {
	primaries := make([]AgentSpecDocument, 0, 1)
	for _, document := range spec.Documents {
		if document.IsPrimary() {
			primaries = append(primaries, document)
		}
	}
	return primaries
}

// visibleDocuments returns the documents that may be disclosed to the caller:
// every document that is not restricted (REQ-4.6). The returned slice is always
// non-nil, so that a spec whose documents are all restricted still serializes
// its documents as [] rather than as null.
func visibleDocuments(documents []AgentSpecDocument) []AgentSpecDocument {
	visible := make([]AgentSpecDocument, 0, len(documents))
	for _, document := range documents {
		if !document.Restricted {
			visible = append(visible, document)
		}
	}
	return visible
}
