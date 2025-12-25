package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/cucumber/godog"
)

// requestResumeInFormat sends a GET request to the resume endpoint with the specified format.
func (a *ApiFeature) requestResumeInFormat(format string) error {
	url := fmt.Sprintf("%s/api/v1/public/resume?format=%s", API_BASE_URL, format)

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

// requestResumeDefautltFormat sends a GET request to the resume endpoint without a format parameter.
func (a *ApiFeature) requestResumeDefautltFormat() error {
	url := fmt.Sprintf("%s/api/v1/public/resume", API_BASE_URL)

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

// requestResumeInvalidFormat sends a GET request to the resume endpoint with an invalid format parameter.
func (a *ApiFeature) requestResumeInvalidFormat() error {
	url := fmt.Sprintf("%s/api/v1/public/resume?format=xml", API_BASE_URL)

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

// verifyJsonResume checks that the response is a valid JSON resume.
func (a *ApiFeature) verifyJsonResume() error {
	body := a.resp.Body
	defer body.Close()

	var payload struct {
		Data struct {
			Education []struct {
			} `json:"education"`
			Experience []struct {
			} `json:"experience"`
			Skills []struct {
			} `json:"skills"`
		} `json:"data"`
	}
	if err := json.NewDecoder(body).Decode(&payload); err != nil {
		return err
	}

	return nil
}

// verifyPdfResume checks that the response is a valid PDF resume.
func (a *ApiFeature) verifyPdfResume() error {
	body := a.resp.Body
	defer body.Close()

	var payload struct {
		Data string `json:"data"`
	}
	if err := json.NewDecoder(body).Decode(&payload); err != nil {
		return err
	}
	// Verify that the data is a valid base64 encoded string
	_, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		return err
	}
	return nil
}

// RegisterResumeSteps registers steps related to resume feature
func RegisterResumeSteps(ctx *godog.ScenarioContext, api *ApiFeature) {
	ctx.Step(`^I make a request to view the resume in (JSON|PDF) format$`, api.requestResumeInFormat)
	ctx.Step(`^I make a request to view the resume without specifying a format$`, api.requestResumeDefautltFormat)
	ctx.Step(`^I make a request to view the resume in an unsupported format "xml"$`, api.requestResumeInvalidFormat)
	ctx.Step(`^the response should contain the resume data in JSON format$`, api.verifyJsonResume)
	ctx.Step(`^the response should contain a base64-encoded PDF resume$`, api.verifyPdfResume)
}
