/**
 * Writer for the contact message resource of the psauerborn.dev API.
 *
 * `POST /v1/messages` is issued from the browser, directly against
 * `NEXT_PUBLIC_API_BASE_URL` — there is no route handler proxy, and this module
 * never reads an environment variable itself: `resolveBaseUrl` inside the
 * client already selects the public base URL when it runs in the browser.
 *
 * A 400 is an expected outcome of a form submission rather than a fault: the
 * API answers it with the shared error envelope whose `details` names the
 * offending field and the reason it was rejected. It is therefore returned to
 * the caller as data (`PostMessageResult`) so the contact form can render it
 * inline next to the field. Every other failure — a timeout, a network error, a
 * 500 — stays an `ApiError` and reaches the error boundary.
 */

import { ApiError, fetchJson } from './client';
import type { CreateMessageRequest, CreateMessageResponse } from './types';

/** Path of the contact message endpoint. */
const MESSAGES_PATH = '/v1/messages';

/** Status the API answers a message that failed validation with. */
const BAD_REQUEST_STATUS = 400;

/**
 * Outcome of a message submission: either the message was recorded, or the API
 * rejected it and named the offending field in `details`.
 */
export type PostMessageResult =
  | { status: 'created'; messageId: string }
  | { status: 'rejected'; details: string };

/**
 * isValidationRejection reports whether a caught value is the 400 answer of the
 * API, which the caller is expected to render rather than to escalate.
 *
 * @param error - value caught from the client.
 * @returns true when the value is an `ApiError` carrying a 400 status.
 */
function isValidationRejection(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === BAD_REQUEST_STATUS;
}

/**
 * postMessage submits a contact message from the browser and reports the
 * outcome.
 *
 * @param message - the submission; `organization` may be omitted, in which case
 *   the API stores a null.
 * @returns `{status: 'created', messageId}` when the message was recorded, or
 *   `{status: 'rejected', details}` when the API rejected it, where `details`
 *   names the offending field and the reason.
 * @throws ApiError on any failure other than a validation rejection.
 */
export async function postMessage(
  message: CreateMessageRequest,
): Promise<PostMessageResult> {
  try {
    const response = await fetchJson<CreateMessageResponse>(MESSAGES_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    return { status: 'created', messageId: response.message_id };
  } catch (error) {
    if (isValidationRejection(error)) {
      return {
        status: 'rejected',
        details: error.details ?? 'the message could not be submitted',
      };
    }
    throw error;
  }
}
