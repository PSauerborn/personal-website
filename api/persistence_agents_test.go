package main

import (
	"context"
	"errors"
	"testing"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The column sets below mirror, in order, the columns each agents statement
// selects and the layer scans.
var (
	subagentColumns = []string{"id", "name", "description", "inputs", "outputs"}

	agentSpecColumns = []string{
		"id", "display_name", "description",
		"document_id", "filename", "document_type", "restricted",
	}

	specDocumentColumns = []string{"filename", "content", "restricted"}
)

// TestPostgresPersistenceLayerGetSubagents tests every path through the subagent
// catalogue read: the schema qualified, read-only and explicitly ordered
// statement, the declared schemas it returns, the empty non-nil maps used for
// undeclared ones, the empty non-nil slice, and the errors wrapping
// ErrDatabaseUnavailable (REQ-4.2).
func TestPostgresPersistenceLayerGetSubagents(t *testing.T) {
	t.Run("issues a schema qualified read only statement with an explicit order", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listSubagentsStatement).
			WillReturnRows(pgxmock.NewRows(subagentColumns))

		agents, err := persistence.GetSubagents(context.Background())

		require.NoError(t, err)
		assert.Empty(t, agents)
	})

	t.Run("returns every catalogue entry with its declared schemas", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(subagentColumns).
			AddRow(
				"11111111111111111111111111111111",
				"task-executor",
				"executes a single task file",
				[]byte(`{"taskFilePath": "string"}`),
				[]byte(`{"status": "string"}`),
			)
		mock.ExpectQuery(listSubagentsStatement).WillReturnRows(rows)

		agents, err := persistence.GetSubagents(context.Background())

		require.NoError(t, err)
		require.Len(t, agents, 1)
		assert.Equal(t, Subagent{
			ID:          "11111111111111111111111111111111",
			Name:        "task-executor",
			Description: "executes a single task file",
			Inputs:      map[string]any{"taskFilePath": "string"},
			Outputs:     map[string]any{"status": "string"},
		}, agents[0])
	})

	t.Run("surfaces undeclared schemas as empty non nil maps", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(subagentColumns).
			AddRow("22222222222222222222222222222222", "work-planner", "plans work", nil, nil)
		mock.ExpectQuery(listSubagentsStatement).WillReturnRows(rows)

		agents, err := persistence.GetSubagents(context.Background())

		require.NoError(t, err)
		require.Len(t, agents, 1)
		assert.NotNil(t, agents[0].Inputs, "an undeclared input schema must serialize as {} rather than null")
		assert.NotNil(t, agents[0].Outputs, "an undeclared output schema must serialize as {} rather than null")
		assert.Empty(t, agents[0].Inputs)
		assert.Empty(t, agents[0].Outputs)
	})

	t.Run("returns an empty non nil slice when no subagent is stored", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listSubagentsStatement).WillReturnRows(pgxmock.NewRows(subagentColumns))

		agents, err := persistence.GetSubagents(context.Background())

		require.NoError(t, err)
		assert.NotNil(t, agents)
		assert.Len(t, agents, 0)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the query fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listSubagentsStatement).WillReturnError(errors.New("connection refused"))

		agents, err := persistence.GetSubagents(context.Background())

		assert.Nil(t, agents)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable for an unreadable schema", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(subagentColumns).
			AddRow("33333333333333333333333333333333", "broken", "invalid schema", []byte(`{`), nil)
		mock.ExpectQuery(listSubagentsStatement).WillReturnRows(rows)

		agents, err := persistence.GetSubagents(context.Background())

		assert.Nil(t, agents)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when a row cannot be read", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(subagentColumns).
			AddRow("44444444444444444444444444444444", "broken", "unreadable row", nil, nil).
			RowError(0, errors.New("row is corrupt"))
		mock.ExpectQuery(listSubagentsStatement).WillReturnRows(rows)

		agents, err := persistence.GetSubagents(context.Background())

		assert.Nil(t, agents)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
	})
}

