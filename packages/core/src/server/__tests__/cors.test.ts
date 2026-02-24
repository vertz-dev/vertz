import { describe, expect, it } from 'bun:test';
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
    expect(response!.status).toBe(204);
    expect(response!.headers.get('access-control-allow-origin')).toBe('*');
    expect(response!.headers.get('access-control-allow-methods')).toContain('POST');
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

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-origin')).toBe('http://app.com');
  });

  it('includes credentials and max-age headers', () => {
    const config: CorsConfig = { origins: true, credentials: true, maxAge: 86400 };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com', 'access-control-request-method': 'POST' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response!.headers.get('access-control-max-age')).toBe('86400');
  });

  it('uses exact default methods in preflight when none are configured', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com', 'access-control-request-method': 'DELETE' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
  });

  it('uses exact default headers in preflight when none are configured', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com', 'access-control-request-method': 'POST' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-headers')).toBe(
      'Content-Type, Authorization',
    );
  });

  it('omits access-control-allow-credentials when credentials is false', () => {
    const config: CorsConfig = { origins: '*', credentials: false };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com', 'access-control-request-method': 'GET' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('omits access-control-allow-credentials when credentials is not set', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com', 'access-control-request-method': 'GET' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('omits access-control-allow-origin in preflight when origin is not in allowlist', () => {
    const config: CorsConfig = { origins: ['http://allowed.com'] };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://blocked.com', 'access-control-request-method': 'GET' },
    });

    const response = handleCors(config, request);

    // Blocked origin: allow-origin is omitted, but allow-methods and allow-headers
    // are still set unconditionally — this documents the current behavior.
    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-origin')).toBeNull();
    expect(response!.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    expect(response!.headers.get('access-control-allow-headers')).toBe(
      'Content-Type, Authorization',
    );
  });

  it('matches single string origin exactly and reflects it', () => {
    const config: CorsConfig = { origins: 'http://exact.com' };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://exact.com', 'access-control-request-method': 'GET' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-origin')).toBe('http://exact.com');
  });

  it('does not allow origin when single string origin does not match', () => {
    const config: CorsConfig = { origins: 'http://exact.com' };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://other.com', 'access-control-request-method': 'GET' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns wildcard allow-origin in preflight even without Origin header when origins is wildcard', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { 'access-control-request-method': 'GET' },
    });

    const response = handleCors(config, request);

    // resolveOrigin short-circuits to '*' before the null-guard when origins === '*',
    // so the absence of an Origin header does not suppress the allow-origin header.
    expect(response).not.toBeNull();
    expect(response!.status).toBe(204);
    expect(response!.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('does not set access-control-allow-origin in preflight when request has no Origin and origins is an array', () => {
    const config: CorsConfig = { origins: ['http://allowed.com'] };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { 'access-control-request-method': 'GET' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('uses custom methods and headers from config instead of defaults in preflight', () => {
    const config: CorsConfig = {
      origins: '*',
      methods: ['GET', 'POST'],
      headers: ['X-Api-Key', 'X-Request-Id'],
    };
    const request = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com', 'access-control-request-method': 'POST' },
    });

    const response = handleCors(config, request);

    expect(response).not.toBeNull();
    expect(response!.headers.get('access-control-allow-methods')).toBe('GET, POST');
    expect(response!.headers.get('access-control-allow-headers')).toBe(
      'X-Api-Key, X-Request-Id',
    );
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

  it('omits access-control-allow-credentials when credentials is not set', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://example.com' },
    });
    const original = new Response('ok');

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('omits access-control-allow-credentials when credentials is false', () => {
    const config: CorsConfig = { origins: '*', credentials: false };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://example.com' },
    });
    const original = new Response('ok');

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('formats multiple exposed headers as comma-separated values', () => {
    const config: CorsConfig = {
      origins: '*',
      exposedHeaders: ['X-Total-Count', 'X-Request-Id', 'X-Rate-Limit'],
    };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://example.com' },
    });
    const original = new Response('ok');

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('access-control-expose-headers')).toBe(
      'X-Total-Count, X-Request-Id, X-Rate-Limit',
    );
  });

  it('preserves response body through applyCorsHeaders', async () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://example.com' },
    });
    const original = new Response(JSON.stringify({ id: 1, name: 'Alice' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const response = applyCorsHeaders(config, request, original);
    const body = await response.json();

    expect(body).toEqual({ id: 1, name: 'Alice' });
    expect(response.status).toBe(200);
  });

  it('preserves existing response headers through applyCorsHeaders', () => {
    const config: CorsConfig = { origins: '*' };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://example.com' },
    });
    const original = new Response('ok', {
      status: 200,
      headers: { 'x-custom-header': 'my-value', 'content-type': 'text/plain' },
    });

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('x-custom-header')).toBe('my-value');
    expect(response.headers.get('content-type')).toBe('text/plain');
  });

  it('returns original response unchanged when request has no Origin header', () => {
    const config: CorsConfig = { origins: ['http://allowed.com'] };
    const request = new Request('http://localhost:3000/api');
    const original = new Response('ok', { status: 200 });

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response).toBe(original);
  });

  it('reflects matched array origin in response header', () => {
    const config: CorsConfig = { origins: ['http://app.com', 'http://admin.com'] };
    const request = new Request('http://localhost:3000/api', {
      headers: { origin: 'http://admin.com' },
    });
    const original = new Response('ok');

    const response = applyCorsHeaders(config, request, original);

    expect(response.headers.get('access-control-allow-origin')).toBe('http://admin.com');
  });
});
