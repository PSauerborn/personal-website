package main

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Persistence interface {
	HealthCheck() error
	GetContact(email string) (*Contact, error)
	CreateContact(contact Contact) (string, error)
	ListContacts() ([]Contact, error)
	CreateContactRequest(entry ContactRequest) (string, error)
	ListContactRequests() ([]ContactRequest, error)
	LogRequest(request LoggedRequest) (string, error)
	LogResponse(request LoggedResponse) error
	GetRequestStats() (*RequestStats, error)
	GetAPIKey(key string) (*APIKey, error)
}

type PGPersistence struct {
	// Add fields for database connection if needed
	Conn *pgxpool.Pool
}

func (db *PGPersistence) HealthCheck() error {
	return db.Conn.Ping(context.TODO())
}

func (db *PGPersistence) GetContact(email string) (*Contact, error) {
	var contact Contact
	response, err := db.Conn.Query(context.TODO(),
		"SELECT id, name, email, created_at FROM base.contacts WHERE email=$1", email)
	if err != nil {
		return nil, err
	}
	defer response.Close()

	if response.Next() {
		err := response.Scan(&contact.Id, &contact.Name, &contact.Email, &contact.CreatedAt)
		if err != nil {
			return nil, err
		}
		return &contact, nil
	}

	return nil, ContactNotFoundError{Email: email}
}

// CreateContact stores a new contact in the database
func (db *PGPersistence) CreateContact(contact Contact) (string, error) {
	id := uuid.New().String()
	id = strings.ReplaceAll(id, "-", "")

	query := `
		INSERT INTO base.contacts (id, name, email, created_at)
		VALUES ($1, $2, $3, $4);`
	_, err := db.Conn.Exec(context.TODO(), query,
		id, contact.Name, contact.Email, time.Now())
	return id, err
}

// ListContacts retrieves all contacts from the database
func (db *PGPersistence) ListContacts() ([]Contact, error) {
	var contacts []Contact
	query := `SELECT id, name, email, created_at FROM base.contacts;`
	rows, err := db.Conn.Query(context.TODO(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var contact Contact
		if err := rows.Scan(&contact.Id, &contact.Name, &contact.Email, &contact.CreatedAt); err != nil {
			return nil, err
		}
		contacts = append(contacts, contact)
	}
	return contacts, nil
}

// CreateContactRequest stores a new contact request in the database
func (db *PGPersistence) CreateContactRequest(entry ContactRequest) (string, error) {
	id := uuid.New().String()
	id = strings.ReplaceAll(id, "-", "")

	query := `
		INSERT INTO base.contact_requests (id, contact_id, message, created_at)
		VALUES ($1, $2, $3, $4);`
	_, err := db.Conn.Exec(context.TODO(), query,
		id, entry.ContactId, entry.Message, time.Now())
	return id, err
}

// ListContactRequests retrieves all contact requests from the database
func (db *PGPersistence) ListContactRequests() ([]ContactRequest, error) {
	var requests []ContactRequest
	query := `SELECT id, contact_id, message, created_at FROM base.contact_requests;`
	rows, err := db.Conn.Query(context.TODO(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var request ContactRequest
		if err := rows.Scan(&request.Id, &request.ContactId, &request.Message, &request.CreatedAt); err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}
	return requests, nil
}

// LogRequest logs an incoming request to the database
func (db *PGPersistence) LogRequest(request LoggedRequest) (string, error) {
	id := uuid.New().String()
	id = strings.ReplaceAll(id, "-", "")

	query := `
		INSERT INTO base.logged_requests (method, path, id, request_ts, ip_address)
		VALUES ($1, $2, $3, $4, $5);`
	_, err := db.Conn.Exec(context.TODO(), query,
		request.Method, request.Path, id, request.RequestTs, request.IPAddress)
	return id, err
}

// LogResponse logs an outgoing response to the database
func (db *PGPersistence) LogResponse(response LoggedResponse) error {
	query := `
		INSERT INTO base.logged_responses (id, status, time_elapsed, response_ts)
		VALUES ($1, $2, $3, $4);`
	_, err := db.Conn.Exec(context.TODO(), query,
		response.RequestId, response.Status, response.TimeElapsed, time.Now())
	return err
}

// GetRequestStats retrieves aggregated request statistics from the database
func (db *PGPersistence) GetRequestStats() (*RequestStats, error) {

	var stats RequestStats

	statsQuery := `SELECT
		COUNT(*) AS total_requests,
		COUNT(DISTINCT ip_address) AS unique_ip_count
	FROM
		base.logged_requests;`

	if err := db.Conn.QueryRow(context.TODO(), statsQuery).Scan(&stats.TotalRequests, &stats.UniqueIPCount); err != nil {
		return nil, err
	}

	pathQuery := `SELECT
			COUNT(path) AS request_count, path
		FROM
			base.logged_requests
		GROUP BY
			path
		ORDER BY
			request_count DESC;`

	rows, err := db.Conn.Query(context.TODO(), pathQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pathCounts := make(map[string]int)

	for rows.Next() {
		var count int
		var path string
		if err := rows.Scan(&count, &path); err != nil {
			return nil, err
		}
		pathCounts[path] = count
	}

	stats.PathCounts = pathCounts

	statusQuery := `SELECT
			COUNT(status) AS status_count, status
		FROM
			base.logged_responses
		GROUP BY
			status
		ORDER BY
			status_count DESC;`

	rows, err = db.Conn.Query(context.TODO(), statusQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	statusCounts := make(map[int]int)

	for rows.Next() {
		var count int
		var status int
		if err := rows.Scan(&count, &status); err != nil {
			return nil, err
		}
		statusCounts[status] = count
	}

	stats.StatusCounts = statusCounts

	return &stats, nil
}

// GetAPIKey retrieves an API key from the database
func (db *PGPersistence) GetAPIKey(key string) (*APIKey, error) {

	var apiKey APIKey
	response, err := db.Conn.Query(context.TODO(),
		"SELECT key, owner, created_at, expires_at FROM base.api_keys WHERE key=$1", key)
	if err != nil {
		return nil, err
	}
	defer response.Close()

	if response.Next() {
		err := response.Scan(&apiKey.Key, &apiKey.Owner, &apiKey.CreatedAt, &apiKey.ExpiresAt)
		if err != nil {
			return nil, err
		}
		return &apiKey, nil
	}

	return nil, APIKeyNotFoundError{Key: key}
}

func NewPGPersistence(dsn string) (*PGPersistence, error) {
	// Create a new PostgreSQL connection pool
	// using the configuration parameters
	pool, err := pgxpool.New(context.TODO(), dsn)
	if err != nil {
		return nil, err
	}

	return &PGPersistence{
		Conn: pool,
	}, nil
}
