import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationException,
  VertzException,
} from '@vertz/core';
import { describe, expect, it } from 'vitest';
import { entityErrorHandler } from '../error-handler';

describe('entityErrorHandler', () => {
  it('maps ForbiddenException to 403 with Forbidden code', () => {
    const result = entityErrorHandler(new ForbiddenException('Access denied'));

    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: { code: 'Forbidden', message: 'Access denied' },
    });
  });

  it('maps NotFoundException to 404 with NotFound code', () => {
    const result = entityErrorHandler(new NotFoundException('User not found'));

    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: { code: 'NotFound', message: 'User not found' },
    });
  });

  it('maps BadRequestException to 400 with BadRequest code', () => {
    const result = entityErrorHandler(new BadRequestException('Invalid input'));

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: { code: 'BadRequest', message: 'Invalid input' },
    });
  });

  it('maps UnauthorizedException to 401 with Unauthorized code', () => {
    const result = entityErrorHandler(new UnauthorizedException('No token'));

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: { code: 'Unauthorized', message: 'No token' },
    });
  });

  it('maps ConflictException to 409 with Conflict code', () => {
    const result = entityErrorHandler(new ConflictException('Duplicate entry'));

    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      error: { code: 'Conflict', message: 'Duplicate entry' },
    });
  });

  it('maps ValidationException to 422 with ValidationError code and details', () => {
    const errors = [{ path: 'email', message: 'Invalid email' }];
    const result = entityErrorHandler(new ValidationException(errors));

    expect(result.status).toBe(422);
    expect(result.body).toEqual({
      error: {
        code: 'ValidationError',
        message: 'Validation failed',
        details: errors,
      },
    });
  });

  it('does NOT include details from generic VertzException (prevents data leakage)', () => {
    const result = entityErrorHandler(
      new BadRequestException('Bad field', { field: 'email', passwordHash: 'secret' }),
    );

    expect(result.status).toBe(400);
    // Details are stripped to prevent leaking hidden fields or internal state
    expect(result.body.error.details).toBeUndefined();
  });

  it('maps unknown errors to 500 InternalError without leaking details', () => {
    const result = entityErrorHandler(new Error('DB connection failed: password=secret123'));

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: { code: 'InternalError', message: 'An unexpected error occurred' },
    });
  });

  it('handles non-Error throws gracefully', () => {
    const result = entityErrorHandler('string error');

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('InternalError');
  });
});