// TestPostgresPersistenceLayerGetAgentSpecs tests every path through the agent
// spec read: the single statement joining specs onto their linked documents, the
// aggregate assembled without a follow-up query, the restricted flag and primary
// document marker handed to the caller, the exclusion of hidden specs, the empty
// non-nil slice, and the errors wrapping ErrDatabaseUnavailable (REQ-4.3,
// REQ-4.4, REQ-4.7).
func TestPostgresPersistenceLayerGetAgentSpecs(t *testing.T) {
	t.Run("joins the specs onto their linked documents in a single statement", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listAgentSpecsStatement).
			WillReturnRows(pgxmock.NewRows(agentSpecColumns))

		specs, err := persistence.GetAgentSpecs(context.Background())

		require.NoError(t, err)
		assert.Empty(t, specs)
	})

	t.Run("assembles every linked document of a spec without a follow up query", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(agentSpecColumns).
			AddRow("11111111111111111111111111111111", "SPEC-001", "database schema",
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "SPEC-001.md", "spec", false).
			AddRow("11111111111111111111111111111111", "SPEC-001", "database schema",
				"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "SPEC-001-acceptance.md", "acceptance", false).
			AddRow("22222222222222222222222222222222", "SPEC-002", "api specification",
				"cccccccccccccccccccccccccccccccc", "SPEC-002.md", "spec", false)
		// A single expectation is registered, so a per-spec follow-up query would
		// fail the test with an unexpected call.
		mock.ExpectQuery(listAgentSpecsStatement).WillReturnRows(rows)

		specs, err := persistence.GetAgentSpecs(context.Background())

		require.NoError(t, err)
		require.Len(t, specs, 2)
		assert.Equal(t, AgentSpec{
			ID:          "11111111111111111111111111111111",
			DisplayName: "SPEC-001",
			Description: "database schema",
			Documents: []AgentSpecDocument{
				{
					DocumentID:   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					Filename:     "SPEC-001.md",
					DocumentType: DocumentTypeSpec,
					Restricted:   false,
				},
				{
					DocumentID:   "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					Filename:     "SPEC-001-acceptance.md",
					DocumentType: DocumentTypeAcceptance,
					Restricted:   false,
				},
			},
		}, specs[0])
		assert.Equal(t, "SPEC-002", specs[1].DisplayName)
		assert.Len(t, specs[1].Documents, 1)
	})

	t.Run("returns restricted documents so that the caller can filter them", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(agentSpecColumns).
			AddRow("11111111111111111111111111111111", "SPEC-001", "database schema",
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "SPEC-001.md", "spec", false).
			AddRow("11111111111111111111111111111111", "SPEC-001", "database schema",
				"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "internal-notes.md", "other", true)
		mock.ExpectQuery(listAgentSpecsStatement).WillReturnRows(rows)

		specs, err := persistence.GetAgentSpecs(context.Background())

		require.NoError(t, err)
		require.Len(t, specs, 1)
		require.Len(t, specs[0].Documents, 2)
		assert.True(t, specs[0].Documents[1].Restricted)
		assert.Equal(t, DocumentTypeOther, specs[0].Documents[1].DocumentType)
	})

	t.Run("marks the document with type spec as the primary document of the spec", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(agentSpecColumns).
			AddRow("11111111111111111111111111111111", "SPEC-001", "database schema",
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "SPEC-001-acceptance.md", "acceptance", false).
			AddRow("11111111111111111111111111111111", "SPEC-001", "database schema",
				"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "SPEC-001.md", "spec", false)
		mock.ExpectQuery(listAgentSpecsStatement).WillReturnRows(rows)

		specs, err := persistence.GetAgentSpecs(context.Background())

		require.NoError(t, err)
		require.Len(t, specs, 1)
		require.Len(t, specs[0].Documents, 2)
		assert.False(t, specs[0].Documents[0].IsPrimary())
		assert.True(t, specs[0].Documents[1].IsPrimary())
	})

	t.Run("excludes specs that are not flagged for display", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		// The mock only ever returns the displayed spec: the assertion of interest
		// is that the statement itself carries the display filter, so that hidden
		// specs can never reach the caller (REQ-4.7).
		rows := pgxmock.NewRows(agentSpecColumns).
			AddRow("11111111111111111111111111111111", "SPEC-001", "database schema",
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "SPEC-001.md", "spec", false)
		mock.ExpectQuery(listAgentSpecsStatement).WillReturnRows(rows)

		specs, err := persistence.GetAgentSpecs(context.Background())

		require.NoError(t, err)
		require.Len(t, specs, 1)
		assert.Equal(t, "SPEC-001", specs[0].DisplayName)
	})

	t.Run("returns an empty non nil slice when no spec is stored", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listAgentSpecsStatement).WillReturnRows(pgxmock.NewRows(agentSpecColumns))

		specs, err := persistence.GetAgentSpecs(context.Background())

		require.NoError(t, err)
		assert.NotNil(t, specs)
		assert.Len(t, specs, 0)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the query fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listAgentSpecsStatement).WillReturnError(errors.New("connection refused"))

		specs, err := persistence.GetAgentSpecs(context.Background())

		assert.Nil(t, specs)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when a row cannot be read", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		rows := pgxmock.NewRows(agentSpecColumns).
			AddRow("11111111111111111111111111111111", "SPEC-001", "database schema",
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "SPEC-001.md", "spec", false).
			RowError(0, errors.New("row is corrupt"))
		mock.ExpectQuery(listAgentSpecsStatement).WillReturnRows(rows)

		specs, err := persistence.GetAgentSpecs(context.Background())

		assert.Nil(t, specs)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
	})
}

