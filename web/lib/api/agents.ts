/**
 * Agent resources of the psauerborn.dev API: the subagent catalogue, the
 * listable specs, and the raw content of a single spec document.
 *
 * The two listings are metadata only — an agent that declares no schema and a
 * spec with no visible documents both deserialize as empty collections rather
 * than nulls, so no defaulting is applied here. Spec document content is served
 * as `binary/octet-stream` and is therefore read exclusively through
 * `fetchText`; `getSpecDocument` returns a `string` and no JSON reader is
 * reachable from it.
 */

import { fetchJson, fetchText } from './client';
import type {
  Agent,
  AgentListResponse,
  AgentSpec,
  SpecListResponse,
} from './types';

/** Path of the subagent catalogue. */
const AGENT_LIST_PATH = '/v1/agents/list';

/** Path of the spec listing. */
const SPEC_LIST_PATH = '/v1/agents/specs/list';

/**
 * Timeout a caller should apply when it reads spec documents in a fan-out.
 *
 * The `/agents` page requests one document per visible entry and renders
 * nothing until all of them have settled, so the slowest document decides when
 * the page appears. The client's ten-second default is the right bound for a
 * single request the reader is waiting on, and much too long here: every body
 * sits behind a collapsed `<details>`, and an unread document is degraded to
 * one line of "content unavailable". Two and a half seconds is therefore the
 * point at which a hung document stops being worth waiting for.
 */
export const SPEC_DOCUMENT_TIMEOUT_MS = 2_500;

/** Request options accepted by {@link getSpecDocument}. */
export type SpecDocumentOptions = {
  /**
   * Milliseconds after which the request is aborted. Defaults to the client's
   * own timeout when omitted.
   */
  timeoutMs?: number;
};

/**
 * specDocumentPath builds the path of a single spec document, encoding both
 * identifiers so an unexpected value cannot escape its path segment.
 *
 * @param specId - identifier of the spec.
 * @param documentId - identifier of the document within the spec.
 * @returns the request path.
 */
function specDocumentPath(specId: string, documentId: string): string {
  return `/v1/agents/specs/${encodeURIComponent(specId)}/${encodeURIComponent(documentId)}`;
}

/**
 * listAgents returns the subagent catalogue together with the declared input
 * and output schemas of each agent.
 *
 * @returns the published agents, or an empty array when there are none.
 * @throws ApiError when the catalogue cannot be retrieved.
 */
export async function listAgents(): Promise<Agent[]> {
  const response = await fetchJson<AgentListResponse>(AGENT_LIST_PATH);
  return response.agents;
}

/**
 * listSpecs returns the metadata of every listable spec together with its
 * visible documents, and never the content of a document.
 *
 * @returns the listable specs, or an empty array when there are none.
 * @throws ApiError when the listing cannot be retrieved.
 */
export async function listSpecs(): Promise<AgentSpec[]> {
  const response = await fetchJson<SpecListResponse>(SPEC_LIST_PATH);
  return response.specs;
}

/**
 * getSpecDocument returns the raw content of a spec document. The endpoint
 * serves `binary/octet-stream`, so the body is read verbatim and never as JSON.
 *
 * A caller that reads many documents at once passes its own `timeoutMs` — see
 * {@link SPEC_DOCUMENT_TIMEOUT_MS} — because the client default is sized for a
 * single request rather than for a fan-out whose slowest member holds a page.
 *
 * @param specId - identifier of the spec.
 * @param documentId - identifier of the document within the spec.
 * @param options - request options; `timeoutMs` bounds the request, and the
 *   client's default applies when it is omitted.
 * @returns the raw content of the document.
 * @throws ApiNotFoundError when the spec, the document, or the link between
 *   them does not exist, or when the document is restricted — the API does not
 *   distinguish these cases.
 * @throws ApiError on any other failure, including the timeout.
 */
export async function getSpecDocument(
  specId: string,
  documentId: string,
  options: SpecDocumentOptions = {},
): Promise<string> {
  return fetchText(specDocumentPath(specId, documentId), options);
}
