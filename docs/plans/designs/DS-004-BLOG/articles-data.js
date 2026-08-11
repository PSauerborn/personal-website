/* DS-004-BLOG — sample article metadata for the static mockups.
 *
 * GENERATED — do not edit. Regenerate with `./build.sh`, which extracts the
 * `sampleArticles` array from `article-data.ts` so the mockups and the typed
 * production data file can never drift apart.
 *
 * Shape matches `GET /v1/articles/list` (SPEC-002 § 6.1.8). There is no
 * `content` and no `comments` field, per SPEC-003 REQ-4.3.
 */
const ARTICLES = [
  {
    id: "a-14",
    title: "Spec-driven development with subagents",
    description:
      "Every feature on this site started as a spec with numbered acceptance criteria. Here is what changes when the acceptance criteria, not the prose, are the unit of work — and what it costs.",
    author: "Pascal Sauerborn",
    topics: ["Agentic development", "Spec-driven development", "Testing"],
    created_at: "2026-07-28T09:00:00Z",
  },
  {
    id: "a-13",
    title: "Postgres advisory locks are a job queue",
    description:
      "You probably do not need Redis for this. A walk through session-level and transaction-level advisory locks, the failure modes of each, and when the queue really does need to leave the database.",
    author: "Pascal Sauerborn",
    topics: ["PostgreSQL", "Go", "Distributed systems"],
    created_at: "2026-06-11T09:00:00Z",
  },
  {
    id: "a-12",
    title: "Exactly-once is a property of your consumer",
    description:
      "Kafka does not give you exactly-once delivery and never claimed to. The guarantee people actually want is idempotent processing, and that is built on the consumer side with a dedupe key and a transaction.",
    author: "Pascal Sauerborn",
    topics: ["Kafka", "Distributed systems", "Event-driven architecture"],
    created_at: "2026-05-19T09:00:00Z",
  },
  {
    id: "a-11",
    title: "The gin middleware I write on every project",
    description:
      "Request IDs, structured access logs, panic recovery that does not swallow the stack, and a timeout that actually cancels the context. Roughly two hundred lines, copied forward for years.",
    author: "Pascal Sauerborn",
    topics: ["Go", "API design", "Observability"],
    created_at: "2026-04-02T09:00:00Z",
  },
  {
    id: "a-10",
    title: "Migrations that survive a rollback",
    description:
      "Expand, migrate, contract — the three-deploy dance that lets a schema change go out without a maintenance window, and the two Alembic patterns that make it routine rather than heroic.",
    author: "Pascal Sauerborn",
    topics: ["PostgreSQL", "Alembic", "Deployment"],
    created_at: "2026-03-14T09:00:00Z",
  },
  {
    id: "a-9",
    title: "Acceptance criteria as executable Gherkin",
    description:
      "Numbered criteria in the spec map one-to-one onto tagged scenarios in godog. The tag, not the file, is the unit of ownership — and that single decision is what keeps cross-cutting features readable.",
    author: "Pascal Sauerborn",
    topics: ["Testing", "Spec-driven development", "Go"],
    created_at: "2026-02-08T09:00:00Z",
  },
  {
    id: "a-8",
    title: "Server components changed how I fetch data",
    description:
      "Rendering on the server is not just an SEO tactic. Once the fetch happens in the component, the loading-state machinery most React apps carry around stops being necessary at all.",
    author: "Pascal Sauerborn",
    topics: ["React", "Frontend", "Performance"],
    created_at: "2026-01-22T09:00:00Z",
  },
  {
    id: "a-7",
    title: "Your dashboards are measuring the wrong thing",
    description:
      "CPU and memory tell you the machine is unhappy. Latency percentiles at the boundary tell you the user is. A short argument for deleting most of your panels and keeping four.",
    author: "Pascal Sauerborn",
    topics: ["Observability", "SRE"],
    created_at: "2025-12-03T09:00:00Z",
  },
  {
    id: "a-6",
    title: "Terraform modules should be boring",
    description:
      "The best module I have written has four variables and no conditionals. Every escape hatch added to a module is a promise to support that shape forever.",
    author: "Pascal Sauerborn",
    topics: ["Terraform", "Infrastructure", "Deployment"],
    created_at: "2025-11-05T09:00:00Z",
  },
  {
    id: "a-5",
    title: "Pagination is an API design decision, not a query",
    description:
      "Offset pagination breaks quietly under concurrent writes. Cursor pagination is barely harder to implement and does not lie to the caller — a comparison with the SQL for both.",
    author: "Pascal Sauerborn",
    topics: ["API design", "PostgreSQL", "Go"],
    created_at: "2025-09-30T09:00:00Z",
  },
  {
    id: "a-4",
    title: "Table-driven tests, and when they stop helping",
    description:
      "The Go idiom everyone reaches for, plus the moment a table of thirty cases with six optional fields has become harder to read than the thirty functions it replaced.",
    author: "Pascal Sauerborn",
    topics: ["Go", "Testing"],
    created_at: "2025-08-18T09:00:00Z",
  },
  {
    id: "a-3",
    title: "Kubernetes probes are not health checks",
    description:
      "Liveness restarts you, readiness removes you from the load balancer, startup buys you time. Conflating the three is how a slow dependency turns into a restart loop across the whole fleet.",
    author: "Pascal Sauerborn",
    topics: ["Kubernetes", "SRE", "Observability"],
    created_at: "2025-07-07T09:00:00Z",
  },
  {
    id: "a-2",
    title: "A CI pipeline you can run on your laptop",
    description:
      "If the pipeline only exists inside the CI provider, nobody can debug it. Push every step into a script the repository owns and CI becomes the thing that calls the script.",
    author: "Pascal Sauerborn",
    topics: ["CI/CD", "Deployment", "Docker"],
    created_at: "2025-06-12T09:00:00Z",
  },
  {
    id: "a-1",
    title: "Why this site is server-rendered",
    description:
      "A personal site is a document, and documents want to arrive as HTML. Notes on picking server rendering for a portfolio, and the one place the decision hurt.",
    author: "Pascal Sauerborn",
    topics: ["Frontend", "React", "Performance"],
    created_at: "2025-05-01T09:00:00Z",
  },
];
