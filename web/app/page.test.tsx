import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CVResponse } from '@/lib/api/types';

import HomePage, { dynamic, metadata } from './page';

/**
 * A minimal but complete CV, standing in for the `GET /v1/cv` payload the page
 * reads on the server. It carries one role and one course so the explorer has
 * real content to render without the test asserting anything about it — the CV
 * section explorer has its own tests.
 */
const CV: CVResponse = {
  skills: { Languages: ['Go', 'TypeScript'] },
  experience: [
    {
      id: 'experience-1',
      organization: 'Helix Systems',
      job_title: 'Principal Backend Engineer',
      start_date: '2023-02-01T00:00:00Z',
      end_date: null,
      description: 'Event-driven platform work.',
      tech_stack: ['Go'],
      responsibilities: ['Owned the ingestion pipeline.'],
    },
  ],
  education: [
    {
      id: 'education-1',
      institution: 'University of Nottingham',
      certificate: 'MSc Physics',
      start_date: '2011-09-01T00:00:00Z',
      end_date: '2015-07-01T00:00:00Z',
    },
  ],
};

// The page is a Server Component that reads the CV over HTTP. The reader is
// mocked at the module boundary so the composition can be rendered without a
// network, which is what these tests are about.
vi.mock('@/lib/api/cv', () => ({
  getCV: vi.fn(async () => CV),
}));

/**
 * The page module's own source, read for directive-level assertions. Vitest
 * runs with the `web/` package root as its working directory.
 */
const pageSource = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

/**
 * sectionSlots returns the `data-slot` name of every section the page stacks,
 * in DOM order.
 *
 * Only the direct children of the section stack are read: the sections nest
 * shadcn primitives that carry `data-slot` attributes of their own, and those
 * are not part of the page's composition.
 *
 * @param container - the rendered page's container element.
 * @returns the section slot names, in the order the page renders them.
 */
function sectionSlots(container: HTMLElement): (string | undefined)[] {
  const stack = container.firstElementChild;

  return Array.from(stack?.children ?? []).map(
    (section) => (section as HTMLElement).dataset.slot,
  );
}

describe('HomePage', () => {
  it('renders the personal details masthead and the agentic summary', async () => {
    render(await HomePage());

    expect(
      screen.getByRole('heading', { level: 1, name: /pascal sauerborn/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /written by agents, under a spec/i,
      }),
    ).toBeInTheDocument();
  });

  it('stacks every homepage section in DES-001 order', async () => {
    const { container } = render(await HomePage());

    expect(sectionSlots(container)).toEqual([
      'personal-details-header',
      'cv-section-explorer',
      'agentic-summary',
      'contact-form',
    ]);
  });

  it('renders the masthead as the first child of the stack', async () => {
    // The hero's fold arithmetic is positional: subtracting only the sticky
    // header and `<main>`'s top padding is exact only while nothing else of the
    // page sits above the hero. This pins that precondition.
    const { container } = render(await HomePage());

    expect(sectionSlots(container)[0]).toBe('personal-details-header');
  });

  it('renders the page index inside the first fold', async () => {
    const { container } = render(await HomePage());
    const hero = container.firstElementChild?.firstElementChild;
    const index = screen.getByRole('navigation', { name: /on this page/i });

    expect(hero).toContainElement(index);
  });

  it('renders no shell elements, which belong to the layout', async () => {
    const { container } = render(await HomePage());

    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
  });

  it('exports metadata with a non-empty title and description', () => {
    expect(typeof metadata.title).toBe('string');
    expect(metadata.title as string).not.toHaveLength(0);
    expect(typeof metadata.description).toBe('string');
    expect(metadata.description as string).not.toHaveLength(0);
  });

  it('declares the route dynamic, as SPEC-003 section 6.1 requires', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('is a Server Component with no "use client" directive', () => {
    expect(pageSource).not.toMatch(/["']use client["']/);
  });
});
