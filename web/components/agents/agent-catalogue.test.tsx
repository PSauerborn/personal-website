import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentCatalogue } from '@/components/agents/agent-catalogue';
import type { Agent } from '@/lib/api/types';

/**
 * Coverage for the agent catalogue (AC-4, AC-5, AC-7, SPEC-003 REQ-RV1-2.1).
 *
 * The catalogue shows one subagent at a time behind the panel header's select,
 * but every subagent stays in the server-rendered HTML so crawlers still read
 * the whole catalogue: the hiding is one CSS rule keyed on `data-selected`, not
 * a filtered render. jsdom applies no CSS, so a "hidden" body is still
 * queryable here and a count of rendered rows would assert nothing about what a
 * reader sees. The tests therefore assert the data-attribute contract the CSS
 * rule keys on — every body present, exactly one marked selected, and the
 * marker moving on change — with the rule itself asserted in `globals.test.ts`.
 *
 * The rest is the documentation contract that predates the panel: each agent's
 * name, its API description, both schemas, the explicit "None declared" line
 * for a schema the API returns empty, and the fallback prose for an agent this
 * repository has authored none for. The absence of a client boundary is
 * asserted against the source text because the directive has no runtime effect
 * under vitest.
 */

/** A listing covering an authored agent, an unknown agent and empty schemas. */
const agents: Agent[] = [
  {
    id: 'code-reviewer',
    name: 'code-reviewer',
    description:
      'Reads the changeset diff the way a senior engineer reads a pull request.',
    inputs: { workPlanId: 'string', manifestPath: 'string' },
    outputs: { findings: 'array', remediationTask: 'object' },
  },
  {
    id: 'acceptance-validator',
    name: 'acceptance-validator',
    description:
      'Runs the Gherkin scenarios tagged with the spec under change.',
    inputs: {},
    outputs: {},
  },
  {
    id: 'ledger-archivist',
    name: 'ledger-archivist',
    description: 'An agent this repository has authored no prose for.',
    inputs: { ledgerPath: 'string' },
    outputs: {},
  },
];

/**
 * agentBody returns the catalogue body belonging to the given agent id.
 *
 * Bodies are addressed by `data-agent` rather than by role, because that is the
 * attribute the switcher and the hiding rule both key on.
 *
 * @param id - the agent id the body declares.
 * @returns the body element, so assertions are scoped to a single agent.
 */
function agentBody(id: string): HTMLElement {
  const body = document.querySelector<HTMLElement>(`[data-agent="${id}"]`);
  if (!body) {
    throw new Error(`no catalogue body for agent ${id}`);
  }

  return body;
}

/**
 * selectedIds returns the agent ids of every body currently marked selected.
 *
 * @returns the `data-agent` values carrying the `data-selected` marker.
 */
function selectedIds(): string[] {
  return [...document.querySelectorAll('[data-agent][data-selected]')].map(
    (body) => body.getAttribute('data-agent') ?? '',
  );
}

describe('AgentCatalogue', () => {
  it('server-renders a body for every agent of the listing', () => {
    const markup = renderToStaticMarkup(<AgentCatalogue agents={agents} />);
    const rendered = [...markup.matchAll(/data-agent="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(rendered).toEqual(agents.map((agent) => agent.id));
  });

  it('hides nothing before the switcher mounts', () => {
    const markup = renderToStaticMarkup(<AgentCatalogue agents={agents} />);

    expect(markup).not.toContain('data-switcher');
    expect(markup).not.toContain('data-selected');
    expect(markup).toContain('3 agents');
  });

  it('marks exactly the first agent selected once the switcher mounts', () => {
    render(<AgentCatalogue agents={agents} />);

    expect(selectedIds()).toEqual([agents[0].id]);
    expect(
      document.querySelector('[data-switcher="ready"]'),
    ).toBeInTheDocument();
  });

  it('moves the selection marker when another agent is chosen', () => {
    render(<AgentCatalogue agents={agents} />);

    fireEvent.change(screen.getByLabelText('Subagent'), {
      target: { value: 'ledger-archivist' },
    });

    expect(selectedIds()).toEqual(['ledger-archivist']);
  });

  it('counts the chosen agent against the listing once hydrated', () => {
    render(<AgentCatalogue agents={agents} />);

    expect(screen.getByRole('status')).toHaveTextContent('1 of 3');
  });

  it('offers a one-option select for a listing of a single agent', () => {
    render(<AgentCatalogue agents={[agents[0]]} />);

    expect(screen.getByRole('status')).toHaveTextContent('1 of 1');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(selectedIds()).toEqual([agents[0].id]);
  });

  it('renders every agent with its name and description', () => {
    render(<AgentCatalogue agents={agents} />);

    for (const agent of agents) {
      const body = agentBody(agent.id);

      expect(within(body).getByText(agent.name)).toBeInTheDocument();
      expect(within(body).getByText(agent.description)).toBeInTheDocument();
    }
  });

  it('renders the declared input and output fields of an agent', () => {
    render(<AgentCatalogue agents={agents} />);
    const body = agentBody('code-reviewer');

    expect(within(body).getByText('Inputs')).toBeInTheDocument();
    expect(within(body).getByText('workPlanId')).toBeInTheDocument();
    expect(within(body).getByText('manifestPath')).toBeInTheDocument();
    expect(within(body).getByText('Outputs')).toBeInTheDocument();
    expect(within(body).getByText('findings')).toBeInTheDocument();
    expect(within(body).getByText('remediationTask')).toBeInTheDocument();
  });

  it('states that an agent declaring empty schemas has none', () => {
    render(<AgentCatalogue agents={agents} />);
    const body = agentBody('acceptance-validator');

    expect(within(body).getAllByText('None declared')).toHaveLength(2);
  });

  it('renders the authored purpose prose of a known agent', () => {
    render(<AgentCatalogue agents={agents} />);
    const body = agentBody('code-reviewer');

    expect(within(body).getByText('Review gates')).toBeInTheDocument();
  });

  it('falls back to generic prose for an agent without authored prose', () => {
    render(<AgentCatalogue agents={agents} />);
    const body = agentBody('ledger-archivist');

    expect(
      within(body).getByText(/part of the subagent pipeline/i),
    ).toBeInTheDocument();
    expect(within(body).getByText('ledgerPath')).toBeInTheDocument();
    expect(within(body).getByText('None declared')).toBeInTheDocument();
  });

  it('renders an empty state when the listing carries no agents', () => {
    render(<AgentCatalogue agents={[]} />);

    expect(document.querySelectorAll('[data-agent]')).toHaveLength(0);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(selectedIds()).toEqual([]);
    expect(screen.getByText('No agents published yet')).toBeInTheDocument();
  });

  it('is a server component that carries no client directive', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/agents/agent-catalogue.tsx'),
      'utf8',
    );

    expect(source).not.toContain('use client');
  });
});
