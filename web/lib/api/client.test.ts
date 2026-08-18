import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiConfigurationError,
  ApiError,
  ApiNotFoundError,
  fetchJson,
  fetchText,
  isNotFoundError,
} from './client';

/**
 * jsonResponse builds a `Response` carrying a JSON body.
 *
 * @param body - value serialized as the response body.
 * @param status - HTTP status code of the response, defaulting to 200.
 * @returns a `Response` with an `application/json` content type.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * octetResponse builds a `Response` carrying raw bytes, mirroring the two
 * `binary/octet-stream` content endpoints of the API.
 *
 * @param body - raw body written verbatim into the response.
 * @param status - HTTP status code of the response, defaulting to 200.
 * @returns a `Response` with a `binary/octet-stream` content type.
 */
function octetResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'binary/octet-stream' },
  });
}

/**
 * stubFetch replaces the global `fetch` with a mock returning the given
 * responses in order.
 *
 * @param responses - responses handed back on successive calls.
 * @returns the installed mock, for assertions on the requests made.
 */
function stubFetch(...responses: Response[]) {
  const mock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => {
      const next = responses.shift();
      if (!next) {
        throw new Error('fetch stub called more times than configured');
      }
      return next;
    },
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

/**
 * lastRequestInit returns the `RequestInit` of the most recent stubbed fetch
 * call.
 *
 * @param mock - the fetch mock installed by `stubFetch`.
 * @returns the `RequestInit` passed to the last call.
 */
function lastRequestInit(mock: ReturnType<typeof stubFetch>): RequestInit {
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch stub was never called');
  }
  return call[1];
}

