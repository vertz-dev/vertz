import { describe, expect, it } from 'vitest';
import {
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

describe('FetchError', () => {
  it('stores status and message', () => {
    const error = new FetchError('Something went wrong', 500);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FetchError);
    expect(error.message).toBe('Something went wrong');
    expect(error.status).toBe(500);
    expect(error.name).toBe('FetchError');
  });

  it('stores optional response body', () => {
    const body = { error: 'validation_failed', details: ['name is required'] };
    const error = new FetchError('Bad Request', 400, body);

    expect(error.body).toEqual(body);
  });
});

describe('status-specific error classes', () => {
  it('BadRequestError has status 400', () => {
    const error = new BadRequestError('Validation failed');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(400);
    expect(error.name).toBe('BadRequestError');
  });

  it('UnauthorizedError has status 401', () => {
    const error = new UnauthorizedError('Invalid token');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(401);
    expect(error.name).toBe('UnauthorizedError');
  });

  it('ForbiddenError has status 403', () => {
    const error = new ForbiddenError('Access denied');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(403);
    expect(error.name).toBe('ForbiddenError');
  });

  it('NotFoundError has status 404', () => {
    const error = new NotFoundError('Resource not found');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(404);
    expect(error.name).toBe('NotFoundError');
  });

  it('ConflictError has status 409', () => {
    const error = new ConflictError('Resource conflict');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(409);
    expect(error.name).toBe('ConflictError');
  });

  it('GoneError has status 410', () => {
    const error = new GoneError('Resource gone');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(410);
    expect(error.name).toBe('GoneError');
  });

  it('UnprocessableEntityError has status 422', () => {
    const error = new UnprocessableEntityError('Unprocessable');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(422);
    expect(error.name).toBe('UnprocessableEntityError');
  });

  it('RateLimitError has status 429', () => {
    const error = new RateLimitError('Too many requests');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(429);
    expect(error.name).toBe('RateLimitError');
  });

  it('InternalServerError has status 500', () => {
    const error = new InternalServerError('Server error');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(500);
    expect(error.name).toBe('InternalServerError');
  });

  it('ServiceUnavailableError has status 503', () => {
    const error = new ServiceUnavailableError('Service down');
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(503);
    expect(error.name).toBe('ServiceUnavailableError');
  });
});

describe('createErrorFromStatus', () => {
  it('returns specific error class for known status codes', () => {
    expect(createErrorFromStatus(400, 'Bad')).toBeInstanceOf(BadRequestError);
    expect(createErrorFromStatus(401, 'Unauth')).toBeInstanceOf(UnauthorizedError);
    expect(createErrorFromStatus(403, 'Forbidden')).toBeInstanceOf(ForbiddenError);
    expect(createErrorFromStatus(404, 'Not found')).toBeInstanceOf(NotFoundError);
    expect(createErrorFromStatus(409, 'Conflict')).toBeInstanceOf(ConflictError);
    expect(createErrorFromStatus(410, 'Gone')).toBeInstanceOf(GoneError);
    expect(createErrorFromStatus(422, 'Unprocessable')).toBeInstanceOf(UnprocessableEntityError);
    expect(createErrorFromStatus(429, 'Rate limit')).toBeInstanceOf(RateLimitError);
    expect(createErrorFromStatus(500, 'Server')).toBeInstanceOf(InternalServerError);
    expect(createErrorFromStatus(503, 'Unavailable')).toBeInstanceOf(ServiceUnavailableError);
  });

  it('returns generic FetchError for unknown status codes', () => {
    const error = createErrorFromStatus(418, "I'm a teapot");

    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(418);
    expect(error.message).toBe("I'm a teapot");
  });
});
