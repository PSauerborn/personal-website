/**
 * DS-004-BLOG — Blog Index: Editorial Index
 *
 * The archive as a contents page: one column, one article per ruled row, newest
 * first, with the most recent post pulled out at masthead size. Search and topic
 * chips sit in a slim bar sticking under the site header.
 *
 * Client component. Every article is rendered into the DOM on the server and
 * hidden with the `hidden` attribute rather than being conditionally mounted, so
 * filtering never removes content from the server-rendered HTML (SPEC-003
 * REQ-1.1). `theme.css` forces `[hidden] { display: none !important }` because a
 * display utility on the same element would otherwise beat the UA default.
 *
 * See DS-004-BLOG.md for the design rationale behind the behaviours here; the
 * comments below cite it where a line encodes a decision rather than a mechanic.
 */

"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  type ArticleMeta,
  formatDate,
  matchesQuery,
  matchesTopics,
  topicCounts,
} from "@/lib/article-data";

/** Topic chips shown before the "+n more" disclosure — DS-004-BLOG § Layout. */
const VISIBLE_TOPICS = 8;

// ---------------------------------------------------------------------------
// Row — one ruled article entry
// ---------------------------------------------------------------------------

function ArticleRow({ article, hidden }: { article: ArticleMeta; hidden: boolean }) {
  return (
    <article hidden={hidden}>
      {/* One <a> wrapping the whole row: one tab stop per article, no nested
          interactive elements — DS-004-BLOG § Accessibility Notes. */}
      <a
        className="article-row grid gap-2 sm:grid-cols-[112px_1fr] sm:gap-8"
        href={`/blog/${article.id}`}
      >
        <time className="text-xs text-tertiary sm:pt-1" dateTime={article.created_at}>
          {formatDate(article.created_at)}
        </time>
        <div>
          <h3 className="article-row__title text-lg font-medium leading-snug tracking-[-0.012em]">
            {article.title}
          </h3>
          <p className="clamp-2 mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            {article.description}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {article.topics.map((topic) => (
              <Badge key={topic} className="tag">
                {topic}
              </Badge>
            ))}
            {/* Revealed on hover *and* focus-visible, so keyboard users get the
                same affordance as pointer users. */}
            <span className="article-row__arrow link-arrow ml-auto pl-4">Read</span>
          </div>
        </div>
      </a>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Lead — the newest post, at masthead size
// ---------------------------------------------------------------------------

