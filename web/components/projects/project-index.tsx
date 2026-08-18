import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { Project } from '@/lib/api/types';
import { safeExternalHref } from '@/lib/utils';

/** Props accepted by `ProjectIndex`. */
export type ProjectIndexProps = {
  /** Projects to list, in the order returned by the API. */
  projects: Project[];
};

/**
 * repositoryLabel renders a GitHub URL as the bare host and path shown in the
 * DES-001 ledger, so the ghost link reads `github.com/psauerborn/pgqueue`
 * rather than repeating the scheme on every row.
 *
 * @param link - absolute URL of the repository.
 * @returns the URL without its scheme or trailing slash; the original value is
 *   returned unchanged when it is not an absolute URL.
 */
function repositoryLabel(link: string): string {
  return link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
}

/**
 * ProjectIndex renders the projects ledger: one ruled row per project over a
 * shared hairline grid.
 *
 * Each row is a single wrapping anchor on the project's primary link covering
 * the name, the description and the `Visit` arrow, so a row is one tab stop
 * (DES-001 accessibility notes) named after the project rather than after its
 * whole description. The repository link is a second, quieter
 * anchor rendered as a sibling of that anchor rather than inside it, because a
 * nested interactive element is invalid HTML and unreachable by keyboard. A
 * project without a repository renders no second line at all — no empty label
 * and no dead link.
 *
 * Both links arrive from the API, so both pass through `safeExternalHref`
 * before reaching an `href`: a link outside `http`/`https` renders the row as
 * plain text with no anchor and no `Visit` affordance, rather than a clickable
 * `javascript:` URL that React would happily emit.
 *
 * An empty listing renders the designed zero-data state pointing readers at
 * the writing instead of an empty rule.
 *
 * This is a Server Component: it renders the projects it is handed and fetches
 * nothing itself.
 *
 * @param projects - projects to list, in the order returned by the API.
 * @returns the ledger element, or the empty state when there are no projects.
 */
export function ProjectIndex({ projects }: ProjectIndexProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        label="Projects"
        statement="No projects listed yet"
        description="The index is generated from the API. Until something is published here, the writing and the CV are the fuller picture."
        action={
          <Button variant="secondary" asChild>
            <Link href="/blog">Read the writing</Link>
          </Button>
        }
      />
    );
  }

  return (
    // The rows carry a hover background and need horizontal padding inside it,
    // but the ledger's text must stay aligned with the heading above. The list
    // therefore bleeds 12px into the page gutter and the rows pad the same 12px
    // back in: nothing moves, the hairlines stay flush with each other, and no
    // project name sits on the edge of its own highlight.
    <ul className="-mx-3 border-t border-border-subtle">
      {projects.map((project) => {
        const primaryHref = safeExternalHref(project.primary_link);
        const githubHref = safeExternalHref(project.github_link);

        const summary = (
          <div>
            <h3 className="text-lg font-medium text-text-primary transition-colors duration-(--duration-fast) group-hover:text-accent-text">
              {project.name}
            </h3>
            <p className="mt-2 max-w-(--measure-prose) text-sm leading-relaxed text-text-secondary">
              {project.description}
            </p>
          </div>
        );

        return (
          <li
            key={project.id}
            className="border-b border-border-subtle py-8 transition-colors hover:bg-wash"
          >
            {primaryHref === null ? (
              // No destination, so no anchor and no `Visit` arrow: the row keeps
              // its place in the ledger and reads as plain text.
              <div className="grid gap-2 px-3 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-8">
                {summary}
              </div>
            ) : (
              <a
                href={primaryHref}
                rel="noopener noreferrer"
                aria-label={project.name}
                className="group grid gap-2 px-3 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-8"
              >
                {summary}
                <span className="text-sm text-accent-text group-hover:text-accent-bright">
                  Visit <span aria-hidden="true">→</span>
                </span>
              </a>
            )}
            {githubHref === null ? null : (
              <div className="mt-2 px-3 sm:text-right">
                <a
                  href={githubHref}
                  rel="noopener noreferrer"
                  aria-label={`${project.name} on GitHub`}
                  className="font-mono text-xs text-text-tertiary hover:text-text-secondary"
                >
                  {repositoryLabel(githubHref)}
                </a>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
