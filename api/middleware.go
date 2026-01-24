package main

import (
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// AdminAuthMiddleware is a Gin middleware that checks for a valid API key
// in the "X-API-Key" header for protected admin routes.
func AdminAuthMiddleware(cnt *Controller) gin.HandlerFunc {
	return func(c *gin.Context) {
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
		key, err := cnt.db.GetAPIKey(apiKey)
		if err != nil || key == nil || key.ExpiresAt.Before(time.Now()) {
			log.Warn("unauthorized access attempt to admin route")
			c.AbortWithStatusJSON(403, gin.H{
				"error": "Forbidden",
			})
			return
		}

		log.WithFields(log.Fields{
			"owner": key.Owner,
		}).Info("authorized admin access")

		c.Next()
	}
}

type LoggingExemption struct {
	PathRegex string
	Method    string
}

// RouteLoggingMiddleware is a Gin middleware that logs each incoming request
// and its corresponding response to the database.
func RouteLoggingMiddleware(cnt *Controller, exemptions []LoggingExemption) gin.HandlerFunc {
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
				log.WithFields(log.Fields{
					"method": method,
					"path":   path,
				}).Info("skipping logging for exempted route")
				c.Next()
				return
			}
		}

		ip := c.ClientIP()
		log.WithFields(log.Fields{
			"method": method,
			"path":   path,
			"ip":     ip,
		}).Info("tracing request")

		request := LoggedRequest{
			Method:    strings.ToUpper(method),
			Path:      path,
			IPAddress: ip,
			RequestTs: time.Now(),
		}
		// Log the request to the database
		requestId, err := cnt.db.LogRequest(request)
		if err != nil {
			log.WithError(err).WithFields(log.Fields{
				"method": method,
				"path":   path,
				"ip":     ip,
			}).Warn("failed to log request")
		}

		ts := time.Now()

		c.Next()

		elapsed := time.Since(ts).Seconds()
		response := LoggedResponse{
			RequestId:   requestId,
			Status:      c.Writer.Status(),
			TimeElapsed: elapsed,
			ResponseTs:  time.Now(),
		}
		// Log the response to the database
		if err := cnt.db.LogResponse(response); err != nil {
			log.WithError(err).WithFields(log.Fields{
				"method": method,
				"path":   path,
				"ip":     ip,
			}).Warn("failed to log response")
		}
	}
}
