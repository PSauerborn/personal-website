package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// The document types of the base.document_type enum (docs/db_schema.md §4.20).
// They record the role a document plays for the spec it is linked to.
const (
	// DocumentTypeSpec marks the primary spec document. A spec carries at most
	// one of these (REQ-4.4).
	DocumentTypeSpec = "spec"
	// DocumentTypeAcceptance marks an acceptance criteria document.
	DocumentTypeAcceptance = "acceptance"
	// DocumentTypeOther marks any other supporting document.
	DocumentTypeOther = "other"
)

// The statements below serve the agents endpoints (SPEC-002 §6.1.4 - §6.1.6).
// All of them are read-only, schema-qualified against the `base` schema and
// either explicitly ordered or fully parameterized.
const (
	// listSubagentsStatement selects the complete subagent catalogue (REQ-4.2).
	// The nullable inputs and outputs schemas are selected verbatim and turned
	// into empty schemas by the layer. base.subagent.name carries no unique
	// constraint, so the primary key breaks ties between agents of equal name
	// and keeps the ordering deterministic.
	listSubagentsStatement = `SELECT id, name, description, inputs, outputs ` +
		`FROM base.subagent ` +
		`ORDER BY name ASC, id ASC`

	// listAgentSpecsStatement selects every spec flagged for display together
	// with all of its linked documents in a single pass, so that the specs are
	// assembled without a statement per spec (REQ-4.3, REQ-4.4). The
	// `display = true` filter keeps hidden specs out of the result for every
	// caller (REQ-4.7); the restricted flag of each document is selected rather
	// than filtered on, because the rules of REQ-4.5 and REQ-4.6 depend on the
	// role the document plays and are applied by the controller. The inner
	// joins drop specs without any linked document, which can never be listed
	// anyway as they cannot have a primary spec document (REQ-4.7). Ordering by
	// display name and filename alone is not deterministic, so both primary
	// keys are used as tie-breakers.
	listAgentSpecsStatement = `SELECT spec.id, spec.display_name, spec.description, ` +
		`document.id, document.filename, link.document_type, document.restricted ` +
		`FROM base.agent_spec spec ` +
		`INNER JOIN base.agent_spec_document_link link ON link.spec_id = spec.id ` +
		`INNER JOIN base.document document ON document.id = link.document_id ` +
		`WHERE spec.display = true ` +
		`ORDER BY spec.display_name ASC, spec.id ASC, document.filename ASC, document.id ASC`

	// specDocumentStatement selects the content of a single document by spec and
	// document id. It carries the same visibility predicate as
	// listAgentSpecsStatement and listableSpecs, so that a document can never be
	// downloaded from a spec that is withheld from the listing, and every cause
	// of invisibility produces no row and is reported through the single
	// ErrSpecDocumentNotFound path (REQ-4.8, REQ-4.9). The predicate is applied
	// here rather than in the controller, so that no caller can bypass it
	// (RISK-002):
	//
	//   - driving the statement from the link table enforces the linkage: a
	//     document that exists but is not attached to the given spec produces no
	//     row (REQ-4.8);
	//   - joining base.agent_spec and filtering on `display = true` keeps the
	//     documents of a hidden spec undownloadable for every caller, exactly as
	//     the listing keeps the spec itself hidden (REQ-4.7);
	//   - the EXISTS clause requires the spec to carry a primary
	//     (`document_type = 'spec'`) document that is not restricted, and the
	//     NOT EXISTS clause withholds the spec as soon as any primary document of
	//     it is restricted. Together they reproduce the listing rule that neither
	//     a spec without a readable primary document nor any of its supporting
	//     documents may be disclosed (REQ-4.5, REQ-4.7);
	//   - the counting sub-select requires the spec to carry exactly one primary
	//     document. A spec linked to two of them violates the at-most-one
	//     invariant of REQ-4.4 and is malformed: listableSpecs drops it from the
	//     listing and logs a warning (binding decision 10), so every document of
	//     it must be undownloadable too. Without this clause such a spec
	//     satisfies both the EXISTS and the NOT EXISTS clause and its documents
	//     would be served from a spec that is never listed.
	//
	// The restricted flag of the requested document is selected rather than
	// filtered on, since rejecting a restricted supporting document is a
	// transport concern of the controller (REQ-4.10).
	specDocumentStatement = `SELECT document.filename, document.content, document.restricted ` +
		`FROM base.agent_spec_document_link link ` +
		`INNER JOIN base.agent_spec spec ON spec.id = link.spec_id ` +
		`INNER JOIN base.document document ON document.id = link.document_id ` +
		`WHERE link.spec_id = $1 AND link.document_id = $2 ` +
		`AND spec.display = true ` +
		`AND EXISTS (` +
		`SELECT 1 FROM base.agent_spec_document_link primary_link ` +
		`INNER JOIN base.document primary_document ON primary_document.id = primary_link.document_id ` +
		`WHERE primary_link.spec_id = spec.id ` +
		`AND primary_link.document_type = 'spec' ` +
		`AND primary_document.restricted = false) ` +
		`AND NOT EXISTS (` +
		`SELECT 1 FROM base.agent_spec_document_link restricted_link ` +
		`INNER JOIN base.document restricted_document ON restricted_document.id = restricted_link.document_id ` +
		`WHERE restricted_link.spec_id = spec.id ` +
		`AND restricted_link.document_type = 'spec' ` +
		`AND restricted_document.restricted = true) ` +
		`AND (` +
		`SELECT COUNT(*) FROM base.agent_spec_document_link primary_count_link ` +
		`WHERE primary_count_link.spec_id = spec.id ` +
		`AND primary_count_link.document_type = 'spec') = 1`
)

