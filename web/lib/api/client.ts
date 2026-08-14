/**
 * Low-level HTTP client for the psauerborn.dev API.
 *
 * Two entry points are exported and they are deliberately separate: `fetchJson`
 * decodes an `application/json` body, `fetchText` reads a `binary/octet-stream`
 * body verbatim. The two content endpoints of the API
 * (`/v1/articles/{id}/content` and `/v1/agents/specs/{id}/{document_id}`) return
 * raw bytes and must be read with `fetchText`; its signature returns `string`
 * and it never calls `response.json()`.
 *
 * Every request is dynamic (`cache: 'no-store'`) and carries an
 * `AbortSignal.timeout`, so no call can hang indefinitely. Failures are raised
 * as `ApiError`, with the 404 case narrowed to `ApiNotFoundError` so call sites
 * can map a missing resource onto `notFound()` and everything else onto the
 * error boundary.
 */

/** Timeout applied to a request when the caller does not specify one. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Request options accepted by the client. The signal and the caching mode are
 * owned by the client — a caller cannot supply its own and thereby issue a
 * request without a timeout.
 */
export type ApiRequestInit = Omit<RequestInit, 'signal' | 'cache'> & {
  /** Milliseconds after which the request is aborted. */
  timeoutMs?: number;
};

/** The error envelope returned by every failing response of the API. */
interface ErrorEnvelope {
  error: string;
  details: string;
}

/**
 * ApiConfigurationError is raised when the base URL for the current execution
 * context is not configured. It is a deployment fault rather than a request
 * fault, so it is kept separate from `ApiError`.
 */
export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

/**
 * ApiError is the generic failure of an API request: a timeout, a network
 * error, a non-2xx response other than 404, or an undecodable body.
 */
export class ApiError extends Error {
  /** HTTP status of the response, or `null` when no response was received. */
  readonly status: number | null;
  /** `details` field of the error envelope, when the body carried one. */
  readonly details: string | null;

  constructor(
    message: string,
    options: {
      status?: number | null;
      details?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status ?? null;
    this.details = options.details ?? null;
  }
}

/**
 * ApiNotFoundError is the distinct signal for a 404 response. It is the only
 * failure that call sites are expected to translate into `notFound()`.
 */
export class ApiNotFoundError extends ApiError {
  declare readonly status: number;

  constructor(
    message: string,
    options: { details?: string | null; cause?: unknown } = {},
  ) {
    super(message, { ...options, status: 404 });
    this.name = 'ApiNotFoundError';
  }
}

/**
 * isNotFoundError reports whether a caught value is the distinct 404 signal.
 *
 * @param error - value caught from `fetchJson` or `fetchText`.
 * @returns `true` when the value is an `ApiNotFoundError`.
 */
export function isNotFoundError(error: unknown): error is ApiNotFoundError {
  return error instanceof ApiNotFoundError;
}

/**
 * resolveBaseUrl returns the API base URL for the current execution context:
 * `NEXT_PUBLIC_API_BASE_URL` in the browser, `API_BASE_URL` on the server.
 *
 * @returns the configured base URL, without a trailing slash.
 * @throws ApiConfigurationError when the applicable variable is unset.
 */
export function resolveBaseUrl(): string {
  const isBrowser = typeof window !== 'undefined';
  const name = isBrowser ? 'NEXT_PUBLIC_API_BASE_URL' : 'API_BASE_URL';
  const value = isBrowser
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : process.env.API_BASE_URL;

  if (!value) {
    throw new ApiConfigurationError(
      `${name} is not set; the API base URL must be configured for the ` +
        `${isBrowser ? 'browser' : 'server'} runtime`,
    );
  }
  return value.replace(/\/+$/, '');
}

/**
 * readErrorEnvelope decodes the shared `{error, details}` envelope of a failing
 * response, tolerating a body that is missing or not the expected shape.
 *
 * @param response - the failing response.
 * @returns the decoded envelope, or `null` when the body is unusable.
 */
async function readErrorEnvelope(
  response: Response,
): Promise<ErrorEnvelope | null> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as ErrorEnvelope).error === 'string' &&
      typeof (body as ErrorEnvelope).details === 'string'
    ) {
      return body as ErrorEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * toApiError converts a failing response into the matching error type: the
 * distinct `ApiNotFoundError` for a 404, a generic `ApiError` otherwise.
 *
 * @param path - request path, included in the message for context.
 * @param response - the failing response.
 * @returns the error to raise.
 */
async function toApiError(path: string, response: Response): Promise<ApiError> {
  const envelope = await readErrorEnvelope(response);
  const details = envelope?.details ?? null;
  const suffix = details ? `: ${details}` : '';

  if (response.status === 404) {
    return new ApiNotFoundError(`GET ${path} returned 404${suffix}`, {
      details,
    });
  }
  return new ApiError(
    `request to ${path} failed with status ${response.status}${suffix}`,
    { status: response.status, details },
  );
}

/**
 * request issues a single dynamic, timeout-bounded request and returns the
 * response once it is known to be successful.
 *
 * @param path - path appended to the resolved base URL, for example
 *   `/v1/articles`.
 * @param init - optional request options; the abort signal and the caching mode
 *   are supplied by the client.
 * @returns the successful response.
 * @throws ApiNotFoundError on a 404, ApiError on any other failure.
 */
async function request(
  path: string,
  init: ApiRequestInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const url = `${resolveBaseUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new ApiError(`request to ${path} could not be completed`, { cause });
  }

  if (!response.ok) {
    throw await toApiError(path, response);
  }
  return response;
}

/**
 * fetchJson issues a request and decodes an `application/json` body.
 *
 * @param path - path appended to the resolved base URL.
 * @param init - optional request options, including `timeoutMs`.
 * @returns the decoded body, typed as `T`.
 * @throws ApiNotFoundError on a 404, ApiError on any other failure, including
 *   an undecodable body.
 */
export async function fetchJson<T>(
  path: string,
  init?: ApiRequestInit,
): Promise<T> {
  const response = await request(path, init);
  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new ApiError(`response body of ${path} is not valid JSON`, {
      status: response.status,
      cause,
    });
  }
}

/**
 * fetchText issues a request and reads the body verbatim. It is the only reader
 * for the two `binary/octet-stream` content endpoints and never calls
 * `response.json()`.
 *
 * @param path - path appended to the resolved base URL.
 * @param init - optional request options, including `timeoutMs`.
 * @returns the raw response body.
 * @throws ApiNotFoundError on a 404, ApiError on any other failure.
 */
export async function fetchText(
  path: string,
  init?: ApiRequestInit,
): Promise<string> {
  const response = await request(path, init);
  try {
    return await response.text();
  } catch (cause) {
    throw new ApiError(`response body of ${path} could not be read`, {
      status: response.status,
      cause,
    });
  }
}
