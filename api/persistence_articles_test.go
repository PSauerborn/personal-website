package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// articleListingColumns are the columns the article listing statement selects,
// in the order the layer scans them.
var articleListingColumns = []string{"id", "title", "description", "author", "topics", "authored_at"}

// articleCommentColumns are the columns the comment listing statement selects,
// in the order the layer scans them.
var articleCommentColumns = []string{"author", "comment", "created_at"}

// TestPostgresPersistenceLayerGetArticles tests every path through the article
// listing read: the exact reviewed statement, its schema qualification and
// read-only access, the fact that it never selects the document content, the
// articles and topics it returns, the empty non-nil slices, and the errors
// wrapping ErrDatabaseUnavailable (REQ-3.2).
func TestPostgresPersistenceLayerGetArticles(t *testing.T) {
	authoredAt := time.Date(2026, time.March, 1, 9, 0, 0, 0, time.UTC)

	// The expectation names articlesListQuery itself and the mock pool matches
	// statements for equality, so this asserts that the statement the layer
	// issues is exactly the reviewed constant - no substring, no pattern
	// (RISK-001).
	t.Run("issues exactly the reviewed listing statement", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(articlesListQuery).
			WillReturnRows(pgxmock.NewRows(articleListingColumns))

		_, err := persistence.GetArticles(context.Background())

		assert.NoError(t, err)
	})

	// The clauses that carry a requirement are additionally asserted against the
	// constant, so that a rewrite which keeps the tests passing by editing both
	// the statement and its expectation still has to keep every clause.
	t.Run("issues a schema qualified read only statement", func(t *testing.T) {
		cases := []struct {
			name   string
			clause string
		}{
			{"selects from the schema qualified article table", "FROM base.article article"},
			{"joins topics through the link table", "LEFT JOIN base.topic_article_link link ON link.article_id = article.id"},
			{"joins the topic table", "LEFT JOIN base.topic topic ON topic.id = link.topic_id"},
			{"joins the linked document", "INNER JOIN base.document document ON document.id = article.document_id"},
			{"excludes hidden articles", "WHERE article.display = true"},
			{"excludes articles without a linked document", "AND article.document_id IS NOT NULL"},
			{"excludes articles whose document is restricted", "AND document.restricted = false"},
			{"selects the authored at date rather than the created at date", "article.authored_at"},
			{"orders deterministically", "ORDER BY article.authored_at DESC, article.id ASC"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				assert.Contains(t, articlesListQuery, testCase.clause)
			})
		}

		t.Run("reads without mutating", func(t *testing.T) {
			assert.True(t, strings.HasPrefix(strings.TrimSpace(articlesListQuery), "SELECT"))
			assert.NotContains(t, articlesListQuery, "INSERT")
			assert.NotContains(t, articlesListQuery, "UPDATE")
			assert.NotContains(t, articlesListQuery, "DELETE")
		})
	})

	t.Run("never selects the document content", func(t *testing.T) {
		assert.NotContains(t, articlesListQuery, "content")
	})

	t.Run("returns every listed article with its topics", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(articlesListQuery).
			WillReturnRows(pgxmock.NewRows(articleListingColumns).
				AddRow("article-1", "First", "First description", "Pascal Sauerborn",
					[]string{"golang", "postgresql"}, authoredAt).
				AddRow("article-2", "Second", "Second description", "Pascal Sauerborn",
					[]string{"terraform"}, authoredAt.Add(-24*time.Hour)))

		articles, err := persistence.GetArticles(context.Background())

		require.NoError(t, err)
		require.Len(t, articles, 2)
		assert.Equal(t, Article{
			ID:          "article-1",
			Title:       "First",
			Description: "First description",
			Author:      "Pascal Sauerborn",
			Topics:      []string{"golang", "postgresql"},
			AuthoredAt:  authoredAt,
		}, articles[0])
		assert.Equal(t, []string{"terraform"}, articles[1].Topics)
	})

	t.Run("returns an empty topics slice for an article without topics", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(articlesListQuery).
			WillReturnRows(pgxmock.NewRows(articleListingColumns).
				AddRow("article-1", "First", "First description", "Pascal Sauerborn",
					[]string(nil), authoredAt))

		articles, err := persistence.GetArticles(context.Background())

		require.NoError(t, err)
		require.Len(t, articles, 1)
		assert.NotNil(t, articles[0].Topics)
		assert.Empty(t, articles[0].Topics)
	})

	t.Run("returns an empty non nil slice when no article is listed", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(articlesListQuery).
			WillReturnRows(pgxmock.NewRows(articleListingColumns))

		articles, err := persistence.GetArticles(context.Background())

		require.NoError(t, err)
		assert.NotNil(t, articles)
		assert.Empty(t, articles)
	})

	t.Run("returns an error when the database is unavailable", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(articlesListQuery).
			WillReturnError(errors.New("connection refused"))

		articles, err := persistence.GetArticles(context.Background())

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, articles)
	})

	t.Run("returns an error when a row cannot be scanned", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(articlesListQuery).
			WillReturnRows(pgxmock.NewRows(articleListingColumns).
				AddRow("article-1", "First", "First description", "Pascal Sauerborn",
					[]string{"golang"}, "not-a-timestamp"))

		articles, err := persistence.GetArticles(context.Background())

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, articles)
	})
}

