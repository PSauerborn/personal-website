/**
 * Shared article types, search helpers, and sample data for design set
 * DS-004-BLOG.
 *
 * Types mirror the `GET /v1/articles/list` response schema defined in
 * SPEC-002 § 6.1.8 exactly — field names, types, and nullability all match the
 * API so the design options can be wired to the real endpoint without a
 * mapping layer.
 *
 * SPEC-003 REQ-4.3 is a property of this type, not of the UI: `ArticleMeta`
 * has no `content` and no `comments` field, so no blog index component can
 * render either. The article body is fetched separately, per article, by the
 * blog post page (SPEC-002 § 6.1.9).
 */

export interface ArticleMeta {
  id: string;
  title: string;
  description: string;
  author: string;
  /** Topics linked to the article (SPEC-002 REQ-4.3). May be empty. */
  topics: string[];
  /** ISO-8601 timestamp. */
  created_at: string;
}

export interface ArticleListResponse {
  articles: ArticleMeta[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const LONG_DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

/** "14 Mar 2026" — the human-readable form. Always paired with a machine-readable
 *  `datetime` attribute carrying the raw ISO value from the API. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", LONG_DATE);
}

/**
 * Reading time is NOT derivable from the list response — `ArticleMeta` carries
 * no content and no word count (SPEC-003 REQ-4.3), and fetching every article
 * body to compute one would defeat the point of a metadata-only endpoint.
 *
 * The mockups therefore never show a reading time. If it is wanted later it is
 * an API change: a `read_minutes` integer on the list schema, computed
 * server-side at document-link time. Recorded here so the omission reads as a
 * decision rather than an oversight.
 */

// ---------------------------------------------------------------------------
// Client-side search (SPEC-003 REQ-4.2)
// ---------------------------------------------------------------------------

/**
 * The searchable text for an article: title, description, author, and topics.
 *
 * Content is deliberately absent — it is not in the payload, so the search is
 * a metadata search and the empty state says so rather than implying the whole
 * archive was searched.
 */
export function searchIndex(article: ArticleMeta): string {
  return [article.title, article.description, article.author, ...article.topics]
    .join(" ")
    .toLowerCase();
}

/**
 * Matches on every whitespace-separated term (AND), each as a substring.
 *
 * Substring rather than prefix matching so "kafka" finds "Kafka" mid-sentence;
 * AND rather than OR so adding a term always narrows, which is the behaviour a
 * search box trains people to expect. An empty query matches everything.
 */
export function matchesQuery(article: ArticleMeta, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchIndex(article);
  return terms.every((term) => haystack.includes(term));
}

/**
 * Topic filtering is AND across selected topics — selecting "Go" and "Kafka"
 * shows the articles carrying both. AND keeps the counts shown next to each
 * topic honest: a count is always "how many of the currently visible articles
 * carry this topic", and selecting one never grows the result set.
 */
export function matchesTopics(article: ArticleMeta, selected: string[]): boolean {
  return selected.every((topic) => article.topics.includes(topic));
}

/** Topics across the archive with their article counts, most frequent first. */
export function topicCounts(articles: ArticleMeta[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const topic of article.topics) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

// ---------------------------------------------------------------------------
// Sample data — placeholder content for the mockups, not real articles.
//
// Sorted newest first. SPEC-002 REQ-4.3 does not specify a sort order for
// `GET /v1/articles/list`, so `BlogIndex` sorts client-side by `created_at`
// descending rather than trusting the response order.
// ---------------------------------------------------------------------------

export const sampleArticles: ArticleMeta[] = [
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
