package main

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// articleIDParam is the name of the path parameter carrying the article
// identifier on the article endpoints (SPEC-002 §6.1.9, §6.1.10, §6.1.11).
const articleIDParam = "article_id"

// Names of the request fields reported in the 400 envelopes of the comment
// creation endpoint. They are the names the client itself submitted (SPEC-002
// §6.1.11), with commentBodyField standing for the request body as a whole when
// it cannot be parsed at all.
const (
	commentBodyField    = "body"
	commentAuthorField  = "author"
	commentCommentField = "comment"
)

// newArticleListEntry returns the wire representation of the given article. The
// article argument is the domain model read from persistence. Topics are
// normalised to an empty slice when absent so that an article without topics
// serializes as [] rather than as null.
func newArticleListEntry(article Article) articleListEntry {
	topics := article.Topics
	if topics == nil {
		topics = []string{}
	}

	return articleListEntry{
		ID:          article.ID,
		Title:       article.Title,
		Description: article.Description,
		Author:      article.Author,
		Topics:      topics,
		AuthoredAt:  article.AuthoredAt,
	}
}

// newArticleErrorResponse maps an error returned by the article persistence
// layer onto the response served to the client. The err argument is the error
// to map: every error wrapping ErrArticleNotFound - a missing, hidden,
// document-less or restricted article alike - yields the single identical 404
// envelope, so that no article endpoint discloses which of those causes applies
// (REQ-3.6, REQ-3.7). Any other error yields the generic 500 envelope, with the
// underlying error logged rather than served (SPEC-002 §7). It is the shared
// error path of every endpoint of the articles group.
func newArticleErrorResponse(err error) JSONResponse {
	if errors.Is(err, ErrArticleNotFound) {
		return NewJSONResponse(http.StatusNotFound, NewNotFoundError())
	}

	return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
}

// ListArticlesHandler serves GET /v1/articles/list. It returns 200 with the
// metadata of every publicly visible article and the topics linked to each of
// them; hidden, document-less and restricted-document articles are excluded by
// the persistence layer and article content is never part of the payload
// (REQ-3.2, SPEC-002 §6.1.8). An empty listing and an article without topics
// both serialize as an empty array rather than as null. A failing read yields
// the generic 500 envelope.
func (ct *Controller) ListArticlesHandler(c *gin.Context) JSONResponse {
	articles, err := ct.db.GetArticles(c.Request.Context())
	if err != nil {
		return newArticleErrorResponse(err)
	}

	entries := make([]articleListEntry, 0, len(articles))
	for _, article := range articles {
		entries = append(entries, newArticleListEntry(article))
	}

	return NewOKResponse(gin.H{"articles": entries})
}

// GetArticleContentHandler serves GET /v1/articles/:article_id/content. It
// returns 200 with the raw bytes of the document linked to the article, written
// as "binary/octet-stream" rather than as JSON (REQ-3.3, SPEC-002 §6.1.9). An
// article that is not publicly visible - because it does not exist, is hidden,
// has no linked document or its document is restricted - yields the identical
// 404 envelope (REQ-3.6, REQ-3.7), and any other failure the generic 500
// envelope.
func (ct *Controller) GetArticleContentHandler(c *gin.Context) JSONResponse {
	content, err := ct.db.GetArticleContent(c.Request.Context(), c.Param(articleIDParam))
	if err != nil {
		return newArticleErrorResponse(err)
	}

	return NewRawContentResponse(content)
}

// ListCommentsHandler serves GET /v1/articles/:article_id/comments. It returns
// 200 with every comment recorded against the article, oldest first, in the
// shape of SPEC-002 §6.1.10 (REQ-3.4). An article without comments yields an
// empty array rather than null, and an anonymously posted comment yields a null
// author. An article that is not publicly visible yields the identical 404
// envelope served by every other article endpoint (REQ-3.6, REQ-3.7), and any
// other failure the generic 500 envelope.
func (ct *Controller) ListCommentsHandler(c *gin.Context) JSONResponse {
	articleID := c.Param(articleIDParam)

	comments, err := ct.db.GetArticleComments(c.Request.Context(), articleID)
	if err != nil {
		return newArticleErrorResponse(err)
	}

	// the wire and domain shapes hold the same fields, so each comment converts
	// directly; the two types are still kept apart so that the response contract
	// stays free to diverge from the storage model ([GO-013]).
	entries := make([]articleCommentEntry, 0, len(comments))
	for _, comment := range comments {
		entries = append(entries, articleCommentEntry(comment))
	}

	return NewOKResponse(gin.H{"article_id": articleID, "comments": entries})
}

// CreateCommentHandler serves POST /v1/articles/:article_id/comment. It records
// the submitted comment against the article and returns 201 with the identifier
// generated for it (REQ-3.5, SPEC-002 §6.1.11). The body is bound tolerantly, so
// fields the client sends beyond the documented schema are ignored rather than
// rejected. A malformed or oversized body, an empty or whitespace-only comment,
// an over-long comment and an over-long author each yield a 400 naming the
// offending field, and an article
// that is not publicly visible yields the same 404 envelope as the read
// endpoints, so that the write path discloses no more than they do (REQ-3.6,
// REQ-3.7). Any other failure yields the generic 500 envelope.
func (ct *Controller) CreateCommentHandler(c *gin.Context) JSONResponse {
	var request createCommentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		Logger().WithError(err).Warn("unable to bind comment request body")
		return NewJSONResponse(http.StatusBadRequest,
			NewBadRequestError(commentBodyField, "must be a valid JSON object"))
	}

	author, errResponse, ok := validateCommentRequest(request)
	if !ok {
		return errResponse
	}

	commentID, err := ct.db.CreateArticleComment(c.Request.Context(),
		c.Param(articleIDParam), author, request.Comment)
	if err != nil {
		return newArticleErrorResponse(err)
	}

	return NewCreatedResponse("comment_id", commentID)
}

// validateCommentRequest applies the validation chain of the comment creation
// endpoint to the given bound request, in the single order used across this API:
// the author is sanitized first, the comment is then checked for emptiness on
// its trimmed value and against the maximum length accepted for it, and the
// sanitized author is finally checked against the width of the column it is
// persisted into (REQ-3.5). The comment is persisted into an unbounded TEXT
// column, so CommentMaxLength is the only thing bounding what a caller can
// store through this endpoint (RISK-004). It returns the author to
// persist - nil when none was supplied, so that the comment is stored
// anonymously rather than with an empty author - together with the 400 response
// to serve and a flag reporting whether validation passed. The response value is
// only meaningful when that flag is false.
func validateCommentRequest(request createCommentRequest) (*string, JSONResponse, bool) {
	author := SanitizeText(request.Author)

	if IsEmpty(request.Comment) {
		return nil, NewJSONResponse(http.StatusBadRequest,
			NewBadRequestError(commentCommentField, "must not be empty")), false
	}

	if !WithinLength(request.Comment, CommentMaxLength) {
		return nil, NewJSONResponse(http.StatusBadRequest, NewBadRequestError(commentCommentField,
			fmt.Sprintf("must be at most %d characters", CommentMaxLength))), false
	}

	if !WithinLength(author, CommentAuthorMaxLength) {
		return nil, NewJSONResponse(http.StatusBadRequest, NewBadRequestError(commentAuthorField,
			fmt.Sprintf("must be at most %d characters", CommentAuthorMaxLength))), false
	}

	if author == "" {
		return nil, JSONResponse{}, true
	}
	return &author, JSONResponse{}, true
}
