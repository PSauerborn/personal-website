import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BlogIndex } from '@/components/blog/blog-index';
import type { ArticleListEntry } from '@/lib/api/types';

/**
 * Behavioural coverage for the blog index island (AC-13).
 *
 * The assertions follow the filtering contract of DES-001: a filtered-out
 * article is hidden with the `hidden` attribute and stays in the DOM, so the
 * server-rendered payload a crawler reads is never reduced by an interaction;
 * keyword and topic filters combine; the `role="status"` counter reports the
 * visible count; and both zero-data views render their designed empty state.
 */

const articles: ArticleListEntry[] = [
  {
    id: '9f6a1c30-0a41-4a2e-9a71-2f4a1c3e0001',
    title: 'Exactly-once is a property of your consumer',
    description:
      'Kafka does not give you exactly-once delivery, and the transactional producer is not the feature you think it is.',
    author: 'Pascal Sauerborn',
    topics: ['Kafka', 'Distributed systems'],
    created_at: '2026-05-19T09:00:00Z',
  },
  {
    id: '9f6a1c30-0a41-4a2e-9a71-2f4a1c3e0002',
    title: 'Skip scans and the index you already have',
    description:
      'A tour of the planner decisions that decide whether a composite index is used at all.',
    author: 'Pascal Sauerborn',
    topics: ['PostgreSQL'],
    created_at: '2025-11-02T09:00:00Z',
  },
  {
    id: '9f6a1c30-0a41-4a2e-9a71-2f4a1c3e0003',
    title: 'Rebalances cost more than you think',
    description:
      'The three configuration values that decide whether a deploy costs four seconds or four minutes of lag.',
    author: 'Ada Lovelace',
    topics: ['Kafka', 'Operations'],
    created_at: '2025-06-14T09:00:00Z',
  },
];

/**
 * row returns the list row carrying the given article title.
 *
 * Queries go through the title text rather than through a role, because a
 * filtered-out row is deliberately removed from the accessibility tree while
 * remaining in the DOM.
 *
 * @param title - title of the article whose row is wanted.
 * @returns the `<li>` element of the row.
 */
function row(title: string): HTMLElement {
  const heading = screen.getByText(title);
  const element = heading.closest('li');

  if (element === null) {
    throw new Error(`no row rendered for article "${title}"`);
  }

  return element;
}

/**
 * search returns the keyword search field of the index.
 *
 * @returns the search input element.
 */
function search(): HTMLElement {
  return screen.getByRole('searchbox');
}

describe('BlogIndex', () => {
  it('renders every article before any filter is applied', () => {
    render(<BlogIndex articles={articles} />);

    for (const article of articles) {
      expect(row(article.title)).not.toHaveAttribute('hidden');
    }
  });

  it('hides rows that do not match the keyword without unmounting them', () => {
    render(<BlogIndex articles={articles} />);

    fireEvent.change(search(), { target: { value: 'skip scans' } });

    expect(row(articles[1].title)).not.toHaveAttribute('hidden');
    expect(row(articles[0].title)).toHaveAttribute('hidden');
    expect(row(articles[2].title)).toHaveAttribute('hidden');
  });

  it('matches the keyword against the description and the author', () => {
    render(<BlogIndex articles={articles} />);

    fireEvent.change(search(), { target: { value: 'planner' } });
    expect(row(articles[1].title)).not.toHaveAttribute('hidden');
    expect(row(articles[0].title)).toHaveAttribute('hidden');

    fireEvent.change(search(), { target: { value: 'ada lovelace' } });
    expect(row(articles[2].title)).not.toHaveAttribute('hidden');
    expect(row(articles[1].title)).toHaveAttribute('hidden');
  });

  it('matches the keyword against a topic carried by no other field', () => {
    render(<BlogIndex articles={articles} />);

    // "PostgreSQL" is a topic of the second article and appears in none of its
    // other fields, so this is the case the search placeholder promises and the
    // one a title/description/author haystack silently drops.
    fireEvent.change(search(), { target: { value: 'postgresql' } });

    expect(row(articles[1].title)).not.toHaveAttribute('hidden');
    expect(row(articles[0].title)).toHaveAttribute('hidden');
    expect(row(articles[2].title)).toHaveAttribute('hidden');
  });

  it('filters by topic when a chip is pressed', () => {
    render(<BlogIndex articles={articles} />);

    const chip = screen.getByRole('button', { name: /Kafka/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(row(articles[0].title)).not.toHaveAttribute('hidden');
    expect(row(articles[2].title)).not.toHaveAttribute('hidden');
    expect(row(articles[1].title)).toHaveAttribute('hidden');
  });

  it('combines the keyword and the topic filter', () => {
    render(<BlogIndex articles={articles} />);

    fireEvent.click(screen.getByRole('button', { name: /Kafka/ }));
    fireEvent.change(search(), { target: { value: 'rebalances' } });

    expect(row(articles[2].title)).not.toHaveAttribute('hidden');
    expect(row(articles[0].title)).toHaveAttribute('hidden');
    expect(row(articles[1].title)).toHaveAttribute('hidden');
  });

  it('still ANDs a topic keyword with the pressed chip', () => {
    render(<BlogIndex articles={articles} />);

    fireEvent.click(screen.getByRole('button', { name: /Kafka/ }));
    fireEvent.change(search(), { target: { value: 'postgresql' } });

    for (const article of articles) {
      expect(row(article.title)).toHaveAttribute('hidden');
    }
  });

  it('reports the visible count in a status region', () => {
    render(<BlogIndex articles={articles} />);

    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 articles');

    fireEvent.click(screen.getByRole('button', { name: /Kafka/ }));

    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 articles');
  });

  it('renders the zero-match empty state when nothing matches', () => {
    render(<BlogIndex articles={articles} />);

    fireEvent.change(search(), { target: { value: 'kubernetes' } });

    expect(
      screen.getByRole('heading', { name: 'No articles match that search' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/metadata/i)).toBeInTheDocument();

    for (const article of articles) {
      expect(row(article.title)).toHaveAttribute('hidden');
    }
  });

  it('keeps the search bar and drops the empty state once a match returns', () => {
    render(<BlogIndex articles={articles} />);

    fireEvent.change(search(), { target: { value: 'kubernetes' } });
    fireEvent.change(search(), { target: { value: 'kafka' } });

    expect(
      screen.queryByRole('heading', { name: 'No articles match that search' }),
    ).not.toBeInTheDocument();
    expect(row(articles[0].title)).not.toHaveAttribute('hidden');
  });

  it('renders the zero-article empty state and no search bar', () => {
    render(<BlogIndex articles={[]} />);

    expect(
      screen.getByRole('heading', { name: 'Nothing published yet' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders only the listing metadata of an article', () => {
    render(<BlogIndex articles={articles} />);

    const link = screen.getByRole('link', { name: articles[0].title });

    expect(link).toHaveAttribute('href', `/blog/${articles[0].id}`);
    expect(link).toHaveTextContent(articles[0].description);
    expect(link).toHaveTextContent(articles[0].author);
    expect(link.querySelector('time')).toHaveAttribute(
      'dateTime',
      articles[0].created_at,
    );
  });
});
