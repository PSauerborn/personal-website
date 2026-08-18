import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';

/**
 * NotFound renders the site's 404 route.
 *
 * Next.js renders this file for any unmatched URL and for every `notFound()`
 * raised inside a route segment, so it is also what an unresolvable
 * `article_id` on `/blog/[article_id]` (REQ-1.8) lands on. Both cases share one
 * page because both mean the same thing to a reader: the address does not name
 * anything.
 *
 * The shape is the DES-001 error state — a 12px all-caps label naming the
 * condition, a 32px statement saying plainly what happened, a short paragraph
 * of body copy, and two ways back into the site. The error boundary
 * (`app/error.tsx`) repeats this shape with an amber label; the two states are
 * deliberately siblings so a dead end never looks like a broken page. The
 * markup is not shared between them: the boundary adds a retry action and a
 * reference string, this page carries neither, and a component parameterised
 * over both would be larger than either.
 *
 * Only a section is rendered. The root layout owns the document, the header,
 * the footer and the centered 1024px column, so this page inherits the measure
 * every other route is set in rather than re-declaring it.
 *
 * This is a Server Component and must stay one — a 404 has nothing to react to,
 * and shipping it as JavaScript would put a client bundle on every mistyped
 * URL.
 *
 * @returns the not-found section.
 */
export default function NotFound() {
  return (
    <section
      aria-labelledby="not-found-statement"
      data-slot="not-found"
      className="pb-(--space-9)"
    >
      <span className="block text-xs font-semibold tracking-wide text-text-tertiary uppercase">
        404
      </span>

      <h1
        id="not-found-statement"
        className="mt-4 max-w-(--measure-heading) text-3xl tracking-tight text-text-primary"
      >
        There is nothing at this address
      </h1>

      <p className="mt-4 max-w-(--measure-prose) text-base text-text-secondary">
        The address may have changed, or the article it names may not exist. The
        writing archive and the project index are where most links point.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link href="/" className={buttonVariants({ size: 'lg' })}>
          Back to the homepage
        </Link>

        <Link
          href="/blog"
          className="text-sm text-accent-text transition-colors duration-(--duration-fast) ease-(--ease-out-quint) hover:text-accent-bright"
        >
          Browse the writing archive
        </Link>
      </div>
    </section>
  );
}
