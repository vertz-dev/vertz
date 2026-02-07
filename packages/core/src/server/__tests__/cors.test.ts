import { describe, expect, it } from 'vitest';
import type { CorsConfig } from '../../types/app';
import { applyCorsHeaders, handleCors } from '../cors';

describe('handleCors', () => {
  it('returns 204 preflight response for OPTIONS requests', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://example.com',
        'access-control-request-method': 'POST',
      },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(204);
    expect(response?.headers.get('access-control-allow-origin')).toBe('*');
    expect(response?.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('returns null for non-OPTIONS requests', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      method: 'GET',
      headers: { origin: 'http://example.com' },
    });

    expect(handleCors(config, request)).toBeNull();
  });

  it('allows specific origin from allowlist', () => {
    const config: CorsConfig = { origins: ['http://app.com', 'http://admin.com'] };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://app.com', 'access-control-request-method': 'GET' },
    });

    const response = handleCors(config, request);

    expect(response?.headers.get('access-control-allow-origin')).toBe('http://app.com');
  });

  it('includes credentials and max-age headers', () => {
    const config: CorsConfig = { origins: true, credentials: true, maxAge: 86400 };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com', 'access-control-request-method': 'POST' },
    });

    const response = handleCors(config, request);

    expect(response?.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response?.headers.get('access-control-max-age')).toBe('86400');
  });
});

describe('applyCorsHeaders', () => {
  it('adds CORS headers to an actual response', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://example.com' },
    });
    const original = new Response('ok', { status: 200 });

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.status).toBe(200);
  });

  it('includes exposed headers', () => {
    const config: CorsConfig = { origins: '*', exposedHeaders: ['X-Total-Count'] };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://example.com' },
    });
    const original = new Response('ok');

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('access-control-expose-headers')).toBe('X-Total-Count');
  });

  it('does not add headers when origin is not allowed', () => {
    const config: CorsConfig = { origins: ['http://allowed.com'] };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://blocked.com' },
    });
    const original = new Response('ok');

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
