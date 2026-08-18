import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CVSectionExplorer,
  visibleExperienceIds,
} from '@/components/home/cv-section-explorer';
import type { CVResponse } from '@/lib/api/types';

/**
 * Coverage for the CV section explorer island (AC-2, PC-5, PC-6).
 *
 * The fixture is deliberately small but complete: two skill categories, three
 * roles of which only some carry the filtered skill, one current role with a
 * null `end_date`, and two education entries. The assertions pin the behaviour
 * the acceptance criteria and DES-001 bind — section order, filtering by the
 * `hidden` attribute rather than by unmounting, the announced result count, the
 * suppressed filter bar, and the rendering of an open-ended date range — rather
 * than the copy around them.
 */
const CV: CVResponse = {
  skills: {
    Languages: ['Go', 'Python'],
    Data: ['Kafka', 'PostgreSQL'],
  },
  experience: [
    {
      id: 'exp-1',
      organization: 'Helix Systems',
      job_title: 'Principal Backend Engineer',
      start_date: '2023-02-01T00:00:00Z',
      end_date: null,
      description: 'Lead engineer on the event platform.',
      tech_stack: ['Go', 'Kafka'],
      responsibilities: ['Designed the event schema registry.'],
    },
    {
      id: 'exp-2',
      organization: 'Northwind Data',
      job_title: 'Senior Platform Engineer',
      start_date: '2020-06-01T00:00:00Z',
      end_date: '2023-01-31T00:00:00Z',
      description: 'Owned the ingestion pipeline.',
      tech_stack: ['Python', 'PostgreSQL'],
      responsibilities: ['Ran the migration off the legacy bus.'],
    },
    {
      id: 'exp-3',
      organization: 'Meridian Logistics',
      job_title: 'Backend Engineer',
      start_date: '2017-09-01T00:00:00Z',
      end_date: '2020-05-31T00:00:00Z',
      description: 'Built the shipment service.',
      tech_stack: ['Go'],
      responsibilities: ['Maintained the routing engine.'],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'University of Nottingham',
      certificate: 'PhD Physics',
      start_date: '2014-09-01T00:00:00Z',
      end_date: '2017-08-31T00:00:00Z',
    },
    {
      id: 'edu-2',
      institution: 'Open University',
      certificate: 'MSc Computer Science',
      start_date: '2023-09-01T00:00:00Z',
      end_date: null,
    },
  ],
};

/** readSource reads the component's own source, for directive-level assertions. */
function readSource(): string {
  return readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'cv-section-explorer.tsx'),
    'utf8',
  );
}

/** experienceRow returns the master-list row belonging to one experience entry. */
function experienceRow(id: string): HTMLElement {
  return screen.getByTestId(`cv-experience-row-${id}`);
}

describe('visibleExperienceIds', () => {
  it('returns every entry when no skill is selected', () => {
    expect(visibleExperienceIds(CV.experience, null)).toEqual(
      new Set(['exp-1', 'exp-2', 'exp-3']),
    );
  });

  it('returns only the entries whose stack carries the selected skill', () => {
    expect(visibleExperienceIds(CV.experience, 'Kafka')).toEqual(
      new Set(['exp-1']),
    );
  });

  it('matches a skill irrespective of its casing', () => {
    expect(visibleExperienceIds(CV.experience, 'go')).toEqual(
      new Set(['exp-1', 'exp-3']),
    );
  });

  it('returns an empty set when no entry carries the skill', () => {
    expect(visibleExperienceIds(CV.experience, 'COBOL')).toEqual(new Set());
  });
});

