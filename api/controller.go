package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	log "github.com/sirupsen/logrus"
)

type Controller struct {
	config *Config
	db     Persistence
}

// HealthCheckHandler handles health check requests
// It checks the database connectivity and returns
// a 200 OK status if the service is healthy.
func (cnt *Controller) HealthCheckHandler(c *gin.Context) RESTResponse {
	// Perform a simple database health check
	// If the database is unreachable, return a 500 error
	if err := cnt.db.HealthCheck(); err != nil {
		log.WithError(err).Error("database health check failed")
		return InternalServerErrorResponse
	}

	log.Info("database health check passed")

	response := RESTResponse{
		Code:    200,
		Payload: gin.H{"status": "ok"},
	}
	return response
}

// VersionHandler returns the current API version.
func (cnt *Controller) VersionHandler(c *gin.Context) RESTResponse {
	response := RESTResponse{
		Code: 200,
		Payload: gin.H{
			"version": cnt.config.APIVersion,
		},
	}
	return response
}

// ResumeHandler serves the resume file located at the configured path.
func (cnt *Controller) ResumeHandler(c *gin.Context) RESTResponse {
	formatString := c.Query("format")
	if len(formatString) == 0 {
		formatString = "json"
	}
	// parse format into ResumeFileFormat
	format := ResumeFileFormat(strings.ToLower(formatString))

	// validate format
	validModes := []string{"json", "pdf"}
	if !slices.Contains(validModes, string(format)) {
		log.WithFields(logrus.Fields{
			"format": format,
		}).Error("invalid resume format requested")
		return BadRequestResponse
	}

	log.WithFields(logrus.Fields{
		"format": format,
	}).Info("serving resume file")

	// determine file path based on format
	var filePath string
	switch format {
	case ResumeFormatPDF:
		filePath = cnt.config.ResumePathPDF
	case ResumeFormatJSON:
		filePath = cnt.config.ResumePathJSON
	}

	log.WithFields(logrus.Fields{
		"filePath": filePath,
	}).Info("serving resume file")

	// read file contents
	contents, err := os.ReadFile(filePath)
	if err != nil {
		log.WithError(err).Error("failed to read resume file")
		return InternalServerErrorResponse
	}

	switch format {
	case ResumeFormatPDF:
		// encode file contents to base64
		encoded := base64.StdEncoding.EncodeToString(contents)
		return RESTResponse{
			Code: 200,
			Payload: gin.H{
				"data": encoded,
			},
		}

	case ResumeFormatJSON:
		// unmarshal JSON contents
		var data map[string]any
		if err := json.Unmarshal(contents, &data); err != nil {
			log.WithError(err).Error("failed to unmarshal JSON resume file")
			return InternalServerErrorResponse
		}

		return RESTResponse{
			Code: 200,
			Payload: gin.H{
				"data": data,
			},
		}
	default:
		return NotImplementedResponse
	}
}

// ContactHandler handles contact form submissions.
// It creates a new contact if one does not exist
// and logs the contact request message.
func (cnt *Controller) ContactHandler(c *gin.Context) RESTResponse {
	var body NewContactRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		log.WithError(err).Error("failed to parse request body")
		return BadRequestResponse
	}
	// Normalize email to lowercase
	email := strings.ToLower(body.Email)
	log.WithFields(logrus.Fields{
		"email": email,
		"name":  body.Name,
	}).Info("received contact request")

	contact, err := cnt.db.GetContact(email)
	if err != nil {
		log.WithError(err).Error("failed to get contact")
		var errNotFound ContactNotFoundError
		if !errors.As(err, &errNotFound) {
			return InternalServerErrorResponse
		}
	}

	var id string
	// Create new contact if not found
	// Otherwise, use existing contact ID
	if contact == nil {
		log.WithFields(logrus.Fields{
			"email": email,
			"name":  body.Name,
		}).Info("creating new contact")

		id, err = cnt.db.CreateContact(email, body.Name, body.Message)
		if err != nil {
			log.WithError(err).Error("failed to create contact")
			return InternalServerErrorResponse
		}
	} else {
		log.WithFields(logrus.Fields{
			"email": email,
		}).Info("using existing contact")

		id, err = cnt.db.CreateContactRequest(email, body.Message)
		if err != nil {
			log.WithError(err).Error("failed to create contact request")
			return InternalServerErrorResponse
		}
	}

	log.WithFields(logrus.Fields{
		"id": id,
	}).Info("contact request created")

	response := RESTResponse{
		Code: 201,
		Payload: gin.H{
			"data": id,
		},
	}
	return response
}

// StatsHandler returns request statistics from the database.
// This includes metrics such as total requests, requests per endpoint, etc.
func (cnt *Controller) StatsHandler(c *gin.Context) RESTResponse {
	stats, err := cnt.db.GetRequestStats()
	if err != nil {
		log.WithError(err).Error("failed to get request stats")
		return InternalServerErrorResponse
	}

	log.WithFields(logrus.Fields{
		"stats": stats,
	}).Info("request stats retrieved")

	response := RESTResponse{
		Code:    200,
		Payload: gin.H{"data": stats},
	}
	return response
}

// ListContactsHandler returns a list of all contacts in the system.
func (cnt *Controller) ListContactsHandler(c *gin.Context) RESTResponse {
	contacts, err := cnt.db.ListContacts()
	if err != nil {
		log.WithError(err).Error("failed to list contacts")
		return InternalServerErrorResponse
	}

	log.WithFields(logrus.Fields{
		"count": len(contacts),
	}).Info("contacts retrieved")

	response := RESTResponse{
		Code:    200,
		Payload: gin.H{"data": contacts},
	}
	return response
}

// ListContactRequestsHandler returns a list of all contact requests in the system.
func (cnt *Controller) ListContactRequestsHandler(c *gin.Context) RESTResponse {
	requests, err := cnt.db.ListContactRequests()
	if err != nil {
		log.WithError(err).Error("failed to list contact requests")
		return InternalServerErrorResponse
	}

	log.WithFields(logrus.Fields{
		"count": len(requests),
	}).Info("contact requests retrieved")

	response := RESTResponse{
		Code:    200,
		Payload: gin.H{"data": requests},
	}
	return response
}
