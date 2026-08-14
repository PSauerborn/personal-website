package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CVHandler serves GET /v1/cv. It returns 200 with the complete CV — experience
// entries as full aggregates, education entries, and the stack items grouped by
// skill category — assembled from the three persistence reads into the payload
// of SPEC-002 §6.1.3 (REQ-2.2, REQ-2.3). The ordering applied by the persistence
// layer is preserved verbatim, so entries stay sorted by start date descending
// with the null end date of a current role or ongoing course left in place
// (REQ-2.4). An empty CV yields empty collections and an empty skills object
// rather than nulls (REQ-2.5). A failing read yields the fixed 500 envelope: the
// underlying error is logged for operators and never reaches the client, so that
// no SQL, schema or driver detail leaks (SPEC-002 §7).
func (ct *Controller) CVHandler(c *gin.Context) JSONResponse {
	ctx := c.Request.Context()

	experience, err := ct.db.GetCVExperience(ctx)
	if err != nil {
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	}

	education, err := ct.db.GetCVEducation(ctx)
	if err != nil {
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	}

	skills, err := ct.db.GetCVSkills(ctx)
	if err != nil {
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	}

	return NewOKResponse(CVResponse{
		Skills:     nonNilSkills(skills),
		Experience: nonNilExperience(experience),
		Education:  nonNilEducation(education),
	})
}

// nonNilSkills returns the given skills, or an empty, non-nil map when they are
// nil, so that the skills of an empty CV serialize as {} (REQ-2.5).
func nonNilSkills(skills CVSkills) CVSkills {
	if skills == nil {
		return make(CVSkills)
	}
	return skills
}

// nonNilExperience returns the given experience entries, or an empty, non-nil
// slice when they are nil, so that an empty CV serializes as [] (REQ-2.5).
func nonNilExperience(experience []CVExperience) []CVExperience {
	if experience == nil {
		return make([]CVExperience, 0)
	}
	return experience
}

// nonNilEducation returns the given education entries, or an empty, non-nil
// slice when they are nil, so that an empty CV serializes as [] (REQ-2.5).
func nonNilEducation(education []CVEducation) []CVEducation {
	if education == nil {
		return make([]CVEducation, 0)
	}
	return education
}