// TestPostgresPersistenceLayerGetSpecDocument tests every path through the spec
// document read: the resolution through the link table on both identifiers, the
// restricted flag exposed to the caller, the single ErrSpecDocumentNotFound
// returned for a missing spec, a missing document, an unlinked document, a hidden
// spec and a spec whose primary document is restricted alike, and the error
// wrapping ErrDatabaseUnavailable (REQ-4.5, REQ-4.7, REQ-4.8, REQ-4.9).
func TestPostgresPersistenceLayerGetSpecDocument(t *testing.T) {
	t.Run("resolves the document through the link table with both identifiers", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("11111111111111111111111111111111", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").
			WillReturnRows(pgxmock.NewRows(specDocumentColumns).
				AddRow("SPEC-001.md", []byte("# SPEC-001"), false))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"11111111111111111111111111111111",
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		)

		require.NoError(t, err)
		assert.Equal(t, SpecDocument{
			Filename:   "SPEC-001.md",
			Content:    []byte("# SPEC-001"),
			Restricted: false,
		}, document)
	})

	t.Run("exposes the restricted flag of the document to the caller", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("11111111111111111111111111111111", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").
			WillReturnRows(pgxmock.NewRows(specDocumentColumns).
				AddRow("internal-notes.md", []byte("secret"), true))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"11111111111111111111111111111111",
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		)

		require.NoError(t, err)
		assert.True(t, document.Restricted, "the restricted flag must reach the caller so that it can reject the request")
	})

	t.Run("returns the not found sentinel for a spec that does not exist", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("99999999999999999999999999999999", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").
			WillReturnRows(pgxmock.NewRows(specDocumentColumns))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"99999999999999999999999999999999",
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		)

		assert.ErrorIs(t, err, ErrSpecDocumentNotFound)
		assert.Empty(t, document.Content)
	})

	t.Run("returns the not found sentinel for a document that does not exist", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("11111111111111111111111111111111", "99999999999999999999999999999999").
			WillReturnRows(pgxmock.NewRows(specDocumentColumns))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"11111111111111111111111111111111",
			"99999999999999999999999999999999",
		)

		assert.ErrorIs(t, err, ErrSpecDocumentNotFound)
		assert.Empty(t, document.Content)
	})

	t.Run("returns the not found sentinel for a document that is not linked to the spec", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		// The document exists, but the link table holds no row pairing it with the
		// given spec, so the join yields no row (REQ-4.8).
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("11111111111111111111111111111111", "dddddddddddddddddddddddddddddddd").
			WillReturnRows(pgxmock.NewRows(specDocumentColumns))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"11111111111111111111111111111111",
			"dddddddddddddddddddddddddddddddd",
		)

		assert.ErrorIs(t, err, ErrSpecDocumentNotFound)
		assert.NotErrorIs(t, err, ErrDatabaseUnavailable, "a missing link is not a database failure")
		assert.Empty(t, document.Filename)
	})

	t.Run("returns the not found sentinel for a document of a hidden spec", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		// The spec exists and the document is linked to it, but the spec carries
		// display = false, so the statement itself filters the row out and the
		// document is reported as not found (REQ-4.7).
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("22222222222222222222222222222222", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").
			WillReturnRows(pgxmock.NewRows(specDocumentColumns))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"22222222222222222222222222222222",
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		)

		assert.ErrorIs(t, err, ErrSpecDocumentNotFound)
		assert.NotErrorIs(t, err, ErrDatabaseUnavailable, "a hidden spec is not a database failure")
		assert.Empty(t, document.Content)
	})

	t.Run("returns the not found sentinel for a document of a spec whose primary document is restricted", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		// The requested supporting document is not restricted itself, but the
		// primary document of its spec is, so the whole spec is withheld exactly
		// as it is withheld from the listing (REQ-4.5).
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("33333333333333333333333333333333", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb").
			WillReturnRows(pgxmock.NewRows(specDocumentColumns))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"33333333333333333333333333333333",
			"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		)

		assert.ErrorIs(t, err, ErrSpecDocumentNotFound)
		assert.Empty(t, document.Content)
	})

	t.Run("returns the not found sentinel for a document of a spec carrying more than one primary document", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		// A spec linked to two document_type = 'spec' documents violates the
		// at-most-one invariant of REQ-4.4 and is malformed. listableSpecs
		// withholds it from the listing, so the statement must withhold every
		// document of it too, rather than serving documents of a spec that can
		// never be listed.
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("44444444444444444444444444444444", "cccccccccccccccccccccccccccccccc").
			WillReturnRows(pgxmock.NewRows(specDocumentColumns))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"44444444444444444444444444444444",
			"cccccccccccccccccccccccccccccccc",
		)

		assert.ErrorIs(t, err, ErrSpecDocumentNotFound)
		assert.NotErrorIs(t, err, ErrDatabaseUnavailable, "a malformed spec is not a database failure")
		assert.Empty(t, document.Content)
	})

	t.Run("returns an error wrapping ErrDatabaseUnavailable when the query fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(specDocumentStatement).
			WithArgs("11111111111111111111111111111111", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").
			WillReturnError(errors.New("connection refused"))

		document, err := persistence.GetSpecDocument(
			context.Background(),
			"11111111111111111111111111111111",
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		)

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.NotErrorIs(t, err, ErrSpecDocumentNotFound, "a query failure must be distinguishable from a missing document")
		assert.Empty(t, document.Content)
	})
}

