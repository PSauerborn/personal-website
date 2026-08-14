package main

import (
	"net/http"
	"slices"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// basePrefix is the routing prefix of the base router group. Every other group
// of this API is created from the base group so that the prefix is applied to
// all endpoints (REQ-1.1, REQ-1.4).
const basePrefix = "/v1"

// cvPrefix is the routing prefix of the CV router group, applied on top of the
// base prefix so that the group is served on /v1/cv (REQ-2.1).
const cvPrefix = "/cv"

// projectsPrefix is the routing prefix of the projects router group, applied on
// top of the base prefix so that the group is served on /v1/projects (REQ-6.1).
const projectsPrefix = "/projects"

// agentsPrefix is the routing prefix of the agents router group, applied on top
// of the base prefix so that the group is served on /v1/agents (REQ-4.1).
const agentsPrefix = "/agents"

// articlesPrefix is the routing prefix of the articles router group, applied on
// top of the base prefix so that the group is served on /v1/articles (REQ-3.1).
const articlesPrefix = "/articles"

// messagesPrefix is the routing prefix of the messages router group, applied on
// top of the base prefix so that the group is served on /v1/messages (REQ-5.1).
const messagesPrefix = "/messages"

// maxRequestBodyBytes bounds the request body of the write endpoints. Both of
// them are unauthenticated, so an anonymous caller could otherwise pin an
// arbitrarily large body in the process heap simply by sending one; the limit
// is the in-scope countermeasure of RISK-004. It is set well above the largest
// body the documented schemas can produce - the longest accepted comment and
// message are CommentMaxLength and MessageMaxLength characters - so that no
// legitimate submission is refused on size.
const maxRequestBodyBytes = 64 * 1024

var (
	// corsAllowedOrigins lists the origins allowed to call this API
	// (SPEC-002 §6.2). Requests from any other origin are served without CORS
	// headers, leaving the browser to reject the response.
	corsAllowedOrigins = []string{
		"http://localhost:9000",
		"https://psauerborn.dev",
		"https://dev.psauerborn.dev",
	}
	// corsAllowedHeaders lists the non-simple request headers callers may set
	// (SPEC-002 §6.2).
	corsAllowedHeaders = []string{
		"Content-Type",
		"Accept",
		"Accept-Language",
		"Content-Language",
	}
	// corsAllowedMethods lists the HTTP methods callers may use across origins
	// (SPEC-002 §6.2).
	corsAllowedMethods = []string{
		http.MethodGet,
		http.MethodPost,
		http.MethodPatch,
		http.MethodPut,
		http.MethodDelete,
		http.MethodOptions,
	}
)

// NewRouter returns the gin engine serving this API with all middleware and
// endpoints registered ([GO-API-003]). The controller argument holds the
// persistence and configuration singletons shared by every handler, and is
// bound to each endpoint through the Handler adapter so that the registrations
// below stay minimal. CORS is enabled by default on the whole engine (REQ-1.2)
// and every group is derived from the base /v1 group (REQ-1.4).
func NewRouter(controller *Controller) *gin.Engine {
	router := gin.Default()
	router.Use(CORSMiddleware())

	base := router.Group(basePrefix)
	registerBaseRoutes(base, controller)
	registerCVRoutes(base.Group(cvPrefix), controller)
	registerProjectsRoutes(base.Group(projectsPrefix), controller)
	registerAgentsRoutes(base.Group(agentsPrefix), controller)
	registerArticlesRoutes(base.Group(articlesPrefix), controller)
	registerMessagesRoutes(base.Group(messagesPrefix), controller)

	return router
}

// registerBaseRoutes registers the endpoints of the base router group on the
// given group (REQ-1.3). The group argument is the /v1 base group and the
// controller argument supplies the handlers that are bound to it.
func registerBaseRoutes(group *gin.RouterGroup, controller *Controller) {
	group.GET("/health", Handler(controller.HealthHandler))
	group.GET("/version", Handler(controller.VersionHandler))
}

// registerCVRoutes registers the endpoints of the CV router group on the given
// group (REQ-2.1). The group argument is the /v1/cv group derived from the base
// group and the controller argument supplies the handler that is bound to it.
// The handler is registered on both the empty path and the trailing slash so
// that /v1/cv and /v1/cv/ are both served directly, rather than the one without
// the trailing slash being answered with a redirect.
func registerCVRoutes(group *gin.RouterGroup, controller *Controller) {
	group.GET("", Handler(controller.CVHandler))
	group.GET("/", Handler(controller.CVHandler))
}

// registerProjectsRoutes registers the endpoints of the projects router group
// on the given group (REQ-6.1). The group argument is the /v1/projects group
// derived from the base group and the controller argument supplies the handler
// that is bound to it.
func registerProjectsRoutes(group *gin.RouterGroup, controller *Controller) {
	group.GET("/list", Handler(controller.ListProjectsHandler))
}

// registerAgentsRoutes registers the endpoints of the agents router group on
// the given group (REQ-4.1). The group argument is the /v1/agents group derived
// from the base group and the controller argument supplies the handlers that
// are bound to it.
func registerAgentsRoutes(group *gin.RouterGroup, controller *Controller) {
	group.GET("/list", Handler(controller.ListAgentsHandler))
	group.GET("/specs/list", Handler(controller.ListSpecsHandler))
	group.GET("/specs/:id/:document_id", Handler(controller.GetSpecDocumentHandler))
}

// registerArticlesRoutes registers the endpoints of the articles router group
// on the given group (REQ-3.1). The group argument is the /v1/articles group
// derived from the base group and the controller argument supplies the handlers
// that are bound to it.
func registerArticlesRoutes(group *gin.RouterGroup, controller *Controller) {
	group.GET("/list", Handler(controller.ListArticlesHandler))
	group.GET("/:article_id/content", Handler(controller.GetArticleContentHandler))
	group.GET("/:article_id/comments", Handler(controller.ListCommentsHandler))
	group.POST("/:article_id/comment",
		BodyLimitMiddleware(maxRequestBodyBytes), Handler(controller.CreateCommentHandler))
}

// registerMessagesRoutes registers the endpoints of the messages router group
// on the given group (REQ-5.1). The group argument is the /v1/messages group
// derived from the base group and the controller argument supplies the handler
// that is bound to it. The handler is registered on both the empty path and the
// trailing slash so that /v1/messages and /v1/messages/ are both served
// directly: a POST answered with a redirect would otherwise cost the caller a
// second request, and browsers may drop the body when following it.
func registerMessagesRoutes(group *gin.RouterGroup, controller *Controller) {
	group.POST("", BodyLimitMiddleware(maxRequestBodyBytes), Handler(controller.CreateMessageHandler))
	group.POST("/", BodyLimitMiddleware(maxRequestBodyBytes), Handler(controller.CreateMessageHandler))
}

// BodyLimitMiddleware returns middleware bounding the request body of the
// endpoints it is registered on. The limit argument is the maximum number of
// bytes a caller may send; anything beyond it is refused by the reader rather
// than buffered, so that the memory a single request can pin is bounded before
// any handler runs (RISK-004). Registering it per route keeps the read
// endpoints, which carry no body, untouched.
//
// The oversized body is not answered here: the reader fails while the handler
// binds it, which the handler already reports as the standard 400 "body"
// envelope. That keeps a single rejection shape for every unusable body and
// avoids a second one that would have to be kept in step with it.
func BodyLimitMiddleware(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Next()
	}
}

