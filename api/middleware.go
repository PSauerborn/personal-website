package main

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// AdminAuthMiddleware is a Gin middleware that checks for a valid API key
// in the "X-API-Key" header for protected admin routes.
func AdminAuthMiddleware(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		pgDsn := PostgresDSNFromConfig(cfg)
		// Initialize database connection for logging
		db, err := NewPGPersistence(pgDsn)
		if err != nil {
			log.Error(fmt.Sprintf("failed to connect to database for tracing: %v", err))
			c.AbortWithStatusJSON(500, gin.H{
				"error": "Internal server error",
			})
			return
		}
		defer db.Conn.Close()

		// Validate API key from header
		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			log.Warn("missing API key in admin route request")
			c.AbortWithStatusJSON(403, gin.H{
				"error": "Forbidden",
			})
			return
		}

		// Check if the API key is valid
		key, err := db.GetAPIKey(apiKey)
		if err != nil || key == nil || key.ExpiresAt.Before(time.Now()) {
			log.Warn("unauthorized access attempt to admin route")
			c.AbortWithStatusJSON(403, gin.H{
				"error": "Forbidden",
			})
			return
		}

		log.Info(fmt.Sprintf("authorized admin access by %s", key.Owner))
		c.Next()
	}
}

type LoggingExemption struct {
	PathRegex string
	Method    string
}

// RouteLoggingMiddleware is a Gin middleware that logs each incoming request
// and its corresponding response to the database.
func RouteLoggingMiddleware(cfg *Config, exemptions []LoggingExemption) gin.HandlerFunc {
	return func(c *gin.Context) {

		path := c.Request.URL.Path
		method := c.Request.Method

		// check for exemptions
		for _, exemption := range exemptions {
			if !strings.EqualFold(method, exemption.Method) {
				continue
			}
			// check if path matches regex
			exp := regexp.MustCompile(exemption.PathRegex)
			if exp.MatchString(path) {
				log.Info(fmt.Sprintf("skipping logging for exempted route - Method: %s, Path: %s", method, path))
				c.Next()
				return
			}
		}

		ip := c.ClientIP()

		pgDsn := PostgresDSNFromConfig(cfg)
		// Initialize database connection for logging
		db, err := NewPGPersistence(pgDsn)
		if err != nil {
			log.Error(fmt.Sprintf("failed to connect to database for tracing: %v", err))
			c.AbortWithStatusJSON(500, gin.H{
				"error": "Internal server error",
			})
			return
		}
		defer db.Conn.Close()

		log.Info(fmt.Sprintf("tracing request - Method: %s, Path: %s", method, path))

		request := LoggedRequest{
			Method:    strings.ToUpper(method),
			Path:      path,
			IPAddress: ip,
			RequestTs: time.Now(),
		}
		// Log the request to the database
		requestId, err := db.LogRequest(request)
		if err != nil {
			log.Warn(fmt.Sprintf("failed to log request: %v", err))
		}

		ts := time.Now()

		c.Next()

		elapsed := time.Since(ts).Milliseconds()
		response := LoggedResponse{
			RequestId:   requestId,
			Status:      c.Writer.Status(),
			TimeElapsed: elapsed,
			ResponseTs:  time.Now(),
		}
		// Log the response to the database
		if err := db.LogResponse(response); err != nil {
			log.Warn(fmt.Sprintf("failed to log response: %v", err))
		}
	}
}
