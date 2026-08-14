package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// date returns a UTC date value for the given calendar day, matching the DATE
// columns of base.cv_experience and base.cv_education.
func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// experienceRows returns an empty pgxmock row set with the columns selected by
// the CV experience query.
func experienceRows() *pgxmock.Rows {
	return pgxmock.NewRows([]string{"id", "organization", "job_title", "start_date", "end_date", "description"})
}

// responsibilityRows returns an empty pgxmock row set with the columns selected
// by the CV responsibility query.
func responsibilityRows() *pgxmock.Rows {
	return pgxmock.NewRows([]string{"experience_id", "description"})
}

// stackItemRows returns an empty pgxmock row set with the columns selected by
// the CV experience stack item query.
func stackItemRows() *pgxmock.Rows {
	return pgxmock.NewRows([]string{"experience_id", "name"})
}

// educationRows returns an empty pgxmock row set with the columns selected by
// the CV education query.
func educationRows() *pgxmock.Rows {
	return pgxmock.NewRows([]string{"id", "institution", "certificate", "start_date", "end_date"})
}

// skillRows returns an empty pgxmock row set with the columns selected by the
// CV skills query.
func skillRows() *pgxmock.Rows {
	return pgxmock.NewRows([]string{"category", "name"})
}

// TestPostgresPersistenceLayerGetCVExperience tests every path through the CV
// experience read: the schema qualified, read-only and explicitly ordered
// statements, the aggregate assembled from them without a query per row, the
// preserved ordering and null end date, the empty non-nil collections, and the
// errors wrapping ErrDatabaseUnavailable (REQ-2.3, REQ-2.4, REQ-2.5,
// [GO-036]).
func TestPostgresPersistenceLayerGetCVExperience(t *testing.T) {
	t.Run("issues schema qualified read only queries with an explicit ordering", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).
			WillReturnRows(experienceRows().AddRow("exp1", "acme", "engineer", date(2020, time.January, 1), (*time.Time)(nil), "worked"))
		mock.ExpectQuery(cvResponsibilityStatement).
			WillReturnRows(responsibilityRows())
		mock.ExpectQuery(cvExperienceStackStatement).
			WillReturnRows(stackItemRows())
		mock.ExpectCommit()

		experience, err := persistence.GetCVExperience(context.Background())

		require.NoError(t, err)
		require.Len(t, experience, 1)
		assert.Equal(t, "exp1", experience[0].ID)
		assert.Equal(t, "acme", experience[0].Organization)
		assert.Equal(t, "engineer", experience[0].JobTitle)
		assert.Equal(t, "worked", experience[0].Description)
	})

	t.Run("returns each experience as an aggregate carrying its responsibilities and stack items", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).WillReturnRows(experienceRows().
			AddRow("exp1", "acme", "engineer", date(2022, time.March, 1), (*time.Time)(nil), "current role").
			AddRow("exp2", "globex", "developer", date(2018, time.June, 1), &[]time.Time{date(2022, time.February, 28)}[0], "previous role"))
		mock.ExpectQuery(cvResponsibilityStatement).WillReturnRows(responsibilityRows().
			AddRow("exp1", "designed services").
			AddRow("exp1", "reviewed code").
			AddRow("exp2", "wrote migrations"))
		mock.ExpectQuery(cvExperienceStackStatement).WillReturnRows(stackItemRows().
			AddRow("exp1", "golang").
			AddRow("exp1", "postgresql").
			AddRow("exp2", "python"))
		mock.ExpectCommit()

		experience, err := persistence.GetCVExperience(context.Background())

		require.NoError(t, err)
		require.Len(t, experience, 2)
		assert.Equal(t, []string{"designed services", "reviewed code"}, experience[0].Responsibilities)
		assert.Equal(t, []string{"golang", "postgresql"}, experience[0].TechStack)
		assert.Equal(t, []string{"wrote migrations"}, experience[1].Responsibilities)
		assert.Equal(t, []string{"python"}, experience[1].TechStack)
	})

	t.Run("preserves the order returned by the database and a null end date", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		ended := date(2022, time.February, 28)

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).WillReturnRows(experienceRows().
			AddRow("exp1", "acme", "engineer", date(2022, time.March, 1), (*time.Time)(nil), "current role").
			AddRow("exp2", "globex", "developer", date(2018, time.June, 1), &ended, "previous role"))
		mock.ExpectQuery(cvResponsibilityStatement).WillReturnRows(responsibilityRows())
		mock.ExpectQuery(cvExperienceStackStatement).WillReturnRows(stackItemRows())
		mock.ExpectCommit()

		experience, err := persistence.GetCVExperience(context.Background())

		require.NoError(t, err)
		require.Len(t, experience, 2)
		assert.Equal(t, []string{"exp1", "exp2"}, []string{experience[0].ID, experience[1].ID})
		assert.Nil(t, experience[0].EndDate, "a null end date marks the role as current")
		require.NotNil(t, experience[1].EndDate)
		assert.Equal(t, ended, *experience[1].EndDate)
	})

	t.Run("returns empty non-nil collections for an experience without links", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).WillReturnRows(experienceRows().
			AddRow("exp1", "acme", "engineer", date(2022, time.March, 1), (*time.Time)(nil), "current role"))
		mock.ExpectQuery(cvResponsibilityStatement).WillReturnRows(responsibilityRows())
		mock.ExpectQuery(cvExperienceStackStatement).WillReturnRows(stackItemRows())
		mock.ExpectCommit()

		experience, err := persistence.GetCVExperience(context.Background())

		require.NoError(t, err)
		require.Len(t, experience, 1)
		assert.NotNil(t, experience[0].Responsibilities)
		assert.Empty(t, experience[0].Responsibilities)
		assert.NotNil(t, experience[0].TechStack)
		assert.Empty(t, experience[0].TechStack)
	})

	t.Run("returns an empty non-nil slice when no experience is stored", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).WillReturnRows(experienceRows())
		mock.ExpectQuery(cvResponsibilityStatement).WillReturnRows(responsibilityRows())
		mock.ExpectQuery(cvExperienceStackStatement).WillReturnRows(stackItemRows())
		mock.ExpectCommit()

		experience, err := persistence.GetCVExperience(context.Background())

		require.NoError(t, err)
		assert.NotNil(t, experience)
		assert.Empty(t, experience)
	})

	t.Run("resolves the aggregate without a query per experience row", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		rows := experienceRows()
		for _, id := range []string{"exp1", "exp2", "exp3", "exp4"} {
			rows = rows.AddRow(id, "acme", "engineer", date(2020, time.January, 1), (*time.Time)(nil), "worked")
		}

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).WillReturnRows(rows)
		mock.ExpectQuery(cvResponsibilityStatement).WillReturnRows(responsibilityRows())
		mock.ExpectQuery(cvExperienceStackStatement).WillReturnRows(stackItemRows())
		mock.ExpectCommit()

		// the cleanup registered by newMockPersistenceLayer fails the test on any
		// unmet expectation, and pgxmock fails on any unexpected call, so exactly
		// three queries are issued regardless of the number of experience rows.
		experience, err := persistence.GetCVExperience(context.Background())

		require.NoError(t, err)
		assert.Len(t, experience, 4)
	})

	// A committed transaction must not be rolled back afterwards: the driver
	// answers the second termination with ErrTxClosed, which surfaces as a
	// warning on every successful CV read. No rollback is registered on the mock,
	// so an issued one is both logged and left as an unexpected call.
	t.Run("issues no rollback once the transaction has been committed", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).WillReturnRows(experienceRows().
			AddRow("exp1", "acme", "engineer", date(2022, time.March, 1), (*time.Time)(nil), "current role"))
		mock.ExpectQuery(cvResponsibilityStatement).WillReturnRows(responsibilityRows())
		mock.ExpectQuery(cvExperienceStackStatement).WillReturnRows(stackItemRows())
		mock.ExpectCommit()

		var experience []CVExperience
		var err error
		logs := captureLogs(func() {
			experience, err = persistence.GetCVExperience(context.Background())
		})

		require.NoError(t, err)
		assert.Len(t, experience, 1)
		assert.NotContains(t, logs, "roll back",
			"a committed transaction must not be rolled back afterwards")
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the transaction cannot be committed", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).WillReturnRows(experienceRows())
		mock.ExpectQuery(cvResponsibilityStatement).WillReturnRows(responsibilityRows())
		mock.ExpectQuery(cvExperienceStackStatement).WillReturnRows(stackItemRows())
		mock.ExpectCommit().WillReturnError(errors.New("connection refused"))

		experience, err := persistence.GetCVExperience(context.Background())

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, experience)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the query fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectBegin()
		mock.ExpectQuery(cvExperienceStatement).WillReturnError(errors.New("connection refused"))
		mock.ExpectRollback()

		experience, err := persistence.GetCVExperience(context.Background())

		assert.Error(t, err)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, experience)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the transaction cannot be started", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectBegin().WillReturnError(errors.New("connection refused"))

		experience, err := persistence.GetCVExperience(context.Background())

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, experience)
	})
}

