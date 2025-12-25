package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
)

type ApiFeature struct {
	resp   *http.Response
	client *http.Client
	apiKey *string
}

// NewApiFeature initializes a new ApiFeature instance with an HTTP client.
func NewApiFeature() *ApiFeature {
	return &ApiFeature{
		client: &http.Client{},
	}
}

// ExecuteRequest executes the HTTP request, adding the API key header if available.
func (a *ApiFeature) ExecuteRequest(req *http.Request) (*http.Response, error) {
	if a.apiKey != nil {
		req.Header.Set("X-Api-Key", *a.apiKey)
	}
	return a.client.Do(req)
}

// ListContacts makes a request to the admin list contacts endpoint.
func (a *ApiFeature) ListContacts() (*http.Response, error) {
	key := os.Getenv("ADMIN_API_KEY")
	if key == "" {
		return nil, errors.New("ADMIN_API_KEY environment variable is not set")
	}
	a.apiKey = &key

	url := fmt.Sprintf("%s/api/v1/admin/contacts", API_BASE_URL)
	request, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	return a.ExecuteRequest(request)
}
