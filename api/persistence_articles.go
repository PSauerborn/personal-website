package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// articleRowQuerier is the subset of the pgx API used by the article statements.
// Both the connection pool and a transaction started on it satisfy it, so that
// the shared visibility resolution can run either standalone or as one step of a
// larger read.
type articleRowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const (
	// articlesListQuery lists the metadata of every publicly visible article
	// together with its topics. Topics are aggregated by the database so that no
	// follow-up query is issued per article, and articles that are hidden,
	// document-less or backed by a restricted document are filtered out.
	articlesListQuery = `SELECT
		article.id,
		article.title,
		article.description,
		article.author,
		COALESCE(ARRAY_AGG(topic.name ORDER BY topic.name)
			FILTER (WHERE topic.name IS NOT NULL), '{}') AS topics,
		article.authored_at
	FROM base.article article
	INNER JOIN base.document document ON document.id = article.document_id
	LEFT JOIN base.topic_article_link link ON link.article_id = article.id
	LEFT JOIN base.topic topic ON topic.id = link.topic_id
	WHERE article.display = true
		AND article.document_id IS NOT NULL
		AND document.restricted = false
	GROUP BY article.id, article.title, article.description, article.author, article.authored_at
	ORDER BY article.authored_at DESC, article.id ASC`

	// visibleArticleDocumentQuery resolves the document linked to a publicly
	// visible article. It returns no row for every invisibility cause, which is
	// what makes those causes indistinguishable to callers.
	visibleArticleDocumentQuery = `SELECT a.document_id
	FROM base.article a
	INNER JOIN base.document d ON d.id = a.document_id
	WHERE a.id = $1
		AND a.display = true
		AND a.document_id IS NOT NULL
		AND d.restricted = false`

	// visibleArticleContentQuery reads the raw bytes of the document linked to a
	// publicly visible article. It carries the visibility predicate of
	// visibleArticleDocumentQuery and the content read in one statement, so that
	// both are evaluated against a single snapshot: splitting them across two
	// statements of a transaction would not, since pool.Begin starts the
	// transaction at the server default isolation level (READ COMMITTED) under
	// which every statement takes a fresh snapshot, and an article hidden between
	// the two reads would still have its content served (REQ-3.3, REQ-3.7).
	visibleArticleContentQuery = `SELECT d.content
	FROM base.article a
	INNER JOIN base.document d ON d.id = a.document_id
	WHERE a.id = $1
		AND a.display = true
		AND a.document_id IS NOT NULL
		AND d.restricted = false`

	// articleCommentsQuery lists the comments recorded against a single article,
	// oldest first. The identifier is used as a tie-breaker so that comments
	// created within the same clock tick still come back in a stable order
	// (REQ-3.4).
	articleCommentsQuery = `SELECT author, comment, created_at
	FROM base.article_comment
	WHERE article_id = $1
	ORDER BY created_at ASC, id ASC`

	// articleCommentInsertQuery records a single comment against an article. The
	// created_at and updated_at columns are deliberately absent: the schema
	// defaults both to now() and maintains updated_at through a trigger, so the
	// application never writes either of them (docs/db_schema.md §2).
	articleCommentInsertQuery = `INSERT INTO base.article_comment (id, article_id, author, comment)
	VALUES ($1, $2, $3, $4)`
)

// GetArticles returns the listing metadata of every publicly visible article,
// most recently authored first, with the topics of each article attached
// (REQ-3.2). Hidden articles, articles without a linked document and articles
// whose linked document is restricted are never returned. It returns an error
// wrapping ErrDatabaseUnavailable when the listing cannot be read.
func (db *PostgresPersistenceLayer) GetArticles(ctx context.Context) ([]Article, error) {
	rows, err := db.pool.Query(ctx, articlesListQuery)
	if err != nil {
		Logger().WithError(err).Error("unable to query articles")
		return nil, fmt.Errorf("%w: unable to query articles", ErrDatabaseUnavailable)
	}
	defer rows.Close()

	articles := make([]Article, 0)
	for rows.Next() {
		var article Article
		if err := rows.Scan(&article.ID, &article.Title, &article.Description,
			&article.Author, &article.Topics, &article.AuthoredAt); err != nil {
			Logger().WithError(err).Error("unable to scan article row")
			return nil, fmt.Errorf("%w: unable to scan article", ErrDatabaseUnavailable)
		}
		if article.Topics == nil {
			article.Topics = []string{}
		}
		articles = append(articles, article)
	}

	if err := rows.Err(); err != nil {
		Logger().WithError(err).Error("unable to iterate article rows")
		return nil, fmt.Errorf("%w: unable to iterate articles", ErrDatabaseUnavailable)
	}
	return articles, nil
}