// CORSMiddleware returns the CORS middleware of this API, configured with the
// origins, headers and methods of SPEC-002 §6.2. Requests from an allowed
// origin are handled by the gin-contrib/cors middleware ([GO-API-005]), which
// answers preflight requests with 204 and echoes the calling origin. Requests
// from any other origin bypass that middleware: no Access-Control-Allow-Origin
// header is written, and preflight requests are terminated with 204 rather than
// with the 403 the underlying middleware would return, so that disallowed
// origins learn nothing about the API beyond the rejection itself. Both paths
// mark the response as varying on Origin, so that no cache between this API and
// a browser can serve one origin the response produced for another.
func CORSMiddleware() gin.HandlerFunc {
	handler := cors.New(cors.Config{
		AllowOrigins: corsAllowedOrigins,
		AllowHeaders: corsAllowedHeaders,
		AllowMethods: corsAllowedMethods,
	})

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" && !slices.Contains(corsAllowedOrigins, origin) {
			// The bypassed middleware is the only writer of this header, so it
			// is written here as well: a response served without it could be
			// stored by a shared cache under the bare URL and replayed to an
			// allowed origin, which would then receive a response carrying no
			// Access-Control-Allow-Origin header at all.
			c.Header("Vary", "Origin")

			if c.Request.Method == http.MethodOptions {
				c.AbortWithStatus(http.StatusNoContent)
			}

			return
		}

		handler(c)
	}
}
