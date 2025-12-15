package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// HealthCheckHandler handles health check requests
// It checks the database connectivity and returns
// a 200 OK status if the service is healthy.
func HealthCheckHandler(c *gin.Context, db Persistence) RESTResponse {
	// Perform a simple database health check
	// If the database is unreachable, return a 500 error
	if err := db.HealthCheck(); err != nil {
		log.Error(fmt.Sprintf("database health check failed: %v", err))
		return InternalServerErrorResponse
	}

	response := RESTResponse{
		Code:    200,
		Payload: gin.H{"status": "ok"},
	}
	return response
}

// VersionHandler returns the current API version.
func VersionHandler(c *gin.Context, config *Config) RESTResponse {
	response := RESTResponse{
		Code: 200,
		Payload: gin.H{
			"version": config.APIVersion,
		},
	}
	return response
}

// ResumeHandler serves the resume file located at the configured path.
func ResumeHandler(c *gin.Context, config *Config) RESTResponse {
	formatString := c.Query("format")
	if len(formatString) == 0 {
		formatString = "json"
	}
	// parse format into ResumeFileFormat
	format := ResumeFileFormat(strings.ToLower(formatString))
	// validate format
	validModes := []string{"json", "pdf"}
	if !slices.Contains(validModes, string(format)) {
		log.Error(fmt.Sprintf("invalid resume format requested: %s", format))
		return BadRequestResponse
	}

	// determine file path based on format
	var filePath string
	switch format {
	case ResumeFormatPDF:
		filePath = config.ResumePathPDF
	case ResumeFormatJSON:
		filePath = config.ResumePathJSON
	}

	log.Info(fmt.Sprintf("serving resume file: %s", filePath))
	// read file contents
	contents, err := os.ReadFile(filePath)
	if err != nil {
		log.Error(fmt.Sprintf("failed to read resume file: %v", err))
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
			log.Error(fmt.Sprintf("failed to unmarshal JSON resume file: %v", err))
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

type ContactRequestBody struct {
	Name    string `json:"name" binding:"required"`
	Email   string `json:"email" binding:"required,email"`
	Message string `json:"message" binding:"required"`
}

// ContactHandler handles contact form submissions.
// It creates a new contact if one does not exist
// and logs the contact request message.
func ContactHandler(c *gin.Context, db Persistence) RESTResponse {
	var body ContactRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		log.Error(fmt.Sprintf("invalid contact request payload: %v", err))
		return BadRequestResponse
	}
	// Normalize email to lowercase
	email := strings.ToLower(body.Email)

	contact, err := db.GetContact(email)
	if err != nil {
		log.Error(fmt.Sprintf("failed to get contact: %v", err))
		var errNotFound ContactNotFoundError
		if !errors.As(err, &errNotFound) {
			return InternalServerErrorResponse
		}
	}

	var contactId string

	// Create new contact if not found
	// Otherwise, use existing contact ID
	if contact == nil {
		log.Info(fmt.Sprintf("creating new contact for email: %s", body.Email))
		newContact := Contact{
			Name:  body.Name,
			Email: body.Email,
		}

		contactId, err = db.CreateContact(newContact)
		if err != nil {
			log.Error(fmt.Sprintf("failed to create contact: %v", err))
			return InternalServerErrorResponse
		}
	} else {
		log.Info(fmt.Sprintf("using existing contact for email: %s", body.Email))
		contactId = contact.Id
	}

	request := ContactRequest{
		ContactId: contactId,
		Message:   body.Message,
	}

	// Log the contact request
	id, err := db.CreateContactRequest(request)
	if err != nil {
		log.Error(fmt.Sprintf("failed to create contact request: %v", err))
		return InternalServerErrorResponse
	}
	log.Info(fmt.Sprintf("created contact request with id: %s", id))

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
func StatsHandler(c *gin.Context, db Persistence) RESTResponse {
	stats, err := db.GetRequestStats()
	if err != nil {
		log.Error(fmt.Sprintf("failed to get request stats: %v", err))
		return InternalServerErrorResponse
	}

	response := RESTResponse{
		Code:    200,
		Payload: gin.H{"data": stats},
	}
	return response
}

// ListContactsHandler returns a list of all contacts in the system.
func ListContactsHandler(c *gin.Context, db Persistence) RESTResponse {
	contacts, err := db.ListContacts()
	if err != nil {
		log.Error(fmt.Sprintf("failed to list contacts: %v", err))
		return InternalServerErrorResponse
	}

	response := RESTResponse{
		Code:    200,
		Payload: gin.H{"data": contacts},
	}
	return response
}

// ListContactRequestsHandler returns a list of all contact requests in the system.
func ListContactRequestsHandler(c *gin.Context, db Persistence) RESTResponse {
	requests, err := db.ListContactRequests()
	if err != nil {
		log.Error(fmt.Sprintf("failed to list contact requests: %v", err))
		return InternalServerErrorResponse
	}

	response := RESTResponse{
		Code:    200,
		Payload: gin.H{"data": requests},
	}
	return response
}
