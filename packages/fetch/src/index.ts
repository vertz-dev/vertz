export { FetchClient } from './client';
export {
  BadRequestError,
  ConflictError,
  createErrorFromStatus,
  FetchError,
  ForbiddenError,
  GoneError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  UnprocessableEntityError,
} from './errors';
export type {
  AuthStrategy,
  FetchClientConfig,
  FetchResponse,
  HooksConfig,
  RequestOptions,
  RetryConfig,
  StreamingFormat,
  StreamingRequestOptions,
} from './types';

// Re-export Result utilities for consumers
export type { Result } from '@vertz/errors';
export { ok, err, unwrap, unwrapOr, isOk, isErr } from '@vertz/errors';
