package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// healthStatusOK is the verbatim status value returned by a successful health
// check (SPEC-002 §6.1.1).
const healthStatusOK = "OK"

// Controller holds the dependencies shared by every endpoint of this API: the
// persistence layer and the application configuration ([GO-API-002]). Both are
// created once at startup and injected here, so that a single connection pool
// is reused across all requests and no handler reaches for global state. Every
// endpoint is implemented as a method on this struct that takes the gin context
// and returns a JSONResponse ([GO-API-004]).
type Controller struct {
	// db is the persistence singleton used by every handler that touches
	// storage. It is held as an interface so that unittests can substitute a
	// mock ([GO-035]).
	db PersistenceLayer
	// config is the validated application configuration loaded at startup.
	config Config
}

// NewController returns a new Controller serving requests with the given
// persistence layer and configuration. The db argument is the persistence
// singleton created once at startup and the cfg argument is the validated
// configuration; both are stored on the returned controller and shared by every
// handler.
func NewController(db PersistenceLayer, cfg Config) *Controller {
	return &Controller{
		db:     db,
		config: cfg,
	}
}

// HealthHandler serves GET /v1/health. It checks that the database backing the
// API is reachable and returns 200 with {"status": "OK"} when it is (REQ-1.3,
// SPEC-002 §6.1.1). A failing health check yields the fixed 500 envelope: the
// underlying error is logged for operators and never reaches the client, so
// that no connection or driver detail leaks (REQ-1.5, SPEC-002 §7).
func (ct *Controller) HealthHandler(c *gin.Context) JSONResponse {
	if err := ct.db.HealthCheck(c.Request.Context()); err != nil {
		return NewJSONResponse(http.StatusInternalServerError, NewInternalServerError(err))
	}

	return NewOKResponse(gin.H{"status": healthStatusOK})
}

// VersionHandler serves GET /v1/version. It returns 200 with the version string
// held by the application configuration, so that the served value follows the
// deployed configuration rather than a compiled-in literal (REQ-1.3, SPEC-002
// §6.1.2).
func (ct *Controller) VersionHandler(c *gin.Context) JSONResponse {
	return NewOKResponse(gin.H{"version": ct.config.Version})
}
