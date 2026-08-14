import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/api/types';

import ProjectsPage, { dynamic, metadata } from './page';

/**
 * Coverage for the `/projects` route assembly (AC-10, AC-11, PC-3, PC-9,
 * PC-19).
 *
 * The route is a thin server segment: it reads the listing once on the server
 * and hands it to the ledger. The assertions that matter are therefore that
 * every entry of the listing reaches the server-rendered markup, that an empty
 * listing still renders the designed zero-data state rather than a bare rule,
 * that a listing failure is left to the error boundary, and that the segment
 * stays dynamic and free of any client boundary.
 */

vi.mock('@/lib/api/projects', () => ({
  listProjects: vi.fn(),
}));

/** Listing returned by the stubbed API: one project with a repository, one without. */
const projects: Project[] = [
  {
    id: 'pgqueue',
    name: 'pgqueue',
    description: 'A durable job queue built on PostgreSQL advisory locks.',
    primary_link: 'https://pgqueue.dev',
    github_link: 'https://github.com/psauerborn/pgqueue',
  },
  {
    id: 'helix',
    name: 'Helix event platform',
    description: 'An event platform moving four million messages a day.',
    primary_link: 'https://example.com/helix',
    github_link: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listProjects).mockResolvedValue(projects);
});

describe('ProjectsPage', () => {
  it('renders every project of the listing server-side', async () => {
    render(await ProjectsPage());

    expect(listProjects).toHaveBeenCalledTimes(1);
    for (const project of projects) {
      expect(screen.getByRole('link', { name: project.name })).toHaveAttribute(
        'href',
        project.primary_link,
      );
      expect(screen.getByText(project.description)).toBeInTheDocument();
    }
  });

  it('renders the empty state for an empty listing', async () => {
    vi.mocked(listProjects).mockResolvedValue([]);

    render(await ProjectsPage());

    expect(screen.getByText('No projects listed yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Read the writing' }),
    ).toHaveAttribute('href', '/blog');
  });

  it('propagates a failure of the listing to the error boundary', async () => {
    vi.mocked(listProjects).mockRejectedValue(
      new Error('projects unavailable'),
    );

    await expect(ProjectsPage()).rejects.toThrow('projects unavailable');
  });

  it('gives the document a single top-level heading', async () => {
    render(await ProjectsPage());

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('declares the route dynamic so the build never prerenders it', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('exports metadata carrying a title and a description', () => {
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
  });

  it('declares no client boundary', () => {
    // Assembled rather than written out so this assertion does not match its
    // own source, and anchored to a quoted directive so prose about the client
    // boundary is not mistaken for one declaring it.
    const directive = new RegExp(`(['"])use ${'client'}\\1`);
    const source = readFileSync(
      resolve(import.meta.dirname, 'page.tsx'),
      'utf8',
    );

    expect(directive.test(source)).toBe(false);
  });
});
