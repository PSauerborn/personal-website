import type { Metadata } from 'next';

import { ProjectIndex } from '@/components/projects/project-index';
import { SectionHeading } from '@/components/ui/section-heading';
import { listProjects } from '@/lib/api/projects';

/**
 * Metadata of the projects route (REQ-1.9).
 *
 * The description is the page's own summary rather than the site default, so
 * the route is findable on the terms this page is actually about.
 */
export const metadata: Metadata = {
  title: 'Projects',
  description:
    'Things I have built and still maintain: backend platforms, developer tooling and side projects, each with its live link and, where there is one, its repository.',
};

/**
 * Rendering mode of the route (SPEC-003 §6.1).
 *
 * Every route of this site is dynamic: the page reads the API on each request,
 * so there is nothing to prerender at build time and an attempt to do so fails
 * the build. Declaring the segment `force-dynamic` keeps the route out of the
 * static export and renders it per request.
 */
export const dynamic = 'force-dynamic';

/**
 * ProjectsPage renders the projects ledger at `/projects` (REQ-2.6).
 *
 * The listing is read on the server so every project is in the first response
 * and in the crawlable payload (REQ-1.5). A failure of that read is left to
 * propagate to the route's error boundary rather than being degraded to a
 * silent empty ledger: an empty state claims there is nothing to show, which is
 * a different statement from "the API could not be reached". The single
 * legitimate empty case — a listing that really is empty — is rendered by
 * {@link ProjectIndex} itself, so this segment has no empty branch of its own.
 *
 * The page owns no shell: the header, the footer and the content column belong
 * to the root layout. It adds only the DES-001 section header and declares no
 * client boundary, so the route ships zero client JavaScript.
 *
 * @returns the assembled projects page.
 */
export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="flex flex-col gap-16 py-12">
      <section aria-labelledby="project-index-heading">
        <SectionHeading
          level={1}
          id="project-index-heading"
          eyebrow="Projects"
          heading="What I have built"
          lede="A ledger of the work that is public: platforms, tooling and the smaller experiments worth keeping. Each row links to the project, with the repository alongside it where the code is open."
        />
        <div className="mt-10">
          <ProjectIndex projects={projects} />
        </div>
      </section>
    </div>
  );
}
