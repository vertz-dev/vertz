// Re-export Result utilities for consumers
export type { EntityErrorType, FetchErrorType, Result } from '@vertz/errors';
// Re-export matchError for error handling
export { err, isErr, isOk, matchError, ok, unwrap, unwrapOr } from '@vertz/errors';
export { FetchClient } from './client';
export type { QueryDescriptor } from './descriptor';
export { createDescriptor, isQueryDescriptor } from './descriptor';
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
  ListResponse,
  RequestOptions,
  RetryConfig,
  StreamingFormat,
  StreamingRequestOptions,
} from './types';