// TestResolveVisibleArticle tests the shared visibility contract of the article
// endpoints: the exact reviewed statement taking the article id as its only
// argument, the linked document id returned for a visible article, the single
// ErrArticleNotFound returned for every invisibility cause, and the error
// wrapping ErrDatabaseUnavailable (REQ-3.6, REQ-3.7).
func TestResolveVisibleArticle(t *testing.T) {
	t.Run("issues exactly the reviewed visibility statement with the article id as its only argument", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))

		documentID, err := resolveVisibleArticle(context.Background(), persistence.pool, "article-1")

		assert.NoError(t, err)
		assert.Equal(t, "document-1", documentID)
	})

	t.Run("issues a schema qualified read only statement", func(t *testing.T) {
		cases := []struct {
			name   string
			clause string
		}{
			{"selects from the schema qualified article table", "FROM base.article a"},
			{"joins the linked document", "INNER JOIN base.document d ON d.id = a.document_id"},
			{"filters on the parameterized article id", "WHERE a.id = $1"},
			{"excludes hidden articles", "AND a.display = true"},
			{"excludes articles without a linked document", "AND a.document_id IS NOT NULL"},
			{"excludes articles whose document is restricted", "AND d.restricted = false"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				assert.Contains(t, visibleArticleDocumentQuery, testCase.clause)
			})
		}

		t.Run("reads without mutating", func(t *testing.T) {
			assert.True(t, strings.HasPrefix(strings.TrimSpace(visibleArticleDocumentQuery), "SELECT"))
			assert.NotContains(t, visibleArticleDocumentQuery, "INSERT")
			assert.NotContains(t, visibleArticleDocumentQuery, "UPDATE")
			assert.NotContains(t, visibleArticleDocumentQuery, "DELETE")
		})
	})

	t.Run("returns the linked document id of a visible article", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))

		documentID, err := resolveVisibleArticle(context.Background(), persistence.pool, "article-1")

		require.NoError(t, err)
		assert.Equal(t, "document-1", documentID)
	})

	// Every invisibility cause is filtered out by the same statement, so the
	// database returns no row for each of them; the layer must render them all
	// as the identical not-found sentinel so that callers cannot tell them apart
	// (REQ-3.6, REQ-3.7).
	t.Run("returns the not found sentinel for every invisible article", func(t *testing.T) {
		causes := []string{
			"the article does not exist",
			"the article has display set to false",
			"the article has no linked document",
			"the linked document is restricted",
		}

		messages := make([]string, 0, len(causes))
		for _, cause := range causes {
			t.Run(cause, func(t *testing.T) {
				persistence, mock := newMockPersistenceLayer(t)
				mock.ExpectQuery(visibleArticleDocumentQuery).
					WithArgs("article-1").
					WillReturnError(pgx.ErrNoRows)

				documentID, err := resolveVisibleArticle(context.Background(), persistence.pool, "article-1")

				assert.ErrorIs(t, err, ErrArticleNotFound)
				assert.NotErrorIs(t, err, ErrDatabaseUnavailable)
				assert.Empty(t, documentID)
				messages = append(messages, err.Error())
			})
		}

		require.Len(t, messages, len(causes))
		for _, message := range messages {
			assert.Equal(t, messages[0], message, "invisibility causes must be indistinguishable")
		}
	})

	t.Run("returns an error when the database is unavailable", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnError(errors.New("connection refused"))

		documentID, err := resolveVisibleArticle(context.Background(), persistence.pool, "article-1")

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.NotErrorIs(t, err, ErrArticleNotFound)
		assert.Empty(t, documentID)
	})
}

