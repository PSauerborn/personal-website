import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentWorkflow } from '@/components/agents/agent-workflow';

/**
 * Coverage for the authored workflow section (AC-6, AC-9, SPEC-003 REQ-3.1,
 * REQ-3.2, REQ-3.5).
 *
 * The content of this section is authored rather than fetched, so the tests
 * assert the two things that can silently regress: that every stage of the
 * `subagents-dev` pipeline is still named in the narrative, and that the
 * graphical representation of the pipeline renders with a text alternative.
 *
 * The repository link is covered in both of its branches. The user-supplied
 * URL is still outstanding, so `siteConfig.agentsRepositoryUrl` is `null` in
 * the committed configuration: the module is mocked here to drive the supplied
 * branch from a fixture, and the source text is asserted to contain no
 * `github.com` literal so no mockup placeholder can be smuggled in.
 */

/** Mutable stand-in for the committed configuration, hoisted above the mock. */
const config = vi.hoisted(() => ({
  agentsRepositoryUrl: null as string | null,
}));

vi.mock('@/lib/siteConfig', () => ({ siteConfig: config }));

/** A repository URL supplied by the test, never by the DES-001 mockup. */
const SUPPLIED_URL = 'https://example.test/agents-repository';

/** Every stage the workflow narrative must name. */
const STAGE_NAMES = [
  /spec review/i,
  /requirements analysis/i,
  /^planning/i,
  /decomposition/i,
  /execution/i,
  /review gates/i,
  /acceptance validation/i,
];

/** The path of the component source, read for the source-text assertions. */
const SOURCE_PATH = resolve(
  process.cwd(),
  'components/agents/agent-workflow.tsx',
);

beforeEach(() => {
  config.agentsRepositoryUrl = null;
});

describe('AgentWorkflow', () => {
  it('names every stage of the pipeline in the narrative', () => {
    render(<AgentWorkflow />);
    const narrative = screen.getByRole('list');

    for (const stage of STAGE_NAMES) {
      expect(
        within(narrative).getByRole('heading', { name: stage }),
      ).toBeInTheDocument();
    }
  });

  it('describes every stage of the narrative in prose', () => {
    render(<AgentWorkflow />);
    const stages = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(stages.length).toBeGreaterThanOrEqual(STAGE_NAMES.length);
    for (const stage of stages) {
      expect(stage.querySelector('p')).not.toBeNull();
    }
  });

  it('renders the pipeline diagram with an accessible text alternative', () => {
    render(<AgentWorkflow />);
    const diagram = screen.getByRole('img', {
      name: /subagents-dev pipeline/i,
    });

    expect(diagram.tagName.toLowerCase()).toBe('svg');
    expect(diagram).toHaveAccessibleDescription(/spec review/i);
    expect(diagram).toHaveAccessibleDescription(/review gates/i);
  });

  it('renders the repository link when a URL is supplied', () => {
    config.agentsRepositoryUrl = SUPPLIED_URL;
    render(<AgentWorkflow />);
    const link = screen.getByRole('link', { name: /repository/i });

    expect(link).toHaveAttribute('href', SUPPLIED_URL);
  });

  it('omits the repository link entirely when no URL is supplied', () => {
    const { container } = render(<AgentWorkflow />);

    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('omits the repository link when the configured URL is empty', () => {
    config.agentsRepositoryUrl = '';
    const { container } = render(<AgentWorkflow />);

    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('hard-codes no repository URL of its own', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).not.toContain('github.com');
  });

  it('is a server component that carries no client directive', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).not.toContain('use client');
  });
});
