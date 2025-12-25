package main

import (
	"fmt"
	"net/http"

	"github.com/cucumber/godog"
)

// iSubmitAHealthCheckRequest sends a GET request to the health check endpoint.
func (a *ApiFeature) iSubmitAHealthCheckRequest() error {
	url := fmt.Sprintf("%s/api/v1/public/health", API_BASE_URL)
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	a.resp = resp
	return nil
}

// theHealthCheckShouldReturnA200OKResponse verifies that the response status code is 200 OK.
func (a *ApiFeature) theHealthCheckShouldReturnA200OKResponse() error {
	if a.resp.StatusCode != http.StatusOK {
		return fmt.Errorf("expected status code 200, got %d", a.resp.StatusCode)
	}
	return nil
}

// RegisterDefaultSteps registers the health check steps in the scenario context.
func RegisterDefaultSteps(ctx *godog.ScenarioContext, api *ApiFeature) {
	ctx.Step(`^I submit a health check request$`, api.iSubmitAHealthCheckRequest)
	ctx.Step(`^the health check should return a 200 OK response$`, api.theHealthCheckShouldReturnA200OKResponse)
}
