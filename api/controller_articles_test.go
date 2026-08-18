package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// serveArticleRequest performs a GET request against the given path on a router
// backed by the given mock persistence layer and returns the recorded response.
// The articles endpoints carry path parameters, which the shared serveHandler
// helper cannot bind, so these tests exercise the endpoints through the real
// gin engine instead.
func serveArticleRequest(db PersistenceLayer, path string) *httptest.ResponseRecorder {
	router := NewRouter(NewController(db, Config{}))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	return recorder
}

// postArticleRequest performs a POST request with the given raw JSON body
// against the given path on a router backed by the given mock persistence layer
// and returns the recorded response. The body is sent verbatim so that malformed
// JSON and unknown fields can be exercised exactly as a client would submit them.
func postArticleRequest(db PersistenceLayer, path, body string) *httptest.ResponseRecorder {
	router := NewRouter(NewController(db, Config{}))
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)
	return recorder
}

// TestListArticlesHandler tests every path through the article listing endpoint:
// the listing it serves, the empty arrays used for an empty listing and for an
// article without topics, and the generic 500 envelope returned when the listing
// cannot be read (SPEC-002 §6.1.8, REQ-3.2).
func TestListArticlesHandler(t *testing.T) {
	t.Run("returns the article listing", func(t *testing.T) {
		authored := time.Date(2025, time.March, 4, 9, 30, 0, 0, time.UTC)
		db := &mockPersistenceLayer{
			articles: []Article{
				{
					ID:          "article-1",
					Title:       "On Bees",
					Description: "A study of bees",
					Author:      "Pascal",
					Topics:      []string{"biology", "insects"},
					AuthoredAt:  authored,
				},
			},
		}

		recorder := serveArticleRequest(db, "/v1/articles/list")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.articlesCalls)
		assert.JSONEq(t, fmt.Sprintf(`{"articles": [{
			"id": "article-1",
			"title": "On Bees",
			"description": "A study of bees",
			"author": "Pascal",
			"topics": ["biology", "insects"],
			"created_at": %q
		}]}`, authored.Format(time.RFC3339Nano)), recorder.Body.String())
	})

	t.Run("serializes an empty listing as an empty array", func(t *testing.T) {
		db := &mockPersistenceLayer{articles: []Article{}}

		recorder := serveArticleRequest(db, "/v1/articles/list")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.JSONEq(t, `{"articles": []}`, recorder.Body.String())
	})

	t.Run("serializes an article without topics as an empty array", func(t *testing.T) {
		db := &mockPersistenceLayer{
			articles: []Article{{ID: "article-1", AuthoredAt: time.Unix(0, 0).UTC()}},
		}

		recorder := serveArticleRequest(db, "/v1/articles/list")

		assert.Equal(t, http.StatusOK, recorder.Code)

		var body struct {
			Articles []struct {
				Topics []string `json:"topics"`
			} `json:"articles"`
		}
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		require.Len(t, body.Articles, 1)
		assert.NotNil(t, body.Articles[0].Topics)
		assert.Empty(t, body.Articles[0].Topics)
		assert.Contains(t, recorder.Body.String(), `"topics":[]`)
	})

	t.Run("returns the generic 500 envelope when the listing cannot be read", func(t *testing.T) {
		db := &mockPersistenceLayer{articlesErr: ErrDatabaseUnavailable}

		recorder := serveArticleRequest(db, "/v1/articles/list")

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.JSONEq(t, `{"error": "Internal Server Error", "details": "Something went wrong."}`,
			recorder.Body.String())
		assert.NotContains(t, recorder.Body.String(), ErrDatabaseUnavailable.Error())
	})
}

