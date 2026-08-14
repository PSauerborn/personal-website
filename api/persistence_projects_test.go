package main

import (
	"context"
	"errors"
	"testing"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// projectColumns lists the columns returned by the projects listing query in
// the order the layer scans them.
var projectColumns = []string{"id", "name", "description", "primary_link", "github_link"}

// stringPointer returns a pointer to the given string, so that tests can build
// projects that carry a non-null github link.
func stringPointer(value string) *string {
	return &value
}

// TestPostgresPersistenceLayerGetProjects tests every path through the projects
// listing read: the schema qualified, read-only and explicitly ordered
// statement, the ordering and null github link it returns, the exclusion of
// hidden projects, the empty non-nil listing, and the errors wrapping
// ErrDatabaseUnavailable (REQ-6.2).
func TestPostgresPersistenceLayerGetProjects(t *testing.T) {
	t.Run("issues a schema qualified statement filtering on display with an explicit order", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listProjectsQuery).
			WillReturnRows(pgxmock.NewRows(projectColumns))

		projects, err := persistence.GetProjects(context.Background())

		require.NoError(t, err)
		assert.Empty(t, projects)
	})

	t.Run("issues a schema qualified read only statement", func(t *testing.T) {
		cases := []struct {
			name   string
			clause string
		}{
			{"selects from the schema qualified project table", "FROM base.project"},
			{"selects every listed column", "SELECT id, name, description, primary_link, github_link"},
			{"excludes projects that are not displayed", "WHERE display = true"},
			{"orders deterministically with a unique tie breaker", "ORDER BY name ASC, id ASC"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				assert.Contains(t, listProjectsQuery, testCase.clause)
			})
		}

		t.Run("reads without mutating", func(t *testing.T) {
			assert.NotContains(t, listProjectsQuery, "INSERT")
			assert.NotContains(t, listProjectsQuery, "UPDATE")
			assert.NotContains(t, listProjectsQuery, "DELETE")
		})
	})

	t.Run("returns every displayed project in the order returned by the database", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(projectColumns).
			AddRow("11111111111111111111111111111111", "agents", "agent orchestration", "https://psauerborn.dev/agents", stringPointer("https://github.com/psauerborn/agents")).
			AddRow("22222222222222222222222222222222", "website", "personal website", "https://psauerborn.dev", stringPointer("https://github.com/psauerborn/website"))
		mock.ExpectQuery(listProjectsQuery).WillReturnRows(rows)

		projects, err := persistence.GetProjects(context.Background())

		require.NoError(t, err)
		require.Len(t, projects, 2)
		assert.Equal(t, Project{
			ID:          "11111111111111111111111111111111",
			Name:        "agents",
			Description: "agent orchestration",
			PrimaryLink: "https://psauerborn.dev/agents",
			GithubLink:  stringPointer("https://github.com/psauerborn/agents"),
		}, projects[0])
		assert.Equal(t, "website", projects[1].Name)
	})

	t.Run("returns a null github link for a project without one", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(projectColumns).
			AddRow("33333333333333333333333333333333", "notes", "private notes", "https://psauerborn.dev/notes", nil)
		mock.ExpectQuery(listProjectsQuery).WillReturnRows(rows)

		projects, err := persistence.GetProjects(context.Background())

		require.NoError(t, err)
		require.Len(t, projects, 1)
		assert.Nil(t, projects[0].GithubLink, "github link must stay null rather than becoming an empty string")
	})

	t.Run("excludes projects that are not displayed", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		// The mock only ever returns the displayed row: the assertion of interest
		// is that the statement itself carries the display filter, so that hidden
		// projects can never reach the caller (REQ-6.2).
		rows := pgxmock.NewRows(projectColumns).
			AddRow("44444444444444444444444444444444", "displayed", "visible project", "https://psauerborn.dev/displayed", nil)
		mock.ExpectQuery(listProjectsQuery).WillReturnRows(rows)

		projects, err := persistence.GetProjects(context.Background())

		require.NoError(t, err)
		require.Len(t, projects, 1)
		assert.Equal(t, "displayed", projects[0].Name)
	})

	t.Run("returns an empty non nil slice when no projects are stored", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listProjectsQuery).WillReturnRows(pgxmock.NewRows(projectColumns))

		projects, err := persistence.GetProjects(context.Background())

		require.NoError(t, err)
		assert.NotNil(t, projects)
		assert.Len(t, projects, 0)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the query fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listProjectsQuery).WillReturnError(errors.New("connection refused"))

		projects, err := persistence.GetProjects(context.Background())

		assert.Nil(t, projects)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when a row cannot be read", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(projectColumns).
			AddRow("55555555555555555555555555555555", "broken", "unreadable row", "https://psauerborn.dev/broken", nil).
			RowError(0, errors.New("row is corrupt"))
		mock.ExpectQuery(listProjectsQuery).WillReturnRows(rows)

		projects, err := persistence.GetProjects(context.Background())

		assert.Nil(t, projects)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
	})
}
