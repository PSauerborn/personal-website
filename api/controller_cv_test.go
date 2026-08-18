package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testDate returns the given calendar day in UTC, which is how the persistence
// layer hands dates to the controller.
func testDate(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// testCVExperience returns two experience entries in the order the persistence
// layer returns them (start date descending). The first entry is a current role
// and therefore carries no end date.
func testCVExperience() []CVExperience {
	current := testDate(2022, time.March, 1)
	past := testDate(2019, time.June, 15)
	pastEnd := testDate(2022, time.February, 28)

	return []CVExperience{
		{
			ID:               "11111111-1111-1111-1111-111111111111",
			Organization:     "Acme Corp",
			JobTitle:         "Principal Engineer",
			StartDate:        current,
			EndDate:          nil,
			Description:      "Leads the platform team.",
			TechStack:        []string{"Go", "PostgreSQL"},
			Responsibilities: []string{"Owns the platform roadmap", "Mentors engineers"},
		},
		{
			ID:               "22222222-2222-2222-2222-222222222222",
			Organization:     "Initech",
			JobTitle:         "Backend Engineer",
			StartDate:        past,
			EndDate:          &pastEnd,
			Description:      "Built internal services.",
			TechStack:        []string{"Python"},
			Responsibilities: []string{"Maintained the billing service"},
		},
	}
}

// testCVEducation returns two education entries in the order the persistence
// layer returns them, the first of which is an ongoing course.
func testCVEducation() []CVEducation {
	ongoing := testDate(2024, time.September, 1)
	past := testDate(2014, time.October, 1)
	pastEnd := testDate(2017, time.July, 30)

	return []CVEducation{
		{
			ID:          "33333333-3333-3333-3333-333333333333",
			Institution: "Open University",
			Certificate: "MSc",
			StartDate:   ongoing,
			EndDate:     nil,
		},
		{
			ID:          "44444444-4444-4444-4444-444444444444",
			Institution: "University of Nottingham",
			Certificate: "BSc",
			StartDate:   past,
			EndDate:     &pastEnd,
		},
	}
}

// testCVSkills returns the categorized stack items of the CV. Uncategorized
// stack items are excluded by the persistence layer and therefore never reach
// the controller (REQ-2.6).
func testCVSkills() CVSkills {
	return CVSkills{
		"Databases": {"PostgreSQL"},
		"Languages": {"Go", "Python"},
	}
}

// populatedCVMock returns a persistence mock canned with a fully populated CV.
func populatedCVMock() *mockPersistenceLayer {
	return &mockPersistenceLayer{
		cvExperience: testCVExperience(),
		cvEducation:  testCVEducation(),
		cvSkills:     testCVSkills(),
	}
}

// decodeCVBody decodes the recorded response body into a generic map, so that
// assertions can be made against the serialized JSON rather than against the
// Go values the handler returned.
func decodeCVBody(t *testing.T, recorder *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	return body
}

// TestCVHandler tests every path through the CV endpoint defined by SPEC-002
// §6.1.3 (AC-7 through AC-13).
func TestCVHandler(t *testing.T) {
	t.Run("returns 200 and the complete cv payload", func(t *testing.T) {
		db := populatedCVMock()
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.CVHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.cvExperienceCalls)
		assert.Equal(t, 1, db.cvEducationCalls)
		assert.Equal(t, 1, db.cvSkillsCalls)

		body := decodeCVBody(t, recorder)
		assert.ElementsMatch(t, []string{"skills", "experience", "education"}, keysOf(body))
	})

	t.Run("serializes experience entries with the fields of the response schema", func(t *testing.T) {
		controller := NewController(populatedCVMock(), testConfig())

		recorder := serveHandler(controller.CVHandler)

		body := decodeCVBody(t, recorder)
		experience, ok := body["experience"].([]interface{})
		require.True(t, ok)
		require.Len(t, experience, 2)

		assert.Equal(t, map[string]interface{}{
			"id":               "11111111-1111-1111-1111-111111111111",
			"start_date":       "2022-03-01T00:00:00Z",
			"end_date":         nil,
			"organization":     "Acme Corp",
			"job_title":        "Principal Engineer",
			"description":      "Leads the platform team.",
			"tech_stack":       []interface{}{"Go", "PostgreSQL"},
			"responsibilities": []interface{}{"Owns the platform roadmap", "Mentors engineers"},
		}, experience[0])
	})

	t.Run("serializes education entries with the fields of the response schema", func(t *testing.T) {
		controller := NewController(populatedCVMock(), testConfig())

		recorder := serveHandler(controller.CVHandler)

		body := decodeCVBody(t, recorder)
		education, ok := body["education"].([]interface{})
		require.True(t, ok)
		require.Len(t, education, 2)

		assert.Equal(t, map[string]interface{}{
			"id":          "44444444-4444-4444-4444-444444444444",
			"institution": "University of Nottingham",
			"certificate": "BSc",
			"start_date":  "2014-10-01T00:00:00Z",
			"end_date":    "2017-07-30T00:00:00Z",
		}, education[1])
	})

	t.Run("serializes a current role with a null end date", func(t *testing.T) {
		controller := NewController(populatedCVMock(), testConfig())

		recorder := serveHandler(controller.CVHandler)

		body := decodeCVBody(t, recorder)
		experience := body["experience"].([]interface{})
		education := body["education"].([]interface{})

		assert.Nil(t, experience[0].(map[string]interface{})["end_date"])
		assert.Contains(t, experience[0].(map[string]interface{}), "end_date")
		assert.Nil(t, education[0].(map[string]interface{})["end_date"])
		assert.Contains(t, education[0].(map[string]interface{}), "end_date")
	})

	t.Run("preserves the descending order of the persistence layer", func(t *testing.T) {
		controller := NewController(populatedCVMock(), testConfig())

		recorder := serveHandler(controller.CVHandler)

		body := decodeCVBody(t, recorder)
		assert.Equal(t, []string{"2022-03-01T00:00:00Z", "2019-06-15T00:00:00Z"},
			startDatesOf(body["experience"].([]interface{})))
		assert.Equal(t, []string{"2024-09-01T00:00:00Z", "2014-10-01T00:00:00Z"},
			startDatesOf(body["education"].([]interface{})))
	})

	t.Run("returns skills grouped by category", func(t *testing.T) {
		controller := NewController(populatedCVMock(), testConfig())

		recorder := serveHandler(controller.CVHandler)

		body := decodeCVBody(t, recorder)
		assert.Equal(t, map[string]interface{}{
			"Databases": []interface{}{"PostgreSQL"},
			"Languages": []interface{}{"Go", "Python"},
		}, body["skills"])
	})

	t.Run("returns only the categorized stack items as skills", func(t *testing.T) {
		db := populatedCVMock()
		db.cvExperience[0].TechStack = []string{"Go", "PostgreSQL", "Kubernetes"}
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.CVHandler)

		body := decodeCVBody(t, recorder)
		skills := body["skills"].(map[string]interface{})
		for _, items := range skills {
			assert.NotContains(t, items, "Kubernetes")
		}
	})

	t.Run("returns empty collections and an empty object for an empty cv", func(t *testing.T) {
		controller := NewController(&mockPersistenceLayer{}, testConfig())

		recorder := serveHandler(controller.CVHandler)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, `{"skills":{},"experience":[],"education":[]}`, recorder.Body.String())
	})

	t.Run("passes the request context to the persistence layer", func(t *testing.T) {
		db := populatedCVMock()
		controller := NewController(db, testConfig())

		serveHandler(controller.CVHandler)

		assert.NotNil(t, db.lastCVExperienceContext)
		assert.NotNil(t, db.lastCVEducationContext)
		assert.NotNil(t, db.lastCVSkillsContext)
	})

	t.Run("returns 500 and the generic envelope when the experience query fails", func(t *testing.T) {
		db := populatedCVMock()
		db.cvExperienceErr = fmt.Errorf("%w: unable to query cv experience", ErrDatabaseUnavailable)
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.CVHandler)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
	})

	t.Run("returns 500 and the generic envelope when the education query fails", func(t *testing.T) {
		db := populatedCVMock()
		db.cvEducationErr = fmt.Errorf("%w: unable to query cv education", ErrDatabaseUnavailable)
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.CVHandler)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
	})

	t.Run("returns 500 and the generic envelope when the skills query fails", func(t *testing.T) {
		db := populatedCVMock()
		db.cvSkillsErr = fmt.Errorf("%w: unable to query cv skills", ErrDatabaseUnavailable)
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.CVHandler)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Equal(t, `{"error":"Internal Server Error","details":"Something went wrong."}`,
			recorder.Body.String())
	})

	t.Run("does not leak the underlying error to the caller", func(t *testing.T) {
		db := populatedCVMock()
		db.cvExperienceErr = errors.New(
			`ERROR: relation "base.cv_experience" does not exist (SQLSTATE 42P01)`)
		controller := NewController(db, testConfig())

		recorder := serveHandler(controller.CVHandler)

		for _, leak := range []string{"base.cv_experience", "SQLSTATE", "relation"} {
			assert.NotContains(t, recorder.Body.String(), leak)
		}
	})

	t.Run("logs the underlying error", func(t *testing.T) {
		db := populatedCVMock()
		db.cvSkillsErr = errors.New("connection refused")
		controller := NewController(db, testConfig())

		logs := captureLogs(func() {
			serveHandler(controller.CVHandler)
		})

		assert.Contains(t, logs, "connection refused")
	})
}

