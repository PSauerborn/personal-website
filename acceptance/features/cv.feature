Feature: CV
    Visitors can view the CV of the website owner.

    @api @spec-002
    Scenario: A request is made to retrieve CV
        Given a collection of experience entries exists
        And a collection of education entries exists
        When a request is made to retrieve the CV
        Then the response status is 200
        And the response has content type "application/json"
        And the response body contains a list of experience entries
        And the response body contains a list of education entries
        And the response body contains a map of skills

    @api @spec-002
    Scenario: Experience entries are returned as complete aggregates
        Given an experience entry "Technical Lead" exists with responsibilities and tech stack items
        When a request is made to retrieve the CV
        Then the response status is 200
        And the experience entry "Technical Lead" contains its responsibilities
        And the experience entry "Technical Lead" contains its tech stack items

    @api @spec-002
    Scenario Outline: Entries are ordered by start date, most recent first
        Given a collection of <collection> entries with differing start dates exists
        When a request is made to retrieve the CV
        Then the response status is 200
        And the <collection> entries are ordered by start date in descending order

        Examples:
        | collection |
        | experience |
        | education  |

    @api @spec-002
    Scenario: An ongoing role is returned as current
        Given an experience entry "Founder & Developer" exists with no end date
        When a request is made to retrieve the CV
        Then the response status is 200
        And the experience entry "Founder & Developer" has a null end date

    @api @spec-002
    Scenario: Headline skills are grouped by category
        Given a skill category "Core Languages" exists with tech stack items "Golang" and "Python"
        And a skill category "Cloud and Infrastructure" exists with tech stack item "Kubernetes"
        When a request is made to retrieve the CV
        Then the response status is 200
        And the skills contain the category "Core Languages" with the items "Golang" and "Python"
        And the skills contain the category "Cloud and Infrastructure" with the item "Kubernetes"

    @api @spec-002
    Scenario: Tech stack items without a category are not returned as skills
        Given a skill category "Core Languages" exists with tech stack item "Golang"
        And a tech stack item "Athena" exists that is not mapped to a category
        When a request is made to retrieve the CV
        Then the response status is 200
        And the skills do not contain the item "Athena"

    @api @spec-002
    Scenario: An empty CV returns empty collections
        Given no experience or education entries exist
        When a request is made to retrieve the CV
        Then the response status is 200
        And the response body contains an empty list of experience entries
        And the response body contains an empty list of education entries
        And the response body contains an empty map of skills

    @ui @spec-003
    Scenario: The homepage displays the personal details header
        When a visitor navigates to the homepage
        Then the personal details header displays the name of the site owner
        And the personal details header displays an email address
        And the personal details header displays a phone number
        And the personal details header displays a headline summary of professional experience and interests

    @ui @spec-003
    Scenario: The homepage displays the CV sections in order
        Given a CV with skills, experience entries, and education entries exists
        When a visitor navigates to the homepage
        Then the CV section displays the headline skills first
        And the headline skills are followed by a timeline of experience entries
        And the experience timeline is followed by a timeline of education entries