describe('api client', () => {
  beforeEach(() => {
    vi.stubEnv('API_BASE_URL', 'http://api.internal:8080');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:8080');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('base url resolution', () => {
    it('resolves API_BASE_URL when running on the server', async () => {
      const mock = stubFetch(jsonResponse({ ok: true }));
      vi.stubGlobal('window', undefined);

      await fetchJson<{ ok: boolean }>('/v1/articles');

      expect(mock.mock.calls[0][0]).toBe(
        'http://api.internal:8080/v1/articles',
      );
    });

    it('resolves NEXT_PUBLIC_API_BASE_URL when running in the browser', async () => {
      const mock = stubFetch(jsonResponse({ ok: true }));

      await fetchJson<{ ok: boolean }>('/v1/articles');

      expect(mock.mock.calls[0][0]).toBe('http://localhost:8080/v1/articles');
    });

    it('joins the base url and the path without duplicating the separator', async () => {
      const mock = stubFetch(jsonResponse({ ok: true }));
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:8080/');

      await fetchJson<{ ok: boolean }>('/v1/articles');

      expect(mock.mock.calls[0][0]).toBe('http://localhost:8080/v1/articles');
    });

    it('throws a configuration error when the browser variable is unset', async () => {
      stubFetch(jsonResponse({ ok: true }));
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

      await expect(fetchJson<unknown>('/v1/articles')).rejects.toBeInstanceOf(
        ApiConfigurationError,
      );
    });

    it('throws a configuration error when the server variable is unset', async () => {
      stubFetch(jsonResponse({ ok: true }));
      vi.stubGlobal('window', undefined);
      vi.stubEnv('API_BASE_URL', '');

      await expect(fetchJson<unknown>('/v1/articles')).rejects.toBeInstanceOf(
        ApiConfigurationError,
      );
    });
  });

  describe('fetch semantics', () => {
    it('issues every request with an abort signal and without caching', async () => {
      const mock = stubFetch(jsonResponse({ ok: true }), octetResponse('# hi'));

      await fetchJson<{ ok: boolean }>('/v1/articles');
      await fetchText('/v1/articles/1/content');

      for (const [, init] of mock.mock.calls) {
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(init.cache).toBe('no-store');
      }
    });

    it('rejects rather than hanging when the request outlives its timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                reject((init.signal as AbortSignal).reason);
              });
            }),
        ),
      );

      const error = await fetchJson<unknown>('/v1/articles', {
        timeoutMs: 5,
      }).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(ApiNotFoundError);
      expect(isNotFoundError(error)).toBe(false);
    });

    it('applies the requested timeout to the abort signal', async () => {
      const mock = stubFetch(jsonResponse({ ok: true }));

      await fetchJson<{ ok: boolean }>('/v1/articles', { timeoutMs: 25 });

      const init = lastRequestInit(mock);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal?.aborted).toBe(false);
    });
  });

  describe('error handling', () => {
    it('signals a 404 distinctly from every other failure', async () => {
      stubFetch(
        jsonResponse({ error: 'Not Found', details: 'Not found.' }, 404),
      );

      const error = await fetchJson<unknown>('/v1/articles/1').catch(
        (cause: unknown) => cause,
      );

      expect(error).toBeInstanceOf(ApiNotFoundError);
      expect(isNotFoundError(error)).toBe(true);
      expect((error as ApiNotFoundError).status).toBe(404);
    });

    it('signals a 404 distinctly on the text reader as well', async () => {
      stubFetch(
        jsonResponse({ error: 'Not Found', details: 'Not found.' }, 404),
      );

      const error = await fetchText('/v1/articles/1/content').catch(
        (cause: unknown) => cause,
      );

      expect(error).toBeInstanceOf(ApiNotFoundError);
    });

    it('surfaces the error envelope details of a 400 as a generic failure', async () => {
      stubFetch(
        jsonResponse(
          { error: 'Bad Request', details: 'comment: must not be empty' },
          400,
        ),
      );

      const error = (await fetchJson<unknown>('/v1/articles/1/comments', {
        method: 'POST',
      }).catch((cause: unknown) => cause)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(ApiNotFoundError);
      expect(isNotFoundError(error)).toBe(false);
      expect(error.status).toBe(400);
      expect(error.details).toBe('comment: must not be empty');
      expect(error.message).toContain('comment: must not be empty');
    });

    it('surfaces a 500 as a generic failure', async () => {
      stubFetch(
        jsonResponse(
          { error: 'Internal Server Error', details: 'Something went wrong.' },
          500,
        ),
      );

      const error = (await fetchJson<unknown>('/v1/articles').catch(
        (cause: unknown) => cause,
      )) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(ApiNotFoundError);
      expect(error.status).toBe(500);
      expect(error.details).toBe('Something went wrong.');
    });

    it('surfaces a network failure as a generic failure without a status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('fetch failed');
        }),
      );

      const error = (await fetchJson<unknown>('/v1/articles').catch(
        (cause: unknown) => cause,
      )) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(ApiNotFoundError);
      expect(error.status).toBeNull();
    });

    it('surfaces a malformed error body as a generic failure', async () => {
      stubFetch(
        new Response('<html>gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
      );

      const error = (await fetchJson<unknown>('/v1/articles').catch(
        (cause: unknown) => cause,
      )) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(ApiNotFoundError);
      expect(error.status).toBe(502);
      expect(error.details).toBeNull();
    });

    it('surfaces a malformed success body as a generic failure', async () => {
      stubFetch(
        new Response('not json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const error = await fetchJson<unknown>('/v1/articles').catch(
        (cause: unknown) => cause,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(ApiNotFoundError);
    });
  });

  describe('readers', () => {
    it('parses the decoded body on the json reader', async () => {
      stubFetch(jsonResponse({ articles: [{ id: 1 }] }));

      const body = await fetchJson<{ articles: { id: number }[] }>(
        '/v1/articles',
      );

      expect(body).toEqual({ articles: [{ id: 1 }] });
    });

    it('returns the raw body of a binary/octet-stream fixture on the text reader', async () => {
      const content = '# Title\n\nRaw *markdown* bytes, never JSON.\n';
      stubFetch(octetResponse(content));

      await expect(fetchText('/v1/articles/1/content')).resolves.toBe(content);
    });

    it('never invokes response.json() on the text reader', async () => {
      const response = octetResponse('# raw');
      const json = vi.spyOn(response, 'json');
      const text = vi.spyOn(response, 'text');
      stubFetch(response);

      await fetchText('/v1/agents/specs/1/2');

      expect(json).not.toHaveBeenCalled();
      expect(text).toHaveBeenCalledTimes(1);
    });
  });
});
