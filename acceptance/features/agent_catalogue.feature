Feature: Agent Catalogue
    Visitors can browse the subagent catalogue and read the specs used to build the site.

    @api @spec-002
    Scenario: A request is made to list subagents
        Given a collection of subagents exists
        When a request is made to list subagents
        Then the response status is 200
        And the response contains the complete subagent catalogue
        And each subagent in the list includes its inputs and outputs schemas

    @api @spec-002
    Scenario: A subagent without declared schemas returns empty schema objects
        Given a subagent with the name "Sample Agent" exists with no declared input or output schema
        When a request is made to list subagents
        Then the response status is 200
        And the subagent "Sample Agent" is returned with an empty object for its inputs schema
        And the subagent "Sample Agent" is returned with an empty object for its outputs schema

    @api @spec-002
    Scenario: A request is made to list specs
        Given a collection of specs marked as visible exists
        And a collection of specs marked as hidden exists
        When a request is made to list specs
        Then the response status is 200
        And the response contains a list of spec metadata
        And the list only includes specs that are marked as visible
        And each metadata entry includes the non-restricted documents linked to the spec
        And no spec in the list includes its content

    @api @spec-002
    Scenario: A spec without a linked spec document is not listed
        Given a spec with the title "Draft Spec" exists and is marked as visible
        And the spec with the title "Draft Spec" has no spec document linked to it
        When a request is made to list specs
        Then the response status is 200
        And the list does not include the spec "Draft Spec"

    @api @spec-002
    Scenario: A spec with a linked spec document that is restricted is not listed
        Given a spec with the title "Restricted Spec" exists and is marked as visible
        And the spec with the title "Restricted Spec" has a spec document linked to it that is restricted
        When a request is made to list specs
        Then the response status is 200
        And the list does not include the spec "Restricted Spec"

    @api @spec-002
    Scenario: A restricted document is omitted from the spec
        Given a spec with the title "Sample Spec" exists and is marked as visible
        And the spec with the title "Sample Spec" has a non-restricted spec document linked to it
        And the spec with the title "Sample Spec" has a restricted non-spec document linked to it
        When a request is made to list specs
        Then the response status is 200
        And the list does includes the spec "Sample Spec"
        And the list only includes the non-restricted documents linked to the spec "Sample Spec"

    @api @spec-002
    Scenario: A request is made to get the content of a spec
        Given a spec with the title "Sample Spec" exists and is marked as visible
        When a request is made to get the content of the spec with the title "Sample Spec"
        Then the response status is 200
        And the response is of content type "binary/octet-stream"
        And the response body contains the full content of the spec "Sample Spec"

    @api @spec-002
    Scenario: A request is made against a spec that does not exist
        Given no spec exists with the ID "9b4d2f7ac1e34d59b8a61c0f5e372d48"
        When a request is made to get the content of the spec with the ID "9b4d2f7ac1e34d59b8a61c0f5e372d48"
        Then the response status is 404

    @api @spec-004
    Scenario Outline: The API rejects unauthenticated requests to create specs
        Given that <scenario> is provided
        When a request is made to create a new spec
        Then the response status is 403
        And the error message is "Forbidden"

        Examples:
        | scenario |
        | no API key |
        | an invalid API key |
        | an expired API key |

    @api @spec-004
    Scenario Outline: The API rejects unauthenticated content and visibility updates to specs
        Given a spec with the title "Sample Spec" exists and is marked as visible
        And that no API key is provided
        When <request> is made for the spec with the title "Sample Spec"
        Then the response status is 403
        And the error message is "Forbidden"

        Examples:
        | request |
        | a request to replace the content |
        | a request to update the visibility |

    @api @spec-004
    Scenario: Existing spec endpoints remain public
        Given a collection of specs marked as visible exists
        And that no API key is provided
        When a request is made to list specs
        Then the response status is 200

    @api @spec-004
    Scenario: An admin creates a new spec
        Given that a valid API key is provided
        When a request is made to create a new spec with:
            | spec_id | SPEC-101 |
            | description | A sample spec. |
        Then the response status is 201
        And the response body contains the ID of the created spec
        And a new spec is created with the ID "SPEC-101"
        And the spec "SPEC-101" is marked as hidden
        And the spec "SPEC-101" has no document linked to it

    @api @spec-004
    Scenario: An admin uploads the initial content for a spec
        Given that a valid API key is provided
        And a spec with the title "Sample Spec" exists and is marked as visible
        And the spec with the title "Sample Spec" has no document linked to it
        When a multipart request is made to replace the content of the spec "Sample Spec" with the file "updated.md"
        Then the response status is 200
        And a new document is created containing the uploaded content
        And the new document is linked to the spec "Sample Spec"
        And the stored size of the document linked to the spec "Sample Spec" matches the uploaded byte length
        And the document linked to the spec "Sample Spec" is stored with the filename "updated.md"
        And the details of the spec "Sample Spec" are otherwise unchanged

    @api @spec-004
    Scenario: An admin replaces the content of a spec
        Given that a valid API key is provided
        And a spec with the title "Sample Spec" exists and is marked as visible
        And the spec with the title "Sample Spec" has a document linked to it
        When a multipart request is made to replace the content of the spec "Sample Spec" with the file "updated.md"
        Then the response status is 200
        And the document linked to the spec "Sample Spec" contains the uploaded content
        And the stored size of the document linked to the spec "Sample Spec" matches the uploaded byte length
        And the document linked to the spec "Sample Spec" is stored with the filename "updated.md"
        And the metadata of the spec "Sample Spec" is not modified

    @api @spec-004
    Scenario Outline: An admin sets the visibility of a spec
        Given that a valid API key is provided
        And a spec with the title "Sample Spec" exists and is marked as <initial_state>
        When a request is made to set the visibility of the spec "Sample Spec" to <visible>
        Then the response status is 200
        And the display flag of the spec "Sample Spec" is set to <visible>
        And the response body contains the updated metadata of the spec "Sample Spec"
        And no other fields of the spec "Sample Spec" are modified
        And the document linked to the spec "Sample Spec" is not modified

        Examples:
        | initial_state | visible |
        | hidden        | true    |
        | visible       | true    |
        | visible       | false   |
        | hidden        | false   |

    @api @spec-004
    Scenario Outline: An admin request references a spec that does not exist
        Given that a valid API key is provided
        And no spec exists with the ID "9b4d2f7ac1e34d59b8a61c0f5e372d48"
        When <request> is made for the spec with the ID "9b4d2f7ac1e34d59b8a61c0f5e372d48"
        Then the response status is 404

        Examples:
        | request |
        | a request to replace the content |
        | a request to update the visibility |

    @api @spec-004
    Scenario: Hidden specs are listed when an admin includes hidden specs
        Given that a valid API key is provided
        And a collection of specs marked as visible exists
        And a collection of specs marked as hidden exists
        When a request is made to list specs with include_hidden set to "true"
        Then the response status is 200
        And the list includes specs that are marked as hidden
        And an audit log entry is recorded for the request

    @api @spec-004
    Scenario Outline: Hidden specs are not listed without a valid API key
        Given that <scenario> is provided
        And a collection of specs marked as visible exists
        And a collection of specs marked as hidden exists
        When a request is made to list specs with include_hidden set to "true"
        Then the response status is 200
        And the list only includes specs that are marked as visible

        Examples:
        | scenario |
        | no API key |
        | an invalid API key |
        | an expired API key |

    @api @spec-004
    Scenario: Listing specs without including hidden specs remains public
        Given that no API key is provided
        And a collection of specs marked as visible exists
        And a collection of specs marked as hidden exists
        When a request is made to list specs with include_hidden set to "false"
        Then the response status is 200
        And the list only includes specs that are marked as visible
