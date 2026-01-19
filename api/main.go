package main

import (
	"fmt"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// NewRouter creates a new Gin router with all routes and middleware configured
// based on the provided configuration.
func NewRouter(controller *Controller) *gin.Engine {
	r := gin.Default()
	r.Use(cors.Default())

	// GET /api/v1/public/version is used by k8s cluster
	// liveness and readiness probes. do not log to db.
	loggingExemptions := []LoggingExemption{
		{
			PathRegex: "^/" + controller.config.APIVersion + "/public/version$",
			Method:    "GET",
		},
		{
			PathRegex: "^/" + controller.config.APIVersion + "/public/health$",
			Method:    "GET",
		},
	}
	// router group for public routes. public routes
	// do not require authentication but are logged
	// for tracing purposes
	public := r.Group(fmt.Sprintf("/%s/public", controller.config.APIVersion))
	public.Use(RouteLoggingMiddleware(controller, loggingExemptions))

	// router group for private routes that require
	// authentication
	admin := r.Group(fmt.Sprintf("/%s/admin", controller.config.APIVersion))
	admin.Use(AdminAuthMiddleware(controller))

	// health check endpoint
	public.GET("/health", func(c *gin.Context) {
		log.Info("processing health check request")
		response := controller.HealthCheckHandler(c)
		response.Send(c)
	})

	// version endpoint1
	public.GET("/version", func(c *gin.Context) {
		log.Info("processing version request")
		response := controller.VersionHandler(c)
		response.Send(c)
	})

	// GET /resume endpoint to return resume PDF
	public.GET("/resume", func(c *gin.Context) {
		log.Info("processing resume request")
		response := controller.ResumeHandler(c)
		response.Send(c)
	})

	// POST /contacts endpoint to submit a new contact request
	public.POST("/contacts", func(c *gin.Context) {
		log.Info("processing contact request")
		response := controller.ContactHandler(c)
		response.Send(c)
	})

	// GET /stats endpoint to return site statistics
	admin.GET("/stats", func(c *gin.Context) {
		log.Info("processing stats request")
		response := controller.StatsHandler(c)
		response.Send(c)
	})

	// GET /contacts endpoint to list all contacts
	admin.GET("/contacts", func(c *gin.Context) {
		log.Info("processing contacts request")
		response := controller.ListContactsHandler(c)
		response.Send(c)
	})

	// GET /contacts/requests endpoint to list all contact requests
	admin.GET("/contacts/requests", func(c *gin.Context) {
		log.Info("processing contact requests")
		response := controller.ListContactRequestsHandler(c)
		response.Send(c)
	})

	return r
}

func main() {
	config := LoadConfig()
	// set log level based on config settings
	log.SetLevel(ParseLogLevel(config.LogLevel))

	// Create a new database connection
	dsn := PostgresDSNFromConfig(config)
	db, err := NewPGPersistence(dsn)
	if err != nil {
		log.Fatal(fmt.Sprintf("failed to connect to database: %v", err))
	}
	defer db.pool.Close()

	controller := &Controller{
		config: config,
		db:     db,
	}

	router := NewRouter(controller)
	// start server and listen on configured port
	if err := router.Run(fmt.Sprintf(":%d", config.Port)); err != nil {
		log.Fatal(fmt.Sprintf("failed to start server: %v", err))
	}
}
