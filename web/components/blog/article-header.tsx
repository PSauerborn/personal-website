import { Badge } from '@/components/ui/badge';
import type { ArticleSummary } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';

/**
 * The DES-001 article page header.
 *
 * The header is rendered on the server from the listing metadata alone: there
 * is no single-article metadata endpoint, so the page picks the matching
 * `ArticleSummary` out of `GET /v1/articles/list` and passes it down. Nothing
 * here fetches, and nothing here is interactive, so the component stays out of
 * the client bundle.
 *
 * The layout follows the design exactly — a caps label, the 40px title, the
 * 18px standfirst, and a ruled byline row carrying author, date and topics.
 * The date is written through `formatDate`, whose output depends on nothing but
 * the value, while the `<time>` element keeps the raw ISO string so machines
 * read the precise instant the API returned.
 */

/** Props accepted by `ArticleHeader`. */
export interface ArticleHeaderProps {
  /** Listing metadata of the article being displayed. */
  article: ArticleSummary;
}

/**
 * ArticleHeader renders the title, standfirst and byline of an article.
 *
 * @param article - listing metadata of the article: title, description,
 *   author, topics and the ISO8601 `created_at` timestamp.
 * @returns the article page header element.
 */
export function ArticleHeader({ article }: ArticleHeaderProps) {
  const { title, description, author, topics, created_at: createdAt } = article;

  return (
    <header className="flex flex-col">
      <span className="text-xs font-medium tracking-wide text-accent-text uppercase">
        Article
      </span>

      <h1 className="mt-(--space-3) max-w-(--measure-heading) text-4xl font-medium tracking-tight-lg text-text-primary">
        {title}
      </h1>

      <p className="mt-(--space-5) max-w-(--measure-lede) text-lg text-text-secondary">
        {description}
      </p>

      <div className="mt-(--space-5) flex flex-wrap items-center gap-(--space-3) border-t border-border-subtle pt-(--space-5)">
        <span className="text-sm text-text-primary">{author}</span>
        <span aria-hidden="true" className="text-xs text-text-tertiary">
          ·
        </span>
        <time className="text-xs text-text-tertiary" dateTime={createdAt}>
          {formatDate(createdAt)}
        </time>

        {topics.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-(--space-2)">
            {topics.map((topic) => (
              <Badge key={topic}>{topic}</Badge>
            ))}
          </span>
        )}
      </div>
    </header>
  );
}
