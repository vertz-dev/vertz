/**
 * Type-level tests: HTTP error classes should expose literal status types.
 *
 * After instanceof narrowing, TypeScript should know the exact status code —
 * e.g., FetchNotFoundError.status is 404, not number.
 */
import {
  type FetchBadRequestError,
  type FetchConflictError,
  type FetchForbiddenError,
  type FetchGoneError,
  type FetchInternalServerError,
  FetchNotFoundError,
  type FetchRateLimitError,
  type FetchServiceUnavailableError,
  type FetchUnauthorizedError,
  type FetchUnprocessableEntityError,
  type HttpError,
} from '../fetch.js';

// --- Positive: literal status types ---

declare const badRequest: FetchBadRequestError;
const _400: 400 = badRequest.status;

declare const unauthorized: FetchUnauthorizedError;
const _401: 401 = unauthorized.status;

declare const forbidden: FetchForbiddenError;
const _403: 403 = forbidden.status;

declare const notFound: FetchNotFoundError;
const _404: 404 = notFound.status;

declare const conflict: FetchConflictError;
const _409: 409 = conflict.status;

declare const gone: FetchGoneError;
const _410: 410 = gone.status;

declare const unprocessable: FetchUnprocessableEntityError;
const _422: 422 = unprocessable.status;

declare const rateLimit: FetchRateLimitError;
const _429: 429 = rateLimit.status;

declare const internal: FetchInternalServerError;
const _500: 500 = internal.status;

declare const unavailable: FetchServiceUnavailableError;
const _503: 503 = unavailable.status;

// --- Negative: wrong literal should fail ---

declare const notFound2: FetchNotFoundError;
// @ts-expect-error — status is 404, not 500
const _wrong: 500 = notFound2.status;

// --- Base HttpError keeps number (not narrowed) ---

declare const base: HttpError;
const _num: number = base.status;

// --- instanceof narrowing gives literal ---

function testInstanceofNarrowing(err: HttpError) {
  if (err instanceof FetchNotFoundError) {
    const _narrowed: 404 = err.status;
    void _narrowed;
  }
}

// Suppress unused variable warnings
void [_400, _401, _403, _404, _409, _410, _422, _429, _500, _503, _wrong, _num];
void testInstanceofNarrowing;
