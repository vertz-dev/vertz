// Re-export Result utilities for consumers
export type { EntityErrorType, FetchErrorType, Result } from '@vertz/errors';
// Re-export matchError for error handling
export { err, isErr, isOk, matchError, ok, unwrap, unwrapOr } from '@vertz/errors';
export { FetchClient } from './client';
export type { MutationDescriptor, QueryDescriptor, StreamDescriptor } from './descriptor';
export {
  createDescriptor,
  createMutationDescriptor,
  createStreamDescriptor,
  isMutationDescriptor,
  isQueryDescriptor,
  isStreamDescriptor,
  serializeQueryParams,
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
export { FetchValidationError, isFetchValidationError } from '@vertz/errors';
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
export type { QueryKeyInput } from './query-key';
export { queryKey } from './query-key';
export type { VertzQLParams } from './vertzql';
export { encodeVertzQL, resolveVertzQL } from './vertzql';