// TestAgentStatements tests the properties shared by every statement of the
// agents persistence layer: schema qualification, read-only access,
// deterministic ordering, full parameterization, and the visibility predicates
// that keep hidden specs and the documents of a spec with a restricted primary
// document undownloadable (REQ-4.5, REQ-4.7, RISK-002).
func TestAgentStatements(t *testing.T) {
	t.Run("issues schema qualified read only statements with deterministic ordering", func(t *testing.T) {
		for _, statement := range agentStatements() {
			assert.Contains(t, statement, "SELECT", "every agents statement must be read-only")
			assert.NotContains(t, statement, "INSERT")
			assert.NotContains(t, statement, "UPDATE")
			assert.NotContains(t, statement, "DELETE")
			assert.Contains(t, statement, "base.", "every agents statement must be schema qualified")
		}
	})

	t.Run("orders every listing statement explicitly", func(t *testing.T) {
		for _, statement := range []string{listSubagentsStatement, listAgentSpecsStatement} {
			assert.Contains(t, statement, "ORDER BY", "every listing statement must be deterministically ordered")
		}
	})

	t.Run("parameterizes the spec document statement", func(t *testing.T) {
		assert.Contains(t, specDocumentStatement, "$1")
		assert.Contains(t, specDocumentStatement, "$2")
	})

	t.Run("filters hidden specs out of every spec scoped statement", func(t *testing.T) {
		for _, statement := range []string{listAgentSpecsStatement, specDocumentStatement} {
			assert.Contains(t, statement, "base.agent_spec spec",
				"every spec scoped statement must resolve the spec it reads from")
			assert.Contains(t, statement, "spec.display = true",
				"every spec scoped statement must filter hidden specs in SQL")
		}
	})

	t.Run("withholds documents of a spec whose primary document is restricted", func(t *testing.T) {
		assert.Contains(t, specDocumentStatement, "primary_link.document_type = 'spec'",
			"the primary document of the spec must be resolved by its document type")
		assert.Contains(t, specDocumentStatement, "primary_document.restricted = false",
			"a spec without a disclosable primary document must yield no row")
		assert.Contains(t, specDocumentStatement, "restricted_document.restricted = true",
			"a restricted primary document must exclude every document of the spec")
	})

	// listableSpecs drops a spec carrying more than one primary document as
	// malformed (REQ-4.4, binding decision 10). The download statement must
	// withhold the same spec, or a document could be downloaded from a spec that
	// is never listed (RISK-002).
	t.Run("withholds documents of a spec carrying more than one primary document", func(t *testing.T) {
		assert.Contains(t, specDocumentStatement, "primary_count_link.document_type = 'spec'",
			"the primary documents of the spec must be counted by their document type")
		assert.Contains(t, specDocumentStatement, ") = 1",
			"a spec must carry exactly one primary document for any of its documents to be downloadable")

		malformed := AgentSpec{
			ID:          "44444444444444444444444444444444",
			DisplayName: "SPEC-004",
			Documents: []AgentSpecDocument{
				{DocumentID: "aaaa", Filename: "SPEC-004.md", DocumentType: DocumentTypeSpec},
				{DocumentID: "bbbb", Filename: "SPEC-004-v2.md", DocumentType: DocumentTypeSpec},
				{DocumentID: "cccc", Filename: "notes.md", DocumentType: DocumentTypeOther},
			},
		}

		var listable []AgentSpec
		captureLogs(func() {
			listable = listableSpecs([]AgentSpec{malformed})
		})

		assert.Empty(t, listable, "the listing and the download statement must agree on a malformed spec")
	})
}
