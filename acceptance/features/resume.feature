Feature: Resume Display

  Scenario: Viewing resume in PDF format
    Given I make a request to view the resume in PDF format
    Then the response should have content type "application/json"
    And the response should contain a base64-encoded PDF resume

  Scenario: Viewing resume in JSON format
    Given I make a request to view the resume in JSON format
    Then the response should have content type "application/json"
    And the response should contain the resume data in JSON format

  Scenario: Viewing resume default format
    Given I make a request to view the resume without specifying a format
    Then the response should have content type "application/json"
    And the response should contain the resume data in JSON format

  Scenario: Invalid resume format request
    Given I make a request to view the resume in an unsupported format "xml"
    Then the response should have status code 400
