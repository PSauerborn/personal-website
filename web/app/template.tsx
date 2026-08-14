import type { ReactNode } from 'react';

import { SiteHeader } from '@/components/layout/site-header';

/** Props accepted by `RootTemplate`. */
export interface RootTemplateProps {
  /** The route segment rendered inside the content column. */
  readonly children: ReactNode;
}

/**
 * RootTemplate renders the masthead and the content column around every route.
 *
 * This is a Server Component and must stay one: it renders on every route, and
 * it reads nothing from the request. It once did — the masthead's current-entry
 * marking was derived from a pathname the proxy stamped onto the request, and
 * this file was a template rather than part of `layout.tsx` so that the read
 * would happen again on every navigation. That did not work: a template's
 * unique key makes React remount the segment's *cached* output, it does not
 * make the router refetch it, and the root segment's cache entry is shared by
 * every route. The marking is computed on the client now, in `HeaderNav`, which
 * carries the full explanation.
 *
 * @param children - the route segment rendered inside the content column.
 * @returns the masthead and the centered content column.
 */
export default function RootTemplate({ children }: RootTemplateProps) {
  return (
    <>
      <SiteHeader />

      {/* The one centered 1024px column DES-001 puts every route in:
          `max-w-column` (`--container-column`) with the fluid `--gutter` inline
          padding. The header and the footer sit outside it because they carry
          the wider 1200px measure themselves. */}
      <main className="mx-auto w-full max-w-column flex-1 px-(--gutter) pt-(--space-8)">
        {children}
      </main>
    </>
  );
}
