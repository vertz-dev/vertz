import { describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

// Helper to create an auth instance in production mode
function createProductionAuth() {
  return createAuth({
    session: { strategy: 'jwt', ttl: '7d' },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: true,
  });
}

// Helper to create an auth instance in development mode
function createDevAuth() {
  return createAuth({
    session: { strategy: 'jwt', ttl: '7d' },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
  });
}

// Helper to build a Request with configurable headers
function buildRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: object,
): Request {
  const init: RequestInit = {
    method,
    headers: new Headers(headers),
  };
  if (body) {
    init.body = JSON.stringify(body);
    (init.headers as Headers).set('content-type', 'application/json');
  }
  return new Request(url, init);
}

describe('CSRF protection', () => {
  describe('Origin/Referer validation', () => {
    it('allows POST with matching Origin header', async () => {
      const auth = createProductionAuth();
      const request = buildRequest(
        'POST',
        'https://example.com/api/auth/signin',
        {
          origin: 'https://example.com',
          'x-vtz-request': '1',
        },
        { email: 'test@example.com', password: 'password123' },
      );

      const response = await auth.handler(request);

      // Should not be a 403 CSRF rejection — the request may fail for other
      // reasons (e.g., invalid credentials), but CSRF should pass.
      expect(response.status).not.toBe(403);
    });

    it('rejects POST with mismatched Origin header in production (403)', async () => {
      const auth = createProductionAuth();
      const request = buildRequest(
        'POST',
        'https://example.com/api/auth/signin',
        {
          origin: 'https://evil.com',
          'x-vtz-request': '1',
        },
        { email: 'test@example.com', password: 'password123' },
      );

      const response = await auth.handler(request);
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(403);
      expect(body.error).toBe('CSRF validation failed');
    });

    it('allows POST with valid Referer but no Origin header', async () => {
      const auth = createProductionAuth();
      const request = buildRequest(
        'POST',
        'https://example.com/api/auth/signin',
        {
          referer: 'https://example.com/login',
          'x-vtz-request': '1',
        },
        { email: 'test@example.com', password: 'password123' },
      );

      const response = await auth.handler(request);

      // Referer origin matches — CSRF should pass
      expect(response.status).not.toBe(403);
    });

    it('rejects POST with no Origin and no Referer in production (403)', async () => {
      const auth = createProductionAuth();
      const request = buildRequest(
        'POST',
        'https://example.com/api/auth/signin',
        {
          'x-vtz-request': '1',
        },
        { email: 'test@example.com', password: 'password123' },
      );

      const response = await auth.handler(request);
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(403);
      expect(body.error).toBe('CSRF validation failed');
    });

    it('rejects POST with mismatched Referer (no Origin) in production (403)', async () => {
      const auth = createProductionAuth();
      const request = buildRequest(
        'POST',
        'https://example.com/api/auth/signin',
        {
          referer: 'https://evil.com/phishing-page',
          'x-vtz-request': '1',
        },
        { email: 'test@example.com', password: 'password123' },
      );

      const response = await auth.handler(request);
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(403);
      expect(body.error).toBe('CSRF validation failed');
    });
  });

  describe('X-VTZ-Request header', () => {
    it('rejects POST without X-VTZ-Request header in production (403)', async () => {
      const auth = createProductionAuth();
      const request = buildRequest(
        'POST',
        'https://example.com/api/auth/signin',
        {
          origin: 'https://example.com',
        },
        { email: 'test@example.com', password: 'password123' },
      );

      const response = await auth.handler(request);
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(403);
      expect(body.error).toBe('Missing required X-VTZ-Request header');
    });

    it('allows POST with X-VTZ-Request: 1 header', async () => {
      const auth = createProductionAuth();
      const request = buildRequest(
        'POST',
        'https://example.com/api/auth/signin',
        {
          origin: 'https://example.com',
          'x-vtz-request': '1',
        },
        { email: 'test@example.com', password: 'password123' },
      );

      const response = await auth.handler(request);

      // Should not be a 403 — CSRF check passed
      expect(response.status).not.toBe(403);
    });

    it('allows POST without X-VTZ-Request header in development mode', async () => {
      const auth = createDevAuth();
      const request = buildRequest(
        'POST',
        'https://example.com/api/auth/signin',
        {
          origin: 'https://example.com',
        },
        { email: 'test@example.com', password: 'password123' },
      );

      const response = await auth.handler(request);

      // Development mode should not block the request
      expect(response.status).not.toBe(403);
    });
  });

  describe('GET requests', () => {
    it('skips CSRF checks entirely for GET requests', async () => {
      const auth = createProductionAuth();
      // GET request with no Origin, no Referer, no X-VTZ-Request
      const request = buildRequest('GET', 'https://example.com/api/auth/session');

      const response = await auth.handler(request);

      // GET requests bypass CSRF — should not be 403
      expect(response.status).not.toBe(403);
    });
  });
});
