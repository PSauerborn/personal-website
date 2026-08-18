import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SPEC_DOCUMENT_TIMEOUT_MS,
  getSpecDocument,
  listAgents,
  listSpecs,
} from '@/lib/api/agents';
import { ApiError, DEFAULT_TIMEOUT_MS } from '@/lib/api/client';
import type { Agent, Spec } from '@/lib/api/types';

import AgentsPage, { dynamic, metadata } from './page';

/**
 * Coverage for the `/agents` route assembly (AC-6, AC-7, AC-8, AC-9, PC-3,
 * PC-9, PC-11, PC-12, PC-13).
 *
 * The load-bearing assertion is the degradation one: the page fans out one
 * content request per visible spec document, and a single rejected or hung
 * request must leave the whole page rendered with that one document marked
 * unavailable rather than throwing to the error boundary (RISK-006/007). The
 * rest of the suite pins the narrative act order and the intro outline, the
 * exported metadata, and the absence of any client boundary on the route.
 */

vi.mock('@/lib/api/agents', async (importOriginal) => ({
  // The fan-out timeout is a real published value rather than a test constant,
  // so the module's own constants are kept and only its readers are stubbed.
  ...(await importOriginal<typeof import('@/lib/api/agents')>()),
  listAgents: vi.fn(),
  listSpecs: vi.fn(),
  getSpecDocument: vi.fn(),
}));

/** Catalogue returned by the stubbed API. */
const agents: Agent[] = [
  {
    id: 'task-executor',
    name: 'task-executor',
    description: 'Implements exactly one task file.',
    inputs: { taskFilePath: 'string' },
    outputs: { status: 'string' },
  },
];

/** Listing returned by the stubbed API: two documents under one spec. */
const specs: Spec[] = [
  {
    id: 'SPEC-003',
    display_name: 'The user interface',
    description: 'This site: routes, rendering strategy, client boundary.',
    documents: [
      {
        document_id: 'doc-spec-003',
        filename: 'SPEC-003.md',
        document_type: 'spec',
      },
      {
        document_id: 'doc-acceptance-003',
        filename: 'SPEC-003-acceptance.md',
        document_type: 'acceptance',
      },
    ],
  },
];

/** Body of the document whose fetch succeeds. */
const READABLE_BODY = 'REQ-1.1 The site renders server-side.';

/** Line the spec listing shows in place of a body the page could not fetch. */
const UNAVAILABLE = 'Content unavailable';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAgents).mockResolvedValue(agents);
  vi.mocked(listSpecs).mockResolvedValue(specs);
  vi.mocked(getSpecDocument).mockResolvedValue(READABLE_BODY);
});

afterEach(() => {
  vi.useRealTimers();
  // The logging tests spy on `console.log`; without this the spy would outlive
  // the test that installed it and swallow output from the rest of the file.
  vi.restoreAllMocks();
});

