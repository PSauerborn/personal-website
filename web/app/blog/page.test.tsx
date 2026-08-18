import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listArticles } from '@/lib/api/articles';
import type { ArticleListEntry } from '@/lib/api/types';

import BlogPage, { dynamic, metadata } from './page';

/**
 * Coverage for the `/blog` index assembly (AC-12, PC-3, PC-9, PC-15).
 *
 * The load-bearing assertion is AC-12: the index displays article metadata
 * only. It is checked from both ends — every one of the five metadata fields
 * renders for every entry, and neither article content nor comment text can
 * appear, because the page is only ever given the listing payload and never
 * reaches for the content or comment endpoints. The rest pins the empty state,
 * the exported metadata, the dynamic segment config and the absence of a client
 * boundary on the route.
 */

vi.mock('@/lib/api/articles', () => ({
  listArticles: vi.fn(),
}));

/** Listing returned by the stubbed API. */
const articles: ArticleListEntry[] = [
  {
    id: 'exactly-once',
    title: 'Exactly-once is a property of your consumer',
    description:
      'Kafka does not give you exactly-once delivery, and the transactional producer is not the feature you think it is.',
    author: 'Pascal Sauerborn',
    topics: ['Kafka', 'Distributed systems'],
    created_at: '2026-05-19T08:30:00Z',
  },
  {
    id: 'rebalance',
    title: 'Consumer groups rebalance more than you think',
    description:
      'A tour of the rebalance protocol, and the three configuration values that decide what a deploy costs you.',
    author: 'Pascal Sauerborn',
    topics: [],
    created_at: '2025-11-02T17:05:00Z',
  },
];

/** The date each fixture must show, formatted as the deterministic formatter does. */
const formattedDates: Record<string, string> = {
  'exactly-once': '19 May 2026',
  rebalance: '02 Nov 2025',
};

/** Source of the page under test, read for the boundary assertions. */
const source = readFileSync(resolve(import.meta.dirname, 'page.tsx'), 'utf8');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listArticles).mockResolvedValue(articles);
});

describe('BlogPage', () => {
  it('renders every metadata field of every listed article', async () => {
    const { container } = render(await BlogPage());

    for (const article of articles) {
      // Scoped to the row rather than the document, because the filter chips
      // repeat every topic outside the listing; the assertion is that each
      // field is present in the row itself.
      const row = container
        .querySelector(`a[href="/blog/${article.id}"]`)
        ?.closest('li');
      expect(row).toBeInstanceOf(HTMLElement);

      const fields = within(row as HTMLElement);
      expect(
        fields.getByRole('heading', { name: article.title }),
      ).toBeInTheDocument();
      expect(fields.getByText(article.description)).toBeInTheDocument();
      expect(fields.getByText(article.author)).toBeInTheDocument();
      expect(fields.getByText(formattedDates[article.id])).toBeInTheDocument();
      expect(
        [...(row as HTMLElement).querySelectorAll('[data-slot="badge"]')].map(
          (badge) => badge.textContent,
        ),
      ).toEqual(article.topics);
    }
  });

  it('links each row to the article it lists', async () => {
    const { container } = render(await BlogPage());

    const links = [...container.querySelectorAll('a[href^="/blog/"]')];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/blog/exactly-once',
      '/blog/rebalance',
    ]);
  });

  it('reads the listing alone, so no content or comment text can render', async () => {
    const { container } = render(await BlogPage());

    expect(listArticles).toHaveBeenCalledTimes(1);
    expect(source).not.toContain('getArticleContent');
    expect(source).not.toContain('listComments');
    expect(container.textContent).not.toContain('comment');
    expect(container.textContent).not.toContain('Comment');
  });

  it('renders the designed empty state for an empty listing', async () => {
    vi.mocked(listArticles).mockResolvedValue([]);

    const { container } = render(await BlogPage());

    expect(container.querySelector('[data-slot="empty-state"]')).not.toBeNull();
    expect(container.querySelectorAll('a[href^="/blog/"]')).toHaveLength(0);
  });

  it('propagates a failure of the listing to the error boundary', async () => {
    vi.mocked(listArticles).mockRejectedValue(new Error('listing unavailable'));

    await expect(BlogPage()).rejects.toThrow('listing unavailable');
  });

  it('declares the route dynamic so the build never prerenders it', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('exports metadata carrying a title and a description', () => {
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
  });

  it('declares no client boundary', () => {
    // Assembled rather than written out so this assertion does not match its
    // own source.
    expect(new RegExp(`(['"])use ${'client'}\\1`).test(source)).toBe(false);
  });
});
