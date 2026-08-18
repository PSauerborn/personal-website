/**
 * Reader for the CV resource of the psauerborn.dev API.
 *
 * `GET /v1/cv` answers with the complete CV in a single response, so there is
 * no per-section endpoint and no pagination to reconcile. The API guarantees
 * that an empty CV serializes as empty collections and an empty `skills` object
 * rather than nulls, and that the endpoint cannot answer 404 — the payload is
 * therefore handed back verbatim and only genuine failures propagate, as
 * `ApiError` raised by the client.
 *
 * This module is for server-side use: the homepage renders the CV on the
 * server, where `resolveBaseUrl` reads `API_BASE_URL`.
 */

import { fetchJson } from './client';
import type { CVResponse } from './types';

/** Path of the CV endpoint. */
const CV_PATH = '/v1/cv';

/**
 * getCV returns the complete CV: the tech stack grouped by skill category
 * together with the work experience and education entries, most recent first.
 *
 * @returns the CV; `skills` may be an empty map and `end_date` is null for a
 *   current role or an ongoing course.
 * @throws ApiError when the request fails or the body cannot be decoded.
 */
export async function getCV(): Promise<CVResponse> {
  return fetchJson<CVResponse>(CV_PATH);
}