function LeadArticle({ article, hidden }: { article: ArticleMeta; hidden: boolean }) {
  return (
    <article className="mb-4" hidden={hidden}>
      <a className="group relative block pb-10" href={`/blog/${article.id}`}>
        <p className="label-caps mb-4">Latest</p>
        {/* The only element on the page at this size, so "latest" reads as
            latest without a badge — DS-004-BLOG § Hierarchy. */}
        <h2 className="gradient-text max-w-[22ch] text-2xl font-medium leading-[1.15] tracking-[-0.022em] md:text-[2rem]">
          {article.title}
        </h2>
        <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-muted-foreground md:text-lg">
          {article.description}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          <time className="text-xs text-tertiary" dateTime={article.created_at}>
            {formatDate(article.created_at)}
          </time>
          <span className="text-tertiary" aria-hidden="true">
            ·
          </span>
          <span className="flex flex-wrap gap-2">
            {article.topics.map((topic) => (
              <Badge key={topic} className="tag">
                {topic}
              </Badge>
            ))}
          </span>
          <span className="link-arrow ml-auto">Read</span>
        </div>
      </a>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Topic filters
// ---------------------------------------------------------------------------

function TopicFilters({
  topics,
  selected,
  countFor,
  onToggle,
}: {
  /** Ordered by frequency across the whole archive, so the ordering is stable
   *  while typing — only counts and disabled state change. */
  topics: string[];
  selected: Set<string>;
  countFor: (topic: string) => number;
  onToggle: (topic: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflow = topics.length - VISIBLE_TOPICS;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filter by topic">
      {topics.map((topic, i) => {
        const count = countFor(topic);
        const active = selected.has(topic);

        return (
          <Toggle
            key={topic}
            className="topic-chip"
            pressed={active}
            onPressedChange={() => onToggle(topic)}
            // A chip that would return nothing is disabled with a visible 0
            // rather than removed: the topic vocabulary stays stable as the
            // query narrows — DS-004-BLOG § Interaction & States.
            disabled={count === 0 && !active}
            hidden={i >= VISIBLE_TOPICS && !expanded}
          >
            {topic}
            <span className="topic-chip__count tabular">{count}</span>
          </Toggle>
        );
      })}

      {overflow > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-1 h-auto p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show fewer" : `+${overflow} more`}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

export function BlogIndex({ articles }: { articles: ArticleMeta[] }) {
  const [query, setQuery] = useState("");
  const [topics, setTopics] = useState<Set<string>>(() => new Set());

  /* SPEC-002 REQ-4.3 promises no order for GET /v1/articles/list, so the page
     does not rely on one. */
  const sorted = useMemo(
    () => [...articles].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [articles],
  );

  const selectedTopics = useMemo(() => [...topics], [topics]);
  const allTopics = useMemo(() => topicCounts(sorted).map(([topic]) => topic), [sorted]);

  const visible = useMemo(
    () =>
      new Set(
        sorted
          .filter((a) => matchesQuery(a, query) && matchesTopics(a, selectedTopics))
          .map((a) => a.id),
      ),
    [sorted, query, selectedTopics],
  );

  const filtering = query.trim() !== "" || topics.size > 0;
  const lead = sorted[0];

  /* A chip's count is what that topic would leave *given the current query and
     the other selected topics*, so a chip never advertises a result count its
     click cannot deliver — DS-004-BLOG § Interaction & States. */
  const countFor = (topic: string) =>
    sorted.filter(
      (a) =>
        a.topics.includes(topic) &&
        (topics.has(topic) ||
          (matchesQuery(a, query) && matchesTopics(a, selectedTopics))),
    ).length;

  const toggleTopic = (topic: string) =>
    setTopics((prev) => {
      const next = new Set(prev);
      next.has(topic) ? next.delete(topic) : next.add(topic);
      return next;
    });

  const reset = () => {
    setQuery("");
    setTopics(new Set());
  };

  /* Zero-data state one of two: an empty archive is a legitimate 200 with an
     empty collection (SPEC-002 § 6.1.8), not an error. The controls are
     suppressed with it — there is nothing to filter. */
  if (sorted.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state__title">Nothing published yet</p>
        <p className="empty-state__body">
          Articles will appear here as they are written.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* top-16 clears the 64px header exactly, so a focused chip is never
          scrolled underneath it. */}
      <div className="sticky top-16 z-30 -mx-6 mb-8 border-b border-border bg-[hsla(220,7%,4%,0.85)] px-6 py-4 backdrop-blur-xl backdrop-saturate-150 md:-mx-8 md:px-8">
        <form role="search" onSubmit={(e) => e.preventDefault()}>
          <label className="search">
            <span className="u-visually-hidden">
              Search articles by title, topic, or keyword
            </span>
            <SearchIcon />
            <Input
              className="input"
              type="search"
              autoComplete="off"
              placeholder="Search articles by title, topic, or keyword"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="search__trailing">
              {query !== "" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-tertiary hover:text-foreground"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <ClearIcon />
                </Button>
              )}
            </span>
          </label>

          <TopicFilters
            topics={allTopics}
            selected={topics}
            countFor={countFor}
            onToggle={toggleTopic}
          />

          <div className="mt-3 flex items-baseline justify-between gap-4">
            {/* role="status": filtering announces "5 of 14 articles" rather
                than silently shortening the page. */}
            <p className="text-xs text-tertiary tabular" role="status">
              {filtering
                ? `${visible.size} of ${sorted.length} articles`
                : `${sorted.length} articles`}
            </p>
            {filtering && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={reset}
              >
                Clear filters
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* "Latest" is a claim about the whole archive; inside a result set the
          newest match is not editorially special, so the lead withdraws and its
          row rejoins the list — DS-004-BLOG § Filtering changes the shape. */}
      <LeadArticle article={lead} hidden={filtering} />

      <div hidden={visible.size === 0}>
        {sorted.map((article) => (
          <ArticleRow
            key={article.id}
            article={article}
            hidden={
              !visible.has(article.id) || (!filtering && article.id === lead.id)
            }
          />
        ))}
      </div>

      {/* Zero-data state two of two: reachable only through interaction. The
          copy names what the search actually covers, because the honest answer
          to "I searched a phrase I know is in that post" is that the index
          holds metadata only (SPEC-003 REQ-4.3). */}
      {visible.size === 0 && (
        <div className="empty-state mt-8">
          <p className="empty-state__title">No articles match that search</p>
          <p className="empty-state__body">
            This searches article titles, descriptions, and topics — not the full
            text of each post. Try a broader term, or clear the filters.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="empty-state__action"
            onClick={reset}
          >
            Clear filters
          </Button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Icons — inlined rather than pulled from lucide-react, which this project does
// not currently depend on. Swap for <Search /> and <X /> if it gains one.
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg className="search__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
