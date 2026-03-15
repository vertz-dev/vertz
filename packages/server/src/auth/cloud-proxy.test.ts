import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { createAuthProxy } from './cloud-proxy';

let mockCloudServer: ReturnType<typeof Bun.serve>;
let cloudBaseUrl: string;
let lastRequest: { headers: Record<string, string>; body: string | null; url: string; method: string } | null;
let mockResponse: { status: number; body: unknown; headers?: Record<string, string> };

beforeAll(() => {
  mockCloudServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const headers: Record<string, string> = {};
      req.headers.forEach((v, k) => { headers[k] = v; });
      lastRequest = {
        headers,
        body: req.method !== 'GET' ? await req.text() : null,
        url: new URL(req.url).pathname,
        method: req.method,
      };

      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(mockResponse.headers ?? {}),
      };

      return new Response(
        typeof mockResponse.body === 'string' ? mockResponse.body : JSON.stringify(mockResponse.body),
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
        'Cookie': 'vertz.sid=abc',
        'Accept': 'application/json',
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
    mockResponse = { status: 200, body: '<html>Error</html>', headers: { 'Content-Type': 'text/html' } };
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
});