// TestPostgresPersistenceLayerGetCVEducation tests every path through the CV
// education read: the schema qualified, read-only statement ordered by start
// date descending, the preserved ordering and null end date, the empty non-nil
// slice, and the error wrapping ErrDatabaseUnavailable (REQ-2.4, REQ-2.5).
func TestPostgresPersistenceLayerGetCVEducation(t *testing.T) {
	t.Run("issues a schema qualified read only query ordered by start date descending", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectQuery(cvEducationStatement).
			WillReturnRows(educationRows().AddRow("edu1", "university", "bsc", date(2014, time.September, 1), (*time.Time)(nil)))

		education, err := persistence.GetCVEducation(context.Background())

		require.NoError(t, err)
		require.Len(t, education, 1)
		assert.Equal(t, "edu1", education[0].ID)
		assert.Equal(t, "university", education[0].Institution)
		assert.Equal(t, "bsc", education[0].Certificate)
		assert.Equal(t, date(2014, time.September, 1), education[0].StartDate)
	})

	t.Run("preserves the order returned by the database and a null end date", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		ended := date(2017, time.July, 1)

		mock.ExpectQuery(cvEducationStatement).WillReturnRows(educationRows().
			AddRow("edu1", "university", "msc", date(2018, time.September, 1), (*time.Time)(nil)).
			AddRow("edu2", "college", "bsc", date(2014, time.September, 1), &ended))

		education, err := persistence.GetCVEducation(context.Background())

		require.NoError(t, err)
		require.Len(t, education, 2)
		assert.Equal(t, []string{"edu1", "edu2"}, []string{education[0].ID, education[1].ID})
		assert.Nil(t, education[0].EndDate, "a null end date marks the course as ongoing")
		require.NotNil(t, education[1].EndDate)
		assert.Equal(t, ended, *education[1].EndDate)
	})

	t.Run("returns an empty non-nil slice when no education is stored", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectQuery(cvEducationStatement).WillReturnRows(educationRows())

		education, err := persistence.GetCVEducation(context.Background())

		require.NoError(t, err)
		assert.NotNil(t, education)
		assert.Empty(t, education)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the query fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectQuery(cvEducationStatement).WillReturnError(errors.New("connection refused"))

		education, err := persistence.GetCVEducation(context.Background())

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, education)
	})
}

