import { describe, expect, it, mock, spyOn } from 'bun:test';
import { createAuthMethod, parseAuthError } from '../auth-client';
import type { AuthResponse, SignInInput } from '../auth-types';

function makeMethod(overrides?: Partial<Parameters<typeof createAuthMethod>[0]>) {
  return createAuthMethod<SignInInput, AuthResponse>({
    basePath: '/api/auth',
    endpoint: 'signin',
    httpMethod: 'POST',
    schema: {
      parse: (data: unknown) => ({ ok: true as const, data: data as SignInInput }),
    },
    onSuccess: () => {},
    ...overrides,
  });
}

describe('createAuthMethod', () => {
  it('returns a callable with url and method properties', () => {
    const method = makeMethod();

    expect(method.url).toBe('/api/auth/signin');
    expect(method.method).toBe('POST');
    expect(typeof method).toBe('function');
  });

  it('attaches meta.bodySchema from the provided schema', () => {
    const schema = {
      parse: (data: unknown) => ({ ok: true as const, data: data as SignInInput }),
    };
    const method = makeMethod({ schema });

    expect(method.meta.bodySchema).toBe(schema);
  });

  it('sends JSON body with CSRF header and credentials', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ user: { id: '1', email: 'a@b.com', role: 'user' }, expiresAt: 9999 }),
        {
          status: 200,
        },
      ),
    );

    const method = makeMethod();
    await method({ email: 'a@b.com', password: 'pass' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/signin');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-VTZ-Request']).toBe('1');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.com', password: 'pass' });

    fetchSpy.mockRestore();
  });

  it('returns ok(data) and calls onSuccess on 200', async () => {
    const responseData = { user: { id: '1', email: 'a@b.com', role: 'user' }, expiresAt: 9999 };
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(responseData), { status: 200 }),
    );
    const onSuccess = mock(() => {});

    const method = makeMethod({ onSuccess });
    const result = await method({ email: 'a@b.com', password: 'pass' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.user.email).toBe('a@b.com');
      expect(result.data.expiresAt).toBe(9999);
    }
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(responseData);

    fetchSpy.mockRestore();
  });

  it('returns err with AuthClientError on non-ok response', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Wrong password' }), {
        status: 401,
      }),
    );

    const method = makeMethod();
    const result = await method({ email: 'a@b.com', password: 'wrong' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error = result.error as Error & { code: string; statusCode: number };
      expect(error.code).toBe('INVALID_CREDENTIALS');
      expect(error.message).toBe('Wrong password');
      expect(error.statusCode).toBe(401);
    }

    fetchSpy.mockRestore();
  });

  it('returns NETWORK_ERROR on fetch failure', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch'));

    const method = makeMethod();
    const result = await method({ email: 'a@b.com', password: 'pass' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error = result.error as Error & { code: string; statusCode: number };
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.statusCode).toBe(0);
    }

    fetchSpy.mockRestore();
  });
});

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
