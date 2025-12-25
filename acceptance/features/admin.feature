Feature: Admin Access

  Scenario: Admin Access
    Given I provide a valid API key
    When I make a request to an admin endpoint
    Then the response should have status code 200

  Scenario: Admin Access with invalid API key
    Given I provide an invalid API key
    When I make a request to an admin endpoint
    Then the response should have status code 403

  Scenario: Admin Access with no API key
    Given I provide no API key
    When I make a request to an admin endpoint
    Then the response should have status code 403

  Scenario: Get Stats with valid API key
    Given I provide a valid API key
    When I make a request to the admin stats endpoint
    Then the response should have status code 200
    And the response should contain the total number of requests, total number of unique visitors and a summary of status codes

  Scenario: Get Stats with invalid API key
    Given I provide an invalid API key
    When I make a request to the admin stats endpoint
    Then the response should have status code 403

  Scenario: Get Stats with no API key
    Given I provide no API key
    When I make a request to the admin stats endpoint
    Then the response should have status code 403

  Scenario: List Contacts with valid API key
    Given I provide a valid API key
    When I make a request to the admin list contacts endpoint
    Then the response should have status code 200
    And the response should contain a list of contacts

  Scenario: List Contacts with invalid API key
    Given I provide an invalid API key
    When I make a request to the admin list contacts endpoint
    Then the response should have status code 403

  Scenario: List Contacts with no API key
    Given I provide no API key
    When I make a request to the admin list contacts endpoint
    Then the response should have status code 403
