# Hidden Spec Alpha — Search and Indexing

Draft. This spec is complete enough to review and not complete enough to
publish, so the spec row is hidden while the document itself is perfectly
public. Nothing here is confidential; it simply describes a component that does
not exist yet, and advertising it would be a promise rather than a description.

## 1. Problem

Finding anything on this site currently means reading a list. That works at
thirty articles and stops working somewhere before three hundred. Visitors want
to search the content; the admin wants to find the one post that mentioned a
particular library eighteen months ago.

## 2. Proposed approach

PostgreSQL full-text search, not an external search service. The corpus is
small, it lives in the same database as everything else, and the operational
cost of a second stateful system is real while the benefit at this scale is
hypothetical.

Concretely:

- a generated `tsvector` column over title, description and body;
- a GIN index on that column;
- ranking with `ts_rank_cd`, weighted so that a title match outranks a body
  match;
- a single endpoint that takes a query string and returns article metadata.

## 3. Explicitly out of scope

- Fuzzy matching and spelling correction. A misspelled query returning nothing
  is an acceptable first version.
- Searching document *bodies* stored as `BYTEA`. Those are served verbatim and
  are not necessarily text; indexing them means deciding what "text" meant at
  write time, which is a separate problem.
- Faceting by topic. The topic filter already exists and composes with search
  without either knowing about the other.

## 4. Open question

Whether search results should include hidden articles for an authenticated
admin. The listing endpoints already answer this question with an
`include_hidden` parameter, and search should almost certainly answer it the
same way rather than inventing a second convention.