// resolveVisibleArticle returns the identifier of the document linked to the
// article with the given identifier, provided that article is publicly visible,
// using the given querier. It returns an error wrapping ErrArticleNotFound when
// the article does not exist, is hidden, has no linked document or its linked
// document is restricted (REQ-3.6, REQ-3.7). This is the single visibility
// contract shared by every article endpoint, so that all of them answer
// identically for an article the public may not see; taking the querier as an
// argument lets it run either standalone or as one statement of a larger
// transaction.
func resolveVisibleArticle(ctx context.Context, querier articleRowQuerier, articleID string) (string, error) {
	var documentID string
	err := querier.QueryRow(ctx, visibleArticleDocumentQuery, articleID).Scan(&documentID)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return "", fmt.Errorf("%w: no visible article with the given id", ErrArticleNotFound)
	case err != nil:
		Logger().WithError(err).Error("unable to resolve visible article")
		return "", fmt.Errorf("%w: unable to resolve article", ErrDatabaseUnavailable)
	}
	return documentID, nil
}

// GetArticleContent returns the raw content of the document linked to the
// article with the given identifier (REQ-3.3). It returns an error wrapping
// ErrArticleNotFound when the article is not publicly visible - it does not
// exist, is hidden, has no linked document or its linked document is restricted
// - so that the content endpoint answers exactly as every other article
// endpoint does (REQ-3.6, REQ-3.7). Visibility and content are carried by a
// single statement, which is what makes them observe one snapshot: no
// transaction can provide that at the READ COMMITTED default the pool starts
// transactions with.
func (db *PostgresPersistenceLayer) GetArticleContent(ctx context.Context, articleID string) ([]byte, error) {
	var content []byte
	err := db.pool.QueryRow(ctx, visibleArticleContentQuery, articleID).Scan(&content)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return nil, fmt.Errorf("%w: no visible article with the given id", ErrArticleNotFound)
	case err != nil:
		Logger().WithError(err).Error("unable to query article content")
		return nil, fmt.Errorf("%w: unable to query article content", ErrDatabaseUnavailable)
	}
	return content, nil
}

// GetArticleComments returns every comment recorded against the article with
// the given identifier, oldest first (REQ-3.4). An article without comments
// yields an empty, non-nil slice. It returns an error wrapping
// ErrArticleNotFound when the article is not publicly visible, so that comment
// listings disclose no more about an article than any other endpoint
// (REQ-3.7).
func (db *PostgresPersistenceLayer) GetArticleComments(ctx context.Context, articleID string) ([]ArticleComment, error) {
	comments := make([]ArticleComment, 0)
	err := runInTransaction(ctx, db.pool, func(tx pgx.Tx) error {
		if _, err := resolveVisibleArticle(ctx, tx, articleID); err != nil {
			return err
		}

		rows, err := tx.Query(ctx, articleCommentsQuery, articleID)
		if err != nil {
			Logger().WithError(err).Error("unable to query article comments")
			return fmt.Errorf("%w: unable to query article comments", ErrDatabaseUnavailable)
		}
		defer rows.Close()

		for rows.Next() {
			var comment ArticleComment
			if err := rows.Scan(&comment.Author, &comment.Comment, &comment.CreatedAt); err != nil {
				Logger().WithError(err).Error("unable to scan article comment row")
				return fmt.Errorf("%w: unable to scan article comment", ErrDatabaseUnavailable)
			}
			comments = append(comments, comment)
		}

		if err := rows.Err(); err != nil {
			Logger().WithError(err).Error("unable to iterate article comment rows")
			return fmt.Errorf("%w: unable to iterate article comments", ErrDatabaseUnavailable)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return comments, nil
}

// CreateArticleComment records a new comment against the article with the given
// identifier and returns the identifier generated for it (REQ-3.5, [GO-042]).
// The author is optional: a nil author is persisted as SQL NULL rather than as
// an empty string. The creation timestamp is left to the schema default so that
// it always comes from the database clock. It returns an error wrapping
// ErrArticleNotFound when the article is not publicly visible (REQ-3.7).
func (db *PostgresPersistenceLayer) CreateArticleComment(ctx context.Context, articleID string, author *string, comment string) (string, error) {
	commentID, err := NewID()
	if err != nil {
		return "", err
	}

	err = runInTransaction(ctx, db.pool, func(tx pgx.Tx) error {
		if _, err := resolveVisibleArticle(ctx, tx, articleID); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, articleCommentInsertQuery, commentID, articleID, author, comment); err != nil {
			Logger().WithError(err).Error("unable to insert article comment")
			return fmt.Errorf("%w: unable to insert article comment", ErrDatabaseUnavailable)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return commentID, nil
}
