import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

import { SiteFooter } from '@/components/layout/site-footer';
import { siteConfig } from '@/lib/siteConfig';
import { cn } from '@/lib/utils';

/**
 * Inter, the typeface DES-001 ("Broadsheet") is drawn with and the first family
 * named by the `--font-sans` token.
 *
 * Only the weights the design uses are downloaded: 400 for body text, 500 for
 * emphasis and headings, and 600 for the 12px all-caps signpost labels, which
 * `globals.css` documents as the one place a third weight is allowed. Nothing
 * else may be requested — a fourth weight is a design change, not a font
 * option.
 *
 * `display: 'swap'` renders the fallback immediately rather than blocking the
 * first paint, and the fallback list mirrors `--font-sans` so the swap does not
 * change the metrics the page was laid out with.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  fallback: ['-apple-system', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — Backend and platform engineer`,
    // Child routes set a bare title and inherit the site name from here, so no
    // page has to restate it.
    template: `%s — ${siteConfig.name}`,
  },
  description:
    'Backend and platform engineer making agentic development ' +
    'production-grade, with 7+ years building platforms trusted with health ' +
    'records, genomic data, and critical infrastructure.',
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The palette is dark-only; the browser chrome is told so it does not paint a
  // white bar above a near-black page.
  colorScheme: 'dark',
};

/** Props accepted by `RootLayout`. */
export interface RootLayoutProps {
  /**
   * The root template wrapping the route segment. `app/template.tsx` renders
   * between this layout and the page, so what arrives here is the masthead and
   * the content column, not the page alone.
   */
  readonly children: ReactNode;
}

/**
 * RootLayout renders the HTML shell that every route mounts into.
 *
 * It is the single place the document is declared: the `<html>`/`<body>` shell,
 * the global stylesheet that carries the design tokens, the web font and the
 * site footer. No page re-declares any of these.
 *
 * What it deliberately does *not* render is the masthead and the content
 * column: they live in `app/template.tsx`, because the masthead marks the
 * current navigation entry and a layout does not re-render on navigation, so
 * anything derived from the request would be stale from the first in-site click
 * onwards. Everything left here is identical on every route, which is exactly
 * what belongs in a layout — it persists across navigations instead of being
 * rebuilt.
 *
 * This is a Server Component and must stay one: it renders on every route, so a
 * client boundary here would ship the whole shell as JavaScript to every
 * visitor.
 *
 * @param children - the root template, wrapping the route segment.
 * @returns the application's root HTML document.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      {/* The font class sits on `<body>`, not `<html>`: `app.css` sets
          `body { font-family: var(--font-sans) }` in the base layer, and an
          inherited value would lose to that element rule. */}
      <body className={cn(inter.className, 'flex min-h-dvh flex-col')}>
        {children}

        <SiteFooter />
      </body>
    </html>
  );
}
