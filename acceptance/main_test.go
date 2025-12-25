package main

import (
	"os"
	"testing"

	"github.com/cucumber/godog"
)

const (
	API_BASE_URL = "https://api-dev.alpn-software.com"
)

// TestMain is the entry point for running the acceptance tests using Godog.
func TestMain(m *testing.M) {
	opts := godog.Options{
		Format:    "pretty",             // Output format
		Paths:     []string{"features"}, // Path to feature files
		Randomize: 0,                    // Execute scenarios in order
	}

	status := godog.TestSuite{
		Name:                 "acceptance",
		TestSuiteInitializer: InitializeTestSuite,
		ScenarioInitializer:  InitializeScenario,
		Options:              &opts,
	}.Run()

	if st := m.Run(); st > status {
		status = st
	}
	os.Exit(status)
}

// InitializeTestSuite sets up the test suite, including global before/after hooks.
func InitializeTestSuite(ctx *godog.TestSuiteContext) {
	// Global setup (e.g., start API server, docker containers)
	ctx.BeforeSuite(func() {
		// StartServer()
	})
	ctx.AfterSuite(func() {
		// StopServer()
	})
}

// InitializeScenario sets up each scenario by registering steps and creating a new ApiFeature instance.
func InitializeScenario(ctx *godog.ScenarioContext) {
	api := NewApiFeature()

	RegisterCommonSteps(ctx, api)
	RegisterResumeSteps(ctx, api)
	RegisterAdminSteps(ctx, api)
	RegisterContactSteps(ctx, api)
	RegisterDefaultSteps(ctx, api)
}
