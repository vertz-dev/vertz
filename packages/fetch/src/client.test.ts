import { describe, expect, it, vi } from 'vitest';
import { FetchClient } from './client';
import { FetchError, NotFoundError } from './errors';

describe('FetchClient', () => {
  it('can be instantiated with minimal config', () => {
    const client = new FetchClient({ baseURL: 'http://localhost:3000' });

    expect(client).toBeInstanceOf(FetchClient);
  });
});

describe('FetchClient.request', () => {
  it('makes a GET request to the correct URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const result = await client.request('GET', '/api/users');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.method).toBe('GET');
    expect(request.url).toBe('http://localhost:3000/api/users');
    expect(result.data).toEqual({ id: 1 });
    expect(result.status).toBe(200);
  });

  it('sends JSON body with POST request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: 'Alice' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const result = await client.request('POST', '/api/users', {
      body: { name: 'Alice' },
    });

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.method).toBe('POST');
    const sentBody = await request.json();
    expect(sentBody).toEqual({ name: 'Alice' });
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(result.data).toEqual({ id: 1, name: 'Alice' });
    expect(result.status).toBe(201);
  });

  it('appends query parameters to the URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users', {
      query: { page: 1, limit: 10, search: 'alice' },
    });

    const [request] = mockFetch.mock.calls[0] as [Request];
    const url = new URL(request.url);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('search')).toBe('alice');
  });

  it('throws NotFoundError for 404 response', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    await expect(client.request('GET', '/api/users/999')).rejects.toThrow(NotFoundError);

    try {
      await client.request('GET', '/api/users/999');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchError);
      expect((error as NotFoundError).status).toBe(404);
      expect((error as NotFoundError).body).toEqual({ error: 'not_found' });
    }
  });

  it('merges config headers with per-request headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      headers: { 'X-Api-Version': '2', Accept: 'application/json' },
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users', {
      headers: { 'X-Request-Id': 'abc-123' },
    });

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('X-Api-Version')).toBe('2');
    expect(request.headers.get('Accept')).toBe('application/json');
    expect(request.headers.get('X-Request-Id')).toBe('abc-123');
  });

  it('applies bearer auth strategy with static token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      authStrategies: [{ type: 'bearer', token: 'my-token-123' }],
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('Authorization')).toBe('Bearer my-token-123');
  });

  it('applies bearer auth with dynamic token function', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const tokenFn = vi.fn().mockResolvedValue('dynamic-token');

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      authStrategies: [{ type: 'bearer', token: tokenFn }],
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    expect(tokenFn).toHaveBeenCalledOnce();
    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('Authorization')).toBe('Bearer dynamic-token');
  });

  it('applies basic auth strategy', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      authStrategies: [{ type: 'basic', username: 'admin', password: 'secret' }],
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    const [request] = mockFetch.mock.calls[0] as [Request];
    const expected = `Basic ${btoa('admin:secret')}`;
    expect(request.headers.get('Authorization')).toBe(expected);
  });

  it('applies apiKey strategy to header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      authStrategies: [
        { type: 'apiKey', key: 'my-api-key', location: 'header', name: 'X-API-Key' },
      ],
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('X-API-Key')).toBe('my-api-key');
  });

  it('applies apiKey strategy to query', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      authStrategies: [{ type: 'apiKey', key: 'my-api-key', location: 'query', name: 'api_key' }],
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    const [request] = mockFetch.mock.calls[0] as [Request];
    const url = new URL(request.url);
    expect(url.searchParams.get('api_key')).toBe('my-api-key');
  });

  it('applies custom auth strategy', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      authStrategies: [
        {
          type: 'custom',
          apply: (request) => {
            request.headers.set('X-Custom-Auth', 'custom-value');
            return request;
          },
        },
      ],
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('X-Custom-Auth')).toBe('custom-value');
  });

  it('retries on 503 with exponential backoff', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve(
          new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      retry: {
        retries: 3,
        strategy: 'exponential',
        backoffMs: 10,
        retryOn: [503],
      },
      fetch: mockFetch,
    });

    const result = await client.request('GET', '/api/health');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.data).toEqual({ ok: true });
  });

  it('throws after exhausting all retries', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' }),
        ),
      );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      retry: { retries: 2, strategy: 'linear', backoffMs: 1, retryOn: [503] },
      fetch: mockFetch,
    });

    await expect(client.request('GET', '/api/health')).rejects.toThrow('Service Unavailable');
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does not retry non-retryable status codes', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'bad request' }), {
          status: 400,
          statusText: 'Bad Request',
        }),
      ),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      retry: { retries: 3, strategy: 'exponential', backoffMs: 10 },
      fetch: mockFetch,
    });

    await expect(client.request('GET', '/api/users')).rejects.toThrow('Bad Request');
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retries
  });

  it('uses custom backoff function', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 2) {
        return Promise.resolve(
          new Response('Error', { status: 500, statusText: 'Internal Server Error' }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const customBackoff = vi.fn().mockReturnValue(1);

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      retry: { retries: 3, strategy: customBackoff, backoffMs: 100, retryOn: [500] },
      fetch: mockFetch,
    });

    await client.request('GET', '/api/health');

    expect(customBackoff).toHaveBeenCalledWith(1, 100);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('FetchClient hooks', () => {
  it('calls beforeRequest hook before making the request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const beforeRequest = vi.fn();

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      hooks: { beforeRequest },
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    expect(beforeRequest).toHaveBeenCalledOnce();
    expect(beforeRequest).toHaveBeenCalledBefore(mockFetch);
    const [request] = beforeRequest.mock.calls[0] as [Request];
    expect(request.url).toBe('http://localhost:3000/api/users');
  });

  it('calls afterResponse hook after successful response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const afterResponse = vi.fn();

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      hooks: { afterResponse },
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    expect(afterResponse).toHaveBeenCalledOnce();
    const [response] = afterResponse.mock.calls[0] as [Response];
    expect(response.status).toBe(200);
  });

  it('calls onError hook when request fails', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('Not Found', { status: 404, statusText: 'Not Found' })),
      );
    const onError = vi.fn();

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      hooks: { onError },
      fetch: mockFetch,
    });

    await expect(client.request('GET', '/api/users/999')).rejects.toThrow();

    expect(onError).toHaveBeenCalledOnce();
    const [error] = onError.mock.calls[0] as [Error];
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('calls beforeRetry hook before each retry attempt', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve(new Response('Error', { status: 500, statusText: 'Error' }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    const beforeRetry = vi.fn();

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      retry: { retries: 3, strategy: 'linear', backoffMs: 1, retryOn: [500] },
      hooks: { beforeRetry },
      fetch: mockFetch,
    });

    await client.request('GET', '/api/health');

    expect(beforeRetry).toHaveBeenCalledTimes(2);
    expect(beforeRetry.mock.calls[0]?.[0]).toBe(1); // first retry attempt
    expect(beforeRetry.mock.calls[1]?.[0]).toBe(2); // second retry attempt
  });
});

