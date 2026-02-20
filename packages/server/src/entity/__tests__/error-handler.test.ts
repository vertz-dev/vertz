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
  it('maps ForbiddenException to 403 with FORBIDDEN code', () => {
    const result = entityErrorHandler(new ForbiddenException('Access denied'));

    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('maps NotFoundException to 404 with NOT_FOUND code', () => {
    const result = entityErrorHandler(new NotFoundException('User not found'));

    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
  });

  it('maps BadRequestException to 400 with BAD_REQUEST code', () => {
    const result = entityErrorHandler(new BadRequestException('Invalid input'));

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Invalid input' },
    });
  });

  it('maps UnauthorizedException to 401 with UNAUTHORIZED code', () => {
    const result = entityErrorHandler(new UnauthorizedException('No token'));

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'No token' },
    });
  });

  it('maps ConflictException to 409 with CONFLICT code', () => {
    const result = entityErrorHandler(new ConflictException('Duplicate entry'));

    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      error: { code: 'CONFLICT', message: 'Duplicate entry' },
    });
  });

  it('maps ValidationException to 422 with VALIDATION_ERROR code and details', () => {
    const errors = [{ path: 'email', message: 'Invalid email' }];
    const result = entityErrorHandler(new ValidationException(errors));

    expect(result.status).toBe(422);
    expect(result.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors,
      },
    });
  });

  it('includes details when VertzException has details', () => {
    const result = entityErrorHandler(new BadRequestException('Bad field', { field: 'email' }));

    expect(result.status).toBe(400);
    expect(result.body.error.details).toEqual({ field: 'email' });
  });

  it('maps unknown errors to 500 INTERNAL_ERROR without leaking details', () => {
    const result = entityErrorHandler(new Error('DB connection failed: password=secret123'));

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  it('handles non-Error throws gracefully', () => {
    const result = entityErrorHandler('string error');

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
  });
});
