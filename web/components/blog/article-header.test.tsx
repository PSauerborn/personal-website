import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ArticleHeader } from '@/components/blog/article-header';
import type { ArticleSummary } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';

/**
 * Coverage for the DES-001 article page header.
 *
 * The header is metadata-only: the page derives an `ArticleSummary` from
 * `GET /v1/articles/list` and hands it over, so these tests assert the rendered
 * content rather than any fetching. The date assertions are the sharp edge —
 * the visible text must come from the deterministic formatter (so a server
 * render and its hydration agree regardless of `TZ`) while the machine-readable
 * `dateTime` must stay the untouched ISO value from the API.
 */

/** Resolved against the vitest root, which is the `web/` directory. */
const SOURCE_PATH = resolve(
  process.cwd(),
  'components/blog/article-header.tsx',
);

/** Representative article used by every test in this file. */
const article: ArticleSummary = {
  id: 'e2f0c6a4-6f0d-4f6f-9a7f-2b6f5c1d8e30',
  title: 'Exactly-once is a property of your consumer',
  description:
    'Kafka does not give you exactly-once delivery, and the transactional producer is not the feature you think it is.',
  author: 'Pascal Sauerborn',
  topics: ['Kafka', 'Distributed systems'],
  created_at: '2026-05-19T08:30:00Z',
};

describe('ArticleHeader', () => {
  it('renders the title as the page heading', () => {
    render(<ArticleHeader article={article} />);

    expect(
      screen.getByRole('heading', { level: 1, name: article.title }),
    ).toBeInTheDocument();
  });

  it('renders the description as the standfirst', () => {
    render(<ArticleHeader article={article} />);

    expect(screen.getByText(article.description)).toBeInTheDocument();
  });

  it('renders the author byline', () => {
    render(<ArticleHeader article={article} />);

    expect(screen.getByText(article.author)).toBeInTheDocument();
  });

  it('renders every topic of the article', () => {
    render(<ArticleHeader article={article} />);

    for (const topic of article.topics) {
      expect(screen.getByText(topic)).toBeInTheDocument();
    }
  });

  it('renders no topics when the article has none', () => {
    render(<ArticleHeader article={{ ...article, topics: [] }} />);

    expect(screen.queryByText('Kafka')).not.toBeInTheDocument();
  });

  it('renders the date as a time element carrying the raw ISO value', () => {
    const { container } = render(<ArticleHeader article={article} />);

    const time = container.querySelector('time');

    expect(time).not.toBeNull();
    expect(time).toHaveAttribute('dateTime', article.created_at);
    expect(time).toHaveTextContent('19 May 2026');
    expect(time?.textContent).toBe(formatDate(article.created_at));
  });

  it('formats the date identically regardless of the ambient timezone', () => {
    const original = process.env.TZ;

    process.env.TZ = 'Pacific/Kiritimati';
    const { container } = render(<ArticleHeader article={article} />);
    process.env.TZ = original;

    expect(container.querySelector('time')?.textContent).toBe('19 May 2026');
  });

  it('is a server component that performs no fetching', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).not.toMatch(/['"]use client['"]/);
    expect(source).not.toMatch(/\bfetch\(/);
  });
});
