import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StandardsFoundation } from '@/components/agents/standards-foundation';

/**
 * Coverage for the standards act of the agents narrative (REQ-2.3,
 * foundation two).
 *
 * The content is authored rather than fetched, so the tests pin the technical
 * claims that can silently regress: that the section still explains the index
 * by its two selectors — file-scope globs and topics — that the figure still
 * walks concrete index rows, and that the narrative still names both readers
 * of the index, the executing agent and the quality controller.
 */

/** The path of the component source, read for the source-text assertions. */
const SOURCE_PATH = resolve(
  process.cwd(),
  'components/agents/standards-foundation.tsx',
);

describe('StandardsFoundation', () => {
  it('carries the anchor the intro outline links to', () => {
    const { container } = render(<StandardsFoundation />);

    expect(container.querySelector('#foundation-standards')).not.toBeNull();
  });

  it('explains the index by scope and topic and its MUST/SHOULD grammar', () => {
    render(<StandardsFoundation />);

    expect(screen.getByText(/file-scope globs/i)).toBeInTheDocument();
    expect(screen.getByText(/topic terms/i)).toBeInTheDocument();
    expect(screen.getByText(/MUST or SHOULD/)).toBeInTheDocument();
  });

  it('walks concrete index rows, each with a selector and prose', () => {
    render(<StandardsFoundation />);
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.querySelector('p')).not.toBeNull();
    }
    // Both selector kinds appear, so the figure demonstrates the index rather
    // than one half of it.
    expect(screen.getAllByText(/^scope/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/^topic$/)).toBeInTheDocument();
  });

  it('names both readers of the index', () => {
    render(<StandardsFoundation />);

    expect(screen.getByText(/executing agent/i)).toBeInTheDocument();
    expect(screen.getByText(/quality controller/i)).toBeInTheDocument();
  });

  it('is a server component that carries no client directive', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).not.toContain('use client');
  });
});
