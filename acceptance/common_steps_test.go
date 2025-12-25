package main

import (
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/cucumber/godog"
)

// verifyContentType checks that the response has the expected content type.
func (a *ApiFeature) verifyContentType(expectedType string) error {
	ct := a.resp.Header.Get("Content-Type")

	contentTypes := strings.Split(ct, "; ")
	if !slices.Contains(contentTypes, expectedType) {
		return fmt.Errorf("expected content type %s, got %s", expectedType, ct)
	}
	return nil
}

// verifyStatusCode checks that the response has the expected status code.
func (a *ApiFeature) verifyStatusCode(expectedCode int) error {
	if a.resp.StatusCode != expectedCode {
		return fmt.Errorf("expected status code %d, got %d", expectedCode, a.resp.StatusCode)
	}
	return nil
}

// provideValidApiKey sets a valid API key from the environment variable for the request.
func (a *ApiFeature) provideValidApiKey() error {
	key := os.Getenv("ADMIN_API_KEY")
	if key == "" {
		return fmt.Errorf("ADMIN_API_KEY environment variable is not set")
	}
	a.apiKey = &key
	return nil
}

// provideInvalidApiKey sets an invalid API key for the request.
func (a *ApiFeature) provideInvalidApiKey() error {
	key := "invalid-api-key"
	a.apiKey = &key
	return nil
}

// provideNoApiKey clears the API key for the request.
func (a *ApiFeature) provideNoApiKey() error {
	a.apiKey = nil
	return nil
}

// RegisterCommonSteps registers steps that are common across multiple features.
func RegisterCommonSteps(ctx *godog.ScenarioContext, api *ApiFeature) {
	ctx.Step(`^the response should have content type "([^"]*)"$`, api.verifyContentType)
	ctx.Step(`^the response should have status code (\d+)$`, api.verifyStatusCode)
	ctx.Step(`^I provide a valid API key$`, api.provideValidApiKey)
	ctx.Step(`^I provide an invalid API key$`, api.provideInvalidApiKey)
	ctx.Step(`^I provide no API key$`, api.provideNoApiKey)
}
