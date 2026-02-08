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

describe('CORS', () => {
  it('returns 204 for OPTIONS preflight request', async () => {
    const res = await server.fetch('/api/users', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com' },
    });

    expect(res.status).toBe(204);
  });

  it('includes access-control-allow-origin header', async () => {
    const res = await server.fetch('/api/users', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('includes access-control-allow-methods header', async () => {
    const res = await server.fetch('/api/users', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com' },
    });

    const methods = res.headers.get('access-control-allow-methods');
    expect(methods).toBeTruthy();
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });

  it('adds CORS headers to actual GET/POST responses', async () => {
    const res = await server.fetch('/api/users', {
      headers: { ...AUTH, origin: 'http://example.com' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
