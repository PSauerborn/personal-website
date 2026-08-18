/**
 * Article resources of the psauerborn.dev API: the listing, the raw content of
 * a single article, and the comments recorded against it.
 *
 * The API publishes no single-article metadata endpoint, so `getArticleSummary`
 * resolves an article out of the listing and raises the distinct 404 signal
 * (`ApiNotFoundError`) when the identifier is absent — a failing listing keeps
 * whatever failure the client raised, so a 5xx is never mistaken for a missing
 * article. Content is served as `binary/octet-stream` and is therefore read
 * exclusively through `fetchText`; `getArticleContent` returns a `string` and
 * no JSON reader is reachable from it.
 */

import { ApiNotFoundError, fetchJson, fetchText } from './client';
import type {
  ArticleComment,
  ArticleCommentListResponse,
  ArticleListEntry,
  ArticleListResponse,
  CreateCommentRequest,
  CreateCommentResponse,
} from './types';

/** Path of the article listing. */
const LIST_PATH = '/v1/articles/list';

/**
 * articlePath builds the path of a sub-resource of a single article, encoding
 * the identifier so an unexpected value cannot escape its path segment.
 *
 * @param articleId - identifier of the article.
 * @param segment - sub-resource appended to the article, for example `content`.
 * @returns the request path.
 */
function articlePath(articleId: string, segment: string): string {
  return `/v1/articles/${encodeURIComponent(articleId)}/${segment}`;
}

/**
 * listArticles returns the metadata of every publicly visible article. The
 * payload never carries article content or comments.
 *
 * @returns the listed articles, or an empty array when there are none.
 * @throws ApiError when the listing cannot be retrieved.
 */
export async function listArticles(): Promise<ArticleListEntry[]> {
  const response = await fetchJson<ArticleListResponse>(LIST_PATH);
  return response.articles;
}

/**
 * getArticleSummary returns the listing entry of a single article, resolved
 * from the listing because the API exposes no per-article metadata endpoint.
 *
 * @param articleId - identifier of the article.
 * @returns the listing entry of the article.
 * @throws ApiNotFoundError when the identifier is absent from the listing.
 * @throws ApiError when the listing itself could not be retrieved.
 */
export async function getArticleSummary(
  articleId: string,
): Promise<ArticleListEntry> {
  const articles = await listArticles();
  const article = articles.find((entry) => entry.id === articleId);

  if (!article) {
    throw new ApiNotFoundError(
      `article ${articleId} is not present in ${LIST_PATH}`,
    );
  }
  return article;
}

/**
 * getArticleContent returns the raw content of an article. The endpoint serves
 * `binary/octet-stream`, so the body is read verbatim and never as JSON.
 *
 * @param articleId - identifier of the article.
 * @returns the raw content of the article.
 * @throws ApiNotFoundError when the article is not publicly readable.
 * @throws ApiError on any other failure.
 */
export async function getArticleContent(articleId: string): Promise<string> {
  return fetchText(articlePath(articleId, 'content'));
}

/**
 * listComments returns the comments recorded against an article, in the order
 * served by the API (oldest first). The order is preserved verbatim.
 *
 * @param articleId - identifier of the article.
 * @returns the comments of the article, or an empty array when it has none.
 * @throws ApiNotFoundError when the article is not publicly readable.
 * @throws ApiError on any other failure.
 */
export async function listComments(
  articleId: string,
): Promise<ArticleComment[]> {
  const response = await fetchJson<ArticleCommentListResponse>(
    articlePath(articleId, 'comments'),
  );
  return response.comments;
}

/**
 * postComment records a comment against an article. A submission without an
 * author is recorded anonymously.
 *
 * @param articleId - identifier of the article.
 * @param body - author and comment to record.
 * @returns the identifier generated for the comment.
 * @throws ApiError with status 400 when the submission was rejected; its
 *   `details` carry the `<field>: <reason>` context of the API.
 * @throws ApiNotFoundError when the article is not publicly readable.
 */
export async function postComment(
  articleId: string,
  body: CreateCommentRequest,
): Promise<CreateCommentResponse> {
  return fetchJson<CreateCommentResponse>(articlePath(articleId, 'comment'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: body.author, comment: body.comment }),
  });
}
