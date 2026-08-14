package main

import (
	"context"
)

// mockPersistenceLayer must satisfy the PersistenceLayer contract; asserting it
// here fails compilation at the mock rather than at each of its call sites when
// the interface gains a method.
var _ PersistenceLayer = (*mockPersistenceLayer)(nil)

// mockPersistenceLayer is the hand-written PersistenceLayer stand-in shared by
// every test of this package. It records how often each method was called, and
// with which context, and returns the canned values it was built with, so that
// no live database is required ([GO-030]). It is the only PersistenceLayer test
// double of the package: every method added to the interface gets a
// corresponding method here.
type mockPersistenceLayer struct {
	healthCheckErr    error
	healthCheckCalls  int
	closeCalls        int
	lastHealthContext context.Context

	cvExperience            []CVExperience
	cvExperienceErr         error
	cvExperienceCalls       int
	lastCVExperienceContext context.Context

	cvEducation            []CVEducation
	cvEducationErr         error
	cvEducationCalls       int
	lastCVEducationContext context.Context

	cvSkills            CVSkills
	cvSkillsErr         error
	cvSkillsCalls       int
	lastCVSkillsContext context.Context

	projects            []Project
	projectsErr         error
	projectsCalls       int
	lastProjectsContext context.Context

	subagents            []Subagent
	subagentsErr         error
	subagentsCalls       int
	lastSubagentsContext context.Context

	agentSpecs            []AgentSpec
	agentSpecsErr         error
	agentSpecsCalls       int
	lastAgentSpecsContext context.Context

	specDocument            SpecDocument
	specDocumentErr         error
	specDocumentCalls       int
	lastSpecDocumentContext context.Context
	lastSpecID              string
	lastDocumentID          string

	articles            []Article
	articlesErr         error
	articlesCalls       int
	lastArticlesContext context.Context

	articleContent            []byte
	articleContentErr         error
	articleContentCalls       int
	lastArticleContentContext context.Context
	lastArticleContentID      string

	articleComments            []ArticleComment
	articleCommentsErr         error
	articleCommentsCalls       int
	lastArticleCommentsContext context.Context
	lastArticleCommentsID      string

	createdCommentID            string
	createCommentErr            error
	createCommentCalls          int
	lastCreateCommentContext    context.Context
	lastCreateCommentArticleID  string
	lastCreateCommentAuthor     *string
	lastCreateCommentCommentTxt string

	createdMessageID         string
	createMessageErr         error
	createMessageCalls       int
	lastCreateMessageContext context.Context
	lastMessageSubmission    MessageSubmission
}

// HealthCheck records the call and returns the canned error of the mock.
func (m *mockPersistenceLayer) HealthCheck(ctx context.Context) error {
	m.healthCheckCalls++
	m.lastHealthContext = ctx
	return m.healthCheckErr
}

// GetCVExperience records the call and returns the canned experience entries of
// the mock, or its canned error when one is set.
func (m *mockPersistenceLayer) GetCVExperience(ctx context.Context) ([]CVExperience, error) {
	m.cvExperienceCalls++
	m.lastCVExperienceContext = ctx
	if m.cvExperienceErr != nil {
		return nil, m.cvExperienceErr
	}
	return m.cvExperience, nil
}

// GetCVEducation records the call and returns the canned education entries of
// the mock, or its canned error when one is set.
func (m *mockPersistenceLayer) GetCVEducation(ctx context.Context) ([]CVEducation, error) {
	m.cvEducationCalls++
	m.lastCVEducationContext = ctx
	if m.cvEducationErr != nil {
		return nil, m.cvEducationErr
	}
	return m.cvEducation, nil
}

// GetCVSkills records the call and returns the canned skills of the mock, or
// its canned error when one is set.
func (m *mockPersistenceLayer) GetCVSkills(ctx context.Context) (CVSkills, error) {
	m.cvSkillsCalls++
	m.lastCVSkillsContext = ctx
	if m.cvSkillsErr != nil {
		return nil, m.cvSkillsErr
	}
	return m.cvSkills, nil
}

