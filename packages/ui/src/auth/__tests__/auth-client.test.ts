import { describe, expect, it } from 'bun:test';
import { parseAuthError } from '../auth-client';

describe('parseAuthError', () => {
  it('extracts code and message from JSON response', async () => {
    const res = new Response(JSON.stringify({ code: 'USER_EXISTS', message: 'Email taken' }), {
      status: 409,
    });
    const error = await parseAuthError(res);

    expect(error.code).toBe('USER_EXISTS');
    expect(error.message).toBe('Email taken');
    expect(error.statusCode).toBe(409);
  });

  it('defaults to INVALID_CREDENTIALS for 401 without body code', async () => {
    const res = new Response('Unauthorized', { status: 401 });
    const error = await parseAuthError(res);

    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.statusCode).toBe(401);
  });

  it('extracts Retry-After header for 429', async () => {
    const res = new Response(JSON.stringify({ code: 'RATE_LIMITED', message: 'Slow down' }), {
      status: 429,
      headers: { 'Retry-After': '30' },
    });
    const error = await parseAuthError(res);

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfter).toBe(30);
  });

  it('defaults to USER_EXISTS for 409 without body code', async () => {
    const res = new Response('Conflict', { status: 409 });
    const error = await parseAuthError(res);

    expect(error.code).toBe('USER_EXISTS');
    expect(error.statusCode).toBe(409);
  });

  it('defaults to SERVER_ERROR for 500', async () => {
    const res = new Response('Internal Server Error', { status: 500 });
    const error = await parseAuthError(res);

    expect(error.code).toBe('SERVER_ERROR');
    expect(error.statusCode).toBe(500);
  });
});