describe('AgentsPage', () => {
  it('renders the acts in the narrative order of the three foundations', async () => {
    const { container } = render(await AgentsPage());

    // The narrative runs in the homepage's foundation order: the specs come
    // first with the ledger as evidence, the standards index second, and
    // orchestration last — the workflow account followed by its catalogue.
    const listing = container.querySelector('[data-slot="spec-listing"]');
    const standards = container.querySelector(
      '[data-slot="standards-foundation"]',
    );
    const workflow = container.querySelector('[data-slot="agent-workflow"]');
    const catalogue = container.querySelector('[data-slot="agent-catalogue"]');

    expect(listing).not.toBeNull();
    expect(standards).not.toBeNull();
    expect(workflow).not.toBeNull();
    expect(catalogue).not.toBeNull();
    expect(
      listing!.compareDocumentPosition(standards!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      standards!.compareDocumentPosition(workflow!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      workflow!.compareDocumentPosition(catalogue!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole('listitem', { name: 'task-executor' }),
    ).toBeInTheDocument();
    expect(screen.getByText('The user interface')).toBeInTheDocument();
  });

  it('opens with an outline linking each foundation to its act', async () => {
    render(await AgentsPage());
    const outline = screen.getByRole('navigation', {
      name: /three foundations/i,
    });
    const links = within(outline).getAllByRole('link');

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#foundation-specs',
      '#foundation-standards',
      '#foundation-orchestration',
    ]);
  });

  it('closes on a single call to action pointing at the contact section', async () => {
    render(await AgentsPage());
    const cta = screen.getByRole('link', { name: /what you.re building/i });

    expect(cta).toHaveAttribute('href', '/#contact');
  });

  it('fetches every visible document through the agents module', async () => {
    render(await AgentsPage());

    expect(getSpecDocument).toHaveBeenCalledTimes(2);
    expect(getSpecDocument).toHaveBeenCalledWith(
      'SPEC-003',
      'doc-spec-003',
      expect.anything(),
    );
    expect(getSpecDocument).toHaveBeenCalledWith(
      'SPEC-003',
      'doc-acceptance-003',
      expect.anything(),
    );
    expect(screen.getAllByText(READABLE_BODY)).toHaveLength(2);
  });

  it('renders the rest of the page when one document fetch rejects', async () => {
    vi.mocked(getSpecDocument).mockImplementation(
      async (_specId: string, documentId: string) => {
        if (documentId === 'doc-acceptance-003') {
          throw new Error('request timed out');
        }
        return READABLE_BODY;
      },
    );

    const { container } = render(await AgentsPage());

    expect(
      container.querySelector('[data-slot="agent-workflow"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole('listitem', { name: 'task-executor' }),
    ).toBeInTheDocument();
    expect(screen.getByText(READABLE_BODY)).toBeInTheDocument();
    expect(screen.getAllByText(UNAVAILABLE)).toHaveLength(1);
  });

  it('logs one structured record when a document fetch rejects', async () => {
    const written: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      written.push(line);
    });
    vi.mocked(getSpecDocument).mockImplementation(
      async (_specId: string, documentId: string) => {
        if (documentId === 'doc-acceptance-003') {
          throw new Error('request timed out');
        }
        return READABLE_BODY;
      },
    );

    render(await AgentsPage());

    expect(written).toHaveLength(1);
    const record = JSON.parse(written[0]) as Record<string, unknown>;
    expect(typeof record.message).toBe('string');
    expect(typeof record.timestamp).toBe('number');
    expect(record.level).toBe('warn');
    // The failure is degraded rather than propagated, so the record has to
    // carry enough context to name the document that was dropped.
    expect(record.spec_id).toBe('SPEC-003');
    expect(record.document_id).toBe('doc-acceptance-003');
    expect(record.reason).toContain('request timed out');
  });

  it('logs nothing when every document fetch succeeds', async () => {
    const written: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      written.push(line);
    });

    render(await AgentsPage());

    expect(written).toEqual([]);
  });

  it('bounds each document request by the fan-out timeout', async () => {
    render(await AgentsPage());

    expect(SPEC_DOCUMENT_TIMEOUT_MS).toBeLessThan(DEFAULT_TIMEOUT_MS);
    expect(getSpecDocument).toHaveBeenCalledWith('SPEC-003', 'doc-spec-003', {
      timeoutMs: SPEC_DOCUMENT_TIMEOUT_MS,
    });
  });

  it('renders the page once the fan-out timeout expires on a hung document', async () => {
    vi.useFakeTimers();
    // Stands in for the client's own `AbortSignal.timeout`: the request settles
    // only after the timeout the caller asked for, so a page that requests none
    // waits the full ten-second default and this test never completes.
    vi.mocked(getSpecDocument).mockImplementation(
      (_specId: string, documentId: string, options = {}) =>
        documentId === 'doc-acceptance-003'
          ? new Promise<string>((_resolve, reject) => {
              setTimeout(
                () => reject(new ApiError('request timed out')),
                options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
              );
            })
          : Promise.resolve(READABLE_BODY),
    );

    const pending = AgentsPage();
    await vi.advanceTimersByTimeAsync(SPEC_DOCUMENT_TIMEOUT_MS);

    render(await pending);

    expect(
      screen.getByRole('listitem', { name: 'task-executor' }),
    ).toBeInTheDocument();
    expect(screen.getByText(READABLE_BODY)).toBeInTheDocument();
    expect(screen.getAllByText(UNAVAILABLE)).toHaveLength(1);
  });

  it('propagates a failure of the agent listing itself', async () => {
    vi.mocked(listAgents).mockRejectedValue(new Error('catalogue unavailable'));

    await expect(AgentsPage()).rejects.toThrow('catalogue unavailable');
  });

  it('declares the route dynamic so the build never prerenders it', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('exports metadata carrying a title and a description', () => {
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
  });
});

/**
 * sourceFiles lists every source file under the given directory, recursively.
 *
 * @param directory - absolute path of the directory to walk.
 * @returns the absolute paths of the files it contains.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('agents route client boundary', () => {
  it('declares no client component anywhere on the route', () => {
    const roots = [
      resolve(import.meta.dirname, '.'),
      resolve(import.meta.dirname, '../../components/agents'),
    ];
    // Assembled rather than written out so this assertion does not match its
    // own source, and anchored to a quoted directive so a test discussing the
    // client boundary in prose is not mistaken for one declaring it.
    const directive = new RegExp(`(['"])use ${'client'}\\1`);

    const offenders = roots
      .flatMap(sourceFiles)
      .filter((path) => !path.endsWith('.test.tsx'))
      .filter((path) => directive.test(readFileSync(path, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
