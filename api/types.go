package main

import (
	"time"

	"github.com/gin-gonic/gin"
)

type RESTResponse struct {
	Code    int         `json:"code"`
	Payload interface{} `json:"payload"`
}

// Send writes the RESTResponse to the Gin context.
func (r RESTResponse) Send(c *gin.Context) {
	c.JSON(r.Code, r.Payload)
}

type Contact struct {
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Id        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
}

type ContactRequest struct {
	Id        string    `json:"id"`
	ContactId string    `json:"contact_id"`
	Email     string    `json:"email"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

type LoggedRequest struct {
	Method    string    `json:"method"`
	Path      string    `json:"path"`
	ID        string    `json:"id"`
	RequestTs time.Time `json:"request_ts"`
	IPAddress string    `json:"ip_address"`
}

type LoggedResponse struct {
	RequestId   string    `json:"request_id"`
	Status      int       `json:"status"`
	TimeElapsed int64     `json:"time_elapsed_ms"`
	ResponseTs  time.Time `json:"response_ts"`
}

type APIKey struct {
	Key       string    `json:"key"`
	Owner     string    `json:"owner"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

type RequestStats struct {
	TotalRequests int            `json:"total_requests"`
	UniqueIPCount int            `json:"unique_ip_count"`
	PathCounts    map[string]int `json:"path_counts"`
	StatusCounts  map[int]int    `json:"status_counts"`
}

type ResumeFileFormat string

const (
	ResumeFormatPDF  ResumeFileFormat = "pdf"
	ResumeFormatJSON ResumeFileFormat = "json"
)
