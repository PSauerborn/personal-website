Feature: Default Endpoints
    Scenario: Successful Health Check
        Given I submit a health check request
        Then the health check should return a 200 OK response