// TestPostgresPersistenceLayerGetArticleContent tests every path through the
// article content read: the visibility predicate and the content read carried
// by a single statement rather than by two statements of a READ COMMITTED
// transaction, the not found sentinel returned for an invisible article, and
// the error returned when the content cannot be read (REQ-3.3, REQ-3.7).
func TestPostgresPersistenceLayerGetArticleContent(t *testing.T) {
	t.Run("returns the content of the document linked to a visible article", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(visibleArticleContentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"content"}).AddRow([]byte("# article body")))

		content, err := persistence.GetArticleContent(context.Background(), "article-1")

		require.NoError(t, err)
		assert.Equal(t, []byte("# article body"), content)
	})

	// A transaction started with pool.Begin runs at the server default isolation
	// level, under which every statement takes a fresh snapshot: an article
	// hidden between the visibility resolution and the content read would still
	// have its content served. The read therefore resolves visibility and reads
	// the content in one statement, which is the only way it observes a single
	// snapshot. No transaction is registered on the mock, so a started one is
	// left as an unexpected call.
	t.Run("resolves visibility and reads the content in a single statement", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(visibleArticleContentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"content"}).AddRow([]byte("# article body")))

		var content []byte
		var err error
		logs := captureLogs(func() {
			content, err = persistence.GetArticleContent(context.Background(), "article-1")
		})

		require.NoError(t, err)
		assert.Equal(t, []byte("# article body"), content)
		assert.NotContains(t, logs, "unable to begin transaction")
		assert.NotContains(t, logs, "unable to roll back transaction")
	})

	t.Run("carries every clause of the shared visibility contract", func(t *testing.T) {
		cases := []struct {
			name   string
			clause string
		}{
			{"selects the content of the linked document", "SELECT d.content"},
			{"selects from the schema qualified article table", "FROM base.article a"},
			{"joins the linked document", "INNER JOIN base.document d ON d.id = a.document_id"},
			{"filters on the parameterized article id", "WHERE a.id = $1"},
			{"excludes hidden articles", "AND a.display = true"},
			{"excludes articles without a linked document", "AND a.document_id IS NOT NULL"},
			{"excludes articles whose document is restricted", "AND d.restricted = false"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				assert.Contains(t, visibleArticleContentQuery, testCase.clause)
			})
		}

		t.Run("reads without mutating", func(t *testing.T) {
			assert.True(t, strings.HasPrefix(strings.TrimSpace(visibleArticleContentQuery), "SELECT"))
			assert.NotContains(t, visibleArticleContentQuery, "INSERT")
			assert.NotContains(t, visibleArticleContentQuery, "UPDATE")
			assert.NotContains(t, visibleArticleContentQuery, "DELETE")
		})
	})

	// Every invisibility cause is filtered out by the same statement and is
	// therefore reported as the identical not-found sentinel (REQ-3.6, REQ-3.7).
	t.Run("returns the not found sentinel for an invisible article", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(visibleArticleContentQuery).
			WithArgs("article-1").
			WillReturnError(pgx.ErrNoRows)

		content, err := persistence.GetArticleContent(context.Background(), "article-1")

		assert.ErrorIs(t, err, ErrArticleNotFound)
		assert.NotErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, content)
	})

	t.Run("returns an error when the content cannot be read", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(visibleArticleContentQuery).
			WithArgs("article-1").
			WillReturnError(errors.New("connection refused"))

		content, err := persistence.GetArticleContent(context.Background(), "article-1")

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.NotErrorIs(t, err, ErrArticleNotFound)
		assert.Nil(t, content)
	})
}

// capturedArg is a pgxmock argument matcher that accepts any value and records
// it, so that a test can assert on values the persistence layer generates
// itself - such as a comment id - and which it therefore cannot know upfront.
type capturedArg struct {
	value any
}

// Match accepts the argument unconditionally and records it for later
// assertions.
func (c *capturedArg) Match(v any) bool {
	c.value = v
	return true
}

