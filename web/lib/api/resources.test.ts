import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './client';
import { getCV } from './cv';
import { postMessage } from './messages';
import { listProjects } from './projects';
import type { CVResponse, ProjectListResponse } from './types';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return { ...actual, fetchJson: vi.fn() };
});

const { fetchJson } = await import('./client');
const fetchJsonMock = vi.mocked(fetchJson);

beforeEach(() => {
  fetchJsonMock.mockReset();
});

describe('getCV', () => {
  it('requests the CV endpoint', async () => {
    const cv: CVResponse = { skills: {}, experience: [], education: [] };
    fetchJsonMock.mockResolvedValue(cv);

    await getCV();

    expect(fetchJsonMock).toHaveBeenCalledWith('/v1/cv');
  });

  it('parses an empty skills map and null end dates', async () => {
    const cv: CVResponse = {
      skills: {},
      experience: [
        {
          id: '1e4c2a90-1111-4a34-9f1e-1b0f1e2d3c4b',
          organization: 'psauerborn.dev',
          job_title: 'Engineer',
          start_date: '2024-01-01T00:00:00Z',
          end_date: null,
          description: 'Current role.',
          tech_stack: [],
          responsibilities: [],
        },
      ],
      education: [
        {
          id: '1e4c2a90-2222-4a34-9f1e-1b0f1e2d3c4b',
          institution: 'University',
          certificate: 'PhD',
          start_date: '2016-10-01T00:00:00Z',
          end_date: null,
        },
      ],
    };
    fetchJsonMock.mockResolvedValue(cv);

    const result = await getCV();

    expect(result.skills).toEqual({});
    expect(result.experience[0]?.end_date).toBeNull();
    expect(result.education[0]?.end_date).toBeNull();
  });

  it('propagates a client failure', async () => {
    fetchJsonMock.mockRejectedValue(new ApiError('boom', { status: 500 }));

    await expect(getCV()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('listProjects', () => {
  it('requests the project listing endpoint', async () => {
    const listing: ProjectListResponse = { projects: [] };
    fetchJsonMock.mockResolvedValue(listing);

    await listProjects();

    expect(fetchJsonMock).toHaveBeenCalledWith('/v1/projects/list');
  });

  it('returns the projects, including one without a GitHub link', async () => {
    const listing: ProjectListResponse = {
      projects: [
        {
          id: '3c2a1b90-5d4e-4f8a-b7c6-1d2e3f4a5b6c',
          name: 'psauerborn.dev',
          description: 'Personal site.',
          primary_link: 'https://psauerborn.dev',
          github_link: null,
        },
      ],
    };
    fetchJsonMock.mockResolvedValue(listing);

    const projects = await listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]?.github_link).toBeNull();
  });

  it('returns an empty array for an empty listing', async () => {
    fetchJsonMock.mockResolvedValue({
      projects: [],
    } satisfies ProjectListResponse);

    await expect(listProjects()).resolves.toEqual([]);
  });
});

describe('postMessage', () => {
  const submission = {
    email: 'someone@example.com',
    name: 'Someone',
    message: 'Hello there.',
  };

  it('posts the message as JSON and returns the identifier', async () => {
    fetchJsonMock.mockResolvedValue({ message_id: 'a1b2c3' });

    const result = await postMessage(submission);

    expect(result).toEqual({ status: 'created', messageId: 'a1b2c3' });
    expect(fetchJsonMock).toHaveBeenCalledWith('/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
  });

  it('includes the organization when one was supplied', async () => {
    fetchJsonMock.mockResolvedValue({ message_id: 'a1b2c3' });

    await postMessage({ ...submission, organization: 'ACME' });

    const [, init] = fetchJsonMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      ...submission,
      organization: 'ACME',
    });
  });

  it('surfaces the details of a 400 envelope to the caller', async () => {
    fetchJsonMock.mockRejectedValue(
      new ApiError('request to /v1/messages failed with status 400', {
        status: 400,
        details: 'email: must be a valid email address',
      }),
    );

    const result = await postMessage(submission);

    expect(result).toEqual({
      status: 'rejected',
      details: 'email: must be a valid email address',
    });
  });

  it('propagates failures that are not a validation rejection', async () => {
    fetchJsonMock.mockRejectedValue(new ApiError('boom', { status: 500 }));

    await expect(postMessage(submission)).rejects.toBeInstanceOf(ApiError);
  });

  it('leaves base URL resolution to the client rather than reading the environment', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(process.cwd(), 'lib/api/messages.ts'),
      'utf8',
    );

    expect(source).not.toContain('process.env');
    expect(source).not.toContain('API_BASE_URL =');
  });
});