// TestGetArticleContentHandler tests every path through the article content
// endpoint: the raw document content it serves, the single identical 404
// returned for every non-disclosure cause, and the generic 500 envelope returned
// for an unexpected error (SPEC-002 §6.1.9, REQ-3.3, REQ-3.6).
func TestGetArticleContentHandler(t *testing.T) {
	t.Run("returns the raw document content", func(t *testing.T) {
		content := []byte("# On Bees\n\nthey buzz")
		db := &mockPersistenceLayer{articleContent: content}

		recorder := serveArticleRequest(db, "/v1/articles/article-1/content")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, content, recorder.Body.Bytes())
		assert.Equal(t, contentTypeOctetStream, recorder.Header().Get("Content-Type"))
		assert.Equal(t, 1, db.articleContentCalls)
		assert.Equal(t, "article-1", db.lastArticleContentID)
	})

	t.Run("returns an identical 404 for every non-disclosure cause", func(t *testing.T) {
		// every invisibility cause reaches the controller as the same sentinel:
		// the persistence layer resolves them all to ErrArticleNotFound, and the
		// responses below must be indistinguishable (REQ-3.6, REQ-3.7).
		causes := []string{
			"nonexistent article",
			"article with display set to false",
			"article without a linked document",
			"article with a restricted document",
		}

		responses := make([]string, 0, len(causes))
		for _, cause := range causes {
			t.Run(cause, func(t *testing.T) {
				db := &mockPersistenceLayer{
					articleContentErr: fmt.Errorf("%w: %s", ErrArticleNotFound, cause),
				}

				recorder := serveArticleRequest(db, "/v1/articles/article-1/content")

				assert.Equal(t, http.StatusNotFound, recorder.Code)
				assert.JSONEq(t, `{"error": "Not Found", "details": "The requested resource could not be found."}`,
					recorder.Body.String())
				assert.NotContains(t, recorder.Body.String(), cause)
				responses = append(responses, recorder.Body.String())
			})
		}

		require.Len(t, responses, len(causes))
		for _, response := range responses {
			assert.Equal(t, responses[0], response)
		}
	})

	t.Run("returns the generic 500 envelope for an unexpected error", func(t *testing.T) {
		db := &mockPersistenceLayer{articleContentErr: ErrDatabaseUnavailable}

		recorder := serveArticleRequest(db, "/v1/articles/article-1/content")

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.JSONEq(t, `{"error": "Internal Server Error", "details": "Something went wrong."}`,
			recorder.Body.String())
		assert.NotContains(t, recorder.Body.String(), ErrDatabaseUnavailable.Error())
	})
}

// TestListCommentsHandler tests every path through the comment listing endpoint:
// the comments it serves oldest first, the persistence ordering it preserves,
// the empty array used for an article without comments, and the generic 500
// envelope returned for an unexpected error (SPEC-002 §6.1.10, REQ-3.4).
func TestListCommentsHandler(t *testing.T) {
	t.Run("returns the comments of an article oldest first", func(t *testing.T) {
		author := "Pascal"
		first := time.Date(2025, time.March, 4, 9, 30, 0, 0, time.UTC)
		second := time.Date(2025, time.March, 5, 11, 0, 0, 0, time.UTC)
		db := &mockPersistenceLayer{
			articleComments: []ArticleComment{
				{Author: &author, Comment: "first", CreatedAt: first},
				{Author: nil, Comment: "second", CreatedAt: second},
			},
		}

		recorder := serveArticleRequest(db, "/v1/articles/article-1/comments")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, 1, db.articleCommentsCalls)
		assert.Equal(t, "article-1", db.lastArticleCommentsID)
		assert.JSONEq(t, fmt.Sprintf(`{"article_id": "article-1", "comments": [
			{"author": "Pascal", "comment": "first", "created_at": %q},
			{"author": null, "comment": "second", "created_at": %q}
		]}`, first.Format(time.RFC3339Nano), second.Format(time.RFC3339Nano)),
			recorder.Body.String())
	})

	t.Run("preserves the ordering returned by the persistence layer", func(t *testing.T) {
		db := &mockPersistenceLayer{
			articleComments: []ArticleComment{
				{Comment: "oldest", CreatedAt: time.Date(2025, time.January, 1, 0, 0, 0, 0, time.UTC)},
				{Comment: "middle", CreatedAt: time.Date(2025, time.February, 1, 0, 0, 0, 0, time.UTC)},
				{Comment: "newest", CreatedAt: time.Date(2025, time.March, 1, 0, 0, 0, 0, time.UTC)},
			},
		}

		recorder := serveArticleRequest(db, "/v1/articles/article-1/comments")

		require.Equal(t, http.StatusOK, recorder.Code)

		var body struct {
			Comments []struct {
				Comment string `json:"comment"`
			} `json:"comments"`
		}
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		require.Len(t, body.Comments, 3)
		assert.Equal(t, "oldest", body.Comments[0].Comment)
		assert.Equal(t, "middle", body.Comments[1].Comment)
		assert.Equal(t, "newest", body.Comments[2].Comment)
	})

	t.Run("serializes an article without comments as an empty array", func(t *testing.T) {
		db := &mockPersistenceLayer{articleComments: []ArticleComment{}}

		recorder := serveArticleRequest(db, "/v1/articles/article-1/comments")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.JSONEq(t, `{"article_id": "article-1", "comments": []}`, recorder.Body.String())
		assert.Contains(t, recorder.Body.String(), `"comments":[]`)
	})

	t.Run("returns the generic 500 envelope for an unexpected error", func(t *testing.T) {
		db := &mockPersistenceLayer{articleCommentsErr: ErrDatabaseUnavailable}

		recorder := serveArticleRequest(db, "/v1/articles/article-1/comments")

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.JSONEq(t, `{"error": "Internal Server Error", "details": "Something went wrong."}`,
			recorder.Body.String())
		assert.NotContains(t, recorder.Body.String(), ErrDatabaseUnavailable.Error())
	})
}

