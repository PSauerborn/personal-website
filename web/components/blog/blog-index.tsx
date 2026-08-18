'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import type { ArticleListEntry } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';

/** Props accepted by {@link BlogIndex}. */
export type BlogIndexProps = {
  /** Articles to list, in the order returned by the API. */
  articles: ArticleListEntry[];
};

/**
 * matchesFilter reports whether an article survives the current filter.
 *
 * Search covers the listing metadata only — title, description, author and
 * topics — because the index never reads the content endpoint (REQ-4.2). The
 * topics are part of the keyword haystack as well as the chip filter: a reader
 * who types a topic the placeholder invites them to type gets the articles that
 * carry it, without having to find its chip first. The chip stays the exact
 * match and composes with the keyword by AND, so pressing one never widens what
 * the keyword returned. An empty query and an unset topic both match
 * everything, so the two conditions compose without a special case for "no
 * filter at all".
 *
 * @param article - the article under test.
 * @param query - the raw keyword query as typed; compared case-insensitively.
 * @param topic - the pressed topic chip, or null when none is pressed.
 * @returns true when the article matches both the keyword and the topic.
 */
export function matchesFilter(
  article: ArticleListEntry,
  query: string,
  topic: string | null,
): boolean {
  const needle = query.trim().toLowerCase();
  const haystack = [
    article.title,
    article.description,
    article.author,
    ...article.topics,
  ]
    .join(' ')
    .toLowerCase();

  return (
    (needle === '' || haystack.includes(needle)) &&
    (topic === null || article.topics.includes(topic))
  );
}

/**
 * collectTopics returns the topics of a listing, deduplicated and ordered by
 * how many articles carry them so the most useful chips come first.
 *
 * @param articles - the articles being listed.
 * @returns one entry per distinct topic with its article count.
 */
function collectTopics(
  articles: ArticleListEntry[],
): { topic: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const article of articles) {
    for (const topic of article.topics) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

/**
 * BlogIndex renders the DES-001 blog ledger with its keyword search and topic
 * chips (AC-12, AC-13).
 *
 * The listing is fetched on the server and handed down as a prop: this island
 * owns the filter state and nothing else, and it never issues a request of its
 * own. Filtering is applied by setting the `hidden` attribute on a row rather
 * than by unmounting it, so every article stays in the server-rendered payload
 * a crawler reads and hydration has nothing to reconcile — `app.css` forces
 * `[hidden] { display: none !important }` over Tailwind's preflight to make
 * that hiding stick. The visible count is announced through a `role="status"`
 * region so a filter is not a silent change of the page.
 *
 * A row carries the five listing fields — date, title, description, author and
 * topics — and nothing else: content and comments live behind endpoints this
 * component never calls (REQ-4.3). With no articles at all the search bar is
 * suppressed entirely, because a control that can only ever return nothing is
 * worse than no control.
 *
 * @param articles - articles to list, in the order returned by the API.
 * @returns the filterable ledger, or the empty state when there are none.
 */
export function BlogIndex({ articles }: BlogIndexProps) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string | null>(null);

  const topics = useMemo(() => collectTopics(articles), [articles]);
  const matches = useMemo(
    () =>
      new Set(
        articles
          .filter((article) => matchesFilter(article, query, topic))
          .map((article) => article.id),
      ),
    [articles, query, topic],
  );

  if (articles.length === 0) {
    return (
      <EmptyState
        label="Writing"
        statement="Nothing published yet"
        description="The archive is read from the API. Until an article is published here, the projects and the CV are the fuller picture."
        action={
          <Button variant="secondary" asChild>
            <Link href="/projects">See the projects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-(--space-3) border-y border-border-subtle py-4 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search articles"
          placeholder="Search articles by title, topic, or keyword"
          className="sm:max-w-105"
        />

        <div className="flex flex-wrap items-center gap-(--space-2)">
          {topics.map((entry) => (
            <Toggle
              key={entry.topic}
              pressed={topic === entry.topic}
              onPressedChange={(pressed) =>
                setTopic(pressed ? entry.topic : null)
              }
            >
              {entry.topic}
              <span data-numeric className="text-text-tertiary">
                {entry.count}
              </span>
            </Toggle>
          ))}
        </div>

        <p
          role="status"
          data-numeric
          className="text-xs text-text-tertiary sm:ml-auto"
        >
          {matches.size} of {articles.length}{' '}
          {articles.length === 1 ? 'article' : 'articles'}
        </p>
      </div>

      <div>
        {/* The rows carry a hover background and need horizontal padding inside
            it, but the ledger's text must stay aligned with the heading above.
            The list therefore bleeds 12px into the page gutter and the rows pad
            the same 12px back in: nothing moves, the hairlines stay flush with
            each other, and no label sits on the edge of its own highlight. */}
        <ul className="-mx-3 border-t border-border-subtle">
          {articles.map((article) => (
            <li
              key={article.id}
              hidden={!matches.has(article.id)}
              className="border-b border-border-subtle transition-colors hover:bg-wash"
            >
              <Link
                href={`/blog/${article.id}`}
                aria-label={article.title}
                className="group grid gap-(--space-3) px-3 py-8 sm:grid-cols-[7rem_1fr] sm:gap-8"
              >
                <time
                  className="text-xs text-text-tertiary"
                  dateTime={article.created_at}
                >
                  {formatDate(article.created_at)}
                </time>

                <div>
                  <h2 className="max-w-(--measure-heading) text-lg font-medium text-text-primary transition-colors duration-(--duration-fast) group-hover:text-accent-text">
                    {article.title}
                  </h2>
                  <p className="mt-2 max-w-(--measure-prose) text-sm leading-relaxed text-text-secondary">
                    {article.description}
                  </p>

                  <div className="mt-(--space-3) flex flex-wrap items-center gap-(--space-2)">
                    <span className="text-xs text-text-tertiary">
                      {article.author}
                    </span>
                    {article.topics.map((entry) => (
                      <Badge key={entry}>{entry}</Badge>
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {matches.size === 0 ? (
          <EmptyState
            label="Writing"
            statement="No articles match that search"
            description="Search covers article metadata only — title, description, author and topics — not the text of the articles themselves."
            className="mt-8"
          />
        ) : null}
      </div>
    </div>
  );
}
