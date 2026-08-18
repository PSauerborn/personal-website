@contacts
Feature: Contacts
    Visitors can reach me through the site, and I can review what they sent.

    @api @spec-002
    Scenario Outline: A new visitor submits a contact message
        Given no contact exists with email <submitted_email>
        When a contact message is submitted with:
            | name | Test McLovin |
            | email | <submitted_email> |
            | message | Hello, this is a test message. |
        Then the response status is 201
        And the response has content type "application/json"
        And the response body contains the ID of the created message
        And a new contact is created with email "test@example.com"
        And a new message is created with content "Hello, this is a test message."

        Examples:
        | submitted_email |
        | test@example.com |
        | TeSt@ExAmPlE.cOm |

    @api @spec-002
    Scenario: A visitor submits a contact message without an organization
        Given no contact exists with email "test@example.com"
        When a contact message is submitted with:
            | name | Test McLovin |
            | email | test@example.com |
            | message | Hello, this is a test message. |
        Then the response status is 201
        And a new contact is created with email "test@example.com"
        And the contact is created with a null organization

    @api @spec-002
    Scenario Outline: An existing contact submits a contact message
        Given a contact with email "test@example.com" exists
        When a contact message is submitted with:
            | name | Test McLovin |
            | email | <submitted_email> |
            | message | Hello, this is a second message. |
        Then the response status is 201
        And no new contact is created
        And a new message is created with content "Hello, this is a second message."
        And the message is linked to the existing contact for email "test@example.com"

        Examples:
        | submitted_email |
        | test@example.com |
        | TeSt@ExAmPlE.cOm |

    @api @spec-002
    Scenario Outline: Submitted contact details are sanitized before persistence
        Given no contact exists with email "test@example.com"
        When a contact message is submitted with:
            | name | <submitted_name> |
            | email | <submitted_email> |
            | organization | <submitted_organization> |
            | message | Hello, this is a test message. |
        Then the response status is 201
        And a new contact is created with:
            | name | <stored_name> |
            | email | <stored_email> |
            | organization | <stored_organization> |

        Examples:
        | submitted_name | submitted_email      | submitted_organization | stored_name  | stored_email     | stored_organization |
        | Test McLovin   | test@example.com     | acme corp              | Test McLovin | test@example.com | Acme Corp           |
        | test mclovin   | TeSt@ExAmPlE.cOm     | acme corp              | Test Mclovin | test@example.com | Acme Corp           |
        | Test McLovin   |  test@example.com    |  acme corp             | Test McLovin | test@example.com | Acme Corp           |

    @api @spec-002
    Scenario: Client supplied read and submitted_at values are ignored
        Given no contact exists with email "test@example.com"
        When a contact message is submitted with:
            | name | Test McLovin |
            | email | test@example.com |
            | message | Hello, this is a test message. |
            | read | true |
            | submitted_at | 2000-01-01T00:00:00Z |
        Then the response status is 201
        And the message is persisted with read set to false
        And the message is persisted with a submitted_at set to the server-side UTC receipt time

    @api @spec-002
    Scenario Outline: The API rejects malformed submissions
        When a contact message is submitted with an invalid <field>
        Then the response status is 400
        And the error message is "Bad Request"
        And the details message names the <field> field

        Examples:
        | field |
        | name  |
        | email |
        | message |

    @api @spec-004
    Scenario Outline: The API rejects unauthenticated requests to admin endpoints
        Given that <scenario> is provided
        When a request is made to list contacts
        Then the response status is 403
        And the error message is "Forbidden"

        Examples:
        | scenario |
        | no API key |
        | an invalid API key |
        | an expired API key |

    @api @spec-004
    Scenario: Contacts are accessible by admin users that provide an API key
        Given that a valid API key is provided
        When a request is made to list contacts
        Then the response status is 200
        And the response contains a list of all contacts

    @api @spec-004
    Scenario: Contacts with no organization are returned with a null organization
        Given that a valid API key is provided
        And a contact with email "test@example.com" exists
        And the contact with email "test@example.com" has no organization recorded
        When a request is made to list contacts
        Then the response status is 200
        And the contact with email "test@example.com" is returned with a null organization

    @api @spec-004
    Scenario: An empty contacts table returns an empty collection
        Given that a valid API key is provided
        And no contacts exist
        When a request is made to list contacts
        Then the response status is 200
        And the response contains an empty list of contacts

    @api @spec-004
    Scenario Outline: The API rejects unauthenticated requests to message endpoints
        Given that <scenario> is provided
        When a request is made to list messages
        Then the response status is 403
        And the error message is "Forbidden"

        Examples:
        | scenario |
        | no API key |
        | an invalid API key |
        | an expired API key |

    @api @spec-004
    Scenario: An admin lists all messages
        Given that a valid API key is provided
        And a collection of messages from multiple contacts exists
        When a request is made to list messages
        Then the response status is 200
        And the response contains a list of all messages
        And each message in the list includes the email of the contact that submitted it
        And the messages are ordered by submission time in descending order

    @api @spec-004
    Scenario Outline: An admin lists the messages belonging to a contact
        Given that a valid API key is provided
        And a contact with email "test@example.com" exists
        And the contact with email "test@example.com" has submitted messages
        And other contacts have also submitted messages
        When a request is made to list messages for the contact using <contact_ref>
        Then the response status is 200
        And the response contains only the messages submitted by the contact with email "test@example.com"

        Examples:
        | contact_ref |
        | its contact ID |
        | the email "test@example.com" |
        | the email "TeSt@ExAmPlE.cOm" |

    @api @spec-004
    Scenario: An admin lists messages for a contact that does not exist
        Given that a valid API key is provided
        And no contact exists with the ID "3f2a9c1de4b7482ba6c10e5d8c714b39"
        When a request is made to list messages for the contact with the ID "3f2a9c1de4b7482ba6c10e5d8c714b39"
        Then the response status is 404

    @ui @spec-003
    Scenario: The homepage displays the contact form
        When a visitor navigates to the homepage
        Then the contact form displays fields for name, email, organization, and message
        And the organization field is marked as optional

    @ui @spec-003
    Scenario: A visitor submits a valid contact message from the homepage
        Given a visitor has navigated to the homepage
        When the "Submit" button is clicked with:
            | name | Test McLovin |
            | email | test@example.com |
            | message | Hello, this is a test message. |
        Then the contact and message are created
        And a confirmation is displayed to the visitor

    @ui @spec-003
    Scenario Outline: The contact form rejects invalid input
        Given a visitor has navigated to the homepage
        When the contact form is submitted with an invalid <field>
        Then a validation error is displayed for the <field> field
        And no message is submitted to the API

        Examples:
        | field |
        | name |
        | email |
        | message |
