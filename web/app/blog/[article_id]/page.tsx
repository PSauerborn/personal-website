import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { ArticleContent } from '@/components/blog/article-content';
import { ArticleHeader } from '@/components/blog/article-header';
import { CommentsSection } from '@/components/blog/comments-section';
import { getArticleContent, getArticleSummary } from '@/lib/api/articles';
import { isNotFoundError } from '@/lib/api/client';
import type { ArticleSummary } from '@/lib/api/types';

/**
 * Rendering mode of the route (SPEC-003 §6.1).
 *
 * Every route of this site is dynamic: both the metadata and the body are read
 * from the API on each request, and the API base URL is a runtime setting, so
 * there is nothing to prerender at build time.
 */
export const dynamic = 'force-dynamic';

/** Props supplied by Next.js to the `[article_id]` segment. */
type ArticlePageProps = {
  /** Path parameters of the route; Next.js supplies them as a promise. */
  params: Promise<{ article_id: string }>;
};

/**
 * Metadata used when the requested article cannot be named. The body of the
 * page raises `notFound()` for the same condition, so this text is only ever
 * the `<title>` of the 404 render.
 */
const MISSING_ARTICLE_METADATA: Metadata = {
  title: 'Article not found',
  description: 'There is nothing published at this address.',
};

/**
 * loadSummary resolves the listing entry of an article, memoized for the
 * duration of the request.
 *
 * `generateMetadata` and the page body both need the same entry, and the API
 * publishes no per-article metadata endpoint, so both go through the listing.
 * The client sends every request with `cache: 'no-store'`, so nothing below
 * would deduplicate them — `cache` from React does, leaving one listing read
 * per request rather than two.
 *
 * @param articleId - identifier captured from the URL.
 * @returns the listing entry of the article.
 * @throws ApiNotFoundError when the identifier is absent from the listing.
 * @throws ApiError when the listing itself could not be retrieved.
 */
const loadSummary = cache(async (articleId: string): Promise<ArticleSummary> =>
  getArticleSummary(articleId),
);

/**
 * generateMetadata derives the document title and description of an article
 * from its listing entry (REQ-1.9).
 *
 * An identifier that names no article is not an error here: the page body
 * renders the 404, and this function supplies the title that render carries.
 * Every other failure of the listing is left to propagate, so a 5xx never
 * reaches the reader disguised as a missing article.
 *
 * @param params - path parameters of the route, carrying `article_id`.
 * @returns the metadata of the article, or the missing-article metadata.
 */
export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { article_id: articleId } = await params;

  try {
    const article = await loadSummary(articleId);
    return { title: article.title, description: article.description };
  } catch (error) {
    if (isNotFoundError(error)) {
      return MISSING_ARTICLE_METADATA;
    }
    throw error;
  }
}

/**
 * ArticlePage renders a single article at `/blog/{article_id}` (REQ-1.8).
 *
 * The header is built from the listing entry and the body from the content
 * endpoint, which serves `binary/octet-stream` and is therefore read through
 * the client's text reader alone — no JSON reader is reachable from here.
 *
 * Only the client's distinct 404 signal — the identifier being absent from the
 * listing, or a 404 from the content endpoint — becomes `notFound()`
 * (RISK-021). Every other failure, including a 5xx, a network error and a
 * timeout, is left to propagate to `app/error.tsx`: those are conditions a
 * retry can clear, and a 404 render offers no retry. A blanket `try/catch`
 * around the two reads would erase that distinction, so each read is narrowed
 * by `isNotFoundError` and anything else is rethrown untouched.
 *
 * The comments section is the one part of this page the server does not read:
 * it is a client island that fetches the thread from the browser on mount
 * (REQ-1.7), so a slow or failing comments endpoint cannot delay or break the
 * article itself, and only the article identifier is handed to it.
 *
 * The page owns no shell of its own: the root layout provides the document, the
 * header, the footer and the centered content column.
 *
 * @param params - path parameters of the route, carrying `article_id`.
 * @returns the assembled article page.
 */
export default async function ArticlePage({ params }: ArticlePageProps) {
  const { article_id: articleId } = await params;

  let article: ArticleSummary;
  try {
    article = await loadSummary(articleId);
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }
    throw error;
  }

  let markdown: string;
  try {
    markdown = await getArticleContent(articleId);
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }
    throw error;
  }

  return (
    <article className="flex flex-col gap-(--space-8) py-12">
      <ArticleHeader article={article} />
      <ArticleContent markdown={markdown} />
      <CommentsSection articleId={articleId} />
    </article>
  );
}
