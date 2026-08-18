import { PageIndex } from '@/components/home/page-index';
import { siteConfig } from '@/lib/siteConfig';

/**
 * One entry of the contact rail.
 *
 * The rail is data-driven so the label, value and href are declared once each
 * and rendered by a single row template, rather than repeated per contact
 * method.
 */
type ContactEntry = {
  /** All-caps signpost naming the contact method. */
  label: string;
  /** The value rendered as the link text. */
  value: string;
  /** The scheme-qualified href the value links to. */
  href: string;
  /**
   * Whether the href leaves this origin. External entries are marked
   * `rel="noreferrer"`, matching the footer's outbound link; the `mailto:` and
   * `tel:` entries are handed to the operating system and carry no referrer to
   * suppress.
   */
  external?: boolean;
};

/**
 * githubHandle renders the GitHub URL as the bare `github.com/user` it points
 * at, so the rail's third column reads as an identity like the two beside it
 * rather than as a full URL with a scheme in front of it. The `href` still
 * carries the configured URL verbatim.
 *
 * @param url - the configured profile URL.
 * @returns the host and path with the scheme and any trailing slash removed.
 */
function githubHandle(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * The contact methods the masthead rail renders, in display order.
 *
 * Every value comes from `siteConfig`, and the hrefs are built from those same
 * values verbatim — nothing is reformatted except the GitHub label, whose
 * scheme is dropped for display only — so the configuration stays the single
 * place any of them is edited. The mockup's "Based in" column is omitted: no
 * location value exists in the configuration and the design placeholder must
 * not be copied.
 */
const CONTACT_ENTRIES: readonly ContactEntry[] = [
  {
    label: 'Email',
    value: siteConfig.email,
    href: `mailto:${siteConfig.email}`,
  },
  {
    label: 'Phone',
    value: siteConfig.phone,
    href: `tel:${siteConfig.phone}`,
  },
  {
    label: 'GitHub',
    value: githubHandle(siteConfig.githubUrl),
    href: siteConfig.githubUrl,
    external: true,
  },
];

/**
 * PersonalDetailsHeader renders the homepage masthead required by REQ-2.1: the
 * site owner's name, the headline summary, and a contact rail linking the email
 * address, telephone number and GitHub profile.
 *
 * Every personal value is read from `lib/siteConfig.ts`; none is written into
 * this file, so the component cannot drift from the committed configuration.
 *
 * Visually this is the DES-001 masthead: the name is the single 56px element on
 * the site, the lede sits under it in secondary text at a 60ch measure, and the
 * rail below is separated by hairline rules with 12px all-caps labels in
 * tertiary — three text colours and two weights, no cards.
 *
 * The fold is two flex columns from `lg` up. The first holds two rows — the
 * name and the lede above, the contact rail directly beneath them at the
 * spacing scale's section step, with nothing pushing the two apart. The second
 * column holds the page index beside the masthead, so the index reads as part
 * of the hero and the fold stays one screen tall. Below `lg` the row becomes a
 * column, everything stacks in source order, and the fold grows as tall as its
 * content needs.
 *
 * The content is centred vertically in the fold: `justify-center` splits the
 * viewport's slack above and below the stacked column, and from `lg` up
 * `items-center` sets both columns on the fold's midline. The section still
 * declares only a `min-height`, so a short viewport grows and the centring
 * degrades to normal flow.
 *
 * The masthead owns the whole first screen, so every later section starts below
 * the fold. The height is a `min-height` in `dvh` — mobile browser chrome is
 * counted, and a short or landscape viewport grows and scrolls rather than
 * clipping, which is why nothing here declares `overflow`. Two subtrahends come
 * off the viewport, both of them chrome this section renders inside of:
 * `--header-height` for the sticky site header (`app/template.tsx:49`) and
 * `--space-8` for the top padding `<main>` applies to every route
 * (`app/template.tsx:55`). Subtracting only the header overshoots the fold by
 * that padding's 64px.
 *
 * **Recorded risk — the arithmetic is positional.** It is exact only while this
 * section is the *first* child of the homepage stack, so that the header and
 * the `<main>` padding are the only things above it. Insert anything before it
 * in `app/page.tsx` and the fold silently runs long by that element's height;
 * the height of the new element has to join the subtraction. `app/page.test.tsx`
 * pins the ordering this depends on. The shared padding in `template.tsx` is
 * deliberately left alone — the other four routes must not shift.
 *
 * @returns the masthead section element.
 */
export function PersonalDetailsHeader() {
  return (
    <section
      aria-labelledby="personal-details-heading"
      data-slot="personal-details-header"
      className="flex min-h-[calc(100dvh_-_var(--header-height)_-_var(--space-8))] flex-col justify-center gap-(--space-8) lg:flex-row lg:items-center lg:gap-(--space-7)"
    >
      {/* Column one. `min-w-0` because a flex item refuses by default to shrink
          below its content's width; `flex-1` so it takes what column two leaves.
          Its two rows are stacked blocks and nothing pushes them apart — the
          fold's slack falls below them, not between them. */}
      <div className="min-w-0 flex-1">
        {/* Row one. */}
        <div>
          {/* The name is solid primary text with a single accent-green full
              stop as its signature — the accent's *text* step, whose 9.15:1
              contrast holds on the canvas. The period is punctuation, not
              content, so it is hidden from the accessible name. */}
          <h1
            id="personal-details-heading"
            className="text-5xl font-medium tracking-[var(--tracking-tight-lg)] text-text-primary"
          >
            {siteConfig.name}
            <span aria-hidden="true" className="text-accent-text">
              .
            </span>
          </h1>

          <p className="mt-6 max-w-(--measure-lede) text-xl text-text-secondary">
            {siteConfig.headline}
          </p>
        </div>

        {/* Row two, sitting on row one at the spacing scale's section step. The
            gutter is `6` rather than the `8` the rail carried when it had the
            full 1024px measure: the three entries need ~560px of the ~630px
            this column gets at `lg`, and the wider gutter spent the margin that
            leaves. `flex-wrap` stays as the safety valve — a font that sets
            wider than this breaks the rail onto a second line instead of out of
            the column. */}
        <dl className="mt-8 flex flex-wrap border-t border-border-subtle">
          {CONTACT_ENTRIES.map((entry) => (
            <div
              key={entry.label}
              className="mr-6 border-r border-border-subtle py-4 pr-6 last:mr-0 last:border-r-0 last:pr-0"
            >
              <dt className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
                {entry.label}
              </dt>
              <dd className="mt-1 text-sm font-medium">
                <a
                  href={entry.href}
                  rel={entry.external ? 'noreferrer' : undefined}
                  className="text-text-primary transition-colors hover:text-accent-text"
                >
                  {entry.value}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Column two. Last in DOM and in reading order — the name and the lede
          are what the visitor should meet first — but beside the masthead from
          `lg` up, centred on the same midline by the section's `items-center`. */}
      <PageIndex className="lg:w-[280px] lg:shrink-0" />
    </section>
  );
}
