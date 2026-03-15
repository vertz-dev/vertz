import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { createCircuitBreaker } from './circuit-breaker';
import { type CloudProxyLifecycleCallbacks, createAuthProxy } from './cloud-proxy';

let mockCloudServer: ReturnType<typeof Bun.serve>;
let cloudBaseUrl: string;
let lastRequest: {
  headers: Record<string, string>;
  body: string | null;
  url: string;
  search: string;
  method: string;
} | null;
let mockResponse: { status: number; body: unknown; headers?: Record<string, string> };

beforeAll(() => {
  mockCloudServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const headers: Record<string, string> = {};
      req.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const parsedUrl = new URL(req.url);
      lastRequest = {
        headers,
        body: req.method !== 'GET' ? await req.text() : null,
        url: parsedUrl.pathname,
        search: parsedUrl.search,
        method: req.method,
      };

      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(mockResponse.headers ?? {}),
      };

      return new Response(
        typeof mockResponse.body === 'string'
          ? mockResponse.body
          : JSON.stringify(mockResponse.body),
        { status: mockResponse.status, headers: responseHeaders },
      );
    },
  });
  cloudBaseUrl = `http://localhost:${mockCloudServer.port}`;
});

afterAll(() => {
  mockCloudServer?.stop();
});

afterEach(() => {
  lastRequest = null;
  mockResponse = { status: 200, body: {} };
});

function createProxy(overrides?: Record<string, unknown>) {
  return createAuthProxy({
    projectId: 'proj_test123',
    cloudBaseUrl,
    environment: 'production',
    authToken: 'vtk_test_token',
    ...overrides,
  });
}

