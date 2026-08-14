import Link from 'next/link';

import { Wordmark } from '@/components/layout/site-header';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/siteConfig';

/** Treatment shared by the caps signpost above each footer link column. */
const columnHeadingClasses =
  'mb-4 text-xs font-semibold tracking-wide uppercase text-text-tertiary';

/** Treatment shared by every footer link. */
const footerLinkClasses = cn(
  'text-sm text-text-secondary',
  'transition-colors duration-(--duration-fast) ease-(--ease-out-quint)',
  'hover:text-text-primary',
);

/**
 * SiteFooter renders the closing chrome mounted on every route.
 *
 * DES-001 ("Broadsheet") closes the page with a hairline rule and a column of
 * links at the wide container measure: the configured navigation repeated as a
 * *Site* column, the contact address, and — only when one is configured — the
 * public source repository. The repository URL is `string | null` and a null
 * value omits the column entirely rather than rendering a dead or guessed link.
 *
 * It is a Server Component: the footer is links and text, so it ships no
 * JavaScript.
 *
 * @returns the site footer element.
 */
export function SiteFooter() {
  const { agentsRepositoryUrl, email, name, navigation } = siteConfig;

  return (
    <footer className="mt-24 border-t border-border-soft pt-16 pb-12">
      <div className="mx-auto max-w-wide px-(--gutter)">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(3,1fr)]">
          <div>
            <Wordmark alwaysShowName />
          </div>

          <nav aria-label="Footer">
            <p className={columnHeadingClasses}>Site</p>
            <ul className="grid gap-3">
              {navigation.map((entry) => (
                <li key={entry.href}>
                  <Link href={entry.href} className={footerLinkClasses}>
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className={columnHeadingClasses}>Contact</p>
            <ul className="grid gap-3">
              <li>
                <a href={`mailto:${email}`} className={footerLinkClasses}>
                  {email}
                </a>
              </li>
              <li>
                <Link href="/#contact" className={footerLinkClasses}>
                  Send a message
                </Link>
              </li>
            </ul>
          </div>

          {agentsRepositoryUrl !== null && (
            <div>
              <p className={columnHeadingClasses}>Source</p>
              <ul className="grid gap-3">
                <li>
                  <a
                    href={agentsRepositoryUrl}
                    className={footerLinkClasses}
                    rel="noreferrer"
                  >
                    Source on GitHub
                  </a>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="mt-12 flex flex-wrap justify-between gap-4 border-t border-border-soft pt-6 text-xs text-text-tertiary">
          <span>
            &copy; {new Date().getFullYear()} {name}
          </span>
          <span>Built with Next.js &middot; specs in the open</span>
        </div>
      </div>
    </footer>
  );
}
