# Scaling Postgres Connections

The first performance problem most services meet is not a slow query. It is a
thousand idle connections, each holding a backend process open, and a database
that has spent its memory on bookkeeping instead of work.

## A connection is not free

PostgreSQL forks a backend process per connection. That process carries its own
work memory, its own catalogue caches, and its own share of the snapshot
bookkeeping every other backend has to walk. Two hundred mostly-idle connections
can cost more than twenty busy ones, and the cost is paid by the queries you
actually care about.

The number to reason about is not "how many clients do I have" but "how many
queries can this machine run at once". Those are rarely the same number, and the
gap between them is what a pool is for.

## Sizing the pool

A workable starting point:

```
pool_size = ((core_count * 2) + effective_spindle_count)
```

For a modern eight-core instance on network-attached SSD storage, that lands
somewhere near twenty. It will feel far too small. It usually is not: a pool
that is smaller than the machine's capacity queues work, while a pool that is
larger than it thrashes, and queueing is very much the cheaper failure.

Measure before adjusting. `pg_stat_activity` grouped by `state` tells you
whether backends are running, idle, or — the interesting one — idle in
transaction.

## Idle in transaction is the real enemy

```sql
SELECT state, count(*), max(now() - state_change) AS longest
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state;
```

A backend sitting in `idle in transaction` holds its snapshot open. Autovacuum
cannot clean up rows newer than that snapshot, so dead tuples accumulate, tables
bloat, and every sequential scan on them gets slower — all because a piece of
application code opened a transaction and then went off to call an HTTP API.

Set `idle_in_transaction_session_timeout` and let the database defend itself.

## Pool where the pool belongs

An in-process pool per replica multiplies: ten replicas with a pool of twenty is
two hundred connections, whatever you told each replica. When the replica count
is elastic, put a transaction-mode pooler in front and let the in-process pools
stay small. Transaction mode is the mode that matters; session mode gives back
most of what you came for.

## The short version

Keep pools small, keep transactions short, time out the ones that are not, and
count connections at the database rather than in the deployment manifest. None
of this is clever. All of it is the difference between a database that degrades
gently and one that falls over at once.
