import type { Metadata } from 'next';

import { AgenticSummary } from '@/components/home/agentic-summary';
import { ContactForm } from '@/components/home/contact-form';
import { CVSectionExplorer } from '@/components/home/cv-section-explorer';
import { PersonalDetailsHeader } from '@/components/home/personal-details-header';
import { getCV } from '@/lib/api/cv';

export const metadata: Metadata = {
  // The layout's title template appends the site name, so the page states only
  // what it adds: what the site owner does.
  title: 'Backend and platform engineer',
  // The description leads with the same trust claim as the masthead headline:
  // agentic development backed by a record with regulated data. Kept near the
  // ~160 characters search results display before truncating.
  description:
    'Pascal Sauerborn — making agentic development production-grade, with 7+ ' +
    'years building platforms trusted with health records, genomic data, and ' +
    'critical infrastructure.',
};

/**
 * SPEC-003 section 6.1 renders every route dynamically: the homepage reads
 * live data, so it must not be captured into the static export at build time.
 */
export const dynamic = 'force-dynamic';

/**
 * HomePage renders the site's landing route: the personal details masthead, the
 * CV section explorer, the summary of how this site was built, and the contact
 * form, in the DES-001 "Broadsheet" order (REQ-1.9, REQ-2.1, REQ-2.2, REQ-2.3,
 * REQ-2.4). The contact section is last and carries the `#contact` anchor the
 * header's *Get in touch* action targets.
 *
 * This is a Server Component and must stay one — the whole homepage is
 * SEO-critical, and the two interactive islands the design allows here (the CV
 * section explorer and the contact form) carry their own client boundaries.
 *
 * The page renders sections only. The HTML shell, the site header and footer,
 * and the centered 1024px column all belong to `app/layout.tsx`; nothing here
 * re-declares them. Sections are stacked with the major-section step of the
 * spacing scale and separated by the design's hairline rules, which each
 * section draws itself — the page adds rhythm, not chrome.
 *
 * The CV is read here, on the server, and handed to the explorer island as a
 * prop (REQ-1.5): the whole history has to be in the first response for the
 * homepage to be crawlable, so the island is allowed interactivity but not a
 * fetch of its own. A failure of that read propagates to the route's error
 * boundary rather than degrading to an empty CV, which would claim there is no
 * history to show.
 *
 * @returns the home page section stack.
 */
export default async function HomePage() {
  const cv = await getCV();

  return (
    <div className="space-y-(--space-9) pb-(--space-9)">
      <PersonalDetailsHeader />

      <CVSectionExplorer cv={cv} />

      <AgenticSummary />

      <ContactForm />
    </div>
  );
}
