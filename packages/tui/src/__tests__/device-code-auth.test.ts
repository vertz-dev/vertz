import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfig, DeviceCodeResponse } from '../auth/index';
import {
  AuthCancelledError,
  AuthDeniedError,
  AuthExpiredError,
  DeviceCodeAuth,
  pollTokenUntilComplete,
  requestDeviceCode,
} from '../auth/index';

function createMockFetcher(responses: Array<{ status: number; body: unknown }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex++] ?? { status: 500, body: { error: 'no_more_responses' } };
    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const MOCK_DEVICE_CODE_RESPONSE: DeviceCodeResponse = {
  device_code: 'test-device-code',
  user_code: 'ABCD-1234',
  verification_uri: 'https://example.com/verify',
  expires_in: 300,
  interval: 0.01, // 10ms for fast tests
};

const MOCK_TOKEN_RESPONSE = {
  access_token: 'test-access-token',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'test-refresh-token',
  scope: 'read write',
};

describe('Auth error types', () => {
  it('AuthDeniedError has correct name and message', () => {
    const err = new AuthDeniedError();
    expect(err.name).toBe('AuthDeniedError');
    expect(err.message).toContain('denied');
    expect(err).toBeInstanceOf(Error);
  });

  it('AuthExpiredError has correct name and message', () => {
    const err = new AuthExpiredError();
    expect(err.name).toBe('AuthExpiredError');
    expect(err.message).toContain('expired');
    expect(err).toBeInstanceOf(Error);
  });

  it('AuthCancelledError has correct name and message', () => {
    const err = new AuthCancelledError();
    expect(err.name).toBe('AuthCancelledError');
    expect(err.message).toContain('cancelled');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('requestDeviceCode', () => {
  it('sends correct POST body and returns device code response', async () => {
    const fetcher = createMockFetcher([{ status: 200, body: MOCK_DEVICE_CODE_RESPONSE }]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      scopes: ['read', 'write'],
      fetcher,
    };

    const result = await requestDeviceCode(config);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://auth.example.com/device/code');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });

    const body = new URLSearchParams(init.body as string);
    expect(body.get('client_id')).toBe('my-app');
    expect(body.get('scope')).toBe('read write');

    expect(result.device_code).toBe('test-device-code');
    expect(result.user_code).toBe('ABCD-1234');
    expect(result.verification_uri).toBe('https://example.com/verify');
  });

  it('throws on HTTP error', async () => {
    const fetcher = createMockFetcher([{ status: 500, body: {} }]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
    };

    await expect(requestDeviceCode(config)).rejects.toThrow('Device code request failed: 500');
  });
});

describe('pollTokenUntilComplete', () => {
  it('returns tokens after authorization_pending then success', async () => {
    const fetcher = createMockFetcher([
      { status: 400, body: { error: 'authorization_pending' } },
      { status: 400, body: { error: 'authorization_pending' } },
      { status: 200, body: MOCK_TOKEN_RESPONSE },
    ]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
    };

    const tokens = await pollTokenUntilComplete(config, {
      ...MOCK_DEVICE_CODE_RESPONSE,
      interval: 0.01,
    });

    expect(tokens.accessToken).toBe('test-access-token');
    expect(tokens.refreshToken).toBe('test-refresh-token');
    expect(tokens.expiresIn).toBe(3600);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('throws AuthDeniedError on access_denied', async () => {
    const fetcher = createMockFetcher([{ status: 400, body: { error: 'access_denied' } }]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
    };

    await expect(
      pollTokenUntilComplete(config, { ...MOCK_DEVICE_CODE_RESPONSE, interval: 0.01 }),
    ).rejects.toThrow(AuthDeniedError);
  });

  it('throws AuthExpiredError on expired_token', async () => {
    const fetcher = createMockFetcher([{ status: 400, body: { error: 'expired_token' } }]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
    };

    await expect(
      pollTokenUntilComplete(config, { ...MOCK_DEVICE_CODE_RESPONSE, interval: 0.01 }),
    ).rejects.toThrow(AuthExpiredError);
  });

  it('calls onTokens callback on success', async () => {
    const onTokens = vi.fn();
    const fetcher = createMockFetcher([{ status: 200, body: MOCK_TOKEN_RESPONSE }]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
      onTokens,
    };

    await pollTokenUntilComplete(config, { ...MOCK_DEVICE_CODE_RESPONSE, interval: 0.01 });

    expect(onTokens).toHaveBeenCalledOnce();
    expect(onTokens).toHaveBeenCalledWith({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresIn: 3600,
    });
  });

  it('handles slow_down by increasing interval', { timeout: 10_000 }, async () => {
    const fetcher = createMockFetcher([
      { status: 400, body: { error: 'slow_down' } },
      { status: 200, body: MOCK_TOKEN_RESPONSE },
    ]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
    };

    const tokens = await pollTokenUntilComplete(config, {
      ...MOCK_DEVICE_CODE_RESPONSE,
      interval: 0.01,
    });

    expect(tokens.accessToken).toBe('test-access-token');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('DeviceCodeAuth', () => {
  const originalCI = process.env.CI;

  afterEach(() => {
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it('CI mode logs URL and code, returns tokens', async () => {
    process.env.CI = 'true';
    const output: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      output.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    const fetcher = createMockFetcher([
      { status: 200, body: MOCK_DEVICE_CODE_RESPONSE },
      { status: 200, body: MOCK_TOKEN_RESPONSE },
    ]);

    try {
      const tokens = await DeviceCodeAuth({
        clientId: 'test-app',
        deviceCodeUrl: 'https://auth.example.com/device/code',
        tokenUrl: 'https://auth.example.com/token',
        fetcher,
      });

      expect(tokens.accessToken).toBe('test-access-token');

      const joined = output.join('');
      expect(joined).toContain('https://example.com/verify');
      expect(joined).toContain('ABCD-1234');
      expect(joined).toContain('Authenticated successfully');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('CI mode throws AuthDeniedError on access_denied', async () => {
    process.env.CI = 'true';
    const originalWrite = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;

    const fetcher = createMockFetcher([
      { status: 200, body: MOCK_DEVICE_CODE_RESPONSE },
      { status: 400, body: { error: 'access_denied' } },
    ]);

    try {
      await expect(
        DeviceCodeAuth({
          clientId: 'test-app',
          deviceCodeUrl: 'https://auth.example.com/device/code',
          tokenUrl: 'https://auth.example.com/token',
          fetcher,
        }),
      ).rejects.toThrow(AuthDeniedError);
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
