# Sample Post

A short walk through the two things this site is built on: a Go service that
speaks HTTP, and a PostgreSQL database that holds everything the service is
willing to say.

## Why the database comes first

Every endpoint on this site is, in the end, a query. The list of blog posts is a
filter on two columns. The content of a post is a single `BYTEA` column handed
back verbatim. The comments below are one index scan ordered by creation time.
If the schema is right, the handlers are dull — and dull handlers are the point.

So the schema is written first, migrated by Alembic, and documented before a
single route exists. The service is then allowed to be boring.

## Go, briefly

The API layer is Go. Not because Go is fashionable, but because the failure
modes are legible: an error is a value you either handle or hand upwards, and
the compiler will not let you forget which. A blog is a small program, and small
programs are exactly where that discipline is cheapest to keep.

```go
func (s *Server) GetArticleContent(ctx context.Context, id string) ([]byte, error) {
	doc, err := s.store.DocumentForArticle(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("load document: %w", err)
	}

	return doc.Content, nil
}
```

That is the whole of it. The handler wraps the error, the store owns the SQL,
and nothing in between invents a cache nobody asked for.

## Postgres, briefly

The interesting decisions are all in the schema:

- **UUIDv7 primary keys.** Time-ordered, so an index on the key is also roughly
  an index on insertion time, and the ID leaks nothing but a timestamp.
- **Link tables with their own keys.** A topic attached to an article is a row
  in its own right, with its own identity, rather than a composite key that has
  to be re-derived every time something wants to reference it.
- **Content stored as bytes.** Documents are served byte-for-byte. Decoding
  them into text on the way in only creates opportunities to hand back something
  subtly different on the way out.

## What comes next

The rest of this series takes each of those in turn: connection handling under
load, the module layout that keeps the infrastructure honest, and what happens
when the whole thing is handed to an operator to run.
