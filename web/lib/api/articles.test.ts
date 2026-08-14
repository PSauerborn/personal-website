import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  ApiNotFoundError,
  fetchJson as fetchJsonImpl,
  fetchText as fetchTextImpl,
} from './client';
import {
  getArticleContent,
  getArticleSummary,
  listArticles,
  listComments,
  postComment,
} from './articles';
import type { ArticleComment, ArticleListEntry } from './types';

// The resource module is exercised against a stubbed transport: the readers are
// replaced while the error types are kept, so a test can assert both which
// reader was used and which failure was raised.
vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    fetchJson: vi.fn(),
    fetchText: vi.fn(),
  };
});

const fetchJson = vi.mocked(fetchJsonImpl);
const fetchText = vi.mocked(fetchTextImpl);

/**
 * articleEntry builds an article listing entry, overriding only the fields a
 * test cares about.
 *
 * @param overrides - fields replacing the defaults of the entry.
 * @returns a complete `ArticleListEntry`.
 */
function articleEntry(
  overrides: Partial<ArticleListEntry> = {},
): ArticleListEntry {
  return {
    id: 'article-1',
    title: 'On idempotency',
    description: 'Why retries are safe',
    author: 'Pascal Sauerborn',
    topics: ['distributed-systems'],
    created_at: '2026-01-04T09:00:00Z',
    ...overrides,
  };
}

/**
 * comment builds an article comment, overriding only the fields a test cares
 * about.
 *
 * @param overrides - fields replacing the defaults of the comment.
 * @returns a complete `ArticleComment`.
 */
function comment(overrides: Partial<ArticleComment> = {}): ArticleComment {
  return {
    author: 'Ada Lovelace',
    comment: 'Good read.',
    created_at: '2026-01-05T09:00:00Z',
    ...overrides,
  };
}

