import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  ApiNotFoundError,
  DEFAULT_TIMEOUT_MS,
  fetchJson as fetchJsonImpl,
  fetchText as fetchTextImpl,
} from './client';
import {
  SPEC_DOCUMENT_TIMEOUT_MS,
  getSpecDocument,
  listAgents,
  listSpecs,
} from './agents';
import type { Agent, AgentSpec } from './types';

// The resource module is exercised against a stubbed transport: the readers are
// replaced while the error types are kept, so a test can assert both which
// reader was used and which failure was raised.
vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    fetchJson: vi.fn(),
    fetchText: vi.fn(),
  };
});

const fetchJson = vi.mocked(fetchJsonImpl);
const fetchText = vi.mocked(fetchTextImpl);

/**
 * agent builds a catalogue agent, overriding only the fields a test cares
 * about.
 *
 * @param overrides - fields replacing the defaults of the agent.
 * @returns a complete `Agent`.
 */
function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'task-executor',
    name: 'Task Executor',
    description: 'Executes a single task file',
    inputs: { taskFilePath: 'string' },
    outputs: { status: 'string' },
    ...overrides,
  };
}

/**
 * spec builds an agent spec, overriding only the fields a test cares about.
 *
 * @param overrides - fields replacing the defaults of the spec.
 * @returns a complete `AgentSpec`.
 */
function spec(overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    id: 'SPEC-001',
    display_name: 'Website rebuild',
    description: 'Rebuild of psauerborn.dev',
    documents: [
      {
        document_id: 'doc-1',
        filename: 'SPEC-001.md',
        document_type: 'spec',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('listAgents', () => {
  it('requests the agent catalogue and returns its agents', async () => {
    const entry = agent();
    fetchJson.mockResolvedValue({ agents: [entry] });

    await expect(listAgents()).resolves.toEqual([entry]);
    expect(fetchJson).toHaveBeenCalledWith('/v1/agents/list');
  });

  it('returns an empty catalogue as an empty array', async () => {
    fetchJson.mockResolvedValue({ agents: [] });

    await expect(listAgents()).resolves.toEqual([]);
  });

  it('parses an agent that declares no inputs or outputs', async () => {
    fetchJson.mockResolvedValue({
      agents: [agent({ inputs: {}, outputs: {} })],
    });

    const agents = await listAgents();

    expect(agents[0].inputs).toEqual({});
    expect(agents[0].outputs).toEqual({});
  });

  it('propagates a failure of the catalogue', async () => {
    fetchJson.mockRejectedValue(new ApiError('boom', { status: 500 }));

    await expect(listAgents()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('listSpecs', () => {
  it('requests the spec listing and returns its specs', async () => {
    const entry = spec();
    fetchJson.mockResolvedValue({ specs: [entry] });

    await expect(listSpecs()).resolves.toEqual([entry]);
    expect(fetchJson).toHaveBeenCalledWith('/v1/agents/specs/list');
  });

  it('returns an empty listing as an empty array', async () => {
    fetchJson.mockResolvedValue({ specs: [] });

    await expect(listSpecs()).resolves.toEqual([]);
  });

  it('parses a spec with no visible documents', async () => {
    fetchJson.mockResolvedValue({ specs: [spec({ documents: [] })] });

    const specs = await listSpecs();

    expect(specs[0].documents).toEqual([]);
  });

  it('propagates a failure of the listing', async () => {
    fetchJson.mockRejectedValue(new ApiError('boom', { status: 500 }));

    await expect(listSpecs()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('getSpecDocument', () => {
  it('reads the document endpoint with the text reader only', async () => {
    fetchText.mockResolvedValue('# Website rebuild\n');

    await expect(getSpecDocument('SPEC-001', 'doc-1')).resolves.toBe(
      '# Website rebuild\n',
    );
    expect(fetchText).toHaveBeenCalledWith(
      '/v1/agents/specs/SPEC-001/doc-1',
      {},
    );
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('encodes both identifiers into the path', async () => {
    fetchText.mockResolvedValue('');

    await getSpecDocument('SPEC 001', 'a/b');

    expect(fetchText).toHaveBeenCalledWith(
      '/v1/agents/specs/SPEC%20001/a%2Fb',
      {},
    );
  });

  it('forwards the caller request options, including the timeout', async () => {
    fetchText.mockResolvedValue('');

    await getSpecDocument('SPEC-001', 'doc-1', { timeoutMs: 1_500 });

    expect(fetchText).toHaveBeenCalledWith('/v1/agents/specs/SPEC-001/doc-1', {
      timeoutMs: 1_500,
    });
  });

  it('publishes a fan-out timeout well below the client default', () => {
    expect(SPEC_DOCUMENT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SPEC_DOCUMENT_TIMEOUT_MS).toBeLessThan(DEFAULT_TIMEOUT_MS / 2);
  });

  it('propagates the distinct 404 signal', async () => {
    fetchText.mockRejectedValue(new ApiNotFoundError('missing'));

    await expect(getSpecDocument('SPEC-001', 'doc-1')).rejects.toBeInstanceOf(
      ApiNotFoundError,
    );
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
