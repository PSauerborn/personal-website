package main

import (
	"fmt"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// NewRouter creates a new Gin router with all routes and middleware configured
// based on the provided configuration.
func NewRouter(config *Config) *gin.Engine {
	r := gin.Default()

	// GET /api/v1/public/version is used by k8s cluster
	// liveness and readiness probes. do not log to db.
	loggingExemptions := []LoggingExemption{
		{
			PathRegex: "^/api/" + config.APIVersion + "/public/version$",
			Method:    "GET",
		},
	}
	// router group for public routes. public routes
	// do not require authentication but are logged
	// for tracing purposes
	public := r.Group(fmt.Sprintf("/api/%s/public", config.APIVersion))
	public.Use(RouteLoggingMiddleware(config, loggingExemptions))

	// router group for private routes that require
	// authentication
	admin := r.Group(fmt.Sprintf("/api/%s/admin", config.APIVersion))
	admin.Use(AdminAuthMiddleware(config))

	pgDsn := PostgresDSNFromConfig(config)

	// health check endpoint
	public.GET("/health", func(c *gin.Context) {
		// Create a new database connection
		db, err := NewPGPersistence(pgDsn)
		if err != nil {
			log.Error(fmt.Sprintf("failed to connect to database: %v", err))
			c.JSON(500, gin.H{
				"error": "Internal server error",
			})
			return
		}
		defer db.Conn.Close()

		log.Info("processing health check request")
		response := HealthCheckHandler(c, db)
		response.Send(c)
	})

	// version endpoint
	public.GET("/version", func(c *gin.Context) {
		log.Info("processing version request")
		response := VersionHandler(c, config)
		response.Send(c)
	})

	// GET /resume endpoint to return resume PDF
	public.GET("/resume", func(c *gin.Context) {
		log.Info("processing resume request")
		// NOTE: /resume returns a file as attachment
		// not a JSON RESTResponse
		buffer, err := ResumeHandler(c, config)
		if err != nil {
			c.JSON(500, gin.H{
				"error": "Internal server error",
			})
			return
		}

		c.Header("Content-Disposition", "attachment; filename=resume.pdf")
		c.Data(200, "application/pdf", buffer)
	})

	// POST /contacts endpoint to submit a new contact request
	public.POST("/contacts", func(c *gin.Context) {
		// Create a new database connection
		db, err := NewPGPersistence(pgDsn)
		if err != nil {
			log.Error(fmt.Sprintf("failed to connect to database: %v", err))
			c.JSON(500, gin.H{
				"error": "Internal server error",
			})
			return
		}
		defer db.Conn.Close()

		log.Info("processing contact request")

		response := ContactHandler(c, db)
		response.Send(c)
	})

	// GET /stats endpoint to return site statistics
	admin.GET("/stats", func(c *gin.Context) {
		// Create a new database connection
		db, err := NewPGPersistence(pgDsn)
		if err != nil {
			log.Error(fmt.Sprintf("failed to connect to database: %v", err))
			c.JSON(500, gin.H{
				"error": "Internal server error",
			})
			return
		}
		defer db.Conn.Close()

		log.Info("processing stats request")
		response := StatsHandler(c, db)
		response.Send(c)
	})

	// GET /contacts endpoint to list all contacts
	admin.GET("/contacts", func(c *gin.Context) {
		// Create a new database connection
		db, err := NewPGPersistence(pgDsn)
		if err != nil {
			log.Error(fmt.Sprintf("failed to connect to database: %v", err))
			c.JSON(500, gin.H{
				"error": "Internal server error",
			})
			return
		}
		defer db.Conn.Close()

		log.Info("processing contacts request")
		response := ListContactsHandler(c, db)
		response.Send(c)
	})

	// GET /contacts/requests endpoint to list all contact requests
	admin.GET("/contacts/requests", func(c *gin.Context) {
		// Create a new database connection
		db, err := NewPGPersistence(pgDsn)
		if err != nil {
			log.Error(fmt.Sprintf("failed to connect to database: %v", err))
			c.JSON(500, gin.H{
				"error": "Internal server error",
			})
			return
		}
		defer db.Conn.Close()

		log.Info("processing contact requests")
		response := ListContactRequestsHandler(c, db)
		response.Send(c)
	})

	return r
}

func main() {
	config := LoadConfig()
	// set log level based on config settings
	log.SetLevel(ParseLogLevel(config.LogLevel))

	router := NewRouter(config)
	// start server and listen on configured port
	if err := router.Run(fmt.Sprintf(":%d", config.Port)); err != nil {
		log.Fatal(fmt.Sprintf("failed to start server: %v", err))
	}
}
