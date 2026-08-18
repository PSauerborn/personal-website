package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ListProjectsHandler serves GET /v1/projects/list. It returns 200 with every
// project flagged for display, wrapped in the {"projects": [...]} envelope of
// SPEC-002 §6.1.12 (REQ-6.1, AC-39). Hidden projects are excluded by the
// persistence query itself and can never reach the response (REQ-6.2), and an
// empty listing is serialized as an empty array rather than as null. A
// persistence failure yields the fixed 500 envelope, with the underlying error
// logged for operators and never disclosed to the client (SPEC-002 §7).
func (ct *Controller) ListProjectsHandler(c *gin.Context) JSONResponse {
	projects, err := ct.db.GetProjects(c.Request.Context())
	if err != nil {
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	}

	return NewOKResponse(gin.H{"projects": newProjectDTOs(projects)})
}

// newProjectDTOs maps the given domain projects onto their response
// representation. The projects argument is the listing returned by the
// persistence layer; the returned slice is always non-nil so that an empty
// listing serializes as [] rather than as null. ProjectDTO declares the same
// fields in the same order as Project, so each entry is converted rather than
// copied field by field: the two types stay separate ([GO-013]) while the
// mapping cannot silently drop a field that is added to only one of them.
func newProjectDTOs(projects []Project) []ProjectDTO {
	dtos := make([]ProjectDTO, 0, len(projects))
	for _, project := range projects {
		dtos = append(dtos, ProjectDTO(project))
	}
	return dtos
}
