import { signal } from '@vertz/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tui } from '../app';
import type { AuthConfig, AuthStatus, DeviceCodeResponse } from '../auth/index';
import {
  AuthCancelledError,
  AuthDeniedError,
  AuthExpiredError,
  DeviceCodeAuth,
  DeviceCodeDisplay,
  pollTokenUntilComplete,
  requestDeviceCode,
} from '../auth/index';
import { TestAdapter } from '../test/test-adapter';
import { TestStdin } from '../test/test-stdin';

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
  it('sends request without scope param when no scopes provided', async () => {
    const fetcher = createMockFetcher([{ status: 200, body: MOCK_DEVICE_CODE_RESPONSE }]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
    };

    await requestDeviceCode(config);

    const [, init] = fetcher.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('client_id')).toBe('my-app');
    expect(body.has('scope')).toBe(false);
  });

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

  it('throws generic Error with description on unknown error type', async () => {
    const fetcher = createMockFetcher([
      {
        status: 400,
        body: { error: 'server_error', error_description: 'something went wrong' },
      },
    ]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
    };

    await expect(
      pollTokenUntilComplete(config, { ...MOCK_DEVICE_CODE_RESPONSE, interval: 0.01 }),
    ).rejects.toThrow('Token request failed: server_error \u2014 something went wrong');
  });

  it('throws AuthExpiredError when signal is pre-aborted', async () => {
    const fetcher = createMockFetcher([]);

    const config: AuthConfig = {
      clientId: 'my-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
    };

    const controller = new AbortController();
    controller.abort();

    await expect(
      pollTokenUntilComplete(
        config,
        { ...MOCK_DEVICE_CODE_RESPONSE, interval: 0.01 },
        controller.signal,
      ),
    ).rejects.toThrow(AuthExpiredError);

    // Should not have made any fetch calls since signal was already aborted
    expect(fetcher).not.toHaveBeenCalled();
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

  it('interactive mode mounts display, polls, and returns tokens on success', async () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const fetcher = createMockFetcher([
      { status: 200, body: MOCK_DEVICE_CODE_RESPONSE },
      { status: 200, body: MOCK_TOKEN_RESPONSE },
    ]);

    const tokens = await DeviceCodeAuth({
      clientId: 'test-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
      _mountOptions: { adapter, testStdin },
    });

    expect(tokens.accessToken).toBe('test-access-token');
    expect(tokens.refreshToken).toBe('test-refresh-token');
    expect(tokens.expiresIn).toBe(3600);
  });

  it('interactive mode rejects with AuthDeniedError on access_denied', async () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const fetcher = createMockFetcher([
      { status: 200, body: MOCK_DEVICE_CODE_RESPONSE },
      { status: 400, body: { error: 'access_denied' } },
    ]);

    await expect(
      DeviceCodeAuth({
        clientId: 'test-app',
        deviceCodeUrl: 'https://auth.example.com/device/code',
        tokenUrl: 'https://auth.example.com/token',
        fetcher,
        _mountOptions: { adapter, testStdin },
      }),
    ).rejects.toThrow(AuthDeniedError);
  });

  it('interactive mode rejects with AuthCancelledError when Escape is pressed', async () => {
    // Use a fetcher that returns device code but never resolves the token poll
    let resolveBlock: (() => void) | null = null;
    const blockingPromise = new Promise<void>((resolve) => {
      resolveBlock = resolve;
    });

    let callIndex = 0;
    const fetcher = vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        // Device code request
        return new Response(JSON.stringify(MOCK_DEVICE_CODE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Token poll — block forever so we can cancel
      await blockingPromise;
      return new Response(JSON.stringify({ error: 'authorization_pending' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();

    const authPromise = DeviceCodeAuth({
      clientId: 'test-app',
      deviceCodeUrl: 'https://auth.example.com/device/code',
      tokenUrl: 'https://auth.example.com/token',
      fetcher,
      _mountOptions: { adapter, testStdin },
    });

    // Wait a tick for the device code request to complete and the display to mount
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Press Escape to cancel
    testStdin.pressKey('escape');

    await expect(authPromise).rejects.toThrow(AuthCancelledError);

    // Unblock the fetcher so the test doesn't hang
    resolveBlock?.();
  });
});

describe('DeviceCodeDisplay', () => {
  it('renders title, URL, code, and hint text', () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          title: 'Login',
          userCode: signal('ABCD-1234'),
          verificationUri: signal('https://example.com/verify'),
          secondsRemaining: signal(120),
          status: signal<AuthStatus>('awaiting-approval'),
          onCancel: () => {},
          onOpenBrowser: () => {},
        }),
      { adapter, testStdin },
    );

    const text = adapter.text();
    expect(text).toContain('Login');
    expect(text).toContain('https://example.com/verify');
    expect(text).toContain('ABCD-1234');
    expect(text).toContain('Press Enter to open browser');
    expect(text).toContain('Press Esc to cancel');
    handle.unmount();
  });

  it('shows awaiting-approval status with countdown', () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          userCode: signal('TEST-CODE'),
          verificationUri: signal('https://example.com'),
          secondsRemaining: signal(125),
          status: signal<AuthStatus>('awaiting-approval'),
        }),
      { adapter, testStdin },
    );

    const text = adapter.text();
    expect(text).toContain('Waiting for approval...');
    expect(text).toContain('2m 5s');
    handle.unmount();
  });

  it('shows seconds-only countdown when < 60 seconds', () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          userCode: signal('TEST-CODE'),
          verificationUri: signal('https://example.com'),
          secondsRemaining: signal(45),
          status: signal<AuthStatus>('polling'),
        }),
      { adapter, testStdin },
    );

    const text = adapter.text();
    expect(text).toContain('Waiting for approval...');
    expect(text).toContain('(45s)');
    // Should not show minutes format like "Xm Ys"
    expect(text).not.toMatch(/\d+m \d+s/);
    handle.unmount();
  });

  it('shows success status', () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          userCode: signal('TEST-CODE'),
          verificationUri: signal('https://example.com'),
          secondsRemaining: signal(0),
          status: signal<AuthStatus>('success'),
        }),
      { adapter, testStdin },
    );

    const text = adapter.text();
    expect(text).toContain('Authenticated!');
    handle.unmount();
  });

  it('shows expired status', () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          userCode: signal('TEST-CODE'),
          verificationUri: signal('https://example.com'),
          secondsRemaining: signal(0),
          status: signal<AuthStatus>('expired'),
        }),
      { adapter, testStdin },
    );

    const text = adapter.text();
    expect(text).toContain('Code expired');
    handle.unmount();
  });

  it('shows denied status', () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          userCode: signal('TEST-CODE'),
          verificationUri: signal('https://example.com'),
          secondsRemaining: signal(0),
          status: signal<AuthStatus>('denied'),
        }),
      { adapter, testStdin },
    );

    const text = adapter.text();
    expect(text).toContain('Authorization denied');
    handle.unmount();
  });

  it('shows error status', () => {
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          userCode: signal('TEST-CODE'),
          verificationUri: signal('https://example.com'),
          secondsRemaining: signal(0),
          status: signal<AuthStatus>('error'),
        }),
      { adapter, testStdin },
    );

    const text = adapter.text();
    expect(text).toContain('Authentication failed');
    handle.unmount();
  });

  it('pressing Escape calls onCancel', () => {
    const cancelFn = vi.fn();
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          userCode: signal('TEST-CODE'),
          verificationUri: signal('https://example.com'),
          secondsRemaining: signal(120),
          status: signal<AuthStatus>('awaiting-approval'),
          onCancel: cancelFn,
        }),
      { adapter, testStdin },
    );

    testStdin.pressKey('escape');
    expect(cancelFn).toHaveBeenCalledOnce();
    handle.unmount();
  });

  it('pressing Enter calls onOpenBrowser', () => {
    const browserFn = vi.fn();
    const adapter = new TestAdapter(60, 20);
    const testStdin = new TestStdin();
    const handle = tui.mount(
      () =>
        DeviceCodeDisplay({
          userCode: signal('TEST-CODE'),
          verificationUri: signal('https://example.com'),
          secondsRemaining: signal(120),
          status: signal<AuthStatus>('awaiting-approval'),
          onOpenBrowser: browserFn,
        }),
      { adapter, testStdin },
    );

    testStdin.pressKey('return');
    expect(browserFn).toHaveBeenCalledOnce();
    handle.unmount();
  });
});
