'use client';

// PC-6 exclusion — documented and reviewed. The four-client-component budget
// counts the feature islands under `components/home/` and `components/blog/`;
// this file is not one of them. It is chrome, and the directive is here for a
// correctness reason rather than for a feature: the masthead marks the current
// navigation entry, and under the App Router's segment cache there is no
// server-side way to keep that marking correct across a client-side navigation.
// See the doc comment on `HeaderNav` for why. Nothing here holds state or runs
// an effect — it reads the pathname the router already knows and renders links.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/siteConfig';

/** Fragment identifier of the homepage contact section the action anchors to. */
const CONTACT_HREF = '/#contact';

/** Shared treatment for a header navigation link, active or not. */
const navLinkClasses = cn(
  'rounded-md px-3 py-2 text-sm font-medium',
  'transition-colors duration-(--duration-fast) ease-(--ease-out-quint)',
  'hover:bg-border-subtle',
);

/**
 * isActiveEntry reports whether a navigation entry describes the current route.
 *
 * The root entry matches only itself, because every path starts with `/`; every
 * other entry also matches its descendants, so an article at `/blog/<id>` still
 * marks *Writing* as the current section.
 *
 * @param entryHref - the navigation entry's route.
 * @param activeHref - the route being rendered, or null when unknown.
 * @returns true when the entry should carry `aria-current="page"`.
 */
function isActiveEntry(entryHref: string, activeHref: string | null): boolean {
  if (activeHref === null) {
    return false;
  }

  if (entryHref === '/') {
    return activeHref === '/';
  }

  return activeHref === entryHref || activeHref.startsWith(`${entryHref}/`);
}

/**
 * HeaderNav renders the masthead navigation and marks the current section.
 *
 * This is the one client boundary in the chrome, and it exists because the
 * marking cannot be computed on the server and stay correct. The obvious
 * server-side approach — a proxy stamping the pathname onto a request header
 * and the chrome reading it back with `headers()` — is right for the document
 * request and wrong from the first in-site click onwards, whether the chrome
 * sits in `layout.tsx` or in `app/template.tsx`.
 *
 * The reason is the App Router's segment cache. A navigation does not re-render
 * the whole tree: the client fetches only the segments it does not already
 * hold, and it caches each segment under a key derived from that segment's
 * position and the route params it varies on
 * (`next/dist/client/components/segment-cache/vary-path.js`). The chrome lives
 * at the root segment, which takes no params, so its key is identical for every
 * route on the site — one cached copy, fetched once, reused by every subsequent
 * navigation. A `template.tsx` does not change this: its unique key makes React
 * *remount* the cached output, not the router *refetch* it, so a request header
 * read there is frozen at whatever route the tab first loaded.
 *
 * `usePathname()` reads the path the router has actually navigated to, so the
 * marking follows the navigation by construction. The cost is this file's worth
 * of JavaScript — the link list and `siteConfig.navigation` — on every route.
 *
 * @returns the masthead navigation element.
 */
export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="ml-auto flex items-center gap-1 text-text-secondary"
    >
      {siteConfig.navigation.map((entry) => {
        const active = isActiveEntry(entry.href, pathname);

        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              navLinkClasses,
              active
                ? 'text-accent-text hover:text-accent-bright'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {entry.label}
          </Link>
        );
      })}

      <span
        aria-hidden="true"
        className="mx-2 hidden h-5 w-px bg-border sm:block"
      />

      <Link
        href={CONTACT_HREF}
        className={cn(navLinkClasses, 'text-text-primary')}
      >
        Get in touch
      </Link>
    </nav>
  );
}
