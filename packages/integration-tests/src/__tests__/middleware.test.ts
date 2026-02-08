import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIntegrationApp, type TestServer } from '../app/create-app';

let server: TestServer;

beforeAll(() => {
  server = createIntegrationApp();
});

afterAll(() => {
  server.stop();
});

describe('Auth middleware', () => {
  it('provides user context when Bearer token is valid', async () => {
    // Create a user first
    const createRes = await server.fetch('/api/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer user-1',
      },
      body: JSON.stringify({ name: 'Test', email: 'test@test.com' }),
    });

    expect(createRes.status).toBe(200);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await server.fetch('/api/users');

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('UnauthorizedException');
  });

  it('returns 401 when token format is invalid', async () => {
    const res = await server.fetch('/api/users', {
      headers: { authorization: 'InvalidFormat' },
    });

    expect(res.status).toBe(401);
  });
});