// TestCreateCommentHandler tests every path through the comment creation
// endpoint: the identifier it returns, the sanitization applied before
// persistence, the null persisted for an omitted or whitespace-only author, the
// unknown body fields it drops, the field-level 400 envelopes returned for an
// empty comment, an over-long author or comment and a malformed body, and the
// generic 500 envelope returned for an unexpected error (SPEC-002 §6.1.11,
// REQ-3.5).
func TestCreateCommentHandler(t *testing.T) {
	t.Run("returns the identifier of the created comment", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment",
			`{"author": "Pascal", "comment": "they really do buzz"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.JSONEq(t, `{"comment_id": "comment-1"}`, recorder.Body.String())
		assert.Equal(t, 1, db.createCommentCalls)
		assert.Equal(t, "article-1", db.lastCreateCommentArticleID)
		assert.Equal(t, "they really do buzz", db.lastCreateCommentCommentTxt)
	})

	t.Run("sanitizes the author before it reaches persistence", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment",
			`{"author": "  pASCAL   van   der   BEE ", "comment": "buzz"}`)

		require.Equal(t, http.StatusCreated, recorder.Code)
		require.NotNil(t, db.lastCreateCommentAuthor)
		// only the first letter of each word is capitalized, so the interior
		// capitals of the submitted author are left untouched (REQ-3.5)
		assert.Equal(t, "PASCAL Van Der BEE", *db.lastCreateCommentAuthor)
	})

	t.Run("sanitization preserves the interior capitals of the author", func(t *testing.T) {
		cases := []struct {
			name     string
			author   string
			expected string
		}{
			{name: "interior capital is preserved", author: "Test McLovin", expected: "Test McLovin"},
			{name: "lower case author is capitalized per word", author: "test mclovin", expected: "Test Mclovin"},
			{name: "lower case author", author: "john doe", expected: "John Doe"},
			{name: "padded author", author: "  Jane Doe  ", expected: "Jane Doe"},
			{name: "lower case padded author", author: "jane doe", expected: "Jane Doe"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				db := &mockPersistenceLayer{createdCommentID: "comment-1"}

				body := fmt.Sprintf(`{"author": %q, "comment": "buzz"}`, testCase.author)
				recorder := postArticleRequest(db, "/v1/articles/article-1/comment", body)

				require.Equal(t, http.StatusCreated, recorder.Code)
				require.NotNil(t, db.lastCreateCommentAuthor)
				assert.Equal(t, testCase.expected, *db.lastCreateCommentAuthor)
			})
		}
	})

	t.Run("persists an omitted author as null", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment", `{"comment": "buzz"}`)

		require.Equal(t, http.StatusCreated, recorder.Code)
		assert.Equal(t, 1, db.createCommentCalls)
		assert.Nil(t, db.lastCreateCommentAuthor)
	})

	t.Run("persists a whitespace-only author as null", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment",
			`{"author": "   ", "comment": "buzz"}`)

		require.Equal(t, http.StatusCreated, recorder.Code)
		assert.Nil(t, db.lastCreateCommentAuthor)
	})

	t.Run("ignores unknown fields in the request body", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment",
			`{"comment": "buzz", "admin": true, "created_at": "2025-01-01T00:00:00Z"}`)

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.Equal(t, 1, db.createCommentCalls)
	})

	t.Run("rejects an empty or whitespace-only comment", func(t *testing.T) {
		bodies := map[string]string{
			"empty comment":           `{"comment": ""}`,
			"whitespace-only comment": `{"comment": "   \t\n  "}`,
			"omitted comment":         `{"author": "Pascal"}`,
		}

		for name, body := range bodies {
			t.Run(name, func(t *testing.T) {
				db := &mockPersistenceLayer{createdCommentID: "comment-1"}

				recorder := postArticleRequest(db, "/v1/articles/article-1/comment", body)

				assert.Equal(t, http.StatusBadRequest, recorder.Code)
				assert.JSONEq(t, `{"error": "Bad Request", "details": "comment: must not be empty"}`,
					recorder.Body.String())
				assert.Zero(t, db.createCommentCalls)
			})
		}
	})

	t.Run("rejects an author longer than the column width before persisting", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment",
			fmt.Sprintf(`{"author": %q, "comment": "buzz"}`,
				strings.Repeat("a", CommentAuthorMaxLength+1)))

		assert.Equal(t, http.StatusBadRequest, recorder.Code)
		assert.JSONEq(t, fmt.Sprintf(
			`{"error": "Bad Request", "details": "author: must be at most %d characters"}`,
			CommentAuthorMaxLength), recorder.Body.String())
		assert.Zero(t, db.createCommentCalls)
	})

	t.Run("rejects a comment longer than the accepted maximum before persisting", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment",
			fmt.Sprintf(`{"comment": %q}`, strings.Repeat("a", CommentMaxLength+1)))

		assert.Equal(t, http.StatusBadRequest, recorder.Code)
		assert.JSONEq(t, fmt.Sprintf(
			`{"error": "Bad Request", "details": "comment: must be at most %d characters"}`,
			CommentMaxLength), recorder.Body.String())
		assert.Zero(t, db.createCommentCalls)
	})

	t.Run("accepts a comment exactly at the accepted maximum", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment",
			fmt.Sprintf(`{"comment": %q}`, strings.Repeat("a", CommentMaxLength)))

		assert.Equal(t, http.StatusCreated, recorder.Code)
		assert.Equal(t, 1, db.createCommentCalls)
	})

	t.Run("rejects a malformed request body without disclosing internals", func(t *testing.T) {
		db := &mockPersistenceLayer{createdCommentID: "comment-1"}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment", `{"comment": `)

		assert.Equal(t, http.StatusBadRequest, recorder.Code)
		assert.JSONEq(t, `{"error": "Bad Request", "details": "body: must be a valid JSON object"}`,
			recorder.Body.String())
		assert.Zero(t, db.createCommentCalls)
	})

	t.Run("returns the generic 500 envelope for an unexpected error", func(t *testing.T) {
		db := &mockPersistenceLayer{createCommentErr: ErrDatabaseUnavailable}

		recorder := postArticleRequest(db, "/v1/articles/article-1/comment", `{"comment": "buzz"}`)

		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.JSONEq(t, `{"error": "Internal Server Error", "details": "Something went wrong."}`,
			recorder.Body.String())
		assert.NotContains(t, recorder.Body.String(), ErrDatabaseUnavailable.Error())
	})
}

// TestArticleEndpointsNotFoundEnvelope tests that every article endpoint taking
// an article id answers with one identical 404 envelope for every invisibility
// cause, so that neither the cause nor the endpoint used discloses whether the
// article exists (REQ-3.6, REQ-3.7).
func TestArticleEndpointsNotFoundEnvelope(t *testing.T) {
	// every invisibility cause reaches the controller as the same sentinel, and
	// every article endpoint that takes an article id - the write path included -
	// must answer with one identical envelope, so that neither the cause nor the
	// endpoint used discloses whether the article exists (REQ-3.6, REQ-3.7).
	causes := []string{
		"nonexistent article",
		"article with display set to false",
		"article without a linked document",
		"article with a restricted document",
	}

	responses := make([]string, 0, len(causes)*3)
	for _, cause := range causes {
		notFound := fmt.Errorf("%w: %s", ErrArticleNotFound, cause)

		t.Run(fmt.Sprintf("content of a %s", cause), func(t *testing.T) {
			db := &mockPersistenceLayer{articleContentErr: notFound}
			recorder := serveArticleRequest(db, "/v1/articles/article-1/content")

			assert.Equal(t, http.StatusNotFound, recorder.Code)
			assert.NotContains(t, recorder.Body.String(), cause)
			responses = append(responses, recorder.Body.String())
		})

		t.Run(fmt.Sprintf("comments of a %s", cause), func(t *testing.T) {
			db := &mockPersistenceLayer{articleCommentsErr: notFound}
			recorder := serveArticleRequest(db, "/v1/articles/article-1/comments")

			assert.Equal(t, http.StatusNotFound, recorder.Code)
			assert.NotContains(t, recorder.Body.String(), cause)
			responses = append(responses, recorder.Body.String())
		})

		t.Run(fmt.Sprintf("new comment on a %s", cause), func(t *testing.T) {
			db := &mockPersistenceLayer{createCommentErr: notFound}
			recorder := postArticleRequest(db, "/v1/articles/article-1/comment",
				`{"author": "Pascal", "comment": "buzz"}`)

			assert.Equal(t, http.StatusNotFound, recorder.Code)
			assert.NotContains(t, recorder.Body.String(), cause)
			responses = append(responses, recorder.Body.String())
		})
	}

	require.Len(t, responses, len(causes)*3)
	for _, response := range responses {
		assert.JSONEq(t, `{"error": "Not Found", "details": "The requested resource could not be found."}`, response)
		assert.Equal(t, responses[0], response)
	}
}