// TestPostgresPersistenceLayerGetArticleComments tests every path through the
// comment listing read: the exact reviewed statements taking the article id as
// their only argument, their schema qualification and read-only access, the
// comments returned oldest first, the empty non-nil slice, the not found
// sentinel returned for every invisible article, and the errors wrapping
// ErrDatabaseUnavailable (REQ-3.4, REQ-3.7).
func TestPostgresPersistenceLayerGetArticleComments(t *testing.T) {
	createdAt := time.Date(2026, time.March, 1, 9, 0, 0, 0, time.UTC)
	author := "Pascal Sauerborn"

	t.Run("issues exactly the reviewed comment statements with the article id as their only argument", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectQuery(articleCommentsQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows(articleCommentColumns))
		mock.ExpectCommit()

		_, err := persistence.GetArticleComments(context.Background(), "article-1")

		assert.NoError(t, err)
	})

	t.Run("issues a schema qualified read only statement", func(t *testing.T) {
		cases := []struct {
			name   string
			clause string
		}{
			{"selects from the schema qualified comment table", "FROM base.article_comment"},
			{"filters on the parameterized article id", "WHERE article_id = $1"},
			{"selects the author, comment and creation date", "SELECT author, comment, created_at"},
			{"orders oldest first with a deterministic tie breaker", "ORDER BY created_at ASC, id ASC"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				assert.Contains(t, articleCommentsQuery, testCase.clause)
			})
		}

		t.Run("reads without mutating", func(t *testing.T) {
			assert.True(t, strings.HasPrefix(strings.TrimSpace(articleCommentsQuery), "SELECT"))
			assert.NotContains(t, articleCommentsQuery, "INSERT")
			assert.NotContains(t, articleCommentsQuery, "UPDATE")
			assert.NotContains(t, articleCommentsQuery, "DELETE")
		})
	})

	t.Run("returns every comment of the article oldest first", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectQuery(articleCommentsQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows(articleCommentColumns).
				AddRow(&author, "first comment", createdAt).
				AddRow((*string)(nil), "second comment", createdAt.Add(time.Hour)))
		mock.ExpectCommit()

		comments, err := persistence.GetArticleComments(context.Background(), "article-1")

		require.NoError(t, err)
		require.Len(t, comments, 2)
		assert.Equal(t, ArticleComment{
			Author:    &author,
			Comment:   "first comment",
			CreatedAt: createdAt,
		}, comments[0])
		assert.Nil(t, comments[1].Author, "an anonymous comment must keep a null author")
		assert.Equal(t, "second comment", comments[1].Comment)
	})

	t.Run("returns an empty non nil slice for an article without comments", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectQuery(articleCommentsQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows(articleCommentColumns))
		mock.ExpectCommit()

		comments, err := persistence.GetArticleComments(context.Background(), "article-1")

		require.NoError(t, err)
		assert.NotNil(t, comments)
		assert.Empty(t, comments)
	})

	// Visibility is resolved before the comments are read, and every
	// invisibility cause yields the same sentinel so that listing comments
	// cannot disclose whether an article the public may not see exists
	// (REQ-3.7).
	t.Run("returns the not found sentinel for every invisible article", func(t *testing.T) {
		causes := []string{
			"the article does not exist",
			"the article has display set to false",
			"the article has no linked document",
			"the linked document is restricted",
		}

		messages := make([]string, 0, len(causes))
		for _, cause := range causes {
			t.Run(cause, func(t *testing.T) {
				persistence, mock := newMockPersistenceLayer(t)
				mock.ExpectBegin()
				mock.ExpectQuery(visibleArticleDocumentQuery).
					WithArgs("article-1").
					WillReturnError(pgx.ErrNoRows)
				mock.ExpectRollback()

				comments, err := persistence.GetArticleComments(context.Background(), "article-1")

				assert.ErrorIs(t, err, ErrArticleNotFound)
				assert.NotErrorIs(t, err, ErrDatabaseUnavailable)
				assert.Nil(t, comments)
				messages = append(messages, err.Error())
			})
		}

		require.Len(t, messages, len(causes))
		for _, message := range messages {
			assert.Equal(t, messages[0], message, "invisibility causes must be indistinguishable")
		}
	})

	t.Run("returns an error when the comments cannot be read", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectQuery(articleCommentsQuery).
			WithArgs("article-1").
			WillReturnError(errors.New("connection refused"))
		mock.ExpectRollback()

		comments, err := persistence.GetArticleComments(context.Background(), "article-1")

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, comments)
	})

	t.Run("returns an error when a comment row cannot be scanned", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectQuery(articleCommentsQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows(articleCommentColumns).
				AddRow(&author, "first comment", "not-a-timestamp"))
		mock.ExpectRollback()

		comments, err := persistence.GetArticleComments(context.Background(), "article-1")

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, comments)
	})

	t.Run("returns an error when the transaction cannot be started", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin().WillReturnError(errors.New("connection refused"))

		comments, err := persistence.GetArticleComments(context.Background(), "article-1")

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Nil(t, comments)
	})
}

