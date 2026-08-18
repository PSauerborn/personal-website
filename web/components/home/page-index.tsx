/** One numbered row of the page index. */
type IndexEntry = {
  /** Two-digit ordinal shown in the numeral column. */
  ordinal: string;
  /** In-page anchor of the section the row points at. */
  href: string;
  /** The section's caps eyebrow, used as the row's title line. */
  title: string;
  /** The section's heading, used as the row's secondary line. */
  heading: string;
};

/**
 * The three sections below the hero, in the order `app/page.tsx` renders them:
 * the CV explorer, the summary of how the site was built, and the contact form.
 * Each row repeats its section's own eyebrow and heading verbatim, so the index
 * reads as the page's table of contents rather than as separate copy.
 *
 * This list is hand-maintained and therefore couples to the homepage: it is
 * only true while the homepage has exactly these three sections in exactly this
 * order.
 */
const INDEX_ENTRIES: readonly IndexEntry[] = [
  {
    ordinal: '01',
    href: '#cv',
    title: 'Professional history',
    heading: 'Where I have worked, and what with',
  },
  {
    ordinal: '02',
    href: '#agentic-summary',
    title: 'Agentic development',
    heading: 'How I work in the age of agents',
  },
  {
    ordinal: '03',
    href: '#contact',
    title: 'Contact',
    heading: 'Tell me what you are building',
  },
];

/** Props accepted by `PageIndex`. */
export type PageIndexProps = {
  /** Additional classes merged after the index's own classes. */
  className?: string;
};

/**
 * PageIndex renders the index that sits beside the homepage masthead in the
 * hero's second column: a caps signpost over three numbered, ruled rows, each
 * one link down to a section of the page. It is what the fold buys — the
 * visitor can see what the page holds without scrolling, and reach any of it in
 * one keystroke.
 *
 * The index carries no width or placement of its own: it is the hero's second
 * flex column (`components/home/personal-details-header.tsx`) and takes the
 * width that component hands it — 280px from `lg` up, the full measure below.
 *
 * The rows follow the DES-001 numbered-row treatment the agentic summary
 * already uses: a 32px numeral column with the ordinal in accent text, the
 * section eyebrow as the title and the section heading below it, rows divided
 * by hairline rules. The ordinal is decorative and `aria-hidden`, so each link
 * announces as its own row text rather than as a bare number. The signpost
 * repeats the landmark's label, so it is hidden from assistive technology too.
 *
 * **Coupling — this index goes stale.** `INDEX_ENTRIES` is a hand-maintained
 * mirror of the homepage section stack in `web/app/page.tsx`, including its
 * order and each section's eyebrow and heading. Adding, removing or reordering
 * a homepage section without updating this list silently makes the index a lie:
 * change the two files together, and check that every `href` here still
 * resolves to an `id` on the section component it names.
 *
 * This is a Server Component: the rows are authored constants and the links are
 * plain in-page anchors, so nothing here needs a client boundary.
 *
 * @param className - additional classes merged after the index's own classes.
 * @returns the page index navigation landmark.
 */
export function PageIndex({ className }: PageIndexProps) {
  return (
    <nav aria-label="On this page" data-slot="page-index" className={className}>
      <p
        aria-hidden="true"
        className="text-xs font-semibold tracking-wide text-accent-text uppercase"
      >
        On this page
      </p>

      <div className="mt-4 border-b border-border-subtle">
        {INDEX_ENTRIES.map((entry, index) => (
          <a
            key={entry.href}
            href={entry.href}
            data-testid={`page-index-row-${index + 1}`}
            className="group grid grid-cols-[32px_1fr] gap-5 border-t border-border-subtle py-4"
          >
            <span
              aria-hidden="true"
              data-testid={`page-index-ordinal-${index + 1}`}
              className="pt-1 text-xs font-semibold text-accent-text"
            >
              {entry.ordinal}
            </span>
            <span>
              <span className="block text-sm font-medium text-text-primary transition-colors group-hover:text-accent-text">
                {entry.title}
              </span>
              <span className="mt-1 block text-sm text-text-tertiary">
                {entry.heading}
              </span>
            </span>
          </a>
        ))}
      </div>
    </nav>
  );
}
