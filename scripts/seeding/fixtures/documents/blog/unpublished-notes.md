# Unpublished Notes

Working notes, kept hidden on purpose. Half of these will turn into posts and
half will turn out to be wrong.

## On writing Go for clusters

The Kubernetes client-go API rewards patience and punishes cleverness. Informers
are caches; caches are stale; every read from an informer is a read of the past.
Code that treats a lister as the source of truth works perfectly until the first
race, and then fails in a way that is almost impossible to reproduce locally.

The rule I keep coming back to: read from the cache to *decide*, read from the
API server to *act*, and make the action tolerant of having been wrong.

## On generics

Go generics have settled into a narrow, useful role: containers and small
functional helpers.

```go
func Map[T, U any](in []T, fn func(T) U) []U {
	out := make([]U, 0, len(in))
	for _, item := range in {
		out = append(out, fn(item))
	}

	return out
}
```

Every attempt I have made to push them further — generic interfaces over
storage backends, in particular — ended up less readable than the four concrete
implementations it replaced. Worth a post, once I can say that without it
sounding like a complaint.

## On observability budgets

A metric costs money forever. A log line costs money forever and is usually read
once, during an incident, by someone who wanted a metric. Three questions before
adding either:

1. What decision would this change?
2. Who would be looking at it, and when?
3. What is the cardinality, honestly, at peak?

Most candidates fail the third question. The ones that survive tend to be
counters of things that should never happen.

## Loose ends

- Benchmark the connection pooler under a deliberately bursty client before
  claiming anything about transaction-mode overhead.
- Find out whether the ordering guarantee I have been assuming for comment
  timestamps actually survives a single-transaction seed. (It does not — the
  server default is the transaction timestamp, so the rows must carry explicit
  values.)
- Decide whether any of this is a post or just a changelog.
