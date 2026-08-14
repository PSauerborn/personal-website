import Link from 'next/link';

import { HeaderNav } from '@/components/layout/header-nav';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/siteConfig';

/**
 * monogramOf reduces a full name to the initials shown in the wordmark badge.
 *
 * @param name - the configured full name.
 * @returns the uppercased initial of each whitespace-separated word.
 */
function monogramOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/** Props accepted by `Wordmark`. */
export interface WordmarkProps {
  /**
   * When false the name is hidden below the `sm` breakpoint and only the
   * monogram is shown, which is how the header keeps its single 64px row on a
   * narrow viewport. The footer has the room, so it renders the name always.
   */
  readonly alwaysShowName?: boolean;
}

/**
 * Wordmark renders the monogram badge and the configured name as a link home.
 *
 * It lives here rather than in each consumer because the header and the footer
 * carry the identical mark in DES-001; the footer imports it so the two can
 * never drift apart.
 *
 * @param alwaysShowName - keep the name visible at every viewport width.
 * @returns the wordmark link.
 */
export function Wordmark({ alwaysShowName = false }: WordmarkProps) {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 text-base font-semibold tracking-tight text-text-primary"
    >
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-md bg-accent text-xs font-semibold shadow-raised"
      >
        {monogramOf(siteConfig.name)}
      </span>
      <span className={alwaysShowName ? undefined : 'hidden sm:inline'}>
        {siteConfig.name}
      </span>
    </Link>
  );
}

/**
 * SiteHeader renders the sticky masthead mounted on every route.
 *
 * DES-001 ("Broadsheet") gives the site a 64px glass bar: the wordmark on the
 * left, the configured navigation on the right, and the *Get in touch* action
 * behind a hairline rule. This module stays a Server Component; the navigation
 * itself is the site's one piece of client chrome, because the current-section
 * marking has to survive a client-side navigation and only the router knows
 * where it navigated to. `HeaderNav` documents why.
 *
 * @returns the site header element.
 */
export function SiteHeader() {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 h-(--header-height) w-full',
        'border-b border-border-soft bg-glass backdrop-blur-xl backdrop-saturate-150',
      )}
    >
      <div className="mx-auto flex h-full max-w-wide items-center gap-6 px-(--gutter)">
        <Wordmark />

        <HeaderNav />
      </div>
    </header>
  );
}