// TestPostgresPersistenceLayerGetCVSkills tests every path through the CV skills
// read: the explicitly ordered join of stack items onto their category, the
// grouping it produces, the exclusion of uncategorized items, the empty non-nil
// map, and the error wrapping ErrDatabaseUnavailable (REQ-2.6).
func TestPostgresPersistenceLayerGetCVSkills(t *testing.T) {
	t.Run("joins stack items to their category with an explicit ordering", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectQuery(cvSkillsStatement).
			WillReturnRows(skillRows().AddRow("languages", "golang"))

		skills, err := persistence.GetCVSkills(context.Background())

		require.NoError(t, err)
		assert.Equal(t, CVSkills{"languages": {"golang"}}, skills)
	})

	t.Run("groups the stack items of each category in the order returned by the database", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectQuery(cvSkillsStatement).WillReturnRows(skillRows().
			AddRow("databases", "postgresql").
			AddRow("languages", "golang").
			AddRow("languages", "python"))

		skills, err := persistence.GetCVSkills(context.Background())

		require.NoError(t, err)
		assert.Equal(t, CVSkills{
			"databases": {"postgresql"},
			"languages": {"golang", "python"},
		}, skills)
	})

	t.Run("excludes stack items that are not linked to a category", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		// the inner joins asserted above mean an unlinked stack item never
		// reaches the layer; nothing in the result carries it.
		mock.ExpectQuery(cvSkillsStatement).
			WillReturnRows(skillRows().AddRow("languages", "golang"))

		skills, err := persistence.GetCVSkills(context.Background())

		require.NoError(t, err)
		assert.Equal(t, CVSkills{"languages": {"golang"}}, skills)
		assert.NotContains(t, skills["languages"], "unmapped-item")
	})

	t.Run("returns an empty non-nil map when no stack item is categorized", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectQuery(cvSkillsStatement).WillReturnRows(skillRows())

		skills, err := persistence.GetCVSkills(context.Background())

		require.NoError(t, err)
		assert.NotNil(t, skills)
		assert.Empty(t, skills)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the query fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)

		mock.ExpectQuery(cvSkillsStatement).WillReturnError(errors.New("connection refused"))

		skills, err := persistence.GetCVSkills(context.Background())

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, skills)
	})
}

// TestCVStatementsAreReadOnly tests that no statement issued by the CV
// persistence layer mutates the database, which is what makes the CV endpoints
// safe to serve from any replica.
func TestCVStatementsAreReadOnly(t *testing.T) {
	t.Run("no CV statement mutates the database", func(t *testing.T) {
		for _, statement := range cvStatements() {
			assert.NotContains(t, statement, "INSERT")
			assert.NotContains(t, statement, "UPDATE")
			assert.NotContains(t, statement, "DELETE")
			assert.Contains(t, statement, "base.")
			assert.Contains(t, statement, "ORDER BY")
		}
	})
}
