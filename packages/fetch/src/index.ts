// Re-export Result utilities for consumers
export type { EntityErrorType, FetchErrorType, Result } from '@vertz/errors';
// Re-export matchError for error handling
export { err, isErr, isOk, matchError, ok, unwrap, unwrapOr } from '@vertz/errors';
export { FetchClient } from './client';
export type { MutationDescriptor, QueryDescriptor } from './descriptor';
export {
  createDescriptor,
  createMutationDescriptor,
  isMutationDescriptor,
  isQueryDescriptor,
} from './descriptor';
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
  EntityQueryMeta,
  FetchClientConfig,
  FetchResponse,
  HooksConfig,
  ListResponse,
  MutationMeta,
  OptimisticHandler,
  QueryParams,
  RequestOptions,
  RetryConfig,
  StreamingFormat,
  StreamingRequestOptions,
} from './types';
export type { VertzQLParams } from './vertzql';
export { encodeVertzQL, resolveVertzQL } from './vertzql';