// GetProjects records the call and returns the canned projects of the mock, or
// its canned error when one is set.
func (m *mockPersistenceLayer) GetProjects(ctx context.Context) ([]Project, error) {
	m.projectsCalls++
	m.lastProjectsContext = ctx
	if m.projectsErr != nil {
		return nil, m.projectsErr
	}
	return m.projects, nil
}

// GetSubagents records the call and returns the canned subagent catalogue of
// the mock, or its canned error when one is set.
func (m *mockPersistenceLayer) GetSubagents(ctx context.Context) ([]Subagent, error) {
	m.subagentsCalls++
	m.lastSubagentsContext = ctx
	if m.subagentsErr != nil {
		return nil, m.subagentsErr
	}
	return m.subagents, nil
}

// GetAgentSpecs records the call and returns the canned spec metadata of the
// mock, or its canned error when one is set.
func (m *mockPersistenceLayer) GetAgentSpecs(ctx context.Context) ([]AgentSpec, error) {
	m.agentSpecsCalls++
	m.lastAgentSpecsContext = ctx
	if m.agentSpecsErr != nil {
		return nil, m.agentSpecsErr
	}
	return m.agentSpecs, nil
}

// GetSpecDocument records the call together with the identifiers it was made
// with, and returns the canned spec document of the mock, or its canned error
// when one is set.
func (m *mockPersistenceLayer) GetSpecDocument(ctx context.Context, specID, documentID string) (SpecDocument, error) {
	m.specDocumentCalls++
	m.lastSpecDocumentContext = ctx
	m.lastSpecID = specID
	m.lastDocumentID = documentID
	if m.specDocumentErr != nil {
		return SpecDocument{}, m.specDocumentErr
	}
	return m.specDocument, nil
}

// GetArticles records the call and returns the canned article listing of the
// mock, or its canned error when one is set.
func (m *mockPersistenceLayer) GetArticles(ctx context.Context) ([]Article, error) {
	m.articlesCalls++
	m.lastArticlesContext = ctx
	if m.articlesErr != nil {
		return nil, m.articlesErr
	}
	return m.articles, nil
}

// GetArticleContent records the call together with the article id it was made
// with, and returns the canned article content of the mock, or its canned error
// when one is set.
func (m *mockPersistenceLayer) GetArticleContent(ctx context.Context, articleID string) ([]byte, error) {
	m.articleContentCalls++
	m.lastArticleContentContext = ctx
	m.lastArticleContentID = articleID
	if m.articleContentErr != nil {
		return nil, m.articleContentErr
	}
	return m.articleContent, nil
}

// GetArticleComments records the call together with the article id it was made
// with, and returns the canned comments of the mock, or its canned error when
// one is set.
func (m *mockPersistenceLayer) GetArticleComments(ctx context.Context, articleID string) ([]ArticleComment, error) {
	m.articleCommentsCalls++
	m.lastArticleCommentsContext = ctx
	m.lastArticleCommentsID = articleID
	if m.articleCommentsErr != nil {
		return nil, m.articleCommentsErr
	}
	return m.articleComments, nil
}

// CreateArticleComment records the call together with every argument it was
// made with - so that tests can assert what exactly reaches persistence, a nil
// author included - and returns the canned comment id of the mock, or its
// canned error when one is set.
func (m *mockPersistenceLayer) CreateArticleComment(ctx context.Context, articleID string, author *string, comment string) (string, error) {
	m.createCommentCalls++
	m.lastCreateCommentContext = ctx
	m.lastCreateCommentArticleID = articleID
	m.lastCreateCommentAuthor = author
	m.lastCreateCommentCommentTxt = comment
	if m.createCommentErr != nil {
		return "", m.createCommentErr
	}
	return m.createdCommentID, nil
}

// CreateMessage records the call together with the submission it was made with
// - so that tests can assert exactly which sanitized contact details reach
// persistence - and returns the canned message id of the mock, or its canned
// error when one is set.
func (m *mockPersistenceLayer) CreateMessage(ctx context.Context, submission MessageSubmission) (string, error) {
	m.createMessageCalls++
	m.lastCreateMessageContext = ctx
	m.lastMessageSubmission = submission
	if m.createMessageErr != nil {
		return "", m.createMessageErr
	}
	return m.createdMessageID, nil
}

// Close records that the persistence layer was closed.
func (m *mockPersistenceLayer) Close() {
	m.closeCalls++
}