/**
 * rejectionOf captures the value a promise rejects with, so a test can assert
 * on the failure itself rather than only on its type.
 *
 * @param promise - promise expected to reject.
 * @returns the rejection value.
 */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('promise resolved but a rejection was expected');
    },
    (caught: unknown) => caught,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('listArticles', () => {
  it('requests the article listing and returns its articles', async () => {
    const entry = articleEntry();
    fetchJson.mockResolvedValue({ articles: [entry] });

    await expect(listArticles()).resolves.toEqual([entry]);
    expect(fetchJson).toHaveBeenCalledWith('/v1/articles/list');
  });

  it('returns an empty listing as an empty array', async () => {
    fetchJson.mockResolvedValue({ articles: [] });

    await expect(listArticles()).resolves.toEqual([]);
  });

  it('parses an article without topics', async () => {
    fetchJson.mockResolvedValue({ articles: [articleEntry({ topics: [] })] });

    const articles = await listArticles();

    expect(articles[0].topics).toEqual([]);
  });

  it('propagates a failure of the listing', async () => {
    fetchJson.mockRejectedValue(new ApiError('boom', { status: 500 }));

    await expect(listArticles()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('getArticleSummary', () => {
  it('resolves the article with the requested id from the listing', async () => {
    const wanted = articleEntry({ id: 'article-2', title: 'On backpressure' });
    fetchJson.mockResolvedValue({ articles: [articleEntry(), wanted] });

    await expect(getArticleSummary('article-2')).resolves.toEqual(wanted);
  });

  it('raises the distinct 404 signal for an id absent from the listing', async () => {
    fetchJson.mockResolvedValue({ articles: [articleEntry()] });

    await expect(getArticleSummary('missing')).rejects.toBeInstanceOf(
      ApiNotFoundError,
    );
  });

  it('raises the distinct 404 signal when the listing is empty', async () => {
    fetchJson.mockResolvedValue({ articles: [] });

    await expect(getArticleSummary('article-1')).rejects.toBeInstanceOf(
      ApiNotFoundError,
    );
  });

  it('surfaces a failing listing as a generic failure, not as a 404', async () => {
    fetchJson.mockRejectedValue(
      new ApiError('listing failed', { status: 500 }),
    );

    const error = await rejectionOf(getArticleSummary('article-1'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ApiNotFoundError);
  });
});

describe('getArticleContent', () => {
  it('reads the content endpoint with the text reader only', async () => {
    fetchText.mockResolvedValue('# On idempotency\n');

    await expect(getArticleContent('article-1')).resolves.toBe(
      '# On idempotency\n',
    );
    expect(fetchText).toHaveBeenCalledWith('/v1/articles/article-1/content');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('encodes the article id into the path', async () => {
    fetchText.mockResolvedValue('');

    await getArticleContent('a/b c');

    expect(fetchText).toHaveBeenCalledWith('/v1/articles/a%2Fb%20c/content');
  });

  it('propagates the distinct 404 signal', async () => {
    fetchText.mockRejectedValue(new ApiNotFoundError('missing'));

    await expect(getArticleContent('article-1')).rejects.toBeInstanceOf(
      ApiNotFoundError,
    );
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe('listComments', () => {
  it('returns the comments in the order served by the API', async () => {
    const oldest = comment({ created_at: '2026-01-05T09:00:00Z' });
    const middle = comment({ created_at: '2026-01-07T09:00:00Z' });
    const newest = comment({ created_at: '2026-01-09T09:00:00Z' });
    fetchJson.mockResolvedValue({
      article_id: 'article-1',
      comments: [oldest, middle, newest],
    });

    await expect(listComments('article-1')).resolves.toEqual([
      oldest,
      middle,
      newest,
    ]);
    expect(fetchJson).toHaveBeenCalledWith('/v1/articles/article-1/comments');
  });

  it('does not re-sort comments served out of chronological order', async () => {
    const first = comment({ created_at: '2026-01-09T09:00:00Z' });
    const second = comment({ created_at: '2026-01-05T09:00:00Z' });
    fetchJson.mockResolvedValue({
      article_id: 'article-1',
      comments: [first, second],
    });

    const comments = await listComments('article-1');

    expect(comments.map((entry) => entry.created_at)).toEqual([
      '2026-01-09T09:00:00Z',
      '2026-01-05T09:00:00Z',
    ]);
  });

  it('returns an article without comments as an empty array', async () => {
    fetchJson.mockResolvedValue({ article_id: 'article-1', comments: [] });

    await expect(listComments('article-1')).resolves.toEqual([]);
  });

  it('parses an anonymous comment with a null author', async () => {
    fetchJson.mockResolvedValue({
      article_id: 'article-1',
      comments: [comment({ author: null })],
    });

    const comments = await listComments('article-1');

    expect(comments[0].author).toBeNull();
  });

  it('propagates the distinct 404 signal', async () => {
    fetchJson.mockRejectedValue(new ApiNotFoundError('missing'));

    await expect(listComments('missing')).rejects.toBeInstanceOf(
      ApiNotFoundError,
    );
  });
});

describe('postComment', () => {
  it('posts the comment to the singular comment path and returns its id', async () => {
    fetchJson.mockResolvedValue({ comment_id: 'comment-1' });

    await expect(
      postComment('article-1', { author: 'Ada', comment: 'Good read.' }),
    ).resolves.toEqual({ comment_id: 'comment-1' });
    expect(fetchJson).toHaveBeenCalledWith('/v1/articles/article-1/comment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ author: 'Ada', comment: 'Good read.' }),
    });
  });

  it('posts a comment without an author', async () => {
    fetchJson.mockResolvedValue({ comment_id: 'comment-2' });

    await postComment('article-1', { comment: 'Anonymous note.' });

    expect(fetchJson).toHaveBeenCalledWith(
      '/v1/articles/article-1/comment',
      expect.objectContaining({
        body: JSON.stringify({ comment: 'Anonymous note.' }),
      }),
    );
  });

  it('surfaces a rejected submission to the caller', async () => {
    fetchJson.mockRejectedValue(
      new ApiError('bad request', {
        status: 400,
        details: 'comment: must not be empty',
      }),
    );

    const error = await rejectionOf(postComment('article-1', { comment: '' }));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).details).toBe('comment: must not be empty');
  });
});