// agentStatements returns every statement this file issues. It exists so that
// the unittests can assert the shared properties of the agents statements —
// schema qualification and read-only access — in one place.
func agentStatements() []string {
	return []string{
		listSubagentsStatement,
		listAgentSpecsStatement,
		specDocumentStatement,
	}
}

// IsPrimary reports whether the document is the primary spec document of the
// spec it is linked to, of which a spec has at most one (REQ-4.4). It is the
// flag the caller applies REQ-4.5 on: a spec whose primary document is
// restricted is not listed at all, while restricted supporting documents are
// merely omitted from the listing (REQ-4.6).
func (document AgentSpecDocument) IsPrimary() bool {
	return document.DocumentType == DocumentTypeSpec
}

// GetSubagents returns the complete subagent catalogue ordered by name with the
// entry id as a tie-breaker (REQ-4.2). Agents that declare no input or output
// schema carry an empty, non-nil schema map rather than a nil one, so that the
// caller emits `{}` for them. It returns an empty, non-nil slice when no
// subagent is stored, and an error wrapping ErrDatabaseUnavailable when the
// database cannot serve the request, so that no driver detail leaks past this
// layer ([GO-016], [GO-040]).
func (db *PostgresPersistenceLayer) GetSubagents(ctx context.Context) ([]Subagent, error) {
	rows, err := db.pool.Query(ctx, listSubagentsStatement)
	if err != nil {
		Logger().WithError(err).Error("unable to query subagents")
		return nil, fmt.Errorf("%w: unable to query subagents", ErrDatabaseUnavailable)
	}
	defer rows.Close()

	agents := make([]Subagent, 0)
	for rows.Next() {
		agent, err := scanSubagent(rows)
		if err != nil {
			return nil, err
		}
		agents = append(agents, agent)
	}
	if err := rows.Err(); err != nil {
		Logger().WithError(err).Error("unable to read subagent rows")
		return nil, fmt.Errorf("%w: unable to read subagents", ErrDatabaseUnavailable)
	}
	return agents, nil
}

// GetAgentSpecs returns every spec flagged for display, ordered by display name
// with the spec id as a tie-breaker, each carrying all of its linked documents
// ordered by filename (REQ-4.3, REQ-4.4, REQ-4.7). Specs with `display = false`
// are filtered out by the statement itself and can never reach the caller.
// Restricted documents are returned as they are: the visibility rules of
// REQ-4.5 and REQ-4.6 are applied by the caller, which needs the restricted
// flag of both the primary and the supporting documents to do so. It returns an
// empty, non-nil slice when no spec is displayed, and an error wrapping
// ErrDatabaseUnavailable when the database cannot serve the request.
func (db *PostgresPersistenceLayer) GetAgentSpecs(ctx context.Context) ([]AgentSpec, error) {
	rows, err := db.pool.Query(ctx, listAgentSpecsStatement)
	if err != nil {
		Logger().WithError(err).Error("unable to query agent specs")
		return nil, fmt.Errorf("%w: unable to query agent specs", ErrDatabaseUnavailable)
	}
	defer rows.Close()

	specs := make([]AgentSpec, 0)
	// The statement returns one row per (spec, document) pair ordered by spec,
	// so consecutive rows of the same spec are folded into the aggregate that is
	// currently being assembled. Indices are tracked rather than pointers so
	// that appending to the slice cannot invalidate them.
	indices := make(map[string]int)
	for rows.Next() {
		spec, document, err := scanAgentSpecRow(rows)
		if err != nil {
			return nil, err
		}

		index, seen := indices[spec.ID]
		if !seen {
			specs = append(specs, spec)
			index = len(specs) - 1
			indices[spec.ID] = index
		}
		specs[index].Documents = append(specs[index].Documents, document)
	}
	if err := rows.Err(); err != nil {
		Logger().WithError(err).Error("unable to read agent spec rows")
		return nil, fmt.Errorf("%w: unable to read agent specs", ErrDatabaseUnavailable)
	}
	return specs, nil
}

