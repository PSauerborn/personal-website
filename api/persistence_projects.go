package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// listProjectsQuery lists the projects that are flagged for display. The
// statement is schema qualified and read-only, and the `display = true` filter
// keeps hidden projects out of the result for every caller (REQ-6.2). The
// explicit ORDER BY makes the result deterministic: projects are ordered by
// name, with the primary key breaking ties between equal names.
const listProjectsQuery = `SELECT id, name, description, primary_link, github_link
FROM base.project
WHERE display = true
ORDER BY name ASC, id ASC`

// GetProjects returns every project flagged for display, ordered by name
// (REQ-6.2). Projects with `display = false` are filtered out by the query
// itself and can never reach the caller. It returns an empty, non-nil slice
// when no project is stored, and an error wrapping ErrDatabaseUnavailable when
// the database cannot be queried, so that no driver detail leaks past this
// layer ([GO-016], [GO-040]).
func (db *PostgresPersistenceLayer) GetProjects(ctx context.Context) ([]Project, error) {
	rows, err := db.pool.Query(ctx, listProjectsQuery)
	if err != nil {
		Logger().WithError(err).Error("unable to query projects")
		return nil, fmt.Errorf("%w: unable to query projects", ErrDatabaseUnavailable)
	}
	defer rows.Close()

	projects := make([]Project, 0)
	for rows.Next() {
		project, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}

	if err := rows.Err(); err != nil {
		Logger().WithError(err).Error("unable to iterate project rows")
		return nil, fmt.Errorf("%w: unable to read projects", ErrDatabaseUnavailable)
	}
	return projects, nil
}

// scanProject scans a single row of the projects listing query into a Project.
// The nullable github_link column is scanned into a *string so that a null in
// the database stays a null in the domain model.
func scanProject(rows pgx.Rows) (Project, error) {
	var project Project
	if err := rows.Scan(
		&project.ID,
		&project.Name,
		&project.Description,
		&project.PrimaryLink,
		&project.GithubLink,
	); err != nil {
		Logger().WithError(err).Error("unable to scan project row")
		return Project{}, fmt.Errorf("%w: unable to read projects", ErrDatabaseUnavailable)
	}
	return project, nil
}
