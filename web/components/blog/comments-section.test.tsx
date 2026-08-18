import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CommentsSection,
  MAX_COMMENT_LENGTH,
  validateComment,
} from '@/components/blog/comments-section';
import { listComments, postComment } from '@/lib/api/articles';
import { ApiError } from '@/lib/api/client';
import type { ArticleComment } from '@/lib/api/types';

/**
 * Behavioural coverage for the comments island (AC-15, AC-16, PC-7, RISK-004,
 * RISK-016).
 *
 * The articles module is stubbed, so these tests describe the island's own
 * contract rather than the transport: comments are rendered in the order the
 * API returned them, a null author becomes an italic "Anonymous", and — the
 * assertion that matters most — a comment body is inert. Bodies arrive through
 * an unauthenticated POST, so the fixture below carries a script payload and
 * the test proves it reaches the reader as visible literal text with no live
 * node in the document.
 */

vi.mock('@/lib/api/articles', () => ({
  listComments: vi.fn(),
  postComment: vi.fn(),
}));

/** Identifier of the article under test. */
const ARTICLE_ID = '9f6a1c30-0a41-4a2e-9a71-2f4a1c3e0001';

/** A script payload, as an attacker would submit it through the public POST. */
const SCRIPT_PAYLOAD = '<script>alert(1)</script> and <img src=x onerror=1>';

const comments: ArticleComment[] = [
  {
    author: 'Marta Ó Conaill',
    comment: 'The transactional-offset pattern is right, but only same-store.',
    created_at: '2026-05-20T09:00:00Z',
  },
  {
    author: null,
    comment: 'We spent a quarter on this.',
    created_at: '2026-05-22T11:30:00Z',
  },
  {
    author: 'Tom Petrov',
    comment: 'Is the repartitioning script public anywhere?',
    created_at: '2026-06-01T08:15:00Z',
  },
];

/**
 * bodies returns the rendered text of every comment body, in document order.
 *
 * @returns the body text of each rendered comment entry.
 */
function bodies(): string[] {
  return screen
    .getAllByTestId('comment-body')
    .map((element) => element.textContent ?? '');
}

/**
 * composer returns the two controls and the submit button of the composer.
 *
 * @returns the name input, the comment textarea and the submit button.
 */
function composer(): {
  name: HTMLInputElement;
  comment: HTMLTextAreaElement;
  submit: HTMLButtonElement;
} {
  return {
    name: screen.getByLabelText(/^Name/) as HTMLInputElement,
    comment: screen.getByLabelText('Comment') as HTMLTextAreaElement,
    submit: screen.getByRole('button', {
      name: /post comment/i,
    }) as HTMLButtonElement,
  };
}

/**
 * commentCount returns the count rendered beside the heading, if any.
 *
 * @returns the text of the count, or null when no count is shown.
 */
function commentCount(): string | null {
  const heading = screen.getByRole('heading', { name: 'Comments' });

  return (
    heading.parentElement?.querySelector('[data-numeric]')?.textContent ?? null
  );
}

beforeEach(() => {
  vi.mocked(listComments).mockReset();
  vi.mocked(postComment).mockReset();
  vi.mocked(listComments).mockResolvedValue(comments);
  vi.mocked(postComment).mockResolvedValue({ comment_id: 'c-1' });
});

describe('validateComment', () => {
  it('rejects a body that is empty once trimmed', () => {
    expect(validateComment('   \n  ')).not.toBeNull();
  });

  it('rejects a body longer than the maximum length', () => {
    expect(validateComment('x'.repeat(MAX_COMMENT_LENGTH + 1))).not.toBeNull();
  });

  it('accepts a body with content within the maximum length', () => {
    expect(validateComment('  a real comment  ')).toBeNull();
  });
});

