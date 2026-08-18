Feature: Blog
    Visitors can list and read blog posts, and leave comments.

    @api @spec-002
    Scenario: A request is made to list blog posts
        Given a collection of blog posts marked as visible exists
        And a collection of blog posts marked as hidden exists
        When a request is made to list blog posts
        Then the response status is 200
        And the response contains a list of blog post metadata
        And the list only includes blog posts that are marked as visible
        And each blog post in the list includes the topics linked to it
        And no blog post in the list includes its content

    @api @spec-002
    Scenario: A blog post without a linked document is not listed
        Given a blog post with the title "Draft Post" exists and is marked as visible
        And the blog post with the title "Draft Post" has no document linked to it
        When a request is made to list blog posts
        Then the response status is 200
        And the list does not include the blog post "Draft Post"


    @api @spec-002
    Scenario: A request is made to get the content of a visible blog post
        Given a blog post with the title "Sample Post" exists and is marked as visible
        When a request is made to get the content of the blog post with the title "Sample Post"
        Then the response status is 200
        And the response is of content type "binary/octet-stream"
        And the response body contains the full content of the blog post "Sample Post"

    @api @spec-002
    Scenario: A request is made to get the content of a hidden blog post
        Given a blog post with the title "Sample Post" exists and is marked as hidden
        When a request is made to get the content of the blog post with the title "Sample Post"
        Then the response status is 404
        And the response body does not contain the full content of the blog post "Sample Post"
        And the response body does not indicate that the blog post exists

    @api @spec-002
    Scenario: A request is made to create a new comment
        Given a blog post with the title "Sample Post" exists and is marked as visible
        When a request is made to create a new comment for the blog post with the title "Sample Post" with author "John Doe" and content "This is a comment."
        Then the response status is 201
        And a comment is created against the blog post "Sample Post"
        And the comment is created against the blog post "Sample Post" with author "John Doe" and content "This is a comment."
        And the response body contains the ID of the newly created comment

    @api @spec-002
    Scenario: A request is made to create a new anonymous comment
        Given a blog post with the title "Sample Post" exists and is marked as visible
        When a request is made to create a new anonymous comment for the blog post with the title "Sample Post" with content "This is an anonymous comment."
        Then the response status is 201
        And a comment is created against the blog post "Sample Post"
        And the comment is created against the blog post "Sample Post" with content "This is an anonymous comment."
        And the comment is persisted with a null author
        And the response body contains the ID of the newly created comment

    @api @spec-002
    Scenario Outline: A submitted comment author is sanitized before persistence
        Given a blog post with the title "Sample Post" exists and is marked as visible
        When a request is made to create a new comment for the blog post with the title "Sample Post" with author "<submitted_author>" and content "This is a comment."
        Then the response status is 201
        And the comment is created against the blog post "Sample Post" with author "<stored_author>" and content "This is a comment."

        Examples:
        | submitted_author | stored_author |
        | john doe         | John Doe      |
        |   Jane Doe       | Jane Doe      |
        | jane doe         | Jane Doe      |

    @api @spec-002
    Scenario: The API rejects an empty comment
        Given a blog post with the title "Sample Post" exists and is marked as visible
        When a request is made to create a new comment for the blog post with the title "Sample Post" with author "John Doe" and empty content
        Then the response status is 400
        And the error message is "Bad Request"
        And no comment is created against the blog post "Sample Post"

    @api @spec-002
    Scenario: A request is made to list comments associated with a visible blog post
        Given a blog post with the title "Sample Post" exists and is marked as visible
        When a request is made to list comments for the blog post with the title "Sample Post"
        Then the response status is 200
        And the response body contains a list of comments for the blog post "Sample Post"

    @api @spec-002
    Scenario: Comments are returned oldest first
        Given a blog post with the title "Sample Post" exists and is marked as visible
        And the blog post "Sample Post" has comments created at differing times
        When a request is made to list comments for the blog post with the title "Sample Post"
        Then the response status is 200
        And the comments are ordered by creation time in ascending order

    @api @spec-002
    Scenario: A request is made to list comments for a blog post that has none
        Given a blog post with the title "Sample Post" exists and is marked as visible
        And the blog post "Sample Post" has no comments
        When a request is made to list comments for the blog post with the title "Sample Post"
        Then the response status is 200
        And the response body contains an empty list of comments for the blog post "Sample Post"

    @api @spec-002
    Scenario: A request is made to list comments associated with a hidden blog post
        Given a blog post with the title "Sample Post" exists and is marked as hidden
        When a request is made to list comments for the blog post with the title "Sample Post"
        Then the response status is 404
        And the response body does not contain the list of comments for the blog post "Sample Post"
        And the response body does not indicate that the blog post exists

    @api @spec-002
    Scenario Outline: A request is made against a blog post that does not exist
        Given no blog post exists with the ID "3f2a9c1de4b7482ba6c10e5d8c714b39"
        When <request> is made for the blog post with the ID "3f2a9c1de4b7482ba6c10e5d8c714b39"
        Then the response status is 404

        Examples:
        | request                       |
        | a request for the content     |
        | a request to list comments    |
        | a request to create a comment |

    @api @spec-004
    Scenario Outline: The API rejects unauthenticated requests to create blog posts
        Given that <scenario> is provided
        When a request is made to create a new blog post
        Then the response status is 403
        And the error message is "Forbidden"

        Examples:
        | scenario |
        | no API key |
        | an invalid API key |
        | an expired API key |

    @api @spec-004
    Scenario Outline: The API rejects unauthenticated content and visibility updates to blog posts
        Given a blog post with the title "Sample Post" exists and is marked as visible
        And that no API key is provided
        When <request> is made for the blog post with the title "Sample Post"
        Then the response status is 403
        And the error message is "Forbidden"

        Examples:
        | request |
        | a request to replace the content |
        | a request to update the visibility |

    @api @spec-004
    Scenario: An admin creates a new blog post
        Given that a valid API key is provided
        When a request is made to create a new blog post with:
            | title | Sample Post |
            | description | A sample blog post. |
            | topics | golang,postgres |
        Then the response status is 201
        And the response body contains the ID of the created blog post
        And a new blog post is created with the title "Sample Post"
        And the blog post "Sample Post" is linked to the topics "golang" and "postgres"
        And the blog post "Sample Post" has no document linked to it

    @api @spec-004
    Scenario: An admin uploads the initial content for a blog post
        Given that a valid API key is provided
        And a blog post with the title "Sample Post" exists and is marked as visible
        And the blog post with the title "Sample Post" has no document linked to it
        When a multipart request is made to replace the content of the blog post "Sample Post" with the file "updated.md"
        Then the response status is 200
        And a new document is created containing the uploaded content
        And the new document is linked to the blog post "Sample Post"
        And the stored size of the document linked to the blog post "Sample Post" matches the uploaded byte length
        And the document linked to the blog post "Sample Post" is stored with the filename "updated.md"
        And the details of the blog post "Sample Post" are otherwise unchanged

    @api @spec-004
    Scenario: An admin replaces the content of a blog post
        Given that a valid API key is provided
        And a blog post with the title "Sample Post" exists and is marked as visible
        And the blog post with the title "Sample Post" has a document linked to it
        When a multipart request is made to replace the content of the blog post "Sample Post" with the file "updated.md"
        Then the response status is 200
        And the document linked to the blog post "Sample Post" contains the uploaded content
        And the stored size of the document linked to the blog post "Sample Post" matches the uploaded byte length
        And the document linked to the blog post "Sample Post" is stored with the filename "updated.md"
        And the metadata of the blog post "Sample Post" is not modified

    @api @spec-004
    Scenario Outline: An admin sets the visibility of a blog post
        Given that a valid API key is provided
        And a blog post with the title "Sample Post" exists and is marked as <initial_state>
        When a request is made to set the visibility of the blog post "Sample Post" to <visible>
        Then the response status is 200
        And the display flag of the blog post "Sample Post" is set to <visible>
        And the response body contains the updated metadata of the blog post "Sample Post"
        And no other fields of the blog post "Sample Post" are modified
        And the document linked to the blog post "Sample Post" is not modified

        Examples:
        | initial_state | visible |
        | hidden        | true    |
        | visible       | true    |
        | visible       | false   |
        | hidden        | false   |

    @api @spec-004
    Scenario Outline: An admin request references a blog post that does not exist
        Given that a valid API key is provided
        And no blog post exists with the ID "3f2a9c1de4b7482ba6c10e5d8c714b39"
        When <request> is made for the blog post with the ID "3f2a9c1de4b7482ba6c10e5d8c714b39"
        Then the response status is 404

        Examples:
        | request |
        | a request to replace the content |
        | a request to update the visibility |

    @ui @spec-003
    Scenario: The blog index displays article metadata only
        Given a collection of blog posts marked as visible exists
        When a visitor navigates to the blog page
        Then the blog index lists every visible blog post
        And each article entry displays the publication date, title, description, and author of the article
        And each article entry displays the topics linked to the article
        And each article entry links to the blog post itself
        And no article entry displays the content of the article or its comments

    @ui @spec-003
    Scenario: The blog index search filters articles by keyword and topic
        Given a collection of blog posts marked as visible exists
        And a visitor has navigated to the blog page
        When a keyword is entered into the article search
        Then only the articles whose title, description, author, or topics contain the keyword remain visible
        And the articles that still match stay in the order and position they were listed in
        And the number of visible articles out of the total is announced to the visitor
        When a topic is selected in addition to the keyword
        Then only the visible articles that also carry the selected topic remain visible
        And selecting another topic replaces the topic previously selected
        And a filter that matches no article displays "No articles match that search"
        And clearing the keyword and the topic makes every article visible again

    @ui @spec-003
    Scenario: A blog post displays the article header and rendered markdown content
        Given a blog post with the title "Sample Post" exists and is marked as visible
        When a visitor navigates to the blog post "Sample Post"
        Then the article header displays the title, description, and author of the blog post
        And the article header displays the publication date and the topics of the blog post
        And the article header is followed by the content of the blog post rendered as formatted text
        And any markup in the content that could execute in the browser is not rendered

    @ui @spec-003
    Scenario: A blog post displays its comments including an anonymous comment
        Given a blog post with the title "Sample Post" exists and is marked as visible
        And the blog post "Sample Post" has comments left on it, one of which has no author
        When a visitor navigates to the blog post "Sample Post"
        Then the comments section lists every comment left on the blog post
        And the comments are listed in the order returned by the API, oldest first
        And each comment displays the name of its author and the date it was left
        And the comment with no author displays "Anonymous" in place of a name

    @ui @spec-003
    Scenario: A blog post with no comments displays the empty comments state
        Given a blog post with the title "Sample Post" exists and is marked as visible
        And the blog post "Sample Post" has no comments left on it
        When a visitor navigates to the blog post "Sample Post"
        Then no comments are listed
        And the comments section displays "Be the first to respond"
        And the visitor is still offered the form to leave a comment

    @ui @spec-003
    Scenario: An unresolvable article ID renders the not-found page
        Given no blog post exists with the ID "3f2a9c1de4b7482ba6c10e5d8c714b39"
        When a visitor navigates to the blog post with the ID "3f2a9c1de4b7482ba6c10e5d8c714b39"
        Then the not-found page is displayed
        And the not-found page offers the visitor a way back to the rest of the site
