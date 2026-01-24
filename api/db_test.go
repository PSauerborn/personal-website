package main

import (
	"encoding/json"
	"errors"
	"os"
	"time"
)

type TestPersistence struct {
	Contacts        []Contact
	ContactRequests []ContactRequest
	LoggedRequests  []LoggedRequest
	LoggedResponses []LoggedResponse
	APIKeys         []APIKey
	Healthy         bool
}

func NewTestPersistence(healthy bool) *TestPersistence {
	contactsData, err := os.ReadFile("tests/fixtures/contacts.json")
	if err != nil {
		panic(err)
	}
	var contacts []Contact
	if err := json.Unmarshal(contactsData, &contacts); err != nil {
		panic(err)
	}

	requestsData, err := os.ReadFile("tests/fixtures/requests.json")
	if err != nil {
		panic(err)
	}
	var requests []ContactRequest
	if err := json.Unmarshal(requestsData, &requests); err != nil {
		panic(err)
	}

	loggedRequestsData, err := os.ReadFile("tests/fixtures/logged_requests.json")
	if err != nil {
		panic(err)
	}
	var loggedRequests []LoggedRequest
	if err := json.Unmarshal(loggedRequestsData, &loggedRequests); err != nil {
		panic(err)
	}

	loggedResponsesData, err := os.ReadFile("tests/fixtures/logged_responses.json")
	if err != nil {
		panic(err)
	}
	var loggedResponses []LoggedResponse
	if err := json.Unmarshal(loggedResponsesData, &loggedResponses); err != nil {
		panic(err)
	}

	apiKeysData, err := os.ReadFile("tests/fixtures/api_keys.json")
	if err != nil {
		panic(err)
	}
	var apiKeys []APIKey
	if err := json.Unmarshal(apiKeysData, &apiKeys); err != nil {
		panic(err)
	}

	return &TestPersistence{
		Contacts:        contacts,
		ContactRequests: requests,
		LoggedRequests:  loggedRequests,
		LoggedResponses: loggedResponses,
		APIKeys:         apiKeys,
		Healthy:         healthy,
	}
}

func (t *TestPersistence) ContactsByEmail() map[string]Contact {
	contactsByEmail := make(map[string]Contact)
	for _, contact := range t.Contacts {
		contactsByEmail[contact.Email] = contact
	}
	return contactsByEmail
}

func (t *TestPersistence) ContactRequestsByEmail() map[string][]ContactRequest {
	contactRequestsByEmail := make(map[string][]ContactRequest)
	for _, request := range t.ContactRequests {
		contactRequestsByEmail[request.Email] = append(contactRequestsByEmail[request.Email], request)
	}
	return contactRequestsByEmail
}

func (t *TestPersistence) HealthCheck() error {
	if t.Healthy {
		return nil
	}
	return errors.New("something went wrong")
}

func (t *TestPersistence) GetContact(email string) (*Contact, error) {
	for _, contact := range t.Contacts {
		if contact.Email == email {
			return &contact, nil
		}
	}
	return nil, ContactNotFoundError{Email: email}
}

func (t *TestPersistence) CreateContact(email string, name string, message string) (string, error) {
	id := GenerateId()

	c := Contact{
		Id:        id,
		Email:     email,
		Name:      name,
		CreatedAt: time.Now().UTC(),
	}
	t.Contacts = append(t.Contacts, c)

	request := ContactRequest{
		Id:        GenerateId(),
		ContactId: id,
		Email:     email,
		Message:   message,
		CreatedAt: time.Now().UTC(),
	}
	t.ContactRequests = append(t.ContactRequests, request)
	return id, nil
}

func (t *TestPersistence) CreateContactRequest(email string, message string) (string, error) {
	// validate that contact exists
	contact, err := t.GetContact(email)
	if err != nil {
		return "", err
	}

	id := GenerateId()

	entry := ContactRequest{
		Id:        id,
		ContactId: contact.Id,
		Email:     email,
		Message:   message,
		CreatedAt: time.Now().UTC(),
	}

	t.ContactRequests = append(t.ContactRequests, entry)
	return id, nil
}

func (t *TestPersistence) ListContacts() ([]Contact, error) {
	return t.Contacts, nil
}

func (t *TestPersistence) GetRequestStats() (*RequestStats, error) {
	var stats RequestStats
	stats.TotalRequests = 100
	stats.UniqueIPCount = 50
	stats.PathCounts = map[string]int{
		"/v1/public/contact": 70,
		"/v1/private/stats":  30,
	}
	return &stats, nil
}

func (t *TestPersistence) ListContactRequests() ([]ContactRequest, error) {
	return t.ContactRequests, nil
}

func (t *TestPersistence) LogRequest(entry LoggedRequest) (string, error) {
	id := GenerateId()

	entry.ID = id
	t.LoggedRequests = append(t.LoggedRequests, entry)
	return id, nil
}

func (t *TestPersistence) LogResponse(entry LoggedResponse) error {
	t.LoggedResponses = append(t.LoggedResponses, entry)
	return nil
}

func (t *TestPersistence) GetAPIKey(key string) (*APIKey, error) {
	for _, apiKey := range t.APIKeys {
		if apiKey.Key == key {
			return &apiKey, nil
		}
	}
	return nil, APIKeyNotFoundError{Key: key}
}
