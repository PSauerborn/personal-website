'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { listComments, postComment } from '@/lib/api/articles';
import { ApiError } from '@/lib/api/client';
import type { ArticleComment } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';

/**
 * Longest comment the composer will submit.
 *
 * The limit is enforced twice on purpose — as the `maxLength` of the control so
 * the reader is stopped while typing, and in `validateComment` so a value that
 * arrived some other way is still rejected before a request is made. It is an
 * abuse control (RISK-016), not a formatting rule: the endpoint is
 * unauthenticated, so the client refuses to be the thing that sends a megabyte.
 */
export const MAX_COMMENT_LENGTH = 2000;

/** Longest author name the composer will submit. */
export const MAX_AUTHOR_LENGTH = 80;

/** Byline rendered in place of a comment whose author is null. */
const ANONYMOUS = 'Anonymous';

/** Number of placeholder rows rendered while the comments are loading. */
const SKELETON_ROWS = [0, 1, 2];

/** Props accepted by {@link CommentsSection}. */
export type CommentsSectionProps = {
  /** Identifier of the article whose comments are listed and appended to. */
  articleId: string;
};

/**
 * validateComment reports why a comment body cannot be submitted.
 *
 * Validation is deliberately a pure function of the raw field value: it is the
 * same check whether it runs on submit or in a test, and it decides on the
 * trimmed value so a body of whitespace is empty rather than "not empty".
 *
 * @param comment - the comment body exactly as typed.
 * @returns the sentence to show the reader, or null when the body is valid.
 */
export function validateComment(comment: string): string | null {
  const trimmed = comment.trim();

  if (trimmed === '') {
    return 'Write a comment before posting.';
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return `Comments are limited to ${MAX_COMMENT_LENGTH} characters.`;
  }
  return null;
}

/**
 * submissionMessage renders a rejected submission as a sentence for the reader.
 *
 * A 400 carries the API's `<field>: <reason>` context, which is the only part of
 * a failure worth repeating — it says what to change. Every other failure is
 * reported as a retryable condition, because the reader can do nothing about it
 * except try again, and the entered text is kept either way.
 *
 * @param error - the failure raised by `postComment`.
 * @returns the sentence to show beneath the composer.
 */
function submissionMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return error.details
      ? `Your comment was not accepted — ${error.details}`
      : 'Your comment was not accepted. Check the fields and try again.';
  }
  return 'Your comment could not be posted. Your text is still here — try again.';
}

/**
 * CommentsSection renders the comment thread and composer of an article
 * (AC-15, AC-16).
 *
 * This is the fourth and last client island of the site and the only surface
 * that fetches from the browser (PC-6, PC-7): comments are neither SEO-critical
 * nor stable, so they are read on mount straight from the API rather than
 * through the server render or a route handler. A three-row skeleton sized to
 * the real entries holds the space while that request is in flight, so the
 * article above it does not move.
 *
 * Comment bodies are attacker-writable — the POST behind the composer is
 * unauthenticated — so a body is rendered as a plain React text child and
 * nothing else (RISK-004). There is no `dangerouslySetInnerHTML` here, and the
 * markdown renderer that sits beside this file in the same directory is
 * deliberately not reachable from it: markup in a body is text, and
 * `white-space: pre-wrap` is what gives it its line breaks back. A body that
 * carries a `<script>` tag therefore reaches the reader as visible characters.
 *
 * The composer applies the RISK-016 abuse controls — trimmed input, a rejected
 * empty body, a capped length and a submit that is disabled while a request is
 * in flight — and never discards what was typed: a rejection leaves the fields
 * exactly as they were so the reader can correct and resubmit.
 *
 * @param articleId - identifier of the article being read.
 * @returns the comments section of the article page.
 */
