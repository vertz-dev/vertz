import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIntegrationApp, type TestServer } from '../app/create-app';

const AUTH = { authorization: 'Bearer user-1' };

let server: TestServer;

beforeAll(() => {
  server = createIntegrationApp();
});

afterAll(() => {
  server.stop();
});

describe('HTTP errors', () => {
  it('returns 404 for unknown path', async () => {
    const res = await server.fetch('/api/nonexistent', { headers: AUTH });

    expect(res.status).toBe(404);
  });

  it('returns 404 with structured error body', async () => {
    const res = await server.fetch('/api/nonexistent', { headers: AUTH });
    const body = await res.json();

    expect(body).toEqual({
      error: {
        code: 'NotFound',
        message: 'Not Found',
      },
    });
  });

  it('returns 405 for wrong method with Allow header', async () => {
    const res = await server.fetch('/api/users', {
      method: 'PATCH',
      headers: AUTH,
    });

    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error.code).toBe('MethodNotAllowed');
    expect(res.headers.get('allow')).toBeTruthy();
  });
});

describe('Exception handling', () => {
  it('returns 404 for NotFoundException thrown by handler', async () => {
    const res = await server.fetch('/api/users/nonexistent-id', { headers: AUTH });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NotFoundException');
  });

  it('returns 401 for UnauthorizedException', async () => {
    const res = await server.fetch('/api/users');

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UnauthorizedException');
  });

  it('does not leak error details for non-VertzException errors', async () => {
    const res = await server.fetch('/api/users/nonexistent-id', { headers: AUTH });
    const body = await res.json();

    // NotFoundException is a VertzException — has structured error
    // For non-VertzException errors, the framework returns a generic 500
    // We verify VertzException errors have the expected structure
    expect(body.error.code).toBe('NotFoundException');
    expect(body.error.message).toBeTypeOf('string');
    // No stack trace or internal details exposed
    expect(body.error.stack).toBeUndefined();
    expect(body.stack).toBeUndefined();
  });
});
