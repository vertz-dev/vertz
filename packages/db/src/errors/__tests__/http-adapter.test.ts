import { describe, expect, it } from 'vitest';
import {
  CheckConstraintError,
  ConnectionError,
  ConnectionPoolExhaustedError,
  ForeignKeyError,
  NotFoundError,
  NotNullError,
  UniqueConstraintError,
} from '../db-error';
import { dbErrorToHttpError } from '../http-adapter';

describe('dbErrorToHttpError', () => {
  it('maps UniqueConstraintError to 409 Conflict', () => {
    const err = new UniqueConstraintError({ table: 'users', column: 'email' });
    const http = dbErrorToHttpError(err);
    expect(http.status).toBe(409);
    expect(http.body.error).toBe('UniqueConstraintError');
    expect(http.body.code).toBe('23505');
  });

  it('maps ForeignKeyError to 422 Unprocessable Entity', () => {
    const err = new ForeignKeyError({
      table: 'posts',
      constraint: 'posts_author_id_fkey',
    });
    const http = dbErrorToHttpError(err);
    expect(http.status).toBe(422);
    expect(http.body.error).toBe('ForeignKeyError');
  });

  it('maps NotNullError to 422 Unprocessable Entity', () => {
    const err = new NotNullError({ table: 'users', column: 'name' });
    const http = dbErrorToHttpError(err);
    expect(http.status).toBe(422);
    expect(http.body.error).toBe('NotNullError');
  });

  it('maps CheckConstraintError to 422 Unprocessable Entity', () => {
    const err = new CheckConstraintError({
      table: 'orders',
      constraint: 'orders_amount_positive',
    });
    const http = dbErrorToHttpError(err);
    expect(http.status).toBe(422);
    expect(http.body.error).toBe('CheckConstraintError');
  });

  it('maps NotFoundError to 404 Not Found', () => {
    const err = new NotFoundError('users');
    const http = dbErrorToHttpError(err);
    expect(http.status).toBe(404);
    expect(http.body.error).toBe('NotFoundError');
  });

  it('maps ConnectionError to 503 Service Unavailable', () => {
    const err = new ConnectionError('ECONNREFUSED');
    const http = dbErrorToHttpError(err);
    expect(http.status).toBe(503);
    expect(http.body.error).toBe('ConnectionError');
  });

  it('maps ConnectionPoolExhaustedError to 503 Service Unavailable', () => {
    const err = new ConnectionPoolExhaustedError(20);
    const http = dbErrorToHttpError(err);
    expect(http.status).toBe(503);
    expect(http.body.error).toBe('ConnectionPoolExhaustedError');
  });

  it('returns the full toJSON body', () => {
    const err = new UniqueConstraintError({
      table: 'users',
      column: 'email',
      value: 'foo@bar.com',
    });
    const http = dbErrorToHttpError(err);
    expect(http.body.table).toBe('users');
    expect(http.body.column).toBe('email');
    expect(http.body.message).toContain('email');
  });

  it('defaults unknown DbError subclasses to 500', () => {
    // Create a DbError subclass not covered by the known types
    const { parsePgError } = require('../pg-parser');
    const err = parsePgError({ code: '42P01', message: 'relation does not exist' });
    const http = dbErrorToHttpError(err);
    expect(http.status).toBe(500);
  });
});