export function CommentsSection({ articleId }: CommentsSectionProps) {
  const [comments, setComments] = useState<ArticleComment[] | null>(null);
  // Whether the article's existing comments are missing from `comments`. It is
  // set by a failed load and never cleared: a submission adds one comment to
  // the thread, it does not recover the ones the failed request did not bring
  // back. This is deliberately separate from whether the alert is shown — the
  // alert answers "is there something to tell the reader now", this answers
  // "is what is on screen the whole thread", and only the second may gate a
  // count.
  const [loadIncomplete, setLoadIncomplete] = useState(false);
  const [author, setAuthor] = useState('');
  const [comment, setComment] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;

    listComments(articleId)
      .then((loaded) => {
        if (active) {
          setComments(loaded);
        }
      })
      .catch(() => {
        if (active) {
          setComments([]);
          setLoadIncomplete(true);
        }
      });

    return () => {
      active = false;
    };
  }, [articleId]);

  /**
   * submit handles the composer's form submission. An invalid comment, or one
   * entered while a previous submission is still in flight, is rejected without
   * a request being sent. An accepted comment is appended to the thread locally
   * and the fields are cleared, while a rejection keeps the entered text so the
   * reader can correct it and resubmit.
   *
   * @param event - the form submission event, whose default navigation is
   *   suppressed so the page is never reloaded.
   * @returns a promise that settles once the submission has been attempted.
   */
  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const invalid = validateComment(comment);
      if (invalid !== null || submitting) {
        setProblem(invalid);
        return;
      }

      const body = comment.trim();
      const name = author.trim();

      setSubmitting(true);
      setProblem(null);
      try {
        await postComment(articleId, {
          ...(name === '' ? {} : { author: name }),
          comment: body,
        });

        setComments((current) => [
          ...(current ?? []),
          {
            author: name === '' ? null : name,
            comment: body,
            created_at: new Date().toISOString(),
          },
        ]);
        setAuthor('');
        setComment('');
        // The alert falls away on its own here, because the thread is no longer
        // empty and the alert is gated on an empty thread: a standing "could
        // not be loaded" notice would contradict the comment sitting beneath
        // it. `loadIncomplete` stays set, so the failure is not forgotten — the
        // count beside the heading remains suppressed rather than reporting
        // this session's single post as the article's whole thread.
      } catch (error) {
        setProblem(submissionMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [articleId, author, comment, submitting],
  );

  const loading = comments === null;

  return (
    <section
      aria-labelledby="comments-heading"
      className="flex flex-col border-t border-border-subtle pt-(--space-7)"
    >
      <div className="flex items-baseline gap-(--space-3)">
        <h2
          id="comments-heading"
          className="text-2xl font-medium tracking-tight text-text-primary"
        >
          Comments
        </h2>
        {!loading && !loadIncomplete ? (
          <span data-numeric className="text-xs text-text-tertiary">
            {comments.length}
          </span>
        ) : null}
      </div>
      <p className="mt-(--space-2) text-sm text-text-tertiary">
        Oldest first. Leave the name blank to post anonymously.
      </p>

      {loading ? (
        <div
          aria-hidden="true"
          data-testid="comments-skeleton"
          className="mt-(--space-5) animate-pulse border-t border-border-subtle"
        >
          {SKELETON_ROWS.map((row) => (
            <div
              key={row}
              className="flex flex-col gap-(--space-3) border-b border-border-subtle py-(--space-5)"
            >
              <div className="h-3.5 w-32 rounded-sm bg-wash shadow-(--hairline-soft)" />
              <div className="h-3.5 w-full max-w-(--measure-prose) rounded-sm bg-wash shadow-(--hairline-soft)" />
              <div className="h-3.5 w-2/3 max-w-(--measure-prose) rounded-sm bg-wash shadow-(--hairline-soft)" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && comments.length > 0 ? (
        <ul className="mt-(--space-5) border-t border-border-subtle">
          {comments.map((entry, index) => (
            <li
              key={`${entry.created_at}-${index}`}
              className="border-b border-border-subtle py-(--space-5)"
            >
              <div className="flex flex-wrap items-baseline gap-(--space-2)">
                {entry.author === null ? (
                  <span className="text-sm text-text-tertiary italic">
                    {ANONYMOUS}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-text-primary">
                    {entry.author}
                  </span>
                )}
                <time
                  className="text-xs text-text-tertiary"
                  dateTime={entry.created_at}
                >
                  {formatDate(entry.created_at)}
                </time>
              </div>

              <p
                data-testid="comment-body"
                className="mt-(--space-2) max-w-(--measure-prose) text-sm leading-relaxed whitespace-pre-wrap text-text-secondary"
              >
                {entry.comment}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && comments.length === 0 && !loadIncomplete ? (
        <EmptyState
          label="Comments"
          statement="Be the first to respond"
          description="Nobody has commented on this article yet. Corrections are especially welcome."
          className="mt-(--space-5)"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => commentRef.current?.focus()}
            >
              Write a comment
            </Button>
          }
        />
      ) : null}

      {!loading && loadIncomplete && comments.length === 0 ? (
        <p role="alert" className="mt-(--space-5) text-sm text-danger">
          The comments could not be loaded. Reload the page to try again — you
          can still post below.
        </p>
      ) : null}

      <form
        noValidate
        onSubmit={submit}
        className="mt-(--space-7) flex max-w-130 flex-col gap-(--space-5)"
      >
        <div className="flex flex-col gap-(--space-2)">
          <Label htmlFor="comment-author">
            Name
            <span className="text-xs font-normal text-text-tertiary">
              Optional — leave blank to post as {ANONYMOUS}
            </span>
          </Label>
          <Input
            id="comment-author"
            name="author"
            value={author}
            maxLength={MAX_AUTHOR_LENGTH}
            autoComplete="name"
            placeholder="Your name"
            onChange={(event) => setAuthor(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-(--space-2)">
          <Label htmlFor="comment-body">Comment</Label>
          <Textarea
            id="comment-body"
            name="comment"
            ref={commentRef}
            value={comment}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="Keep it civil and on topic."
            aria-invalid={problem !== null || undefined}
            aria-describedby={problem === null ? undefined : 'comment-problem'}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>

        {problem !== null ? (
          <p role="alert" id="comment-problem" className="text-sm text-danger">
            {problem}
          </p>
        ) : null}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Posting…' : 'Post comment'}
          </Button>
        </div>
      </form>
    </section>
  );
}