// TestPostgresPersistenceLayerCreateArticleComment tests every path through the
// comment write: the exact reviewed insert carrying the generated id, article
// id, author and comment, the timestamp columns it never writes, the generated
// hex id it returns, the null persisted for an omitted author, the not found
// sentinel returned for every invisible article, and the errors returned when
// the insert, the transaction start or the commit fails (REQ-3.5, REQ-3.7,
// [GO-041]).
func TestPostgresPersistenceLayerCreateArticleComment(t *testing.T) {
	author := "Pascal Sauerborn"

	t.Run("issues exactly the reviewed insert with the generated id, article id, author and comment", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectExec(articleCommentInsertQuery).
			WithArgs(pgxmock.AnyArg(), "article-1", &author, "a comment").
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		_, err := persistence.CreateArticleComment(context.Background(), "article-1", &author, "a comment")

		assert.NoError(t, err)
	})

	t.Run("issues a schema qualified parameterized insert", func(t *testing.T) {
		cases := []struct {
			name   string
			clause string
		}{
			{"inserts into the schema qualified comment table", "INSERT INTO base.article_comment"},
			{"targets the id, article id, author and comment columns", "(id, article_id, author, comment)"},
			{"passes every value as a bind parameter", "VALUES ($1, $2, $3, $4)"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				assert.Contains(t, articleCommentInsertQuery, testCase.clause)
			})
		}
	})

	// The schema defaults created_at and updated_at to now() and maintains
	// updated_at through a trigger, so the application never writes either
	// column (docs/db_schema.md §2).
	t.Run("never writes the timestamp columns", func(t *testing.T) {
		assert.NotContains(t, articleCommentInsertQuery, "created_at")
		assert.NotContains(t, articleCommentInsertQuery, "updated_at")
	})

	t.Run("persists a generated hex id and returns it", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		insertedID := &capturedArg{}
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectExec(articleCommentInsertQuery).
			WithArgs(insertedID, "article-1", &author, "a comment").
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		commentID, err := persistence.CreateArticleComment(context.Background(), "article-1", &author, "a comment")

		require.NoError(t, err)
		assert.Len(t, commentID, 32)
		assert.Regexp(t, hexIDPattern, commentID)
		assert.Equal(t, commentID, insertedID.value, "the returned id must be the persisted one")
	})

	t.Run("persists an omitted author as null", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		insertedAuthor := &capturedArg{}
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectExec(articleCommentInsertQuery).
			WithArgs(pgxmock.AnyArg(), "article-1", insertedAuthor, "a comment").
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		commentID, err := persistence.CreateArticleComment(context.Background(), "article-1", nil, "a comment")

		require.NoError(t, err)
		assert.NotEmpty(t, commentID)
		assert.Nil(t, insertedAuthor.value, "an omitted author must reach the database as null")
		assert.NotEqual(t, "", insertedAuthor.value, "an omitted author must not be persisted as an empty string")
	})

	t.Run("returns the not found sentinel for every invisible article", func(t *testing.T) {
		causes := []string{
			"the article does not exist",
			"the article has display set to false",
			"the article has no linked document",
			"the linked document is restricted",
		}

		messages := make([]string, 0, len(causes))
		for _, cause := range causes {
			t.Run(cause, func(t *testing.T) {
				persistence, mock := newMockPersistenceLayer(t)
				mock.ExpectBegin()
				mock.ExpectQuery(visibleArticleDocumentQuery).
					WithArgs("article-1").
					WillReturnError(pgx.ErrNoRows)
				mock.ExpectRollback()

				commentID, err := persistence.CreateArticleComment(context.Background(), "article-1", &author, "a comment")

				assert.ErrorIs(t, err, ErrArticleNotFound)
				assert.NotErrorIs(t, err, ErrDatabaseUnavailable)
				assert.Empty(t, commentID)
				messages = append(messages, err.Error())
			})
		}

		require.Len(t, messages, len(causes))
		for _, message := range messages {
			assert.Equal(t, messages[0], message, "invisibility causes must be indistinguishable")
		}
	})

	t.Run("returns an error when the insert fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectExec(articleCommentInsertQuery).
			WithArgs(pgxmock.AnyArg(), "article-1", &author, "a comment").
			WillReturnError(errors.New("connection refused"))
		mock.ExpectRollback()

		commentID, err := persistence.CreateArticleComment(context.Background(), "article-1", &author, "a comment")

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, commentID)
	})

	t.Run("returns an error when the transaction cannot be started", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin().WillReturnError(errors.New("connection refused"))

		commentID, err := persistence.CreateArticleComment(context.Background(), "article-1", &author, "a comment")

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, commentID)
	})

	t.Run("returns an error when the transaction cannot be committed", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(visibleArticleDocumentQuery).
			WithArgs("article-1").
			WillReturnRows(pgxmock.NewRows([]string{"document_id"}).AddRow("document-1"))
		mock.ExpectExec(articleCommentInsertQuery).
			WithArgs(pgxmock.AnyArg(), "article-1", &author, "a comment").
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit().WillReturnError(errors.New("connection refused"))

		commentID, err := persistence.CreateArticleComment(context.Background(), "article-1", &author, "a comment")

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, commentID)
	})
}