// GetSpecDocument returns the content of the document with the given document
// id, provided it is linked to a publicly visible spec with the given spec id
// (REQ-4.8). It returns an error wrapping ErrSpecDocumentNotFound when the spec
// does not exist, the document does not exist, the document exists but is not
// linked to that spec, the spec is hidden, the spec carries no disclosable
// primary document, or the spec is malformed in carrying more than one primary
// document — all of them produce no row for the same statement — and an
// error wrapping ErrDatabaseUnavailable when the database cannot serve the
// request, so that the caller can tell a withheld document apart from a
// failure. The restricted flag of the requested document is returned rather
// than enforced here, since rejecting a restricted supporting document is a
// transport concern (REQ-4.10).
func (db *PostgresPersistenceLayer) GetSpecDocument(ctx context.Context, specID, documentID string) (SpecDocument, error) {
	row := db.pool.QueryRow(ctx, specDocumentStatement, specID, documentID)

	var document SpecDocument
	if err := row.Scan(&document.Filename, &document.Content, &document.Restricted); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Logger().WithFields(map[string]any{
				"spec_id":     specID,
				"document_id": documentID,
			}).Info("no visible document linked to spec")
			return SpecDocument{}, fmt.Errorf("%w: no document %s linked to spec %s", ErrSpecDocumentNotFound, documentID, specID)
		}
		Logger().WithError(err).Error("unable to query spec document")
		return SpecDocument{}, fmt.Errorf("%w: unable to query spec document", ErrDatabaseUnavailable)
	}
	return document, nil
}

// scanSubagent scans a single row of the subagent catalogue statement into a
// Subagent, decoding the two nullable JSONB schema columns. It returns an error
// wrapping ErrDatabaseUnavailable when the row cannot be read or a stored schema
// cannot be decoded.
func scanSubagent(rows pgx.Rows) (Subagent, error) {
	var (
		agent           Subagent
		inputs, outputs []byte
	)

	if err := rows.Scan(&agent.ID, &agent.Name, &agent.Description, &inputs, &outputs); err != nil {
		Logger().WithError(err).Error("unable to scan subagent row")
		return Subagent{}, fmt.Errorf("%w: unable to read subagents", ErrDatabaseUnavailable)
	}

	declaredInputs, err := decodeSchema(inputs)
	if err != nil {
		return Subagent{}, err
	}
	declaredOutputs, err := decodeSchema(outputs)
	if err != nil {
		return Subagent{}, err
	}

	agent.Inputs = declaredInputs
	agent.Outputs = declaredOutputs
	return agent, nil
}

// decodeSchema decodes a JSONB schema column into a map. A null or empty column
// yields an empty, non-nil map, which is what lets the caller emit `{}` for an
// agent that declares no schema instead of a null (REQ-4.2). It returns an error
// wrapping ErrDatabaseUnavailable when the stored document is not a JSON object.
func decodeSchema(raw []byte) (map[string]any, error) {
	schema := make(map[string]any)
	if len(raw) == 0 {
		return schema, nil
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		Logger().WithError(err).Error("unable to decode subagent schema")
		return nil, fmt.Errorf("%w: unable to read subagents", ErrDatabaseUnavailable)
	}
	return schema, nil
}

// scanAgentSpecRow scans a single row of the spec listing statement into the
// spec it belongs to and the document it carries. The returned spec holds an
// empty, non-nil document slice, which the caller fills. It returns an error
// wrapping ErrDatabaseUnavailable when the row cannot be read.
func scanAgentSpecRow(rows pgx.Rows) (AgentSpec, AgentSpecDocument, error) {
	var (
		spec     AgentSpec
		document AgentSpecDocument
	)

	if err := rows.Scan(
		&spec.ID,
		&spec.DisplayName,
		&spec.Description,
		&document.DocumentID,
		&document.Filename,
		&document.DocumentType,
		&document.Restricted,
	); err != nil {
		Logger().WithError(err).Error("unable to scan agent spec row")
		return AgentSpec{}, AgentSpecDocument{}, fmt.Errorf("%w: unable to read agent specs", ErrDatabaseUnavailable)
	}

	spec.Documents = make([]AgentSpecDocument, 0)
	return spec, document, nil
}
