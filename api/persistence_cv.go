package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// The statements below serve the CV endpoint (SPEC-002 §6.1.3). All of them are
// read-only, schema-qualified against the `base` schema and carry an explicit
// ORDER BY, so that identical requests always produce identical output
// (REQ-2.4). Ordering by start date alone is not deterministic when two entries
// share a start date, so the primary key is used as a tie-breaker.
const (
	// cvExperienceStatement selects every CV work experience entry, most recent
	// first. A null end_date is selected verbatim and marks a current role
	// (REQ-2.4).
	cvExperienceStatement = `SELECT id, organization, job_title, start_date, end_date, description ` +
		`FROM base.cv_experience ` +
		`ORDER BY start_date DESC, id ASC`

	// cvResponsibilityStatement selects the responsibilities of every CV work
	// experience entry in a single pass, keyed by experience, so that the
	// aggregates can be assembled without a query per experience row (REQ-2.3).
	cvResponsibilityStatement = `SELECT experience_id, description ` +
		`FROM base.cv_experience_responsibility ` +
		`ORDER BY experience_id ASC, id ASC`

	// cvExperienceStackStatement selects the tech stack items of every CV work
	// experience entry in a single pass, resolving the link table onto the
	// shared base.cv_stack_item lookup (REQ-2.3).
	cvExperienceStackStatement = `SELECT link.experience_id, item.name ` +
		`FROM base.cv_stack_item_experience_link link ` +
		`INNER JOIN base.cv_stack_item item ON item.id = link.stack_item_id ` +
		`ORDER BY link.experience_id ASC, item.name ASC`

	// cvEducationStatement selects every CV education entry, most recent first.
	// A null end_date marks an ongoing course (REQ-2.4).
	cvEducationStatement = `SELECT id, institution, certificate, start_date, end_date ` +
		`FROM base.cv_education ` +
		`ORDER BY start_date DESC, id ASC`

	// cvSkillsStatement selects every categorized tech stack item together with
	// its category. The inner joins are what excludes stack items that are not
	// linked to a category from the skills section (REQ-2.6).
	cvSkillsStatement = `SELECT category.category, item.name ` +
		`FROM base.cv_stack_item_category_link link ` +
		`INNER JOIN base.cv_skill_category category ON category.id = link.category_id ` +
		`INNER JOIN base.cv_stack_item item ON item.id = link.stack_item_id ` +
		`ORDER BY category.category ASC, item.name ASC`
)

// cvStatements returns every statement this file issues. It exists so that the
// unittests can assert the shared properties of the CV statements — schema
// qualification, explicit ordering and read-only access — in one place.
func cvStatements() []string {
	return []string{
		cvExperienceStatement,
		cvResponsibilityStatement,
		cvExperienceStackStatement,
		cvEducationStatement,
		cvSkillsStatement,
	}
}

// GetCVExperience returns every CV work experience entry as a complete
// aggregate, ordered by start date descending with the entry id as a
// tie-breaker (REQ-2.3, REQ-2.4). Responsibilities and tech stack items are
// resolved with one additional statement each — never one per experience row —
// and all three statements run inside a single transaction, through the shared
// runInTransaction helper so that this read carries no transaction scaffolding
// of its own ([GO-036]). It returns an empty, non-nil slice when no experience
// is stored (REQ-2.5), and an error wrapping ErrDatabaseUnavailable when the
// database cannot serve the request.
func (db *PostgresPersistenceLayer) GetCVExperience(ctx context.Context) ([]CVExperience, error) {
	var (
		experience              []CVExperience
		responsibilities, stack map[string][]string
	)

	err := runInTransaction(ctx, db.pool, func(tx pgx.Tx) error {
		var err error
		if experience, err = scanCVExperienceRows(ctx, tx); err != nil {
			return err
		}
		if responsibilities, err = scanCVLinkedValues(ctx, tx, cvResponsibilityStatement); err != nil {
			return err
		}
		stack, err = scanCVLinkedValues(ctx, tx, cvExperienceStackStatement)
		return err
	})
	if err != nil {
		return nil, err
	}

	for idx := range experience {
		experience[idx].Responsibilities = valuesFor(responsibilities, experience[idx].ID)
		experience[idx].TechStack = valuesFor(stack, experience[idx].ID)
	}
	return experience, nil
}

// GetCVEducation returns every CV education entry ordered by start date
// descending with the entry id as a tie-breaker (REQ-2.4). Entries of an
// ongoing course keep their null end date. It returns an empty, non-nil slice
// when no education is stored (REQ-2.5), and an error wrapping
// ErrDatabaseUnavailable when the database cannot serve the request.
func (db *PostgresPersistenceLayer) GetCVEducation(ctx context.Context) ([]CVEducation, error) {
	rows, err := db.pool.Query(ctx, cvEducationStatement)
	if err != nil {
		Logger().WithError(err).Error("unable to query cv education")
		return nil, fmt.Errorf("%w: unable to query cv education", ErrDatabaseUnavailable)
	}
	defer rows.Close()

	education := make([]CVEducation, 0)
	for rows.Next() {
		var entry CVEducation
		if err := rows.Scan(&entry.ID, &entry.Institution, &entry.Certificate, &entry.StartDate, &entry.EndDate); err != nil {
			Logger().WithError(err).Error("unable to scan cv education row")
			return nil, fmt.Errorf("%w: unable to scan cv education row", ErrDatabaseUnavailable)
		}
		education = append(education, entry)
	}
	if err := rows.Err(); err != nil {
		Logger().WithError(err).Error("unable to read cv education rows")
		return nil, fmt.Errorf("%w: unable to read cv education rows", ErrDatabaseUnavailable)
	}
	return education, nil
}