describe('createAuthProxy', () => {
  // --- Request proxying ---

  it('proxies POST /api/auth/signup to {cloudBaseUrl}/auth/v1/signup', async () => {
    mockResponse = { status: 200, body: { user: { id: 'user_1' } } };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'abc123' }),
    });

    await proxy(req);
    expect(lastRequest!.url).toBe('/auth/v1/signup');
    expect(lastRequest!.method).toBe('POST');
  });

  it('includes X-Vertz-Project header with projectId', async () => {
    mockResponse = { status: 200, body: {} };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    await proxy(req);
    expect(lastRequest!.headers['x-vertz-project']).toBe('proj_test123');
  });

  it('includes Authorization: Bearer header with auth token', async () => {
    mockResponse = { status: 200, body: {} };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    await proxy(req);
    expect(lastRequest!.headers['authorization']).toBe('Bearer vtk_test_token');
  });

  it('only forwards whitelisted headers', async () => {
    mockResponse = { status: 200, body: {} };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'vertz.sid=abc',
        Accept: 'application/json',
        'User-Agent': 'TestBot/1.0',
        'X-Custom-Header': 'should-be-stripped',
        'X-Forwarded-For': '1.2.3.4',
      },
      body: JSON.stringify({}),
    });

    await proxy(req);
    expect(lastRequest!.headers['content-type']).toBe('application/json');
    expect(lastRequest!.headers['cookie']).toBe('vertz.sid=abc');
    expect(lastRequest!.headers['accept']).toBe('application/json');
    expect(lastRequest!.headers['user-agent']).toBe('TestBot/1.0');
    expect(lastRequest!.headers['x-forwarded-for']).toBe('1.2.3.4');
    expect(lastRequest!.headers['x-custom-header']).toBeUndefined();
  });

  it('includes X-Vertz-Environment header', async () => {
    mockResponse = { status: 200, body: {} };
    const proxy = createProxy({ environment: 'production' });

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    await proxy(req);
    expect(lastRequest!.headers['x-vertz-environment']).toBe('production');
  });

  // --- Cookie handling ---

  it('sets vertz.sid cookie from _tokens in response body', async () => {
    mockResponse = {
      status: 200,
      body: { user: { id: 'user_1' }, _tokens: { jwt: 'the_jwt', refreshToken: 'the_refresh' } },
    };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    const cookies = res.headers.getSetCookie();
    const sidCookie = cookies.find((c) => c.startsWith('vertz.sid='));
    expect(sidCookie).toBeTruthy();
    expect(sidCookie).toContain('the_jwt');
    expect(sidCookie).toContain('HttpOnly');
    expect(sidCookie).toContain('SameSite=Lax');
  });

  it('sets vertz.ref cookie with Path=/api/auth', async () => {
    mockResponse = {
      status: 200,
      body: { user: { id: 'user_1' }, _tokens: { jwt: 'the_jwt', refreshToken: 'the_refresh' } },
    };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    const cookies = res.headers.getSetCookie();
    const refCookie = cookies.find((c) => c.startsWith('vertz.ref='));
    expect(refCookie).toBeTruthy();
    expect(refCookie).toContain('the_refresh');
    expect(refCookie).toContain('HttpOnly');
    expect(refCookie).toContain('Path=/api/auth');
  });

  it('strips _tokens from response body sent to client', async () => {
    mockResponse = {
      status: 200,
      body: { user: { id: 'user_1' }, _tokens: { jwt: 'secret', refreshToken: 'secret2' } },
    };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    const body = await res.json();
    expect(body._tokens).toBeUndefined();
    expect(body.user.id).toBe('user_1');
  });

  it('removes Content-Length header after body manipulation (uses chunked transfer)', async () => {
    mockResponse = {
      status: 200,
      body: { user: { id: 'user_1' }, _tokens: { jwt: 'a', refreshToken: 'b' } },
    };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    expect(res.headers.get('content-length')).toBeNull();
  });

  // --- Cookie security ---

  it('cookies omit Secure flag in development environment', async () => {
    mockResponse = {
      status: 200,
      body: { _tokens: { jwt: 'j', refreshToken: 'r' } },
    };
    const proxy = createProxy({ environment: 'development' });

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    const cookies = res.headers.getSetCookie();
    const sidCookie = cookies.find((c) => c.startsWith('vertz.sid='));
    expect(sidCookie).not.toContain('Secure');
  });

  it('cookies include Secure flag in production environment', async () => {
    mockResponse = {
      status: 200,
      body: { _tokens: { jwt: 'j', refreshToken: 'r' } },
    };
    const proxy = createProxy({ environment: 'production' });

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    const cookies = res.headers.getSetCookie();
    const sidCookie = cookies.find((c) => c.startsWith('vertz.sid='));
    expect(sidCookie).toContain('Secure');
  });

  // --- Body size limit ---

  it('returns 413 Payload Too Large when body exceeds maxBodySize', async () => {
    const proxy = createProxy({ maxBodySize: 100 });

    const largeBody = 'x'.repeat(200);
    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: largeBody,
    });

    const res = await proxy(req);
    expect(res.status).toBe(413);
  });

  // --- Timeout ---

  it('returns 502 Bad Gateway when cloud fetch exceeds fetchTimeout', async () => {
    // Create a slow server
    const slowServer = Bun.serve({
      port: 0,
      async fetch() {
        await new Promise((r) => setTimeout(r, 5000));
        return new Response('ok');
      },
    });

    const proxy = createAuthProxy({
      projectId: 'proj_test123',
      cloudBaseUrl: `http://localhost:${slowServer.port}`,
      environment: 'production',
      authToken: 'vtk_test_token',
      fetchTimeout: 100, // 100ms timeout
    });

    const req = new Request(`http://localhost:${slowServer.port}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    expect(res.status).toBe(502);
    slowServer.stop();
  });

  // --- Non-JSON passthrough ---

  it('passes through non-JSON responses without crashing', async () => {
    mockResponse = {
      status: 200,
      body: '<html>Error</html>',
      headers: { 'Content-Type': 'text/html' },
    };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<html>');
  });

  // --- _lifecycle stripping ---

  it('strips _lifecycle from response body', async () => {
    mockResponse = {
      status: 200,
      body: { user: { id: 'u1' }, _lifecycle: { isNewUser: true } },
    };
    const proxy = createProxy();
    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await proxy(req);
    const body = await res.json();
    expect(body._lifecycle).toBeUndefined();
    expect(body.user.id).toBe('u1');
  });

  // --- Host header ---

  it('sets Host header to cloud endpoint host, not client Host', async () => {
    mockResponse = { status: 200, body: {} };
    const proxy = createProxy();
    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'my-local-app.dev' },
      body: JSON.stringify({}),
    });
    await proxy(req);
    const cloudHost = new URL(cloudBaseUrl).host;
    expect(lastRequest!.headers['host']).toBe(cloudHost);
  });

  // --- Query string preservation ---

  it('preserves query parameters in proxied URL', async () => {
    mockResponse = { status: 200, body: {} };
    const proxy = createProxy();
    const req = new Request(`${cloudBaseUrl}/api/auth/oauth/callback?code=abc123&state=xyz`, {
      method: 'GET',
    });
    await proxy(req);
    expect(lastRequest!.url).toBe('/auth/v1/oauth/callback');
    expect(lastRequest!.search).toBe('?code=abc123&state=xyz');
  });

  // --- 4xx forwarding ---

  it('forwards 400 from cloud to client as-is', async () => {
    mockResponse = { status: 400, body: { error: 'invalid_email', message: 'Email is invalid' } };
    const proxy = createProxy();

    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_email');
  });

  it('does not count 4xx responses as circuit breaker failures', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 2 });
    const proxy = createProxy({ circuitBreaker: cb });

    // Send 3 requests that get 400 from cloud
    for (let i = 0; i < 3; i++) {
      mockResponse = { status: 400, body: { error: 'bad_request' } };
      const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await proxy(req);
      expect(res.status).toBe(400);
    }

    // Circuit should still be closed
    expect(cb.getState()).toBe('closed');
  });

  // --- Circuit breaker integration ---

  it('returns 503 when circuit breaker is open', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    // Trip the circuit breaker by forcing a 500
    mockResponse = { status: 500, body: { error: 'internal_error' } };
    const proxy = createProxy({ circuitBreaker: cb });

    const req1 = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await proxy(req1);

    expect(cb.getState()).toBe('open');

    // Next request should get 503
    const req2 = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await proxy(req2);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('auth_service_unavailable');
  });

  it('forwards 5xx responses AND counts them as circuit breaker failures', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });
    const proxy = createProxy({ circuitBreaker: cb });

    // 500 from cloud — should be forwarded AND counted
    mockResponse = { status: 500, body: { error: 'internal_error', message: 'Server Error' } };
    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await proxy(req);

    // Response forwarded with original status
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('internal_error');

    // Circuit breaker counted the failure (not open yet — threshold is 3)
    expect(cb.getState()).toBe('closed');

    // 2 more 500s should trip the breaker
    for (let i = 0; i < 2; i++) {
      const r = new Request(`${cloudBaseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await proxy(r);
    }

    expect(cb.getState()).toBe('open');
  });

  // --- Lifecycle callbacks ---

  it('fires onUserCreated when _lifecycle.isNewUser is true', async () => {
    let createdPayload: unknown = null;
    const callbacks: CloudProxyLifecycleCallbacks = {
      onUserCreated: async (payload) => {
        createdPayload = payload;
      },
    };
    mockResponse = {
      status: 200,
      body: {
        user: { id: 'u1', email: 'new@test.com', role: 'member' },
        _lifecycle: {
          isNewUser: true,
          provider: { id: 'github', name: 'GitHub' },
          rawProfile: { login: 'octocat' },
        },
        _tokens: { jwt: 'j', refreshToken: 'r' },
      },
    };
    const proxy = createProxy({ lifecycle: callbacks });
    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    await proxy(req);

    expect(createdPayload).not.toBeNull();
    expect((createdPayload as any).user.id).toBe('u1');
    expect((createdPayload as any).provider.id).toBe('github');
    expect((createdPayload as any).profile.login).toBe('octocat');
  });

  it('does not fire onUserCreated when _lifecycle.isNewUser is false', async () => {
    let called = false;
    const callbacks: CloudProxyLifecycleCallbacks = {
      onUserCreated: async () => {
        called = true;
      },
    };
    mockResponse = {
      status: 200,
      body: {
        user: { id: 'u1' },
        _lifecycle: { isNewUser: false },
        _tokens: { jwt: 'j', refreshToken: 'r' },
      },
    };
    const proxy = createProxy({ lifecycle: callbacks });
    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    await proxy(req);
    expect(called).toBe(false);
  });

  it('fires onUserAuthenticated on every successful auth response with _tokens', async () => {
    let authUser: unknown = null;
    const callbacks: CloudProxyLifecycleCallbacks = {
      onUserAuthenticated: async (user) => {
        authUser = user;
      },
    };
    mockResponse = {
      status: 200,
      body: {
        user: { id: 'u2', email: 'auth@test.com', role: 'admin' },
        _tokens: { jwt: 'j', refreshToken: 'r' },
      },
    };
    const proxy = createProxy({ lifecycle: callbacks });
    const req = new Request(`${cloudBaseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    await proxy(req);

    expect(authUser).not.toBeNull();
    expect((authUser as any).id).toBe('u2');
    expect((authUser as any).email).toBe('auth@test.com');
  });

  it('does not fire onUserAuthenticated when no _tokens in response', async () => {
    let called = false;
    const callbacks: CloudProxyLifecycleCallbacks = {
      onUserAuthenticated: async () => {
        called = true;
      },
    };
    mockResponse = { status: 200, body: { user: { id: 'u1' } } };
    const proxy = createProxy({ lifecycle: callbacks });
    const req = new Request(`${cloudBaseUrl}/api/auth/me`, { method: 'GET' });

    await proxy(req);
    expect(called).toBe(false);
  });

  it('strips _lifecycle from response even when lifecycle callbacks fire', async () => {
    const callbacks: CloudProxyLifecycleCallbacks = {
      onUserCreated: async () => {},
    };
    mockResponse = {
      status: 200,
      body: {
        user: { id: 'u1' },
        _lifecycle: { isNewUser: true, provider: { id: 'github', name: 'GitHub' }, rawProfile: {} },
        _tokens: { jwt: 'j', refreshToken: 'r' },
      },
    };
    const proxy = createProxy({ lifecycle: callbacks });
    const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await proxy(req);
    const body = await res.json();
    expect(body._lifecycle).toBeUndefined();
  });

  it('counts network errors as circuit breaker failures', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    // Point to a server that immediately closes connections
    const proxy = createAuthProxy({
      projectId: 'proj_test123',
      cloudBaseUrl: 'http://127.0.0.1:1',
      environment: 'production',
      authToken: 'vtk_test_token',
      circuitBreaker: cb,
      fetchTimeout: 100,
    });

    const req = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await proxy(req);

    expect(res.status).toBe(502);
    expect(cb.getState()).toBe('open');
  });
});
