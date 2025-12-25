Feature: Contact Management

  Scenario: Adding a new contact
    Given no contact exists with the email "john.doe@example.com"
    When I submit a contact request with name "John Doe" and email "john.doe@example.com" and message "Hello"
    Then the contact "john.doe@example.com" should be added

  Scenario: Adding existing contact
    Given a contact exists with the email "john.doe@example.com"
    When I submit a contact request with name "John Doe" and email "john.doe@example.com" and message "Hello"
    Then the contact "john.doe@example.com" should not be added again

  Scenario: Invalid email address
    Given no contact exists with the email "jane.doe@example.com"
    When I submit a contact request with name "Jane Doe" and email "invalid-email" and message "Hello"
    Then the response should have status code 400

  Scenario: Missing contact name
    Given no contact exists with the email "jane.doe@example.com"
    When I submit a contact request with name "" and email "jane.doe@example.com" and message "Hello"
    Then the response should have status code 400

  Scenario: Mixed case email address
    Given no contact exists with the email "jane.doe@example.com"
    When I submit a contact request with name "Jane Doe" and email "Jane.Doe@example.com" and message "Hello"
    Then the response should have status code 201
    And the contact "jane.doe@example.com" should be added