// GetCVSkills returns the tech stack items of the CV grouped by the category
// they are linked to, with the items of each category ordered by name
// (REQ-2.6). Stack items that are not linked to any category are absent from
// the result. It returns an empty, non-nil map when no stack item is
// categorized (REQ-2.5), and an error wrapping ErrDatabaseUnavailable when the
// database cannot serve the request.
func (db *PostgresPersistenceLayer) GetCVSkills(ctx context.Context) (CVSkills, error) {
	rows, err := db.pool.Query(ctx, cvSkillsStatement)
	if err != nil {
		Logger().WithError(err).Error("unable to query cv skills")
		return nil, fmt.Errorf("%w: unable to query cv skills", ErrDatabaseUnavailable)
	}
	defer rows.Close()

	skills := make(CVSkills)
	for rows.Next() {
		var category, name string
		if err := rows.Scan(&category, &name); err != nil {
			Logger().WithError(err).Error("unable to scan cv skill row")
			return nil, fmt.Errorf("%w: unable to scan cv skill row", ErrDatabaseUnavailable)
		}
		skills[category] = append(skills[category], name)
	}
	if err := rows.Err(); err != nil {
		Logger().WithError(err).Error("unable to read cv skill rows")
		return nil, fmt.Errorf("%w: unable to read cv skill rows", ErrDatabaseUnavailable)
	}
	return skills, nil
}

// scanCVExperienceRows runs the experience statement on the given transaction
// and scans its rows into experience entries without their linked collections,
// preserving the ordering applied by the database. It returns an empty,
// non-nil slice when no experience is stored, and an error wrapping
// ErrDatabaseUnavailable on any query, scan or read failure.
func scanCVExperienceRows(ctx context.Context, tx pgx.Tx) ([]CVExperience, error) {
	rows, err := tx.Query(ctx, cvExperienceStatement)
	if err != nil {
		Logger().WithError(err).Error("unable to query cv experience")
		return nil, fmt.Errorf("%w: unable to query cv experience", ErrDatabaseUnavailable)
	}
	defer rows.Close()

	experience := make([]CVExperience, 0)
	for rows.Next() {
		entry := CVExperience{}
		if err := rows.Scan(&entry.ID, &entry.Organization, &entry.JobTitle, &entry.StartDate, &entry.EndDate, &entry.Description); err != nil {
			Logger().WithError(err).Error("unable to scan cv experience row")
			return nil, fmt.Errorf("%w: unable to scan cv experience row", ErrDatabaseUnavailable)
		}
		experience = append(experience, entry)
	}
	if err := rows.Err(); err != nil {
		Logger().WithError(err).Error("unable to read cv experience rows")
		return nil, fmt.Errorf("%w: unable to read cv experience rows", ErrDatabaseUnavailable)
	}
	return experience, nil
}

// scanCVLinkedValues runs the given two column statement on the transaction and
// collects its rows into a map of owner id onto the ordered values belonging to
// that owner. Both the responsibilities and the tech stack items of every
// experience are read this way, which keeps the number of statements constant
// no matter how many experience entries are stored. It returns an error
// wrapping ErrDatabaseUnavailable on any query, scan or read failure.
func scanCVLinkedValues(ctx context.Context, tx pgx.Tx, statement string) (map[string][]string, error) {
	rows, err := tx.Query(ctx, statement)
	if err != nil {
		Logger().WithError(err).Error("unable to query cv experience links")
		return nil, fmt.Errorf("%w: unable to query cv experience links", ErrDatabaseUnavailable)
	}
	defer rows.Close()

	values := make(map[string][]string)
	for rows.Next() {
		var owner, value string
		if err := rows.Scan(&owner, &value); err != nil {
			Logger().WithError(err).Error("unable to scan cv experience link row")
			return nil, fmt.Errorf("%w: unable to scan cv experience link row", ErrDatabaseUnavailable)
		}
		values[owner] = append(values[owner], value)
	}
	if err := rows.Err(); err != nil {
		Logger().WithError(err).Error("unable to read cv experience link rows")
		return nil, fmt.Errorf("%w: unable to read cv experience link rows", ErrDatabaseUnavailable)
	}
	return values, nil
}

// valuesFor returns the values collected for the given owner id, or an empty,
// non-nil slice when the owner has none. It keeps the collections of every
// aggregate serializable as an empty JSON array rather than as null (REQ-2.5).
func valuesFor(values map[string][]string, owner string) []string {
	if found, ok := values[owner]; ok {
		return found
	}
	return make([]string, 0)
}
