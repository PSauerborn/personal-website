import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getArticleContent,
  getArticleSummary,
  listComments,
} from '@/lib/api/articles';
import { ApiError, ApiNotFoundError } from '@/lib/api/client';
import type { ArticleListEntry } from '@/lib/api/types';

import ArticlePage, { dynamic, generateMetadata } from './page';

/**
 * Coverage for the `/blog/[article_id]` segment (AC-14, AC-17, PC-3, PC-8,
 * PC-9, PC-17).
 *
 * The load-bearing assertions are the two branches of RISK-021: the distinct
 * 404 signal of the API client — an identifier absent from the listing, or a
 * 404 from the content endpoint — is the *only* failure that reaches
 * `notFound()`, and every other failure (5xx, network, timeout) leaves the
 * segment as a rejection so the error boundary renders its retry affordance
 * where retrying can actually help. Both directions are checked, because either
 * mistake hands the reader a dead end dressed as the other condition.
 */

// The comments island mounted on this page reads the article module too, so its
// two entry points are stubbed alongside the server-side ones; the island is
// covered by its own suite, and here it only has to mount without reaching the
// network.
vi.mock('@/lib/api/articles', () => ({
  getArticleSummary: vi.fn(),
  getArticleContent: vi.fn(),
  listComments: vi.fn(),
  postComment: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  // `notFound()` terminates rendering by throwing; the stub keeps that control
  // flow so a page that carried on afterwards could not pass.
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
}));

/** Listing entry returned by the stubbed API for the happy path. */
const article: ArticleListEntry = {
  id: 'exactly-once',
  title: 'Exactly-once is a property of your consumer',
  description:
    'Kafka does not give you exactly-once delivery, and the transactional producer is not the feature you think it is.',
  author: 'Pascal Sauerborn',
  topics: ['Kafka', 'Distributed systems'],
  created_at: '2026-05-19T08:30:00Z',
};

/** Markdown body returned by the stubbed content endpoint. */
const markdown = [
  '## The delivery guarantee is yours',
  '',
  'The broker only promises to hand the record over more than once.',
].join('\n');

/** Source of the page under test, read for the boundary assertions. */
const source = readFileSync(resolve(import.meta.dirname, 'page.tsx'), 'utf8');

/**
 * routeParams builds the `params` prop of the segment, which Next.js supplies
 * as a promise.
 *
 * @param articleId - identifier captured from the URL.
 * @returns the props accepted by the page and by `generateMetadata`.
 */
function routeParams(articleId: string) {
  return { params: Promise.resolve({ article_id: articleId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getArticleSummary).mockResolvedValue(article);
  vi.mocked(getArticleContent).mockResolvedValue(markdown);
  vi.mocked(listComments).mockResolvedValue([]);
});

describe('ArticlePage', () => {
  it('renders the listing metadata and the article content', async () => {
    render(await ArticlePage(routeParams(article.id)));

    expect(
      screen.getByRole('heading', { level: 1, name: article.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(article.description)).toBeInTheDocument();
    expect(screen.getByText(article.author)).toBeInTheDocument();
    expect(screen.getByText('19 May 2026')).toBeInTheDocument();
    for (const topic of article.topics) {
      expect(screen.getByText(topic)).toBeInTheDocument();
    }

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'The delivery guarantee is yours',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The broker only promises to hand the record over more than once.',
      ),
    ).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('reads both resources for the requested identifier exactly once', async () => {
    render(await ArticlePage(routeParams(article.id)));

    expect(getArticleSummary).toHaveBeenCalledExactlyOnceWith(article.id);
    expect(getArticleContent).toHaveBeenCalledExactlyOnceWith(article.id);
  });

  it('renders not-found when the identifier is absent from the listing', async () => {
    vi.mocked(getArticleSummary).mockRejectedValue(
      new ApiNotFoundError('article nope is not present in /v1/articles/list'),
    );

    await expect(ArticlePage(routeParams('nope'))).rejects.toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('renders not-found when the content endpoint answers 404', async () => {
    vi.mocked(getArticleContent).mockRejectedValue(
      new ApiNotFoundError(
        'GET /v1/articles/exactly-once/content returned 404',
      ),
    );

    await expect(ArticlePage(routeParams(article.id))).rejects.toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('propagates a listing failure to the error boundary', async () => {
    vi.mocked(getArticleSummary).mockRejectedValue(
      new ApiError('request to /v1/articles/list failed with status 500', {
        status: 500,
      }),
    );

    await expect(ArticlePage(routeParams(article.id))).rejects.toThrow(
      'failed with status 500',
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it('propagates a content failure to the error boundary', async () => {
    vi.mocked(getArticleContent).mockRejectedValue(
      new ApiError(
        'request to /v1/articles/exactly-once/content could not be completed',
      ),
    );

    await expect(ArticlePage(routeParams(article.id))).rejects.toThrow(
      'could not be completed',
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it('declares the route dynamic so the build never prerenders it', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('declares no client boundary and reads content through the text reader', () => {
    // Assembled rather than written out so this assertion does not match its
    // own source.
    expect(new RegExp(`(['"])use ${'client'}\\1`).test(source)).toBe(false);
    expect(source).toContain('getArticleContent');
    expect(source).not.toContain('fetchJson');
    expect(source).not.toContain('.json()');
  });
});

describe('generateMetadata', () => {
  it('derives the title and description from the listing entry', async () => {
    const metadata = await generateMetadata(routeParams(article.id));

    expect(metadata.title).toBe(article.title);
    expect(metadata.description).toBe(article.description);
  });

  it('resolves without a generic failure for an unresolvable identifier', async () => {
    vi.mocked(getArticleSummary).mockRejectedValue(
      new ApiNotFoundError('article nope is not present in /v1/articles/list'),
    );

    const metadata = await generateMetadata(routeParams('nope'));

    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
  });

  it('propagates a listing failure rather than treating it as a missing article', async () => {
    vi.mocked(getArticleSummary).mockRejectedValue(
      new ApiError('request to /v1/articles/list failed with status 500', {
        status: 500,
      }),
    );

    await expect(generateMetadata(routeParams(article.id))).rejects.toThrow(
      'failed with status 500',
    );
    expect(notFound).not.toHaveBeenCalled();
  });
});
