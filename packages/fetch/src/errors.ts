export class FetchError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.body = body;
  }
}

export class BadRequestError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 400, body);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 401, body);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 403, body);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 404, body);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 409, body);
    this.name = 'ConflictError';
  }
}

export class GoneError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 410, body);
    this.name = 'GoneError';
  }
}

export class UnprocessableEntityError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 422, body);
    this.name = 'UnprocessableEntityError';
  }
}

export class RateLimitError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 429, body);
    this.name = 'RateLimitError';
  }
}

export class InternalServerError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 500, body);
    this.name = 'InternalServerError';
  }
}

export class ServiceUnavailableError extends FetchError {
  constructor(message: string, body?: unknown) {
    super(message, 503, body);
    this.name = 'ServiceUnavailableError';
  }
}

const errorMap: Record<number, new (message: string, body?: unknown) => FetchError> = {
  400: BadRequestError,
  401: UnauthorizedError,
  403: ForbiddenError,
  404: NotFoundError,
  409: ConflictError,
  410: GoneError,
  422: UnprocessableEntityError,
  429: RateLimitError,
  500: InternalServerError,
  503: ServiceUnavailableError,
};

export function createErrorFromStatus(status: number, message: string, body?: unknown): FetchError {
  const ErrorClass = errorMap[status];
  if (ErrorClass) {
    return new ErrorClass(message, body);
  }
  return new FetchError(message, status, body);
}
