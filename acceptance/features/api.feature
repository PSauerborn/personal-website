Feature: API
    Developers and operators have an API that they can access to interact with the system programmatically.

    @api @spec-002
    Scenario: A request is made to check the health of the API
        Given the API is running
        And all dependent services are running and reachable
        When a request is made to check the health of the API
        Then the response status is 200
        And the response has content type "application/json"
        And the response body indicates that the API is healthy

    @api @spec-002
    Scenario: A request is made to check the health of the API when some dependent services are down
        Given the API is running
        And some dependent services are not reachable
        When a request is made to check the health of the API
        Then the response status is 500
        And the response has content type "application/json"
        And the response body indicates that the API is unhealthy

    @api @spec-002
    Scenario: A request is made to check the version of the API
        Given the API is running
        When a request is made to check the version of the API
        Then the response status is 200
        And the response has content type "application/json"
        And the response body contains the version of the API

    @api @spec-002
    Scenario Outline: A preflight request is made from an allowed origin
        Given the API is running
        When a preflight request is made to "/v1/health" from origin "<origin>" for method "GET"
        Then the response status is 204
        And the response header "Access-Control-Allow-Origin" is "<origin>"
        And the response header "Access-Control-Allow-Methods" contains "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        And the response header "Access-Control-Allow-Headers" contains "Content-Type, Accept, Accept-Language, Content-Language"

        Examples:
            | origin                     |
            | http://localhost:9000      |
            | https://psauerborn.dev     |
            | https://dev.psauerborn.dev |

    @api @spec-002
    Scenario: A preflight request is made from a disallowed origin
        Given the API is running
        When a preflight request is made to "/v1/health" from origin "https://not-allowed.example.com" for method "GET"
        Then the response does not have an "Access-Control-Allow-Origin" header

    @api @spec-002
    Scenario: A request is made from an allowed origin
        Given the API is running
        And all dependent services are running and reachable
        When a request is made to check the health of the API from origin "https://psauerborn.dev"
        Then the response status is 200
        And the response header "Access-Control-Allow-Origin" is "https://psauerborn.dev"

    @api @spec-004
    Scenario: An authenticated admin request is recorded in the audit log
        Given that a valid API key is provided
        When a request is made to list contacts
        Then the response status is 200
        And an audit log entry is recorded for the request
        And the audit log entry contains the hashed API key used to make the request
        And the audit log entry contains the endpoint called
        And the audit log entry contains the request and response bodies
        And the audit log entry contains the status code of the request

    @api @spec-004
    Scenario: An unauthenticated admin request is recorded in the audit log
        Given that no API key is provided
        When a request is made to list contacts
        Then the response status is 403
        And an audit log entry is recorded for the request
        And the audit log entry contains the endpoint called
        And the audit log entry contains the status code of the request
