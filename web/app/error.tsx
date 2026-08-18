'use client';

// PC-6 exclusion — documented and reviewed. The four-client-component budget
// counts the feature islands under `components/home/` and `components/blog/`;
// this file is not one of them. Next.js implements `app/error.tsx` as a React
// error boundary, and error boundaries can only exist in Client Components, so
// the directive above is a framework requirement rather than drift. Nothing
// here holds state or effects: the only interactivity is handing the retry
// callback that Next.js supplies to a button.

import Link from 'next/link';

import { Button } from '@/components/ui/button';

/** Reference shown when a client-side throw gives us no server digest to quote. */
const NO_DIGEST_REFERENCE = 'unavailable';

/** Props Next.js passes to the route-segment error boundary. */
type ErrorBoundaryProps = {
  /** The thrown error. `digest` is present for errors raised on the server. */
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the segment; preferred over `reset`. */
  retry?: () => void;
  /** Re-renders the segment without re-fetching it. */
  reset: () => void;
};

/**
 * ErrorBoundary renders the site's error state for any route segment whose
 * render throws — in practice, every API call in `lib/api` that fails with
 * something other than a 404.
 *
 * The shape is the DES-001 error state and a deliberate sibling of
 * `app/not-found.tsx`: a 12px caps label, a 32px statement, body copy, actions,
 * and — unique to this state — a monospace reference string. The label is amber
 * (`--color-warning`) rather than tertiary grey, which is the only signal that
 * separates "something failed" from "this address names nothing". Following
 * the reasoning recorded in `not-found.tsx`, the markup is repeated rather than
 * extracted: this state adds a retry action and a reference line and drops the
 * 404 label, so a component parameterised over both would be larger than
 * either.
 *
 * Nothing derived from the error is rendered except `digest`. `error.message`
 * carries the original text for client throws and the stack is a map of the
 * source tree, so quoting either would leak internals to a reader who can do
 * nothing with them; the digest is the one value that is both safe and useful,
 * because it identifies this particular throw rather than describing it, so it
 * can be quoted back verbatim in a report. It is deliberately not claimed to be
 * a key into the application's own log: `lib/logger.ts` records the failures the
 * application degrades rather than throws, and a throw that reaches this
 * boundary is reported by Next.js, not by us.
 *
 * The reference line quotes only the digest, not the wall-clock time the design
 * mock shows beside it: this component renders on the server and again on the
 * client, and a clock read in render would differ between the two.
 *
 * Only a section is rendered. The root layout owns the document, the header,
 * the footer and the centered column, so the error state is set in the same
 * measure as the content it replaces.
 *
 * @param error - the thrown error, as forwarded by Next.js.
 * @param retry - re-fetches and re-renders the segment. Preferred, because the
 *   failure this boundary exists for is a failed server-side fetch, which a
 *   pure re-render would reproduce rather than repair.
 * @param reset - clears the error state without re-fetching; used when the
 *   framework supplies no `retry`.
 * @returns the error section.
 */
export default function ErrorBoundary({
  error,
  retry,
  reset,
}: ErrorBoundaryProps) {
  const reference = error.digest ?? NO_DIGEST_REFERENCE;

  return (
    <section
      aria-labelledby="error-statement"
      data-slot="error"
      className="pb-(--space-9)"
    >
      <span className="block text-xs font-semibold tracking-wide text-warning uppercase">
        Error
      </span>

      <h1
        id="error-statement"
        className="mt-4 max-w-(--measure-heading) text-3xl tracking-tight text-text-primary"
      >
        This page could not be loaded
      </h1>

      <p className="mt-4 max-w-(--measure-prose) text-base text-text-secondary">
        The API did not answer, so the content for this page is missing. Nothing
        is broken on your side — retrying usually works.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button size="lg" onClick={() => (retry ?? reset)()}>
          Try again
        </Button>

        <Link
          href="/"
          className="text-sm text-accent-text transition-colors duration-(--duration-fast) ease-(--ease-out-quint) hover:text-accent-bright"
        >
          Go to the homepage
        </Link>
      </div>

      <p className="mt-8 font-mono text-xs text-text-tertiary">
        reference: {reference}
      </p>
    </section>
  );
}
