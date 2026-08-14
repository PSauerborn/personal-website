import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgenticSummary } from '@/components/home/agentic-summary';

/**
 * Coverage for the homepage agentic summary section (REQ-2.3).
 *
 * The copy is authored rather than fetched, so the assertions pin the three
 * subjects the spec names — acceptance-criteria-driven spec development,
 * indexed coding standards, and subagent orchestration — the ordinals that
 * number them, and the link out to the full dossier. The source file is read
 * back to prove the section stays a Server Component (REQ-1.6).
 */
describe('AgenticSummary', () => {
  it('renders three numbered rows', () => {
    render(<AgenticSummary />);

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
  });

  it('covers acceptance criteria in the first row', () => {
    render(<AgenticSummary />);

    const row = screen.getByTestId('agentic-summary-point-1');
    expect(row.textContent).toMatch(/acceptance criteria/i);
  });

  it('covers indexed coding standards in the second row', () => {
    render(<AgenticSummary />);

    const row = screen.getByTestId('agentic-summary-point-2');
    expect(row.textContent).toMatch(/coding standards/i);
  });

  it('covers subagent orchestration in the third row', () => {
    render(<AgenticSummary />);

    const row = screen.getByTestId('agentic-summary-point-3');
    expect(row.textContent).toMatch(/subagent orchestration/i);
  });

  it('links to the agents page', () => {
    render(<AgenticSummary />);

    const link = screen.getByRole('link', {
      name: /workflow and agent catalogue/i,
    });
    expect(link).toHaveAttribute('href', '/agents');
  });

  it('is a server component', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, 'agentic-summary.tsx'), 'utf8');

    expect(source).not.toContain('use client');
  });
});