// TestRegisterCVRoutes tests that the CV endpoint is reachable on the /v1/cv
// prefix both with and without a trailing slash, so that callers are served
// directly rather than redirected (REQ-2.1, binding decision 9).
func TestRegisterCVRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, path := range []string{"/v1/cv", "/v1/cv/"} {
		t.Run(fmt.Sprintf("serves %s without a redirect", path), func(t *testing.T) {
			router := NewRouter(NewController(populatedCVMock(), testConfig()))

			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))

			assert.Equal(t, http.StatusOK, recorder.Code)
			assert.NotEqual(t, http.StatusMovedPermanently, recorder.Code)
			assert.NotEqual(t, http.StatusTemporaryRedirect, recorder.Code)
			assert.Empty(t, recorder.Header().Get("Location"))

			body := decodeCVBody(t, recorder)
			assert.ElementsMatch(t, []string{"skills", "experience", "education"}, keysOf(body))
		})
	}
}

// keysOf returns the keys of the given decoded JSON object.
func keysOf(body map[string]interface{}) []string {
	keys := make([]string, 0, len(body))
	for key := range body {
		keys = append(keys, key)
	}
	return keys
}

// startDatesOf returns the start_date value of every entry of the given decoded
// JSON array, in the order the entries were serialized.
func startDatesOf(entries []interface{}) []string {
	dates := make([]string, 0, len(entries))
	for _, entry := range entries {
		dates = append(dates, entry.(map[string]interface{})["start_date"].(string))
	}
	return dates
}
