Feature: Projects
    Visitors can browse the projects showcased on the site.

    @api @spec-002
    Scenario: A request is made to list projects
        Given a collection of projects marked as visible exists
        And a collection of projects marked as hidden exists
        When a request is made to list projects
        Then the response status is 200
        And the response contains a list of projects
        And the list only includes projects that are marked as visible

    @api @spec-002
    Scenario: A project without a GitHub link is listed
        Given a project with the name "Sample Project" exists and is marked as visible
        And the project "Sample Project" has no GitHub link
        When a request is made to list projects
        Then the response status is 200
        And the list includes the project "Sample Project"
        And the project "Sample Project" is returned with a null GitHub link

    @api @spec-004
    Scenario Outline: The API rejects unauthenticated requests to create projects
        Given that <scenario> is provided
        When a request is made to create a new project
        Then the response status is 403
        And the error message is "Forbidden"

        Examples:
        | scenario |
        | no API key |
        | an invalid API key |
        | an expired API key |

    @api @spec-004
    Scenario Outline: The API rejects unauthenticated visibility updates to projects
        Given a project with the name "Sample Project" exists and is marked as visible
        And that <scenario> is provided
        When a request is made to update the visibility of the project "Sample Project"
        Then the response status is 403
        And the error message is "Forbidden"

        Examples:
        | scenario |
        | no API key |
        | an invalid API key |
        | an expired API key |

    @api @spec-004
    Scenario: Existing project endpoints remain public
        Given a collection of projects marked as visible exists
        And that no API key is provided
        When a request is made to list projects
        Then the response status is 200

    @api @spec-004
    Scenario: An admin creates a new project
        Given that a valid API key is provided
        When a request is made to create a new project with:
            | name | sample project |
            | description | A sample project. |
            | primary_link | https://example.com/project |
            | github_link | https://github.com/example/project |
        Then the response status is 201
        And the response body contains the ID of the created project
        And a new project is created with the name "Sample Project"
        And the project "Sample Project" is marked as hidden

    @api @spec-004
    Scenario: Project names are sanitized and converted to title format
        Given that a valid API key is provided
        When a request is made to create a new project with the name "  my awesome project  "
        Then the response status is 201
        And a new project is created with the name "My Awesome Project"

    @api @spec-004
    Scenario Outline: The API rejects a project created with an invalid link
        Given that a valid API key is provided
        When a request is made to create a new project with the <link_field> "<link>"
        Then the response status is 400
        And no new project is created

        Examples:
        | link_field   | link                              |
        | primary link | http://example.com/project        |
        | primary link | not-a-valid-url                   |
        | github link  | ftp://github.com/example/project  |

    @api @spec-004
    Scenario Outline: An admin sets the visibility of a project
        Given that a valid API key is provided
        And a project with the name "Sample Project" exists and is marked as <initial_state>
        When a request is made to set the visibility of the project "Sample Project" to <visible>
        Then the response status is 200
        And the display flag of the project "Sample Project" is set to <visible>

        Examples:
        | initial_state | visible |
        | hidden        | true    |
        | visible       | true    |
        | visible       | false   |
        | hidden        | false   |

    @api @spec-004
    Scenario: An admin request references a project that does not exist
        Given that a valid API key is provided
        And no project exists with the ID "7c1e5a9db2f6470c93d84b1a6e05c827"
        When a request is made to update the visibility of the project with the ID "7c1e5a9db2f6470c93d84b1a6e05c827"
        Then the response status is 404
