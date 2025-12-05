package main

import (
	"errors"
	"slices"
	"strconv"
)

type TestPersistence struct {
	Contacts        map[string]Contact
	ContactRequests map[string][]ContactRequest
	LoggedRequests  []LoggedRequest
	LoggedResponses []LoggedResponse
	APIKeys         map[string]APIKey
	Healthy         bool
}

func (t *TestPersistence) HealthCheck() error {
	if t.Healthy {
		return nil
	}
	return errors.New("something went wrong")
}

func (t *TestPersistence) GetContact(email string) (*Contact, error) {
	var contact *Contact
	found := false
	for _, c := range t.Contacts {
		if c.Email == email {
			contact = &c
			found = true
			break
		}
	}
	if !found {
		return nil, ContactNotFoundError{Email: email}
	}
	return contact, nil
}

func (t *TestPersistence) CreateContact(contact Contact) (string, error) {
	ids := []int{}

	for id := range t.Contacts {
		intId, err := strconv.Atoi(id)
		if err != nil {
			continue
		}
		ids = append(ids, intId)
	}

	var id string
	if len(ids) == 0 {
		id = "1"
	} else {
		id = strconv.Itoa(slices.Max(ids) + 1)
	}

	t.Contacts[id] = contact
	return id, nil
}

func (t *TestPersistence) ListContacts() ([]Contact, error) {
	var contacts []Contact
	for _, contact := range t.Contacts {
		contacts = append(contacts, contact)
	}
	return contacts, nil
}

func (t *TestPersistence) GetRequestStats() (*RequestStats, error) {
	var stats RequestStats
	stats.TotalRequests = 100
	stats.UniqueIPCount = 50
	stats.PathCounts = map[string]int{
		"/api/contact": 70,
		"/api/stats":   30,
	}
	return &stats, nil
}

func (t *TestPersistence) CreateContactRequest(entry ContactRequest) (string, error) {
	_, exists := t.ContactRequests[entry.ContactId]
	if exists {
		t.ContactRequests[entry.ContactId] = append(t.ContactRequests[entry.ContactId], entry)
	} else {
		t.ContactRequests[entry.ContactId] = []ContactRequest{entry}
	}
	return entry.Id, nil
}

func (t *TestPersistence) ListContactRequests() ([]ContactRequest, error) {
	var requests []ContactRequest
	for _, reqs := range t.ContactRequests {
		requests = append(requests, reqs...)
	}
	return requests, nil
}

func (t *TestPersistence) LogRequest(entry LoggedRequest) (string, error) {
	t.LoggedRequests = append(t.LoggedRequests, entry)
	return entry.ID, nil
}

func (t *TestPersistence) LogResponse(entry LoggedResponse) error {
	t.LoggedResponses = append(t.LoggedResponses, entry)
	return nil
}

func (t *TestPersistence) GetAPIKey(key string) (*APIKey, error) {
	apiKey, exists := t.APIKeys[key]
	if !exists {
		return nil, APIKeyNotFoundError{Key: key}
	}
	return &apiKey, nil
}
