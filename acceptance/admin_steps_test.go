package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/cucumber/godog"
)

// requestAdminEndpoint sends a request to a protected admin endpoint.
func (a *ApiFeature) requestAdminEndpoint() error {
	url := fmt.Sprintf("%s/api/v1/admin/stats", API_BASE_URL)

	request, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	a.resp, err = a.ExecuteRequest(request)
	if err != nil {
		return err
	}
	return nil
}

// requestAdminStatsEndpoint makes a GET request to the admin statistics endpoint.
func (a *ApiFeature) requestAdminStatsEndpoint() error {
	url := fmt.Sprintf("%s/api/v1/admin/stats", API_BASE_URL)

	request, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	a.resp, err = a.ExecuteRequest(request)
	if err != nil {
		return err
	}
	return nil
}

// responseShouldContainTotalNumberOfRequestsAndUniqueVisitorsAndStatusCodes checks if the response contains the expected statistics fields.
func (a *ApiFeature) responseShouldContainTotalNumberOfRequestsAndUniqueVisitorsAndStatusCodes() error {
	var data struct {
		Data struct {
			TotalRequests int            `json:"total_requests"`
			UniqueIPCount int            `json:"unique_ip_count"`
			StatusCounts  map[string]int `json:"status_counts"`
		} `json:"data"`
	}
	if err := json.NewDecoder(a.resp.Body).Decode(&data); err != nil {
		return err
	}
	if data.Data.TotalRequests == 0 {
		return fmt.Errorf("expected total requests to be 0, got %d", data.Data.TotalRequests)
	}
	if data.Data.UniqueIPCount == 0 {
		return fmt.Errorf("expected total unique visitors to be 0, got %d", data.Data.UniqueIPCount)
	}
	if len(data.Data.StatusCounts) == 0 {
		return fmt.Errorf("expected status codes to be 0, got %d", len(data.Data.StatusCounts))
	}
	return nil
}

// requestAdminListContactsEndpoint makes a GET request to the admin contacts list endpoint.
func (a *ApiFeature) requestAdminListContactsEndpoint() error {
	url := fmt.Sprintf("%s/api/v1/admin/contacts", API_BASE_URL)

	request, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	a.resp, err = a.ExecuteRequest(request)
	if err != nil {
		return err
	}
	return nil
}

// responseShouldContainListContacts verifies that the response contains a list of contacts.
func (a *ApiFeature) responseShouldContainListContacts() error {
	var data struct {
		Data []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Email     string `json:"email"`
			CreatedAt string `json:"created_at"`
		} `json:"data"`
	}
	if err := json.NewDecoder(a.resp.Body).Decode(&data); err != nil {
		return err
	}
	if len(data.Data) == 0 {
		return fmt.Errorf("expected list of contacts to be 0, got %d", len(data.Data))
	}
	return nil
}

// RegisterAdminSteps registers all admin-related steps in the scenario context.
func RegisterAdminSteps(ctx *godog.ScenarioContext, api *ApiFeature) {
	ctx.Step(`^I make a request to an admin endpoint$`, api.requestAdminEndpoint)
	ctx.Step(`^I provide an invalid API key$`, api.provideInvalidApiKey)
	ctx.Step(`^I make a request to the admin stats endpoint$`, api.requestAdminStatsEndpoint)
	ctx.Step(`^the response should contain the total number of requests, total number of unique visitors and a summary of status codes$`, api.responseShouldContainTotalNumberOfRequestsAndUniqueVisitorsAndStatusCodes)
	ctx.Step(`^I make a request to the admin list contacts endpoint$`, api.requestAdminListContactsEndpoint)
	ctx.Step(`^the response should contain a list of contacts$`, api.responseShouldContainListContacts)
}