describe('CommentsSection', () => {
  it('fetches the comments of the article from the browser on mount', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);

    await screen.findByText(comments[0].comment);
    expect(listComments).toHaveBeenCalledWith(ARTICLE_ID);
  });

  it('renders the comments in the order the API returned them', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);

    await screen.findByText(comments[0].comment);
    expect(bodies()).toEqual(comments.map((comment) => comment.comment));
  });

  it('renders the author and the raw ISO date of each comment', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);

    expect(await screen.findByText('Marta Ó Conaill')).toBeInTheDocument();

    const date = screen.getByText('20 May 2026');
    expect(date.tagName).toBe('TIME');
    expect(date).toHaveAttribute('datetime', '2026-05-20T09:00:00Z');
  });

  it('renders a null author as an italic Anonymous byline', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);

    const anonymous = await screen.findByText('Anonymous');
    expect(anonymous).toHaveClass('italic');
  });

  it('renders a script-bearing comment body as inert literal text', async () => {
    vi.mocked(listComments).mockResolvedValue([
      {
        author: 'Mallory',
        comment: SCRIPT_PAYLOAD,
        created_at: '2026-06-02T00:00:00Z',
      },
    ]);

    const { container } = render(<CommentsSection articleId={ARTICLE_ID} />);

    const body = await screen.findByText(SCRIPT_PAYLOAD);
    expect(body).toBeVisible();
    expect(body).toHaveTextContent(SCRIPT_PAYLOAD);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('preserves the whitespace of a comment body without pre-formatting it', async () => {
    vi.mocked(listComments).mockResolvedValue([
      {
        author: null,
        comment: 'line one\nline two',
        created_at: '2026-06-02T00:00:00Z',
      },
    ]);

    render(<CommentsSection articleId={ARTICLE_ID} />);

    const body = await screen.findByTestId('comment-body');
    expect(body).toHaveClass('whitespace-pre-wrap');
  });

  it('renders the designed empty state when the article has no comments', async () => {
    vi.mocked(listComments).mockResolvedValue([]);

    render(<CommentsSection articleId={ARTICLE_ID} />);

    expect(
      await screen.findByText('Be the first to respond'),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId('comment-body')).toHaveLength(0);
  });

  it('reports a failed load without hiding the composer', async () => {
    vi.mocked(listComments).mockRejectedValue(
      new ApiError('boom', { status: 503 }),
    );

    render(<CommentsSection articleId={ARTICLE_ID} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(composer().submit).toBeInTheDocument();
  });

  it('drops the load-failure notice once a submission is accepted', async () => {
    vi.mocked(listComments).mockRejectedValue(
      new ApiError('boom', { status: 503 }),
    );

    render(<CommentsSection articleId={ARTICLE_ID} />);
    await screen.findByRole('alert');

    const { comment, submit } = composer();
    fireEvent.change(comment, { target: { value: 'Posted anyway.' } });
    fireEvent.click(submit);

    await screen.findByText('Posted anyway.');

    // The thread the reader is now looking at is accurate for what it claims to
    // show, so the standing alert would contradict the visible list.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(bodies()).toEqual(['Posted anyway.']);
    // The load failed, so the thread is this session's posts and not the
    // article's: an article with twenty comments must not be reported as
    // having one. No number at all is the only honest answer.
    expect(commentCount()).toBeNull();
  });

  it('shows the comment count when the thread was loaded in full', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);
    await screen.findByText(comments[0].comment);

    expect(commentCount()).toBe(String(comments.length));

    const { comment, submit } = composer();
    fireEvent.change(comment, { target: { value: 'One more.' } });
    fireEvent.click(submit);

    await screen.findByText('One more.');
    expect(commentCount()).toBe(String(comments.length + 1));
  });

  it('blocks an empty comment client-side and never posts it', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);
    await screen.findByText(comments[0].comment);

    const { comment, submit } = composer();
    fireEvent.change(comment, { target: { value: '   ' } });
    fireEvent.click(submit);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(postComment).not.toHaveBeenCalled();
  });

  it('appends the accepted comment and clears the composer on success', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);
    await screen.findByText(comments[0].comment);

    const { name, comment, submit } = composer();
    fireEvent.change(name, { target: { value: '  Ada Lovelace  ' } });
    fireEvent.change(comment, { target: { value: '  A new response.  ' } });
    fireEvent.click(submit);

    await screen.findByText('A new response.');

    expect(postComment).toHaveBeenCalledWith(ARTICLE_ID, {
      author: 'Ada Lovelace',
      comment: 'A new response.',
    });
    expect(bodies()).toEqual([
      ...comments.map((entry) => entry.comment),
      'A new response.',
    ]);
    expect(name.value).toBe('');
    expect(comment.value).toBe('');
  });

  it('posts a comment with no name anonymously', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);
    await screen.findByText(comments[0].comment);

    const { comment, submit } = composer();
    fireEvent.change(comment, { target: { value: 'Unsigned.' } });
    fireEvent.click(submit);

    await screen.findByText('Unsigned.');
    expect(postComment).toHaveBeenCalledWith(ARTICLE_ID, {
      comment: 'Unsigned.',
    });
    expect(screen.getAllByText('Anonymous').length).toBeGreaterThan(1);
  });

  it('renders a rejected submission inline and preserves the entered input', async () => {
    vi.mocked(postComment).mockRejectedValue(
      new ApiError('rejected', {
        status: 400,
        details: 'comment: must not be empty',
      }),
    );

    render(<CommentsSection articleId={ARTICLE_ID} />);
    await screen.findByText(comments[0].comment);

    const { name, comment, submit } = composer();
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } });
    fireEvent.change(comment, { target: { value: 'A rejected response.' } });
    fireEvent.click(submit);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/comment: must not be empty/);
    expect(name.value).toBe('Ada Lovelace');
    expect(comment.value).toBe('A rejected response.');
    expect(bodies()).toEqual(comments.map((entry) => entry.comment));
  });

  it('disables the submit button while a submission is in flight', async () => {
    let release: (value: { comment_id: string }) => void = () => {};
    vi.mocked(postComment).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    render(<CommentsSection articleId={ARTICLE_ID} />);
    await screen.findByText(comments[0].comment);

    const { comment, submit } = composer();
    fireEvent.change(comment, { target: { value: 'In flight.' } });
    fireEvent.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());

    fireEvent.click(submit);
    expect(postComment).toHaveBeenCalledTimes(1);

    release({ comment_id: 'c-2' });
    await screen.findByText('In flight.');
    expect(submit).not.toBeDisabled();
  });

  it('caps the comment length at the maximum the API accepts', async () => {
    render(<CommentsSection articleId={ARTICLE_ID} />);
    await screen.findByText(comments[0].comment);

    expect(composer().comment).toHaveAttribute(
      'maxLength',
      String(MAX_COMMENT_LENGTH),
    );
  });
});
