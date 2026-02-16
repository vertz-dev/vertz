export declare class FetchError extends Error {
  readonly status: number;
  readonly body?: unknown;
  constructor(message: string, status: number, body?: unknown);
}
export declare class BadRequestError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class UnauthorizedError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class ForbiddenError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class NotFoundError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class ConflictError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class GoneError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class UnprocessableEntityError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class RateLimitError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class InternalServerError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare class ServiceUnavailableError extends FetchError {
  constructor(message: string, body?: unknown);
}
export declare function createErrorFromStatus(
  status: number,
  message: string,
  body?: unknown,
): FetchError;
//# sourceMappingURL=errors.d.ts.map