describe('FetchClient timeout', () => {
  it('aborts request after configured timeout', async () => {
    const mockFetch = vi.fn().mockImplementation(
      (request: Request) =>
        new Promise((_resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('should not resolve')), 5000);
          request.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(request.signal.reason);
          });
        }),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      timeoutMs: 50,
      fetch: mockFetch,
    });

    await expect(client.request('GET', '/api/slow')).rejects.toThrow();
  });
});

describe('FetchClient edge cases', () => {
  it('skips null and undefined query values', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users', {
      query: { page: 1, search: undefined, filter: null },
    });

    const [request] = mockFetch.mock.calls[0] as [Request];
    const url = new URL(request.url);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.has('search')).toBe(false);
    expect(url.searchParams.has('filter')).toBe(false);
  });

  it('does not set Content-Type when body is not provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('Content-Type')).toBeNull();
  });

  it('applies apiKey strategy with dynamic key function', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const keyFn = vi.fn().mockResolvedValue('dynamic-key');

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      authStrategies: [{ type: 'apiKey', key: keyFn, location: 'header', name: 'X-API-Key' }],
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    expect(keyFn).toHaveBeenCalledOnce();
    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('X-API-Key')).toBe('dynamic-key');
  });

  it('applies multiple auth strategies in order', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      authStrategies: [
        { type: 'bearer', token: 'my-token' },
        { type: 'apiKey', key: 'my-key', location: 'header', name: 'X-API-Key' },
      ],
      fetch: mockFetch,
    });

    await client.request('GET', '/api/users');

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('Authorization')).toBe('Bearer my-token');
    expect(request.headers.get('X-API-Key')).toBe('my-key');
  });

  it('handles non-JSON error responses gracefully', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      ),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    try {
      await client.request('GET', '/api/users');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).status).toBe(500);
      expect((error as FetchError).body).toBeUndefined();
    }
  });

  it('works without baseURL when full URL is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = new FetchClient({ fetch: mockFetch });

    await client.request('GET', 'http://example.com/api/users');

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.url).toBe('http://example.com/api/users');
  });

  it('does not retry when retries is 0', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('Error', { status: 500, statusText: 'Error' })),
      );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    await expect(client.request('GET', '/api/users')).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('passes response headers in the result', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'X-Request-Id': 'req-123', 'X-RateLimit-Remaining': '99' },
      }),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const result = await client.request('GET', '/api/users');

    expect(result.headers.get('X-Request-Id')).toBe('req-123');
    expect(result.headers.get('X-RateLimit-Remaining')).toBe('99');
  });
});
