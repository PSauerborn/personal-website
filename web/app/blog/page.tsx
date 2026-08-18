import type { Metadata } from 'next';

import { BlogIndex } from '@/components/blog/blog-index';
import { SectionHeading } from '@/components/ui/section-heading';
import { listArticles } from '@/lib/api/articles';

/**
 * Metadata of the blog index (REQ-1.9).
 *
 * The title is bare: the root layout's `%s — Pascal Sauerborn` template adds the
 * site name, so no route restates it.
 */
export const metadata: Metadata = {
  title: 'Writing',
  description:
    'Long-form notes on distributed systems, Postgres, and building software with agents.',
};

/**
 * Rendering mode of the route (SPEC-003 §6.1).
 *
 * Every route of this site is dynamic: the index is read from the API on each
 * request, so there is nothing to prerender at build time and an attempt to do
 * so fails the build — the API base URL is a runtime setting and the client's
 * requests are uncached. Declaring the segment `force-dynamic` keeps the route
 * out of the static export and renders it per request.
 */
export const dynamic = 'force-dynamic';

/**
 * BlogPage renders the blog index at `/blog` (REQ-4.3).
 *
 * The listing is fetched on the server and rendered in the DES-001 order: the
 * caps signpost and standfirst, then the ledger of articles. Only the listing
 * endpoint is read, and a failure of it is left to propagate to the route's
 * error boundary — an index that silently renders as empty would be
 * indistinguishable from a site with nothing published on it.
 *
 * The rows themselves belong to the `BlogIndex` island, which adds the search
 * and topic filters on top of this server-rendered listing. It is handed the
 * fetched articles as a prop and fetches nothing itself, so the crawlable
 * payload of the route is complete before any JavaScript runs.
 *
 * The page owns no shell of its own: the header, the footer and the content
 * column belong to the root layout.
 *
 * @returns the assembled blog index page.
 */
export default async function BlogPage() {
  const articles = await listArticles();

  return (
    <div className="flex flex-col py-12">
      <section aria-labelledby="blog-index-heading">
        <SectionHeading
          level={1}
          id="blog-index-heading"
          eyebrow="Writing"
          heading="Notes from the backend"
          lede="Long-form notes on distributed systems, Postgres, and building software with agents."
        />

        <div className="mt-10">
          <BlogIndex articles={articles} />
        </div>
      </section>
    </div>
  );
}