describe('CVSectionExplorer', () => {
  it('renders the headline skills, then experience, then education (AC-2)', () => {
    const { container } = render(<CVSectionExplorer cv={CV} />);

    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>('[data-cv-block]'),
    ).map((element) => element.dataset.cvBlock);

    expect(blocks).toEqual(['skills', 'experience', 'education']);
  });

  it('renders every experience and education entry into the markup', () => {
    render(<CVSectionExplorer cv={CV} />);

    for (const entry of CV.experience) {
      expect(experienceRow(entry.id)).toBeInTheDocument();
    }
    expect(screen.getByText('University of Nottingham')).toBeInTheDocument();
    expect(screen.getByText('Open University')).toBeInTheDocument();
  });

  it('hides non-matching rows with the hidden attribute rather than unmounting them', () => {
    render(<CVSectionExplorer cv={CV} />);

    fireEvent.click(screen.getByRole('button', { name: 'Kafka' }));

    expect(experienceRow('exp-1')).not.toHaveAttribute('hidden');
    expect(experienceRow('exp-2')).toHaveAttribute('hidden');
    expect(experienceRow('exp-3')).toHaveAttribute('hidden');
  });

  it('marks the pressed chip with aria-pressed and releases it on a second click', () => {
    render(<CVSectionExplorer cv={CV} />);
    const chip = screen.getByRole('button', { name: 'Kafka' });

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(experienceRow('exp-2')).not.toHaveAttribute('hidden');
  });

  it('announces the visible count through a role="status" counter', () => {
    render(<CVSectionExplorer cv={CV} />);
    const counter = screen.getByRole('status');

    expect(counter).toHaveTextContent('3 roles');

    fireEvent.click(screen.getByRole('button', { name: 'Kafka' }));

    expect(counter).toHaveTextContent('1 of 3 roles used Kafka');
  });

  it('suppresses the filter bar for an empty skills map, keeping the timelines', () => {
    render(<CVSectionExplorer cv={{ ...CV, skills: {} }} />);

    expect(screen.queryByTestId('cv-skill-filters')).not.toBeInTheDocument();
    expect(experienceRow('exp-1')).toBeInTheDocument();
    expect(screen.getByText('University of Nottingham')).toBeInTheDocument();
  });

  it('renders a null end_date as "Current", never as null or Invalid Date', () => {
    render(<CVSectionExplorer cv={CV} />);

    expect(experienceRow('exp-1')).toHaveTextContent(/Current/);
    expect(document.body.textContent).not.toMatch(/null|Invalid Date|NaN/);
  });

  it('shows the education timeline on the education tab', () => {
    render(<CVSectionExplorer cv={CV} />);

    // Radix activates a tab trigger on mousedown, not on click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /education/i }));

    const education = screen.getByTestId('cv-education-timeline');
    expect(within(education).getByText('PhD Physics')).toBeInTheDocument();
    expect(within(education).getByText('Open University')).toBeInTheDocument();
  });

  it('switches which panel is active rather than showing both at once', () => {
    const { container } = render(<CVSectionExplorer cv={CV} />);

    // Both panels are force-mounted so the whole CV is in the first response
    // (REQ-1.5), which means `data-state` — not presence in the DOM — is what
    // says which one is on screen. `TabsContent` hides the inactive one on
    // exactly this attribute; asserting it here is what would have caught the
    // education entries rendering underneath the experience panel.
    const panel = (block: string) =>
      container.querySelector(`[data-cv-block="${block}"]`);

    expect(panel('experience')).toHaveAttribute('data-state', 'active');
    expect(panel('education')).toHaveAttribute('data-state', 'inactive');

    fireEvent.mouseDown(screen.getByRole('tab', { name: /education/i }));

    expect(panel('experience')).toHaveAttribute('data-state', 'inactive');
    expect(panel('education')).toHaveAttribute('data-state', 'active');
  });

  it('reports the role count only while the experience tab is open', () => {
    render(<CVSectionExplorer cv={CV} />);

    expect(screen.getByRole('status')).toHaveTextContent(/roles?$/);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /education/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /experience/i }));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the detail of the selected role and follows the selection', () => {
    render(<CVSectionExplorer cv={CV} />);

    const detail = screen.getByTestId('cv-experience-detail');
    expect(detail).toHaveTextContent('Principal Backend Engineer');

    fireEvent.click(experienceRow('exp-2'));

    expect(detail).toHaveTextContent('Senior Platform Engineer');
    expect(experienceRow('exp-2')).toHaveAttribute('aria-current', 'true');
  });

  it('falls back to the first visible role when the selection is filtered out', () => {
    render(<CVSectionExplorer cv={CV} />);

    fireEvent.click(experienceRow('exp-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Kafka' }));

    expect(screen.getByTestId('cv-experience-detail')).toHaveTextContent(
      'Principal Backend Engineer',
    );
  });

  it('is a client island that fetches nothing itself (PC-5)', () => {
    const source = readSource();

    expect(source).toMatch(/^['"]use client['"]/);
    expect(source).not.toMatch(/\bfetch\(|getCV\b|useEffect\b/);
  });
});
