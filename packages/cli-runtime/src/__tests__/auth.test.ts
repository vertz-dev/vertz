import { describe, expect, it, mock } from '@vertz/test';
import type { ConfigStore, DeviceCodeResponse, TokenResponse } from '../auth';
import { AuthError, createAuthManager } from '../auth';

function createMockStore(data: Record<string, string> = {}): ConfigStore {
  const store = new Map(Object.entries(data));
  return {
    read: mock(async (path: string) => store.get(path) ?? null),
    write: mock(async (path: string, content: string) => {
      store.set(path, content);
    }),
    remove: mock(async (path: string) => {
      store.delete(path);
    }),
  };
}

describe('createAuthManager', () => {
  describe('API key management', () => {
    it('stores and retrieves an API key', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      await auth.setApiKey('my-api-key');
      const key = await auth.getApiKey();

      expect(key).toBe('my-api-key');
    });

    it('returns undefined when no API key is stored', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const key = await auth.getApiKey();
      expect(key).toBeUndefined();
    });

    it('clears all credentials', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      await auth.setApiKey('my-api-key');
      await auth.clearCredentials();

      const key = await auth.getApiKey();
      expect(key).toBeUndefined();
    });
  });

  describe('token management', () => {
    it('stores tokens from a token response', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const tokenResponse: TokenResponse = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expires_in: 3600,
        token_type: 'Bearer',
      };

      await auth.storeTokens(tokenResponse);
      const token = await auth.getAccessToken();

      expect(token).toBe('access-123');
    });

    it('returns undefined for expired tokens', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const tokenResponse: TokenResponse = {
        access_token: 'access-123',
        expires_in: -1, // Already expired
        token_type: 'Bearer',
      };

      await auth.storeTokens(tokenResponse);
      const token = await auth.getAccessToken();

      expect(token).toBeUndefined();
    });

    it('returns undefined when no token is stored', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const token = await auth.getAccessToken();
      expect(token).toBeUndefined();
    });
  });

  describe('default config store', () => {
    it('uses default no-op store when none is provided', async () => {
      const auth = createAuthManager({ configDir: '/tmp/test' });

      const credentials = await auth.loadCredentials();
      expect(credentials).toEqual({});

      // setApiKey writes then reads — default store read always returns null
      await auth.setApiKey('key');
      const key = await auth.getApiKey();
      expect(key).toBeUndefined();

      // clearCredentials calls remove — should not throw
      await auth.clearCredentials();
    });
  });

  describe('device code flow', () => {
    it('initiates device code flow with correct parameters', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const mockClient = {
        request: mock().mockResolvedValue({
          ok: true,
          data: {
            data: {
              device_code: 'device-123',
              user_code: 'ABCD-1234',
              verification_uri: 'https://example.com/verify',
              expires_in: 300,
              interval: 5,
            },
            status: 200,
            headers: new Headers(),
          },
        }),
      };

      const result = await auth.initiateDeviceCodeFlow(
        mockClient as never,
        'https://example.com/device/code',
        'client-id',
        ['read', 'write'],
      );

      expect(result.device_code).toBe('device-123');
      expect(result.user_code).toBe('ABCD-1234');
      expect(result.verification_uri).toBe('https://example.com/verify');
      expect(mockClient.request).toHaveBeenCalledWith('POST', 'https://example.com/device/code', {
        body: {
          client_id: 'client-id',
          scope: 'read write',
        },
      });
    });

    it('initiates device code flow without scopes', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const mockClient = {
        request: mock().mockResolvedValue({
          ok: true,
          data: {
            data: {
              device_code: 'device-123',
              user_code: 'ABCD-1234',
              verification_uri: 'https://example.com/verify',
              expires_in: 300,
              interval: 5,
            } satisfies DeviceCodeResponse,
            status: 200,
            headers: new Headers(),
          },
        }),
      };

      await auth.initiateDeviceCodeFlow(
        mockClient as never,
        'https://example.com/device/code',
        'client-id',
      );

      expect(mockClient.request).toHaveBeenCalledWith('POST', 'https://example.com/device/code', {
        body: { client_id: 'client-id' },
      });
    });

    it('throws when device code flow request fails', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const error = new Error('Request failed');
      const mockClient = {
        request: mock().mockResolvedValue({
          ok: false,
          error,
        }),
      };

      await expect(
        auth.initiateDeviceCodeFlow(
          mockClient as never,
          'https://example.com/device/code',
          'client-id',
        ),
      ).rejects.toThrow('Request failed');
    });
  });

  describe('token refresh', () => {
    it('refreshes access token using stored refresh token', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      // Store initial tokens with a refresh token
      await auth.storeTokens({
        access_token: 'old-access',
        refresh_token: 'refresh-456',
        expires_in: 3600,
        token_type: 'Bearer',
      });

      const mockClient = {
        request: mock().mockResolvedValue({
          ok: true,
          data: {
            data: {
              access_token: 'new-access',
              refresh_token: 'new-refresh',
              expires_in: 3600,
              token_type: 'Bearer',
            },
            status: 200,
            headers: new Headers(),
          },
        }),
      };

      const result = await auth.refreshAccessToken(
        mockClient as never,
        'https://example.com/token',
        'client-id',
      );

      expect(result).not.toBeNull();
      expect(result?.access_token).toBe('new-access');

      // Verify new token is stored
      const token = await auth.getAccessToken();
      expect(token).toBe('new-access');
    });

    it('returns null when no refresh token is stored', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const mockClient = { request: mock() };

      const result = await auth.refreshAccessToken(
        mockClient as never,
        'https://example.com/token',
        'client-id',
      );

      expect(result).toBeNull();
      expect(mockClient.request).not.toHaveBeenCalled();
    });

    it('returns null when refresh request fails', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      await auth.storeTokens({
        access_token: 'access',
        refresh_token: 'refresh-456',
        expires_in: 3600,
        token_type: 'Bearer',
      });

      const mockClient = {
        request: mock().mockResolvedValue({
          ok: false,
          error: new Error('Token expired'),
        }),
      };

      const result = await auth.refreshAccessToken(
        mockClient as never,
        'https://example.com/token',
        'client-id',
      );

      expect(result).toBeNull();
    });
  });

  describe('poll for token', () => {
    it('polls until token is received', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      let callCount = 0;
      const mockClient = {
        request: mock().mockImplementation(async () => {
          callCount++;
          if (callCount < 3) {
            return {
              ok: false,
              error: { body: { error: 'authorization_pending' } },
            };
          }
          return {
            ok: true,
            data: {
              data: {
                access_token: 'polled-token',
                token_type: 'Bearer',
                expires_in: 3600,
              },
              status: 200,
              headers: new Headers(),
            },
          };
        }),
      };

      const result = await auth.pollForToken(
        mockClient as never,
        'https://example.com/token',
        'device-code',
        'client-id',
        0.01, // Very short interval for testing
        10, // 10 second expiry
      );

      expect(result.access_token).toBe('polled-token');
      expect(callCount).toBe(3);
    });

    it('increases interval on slow_down error', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      // Override setTimeout to resolve instantly so slow_down +5s doesn't block
      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as never;

      let callCount = 0;
      const mockClient = {
        request: mock().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              ok: false,
              error: { body: { error: 'slow_down' } },
            };
          }
          return {
            ok: true,
            data: {
              data: {
                access_token: 'token-after-slowdown',
                token_type: 'Bearer',
                expires_in: 3600,
              },
              status: 200,
              headers: new Headers(),
            },
          };
        }),
      };

      try {
        const result = await auth.pollForToken(
          mockClient as never,
          'https://example.com/token',
          'device-code',
          'client-id',
          0.01,
          10,
        );

        expect(result.access_token).toBe('token-after-slowdown');
        expect(callCount).toBe(2);
      } finally {
        globalThis.setTimeout = origSetTimeout;
      }
    });

    it('throws on unknown poll error', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const unknownError = { body: { error: 'access_denied' } };
      const mockClient = {
        request: mock().mockResolvedValue({
          ok: false,
          error: unknownError,
        }),
      };

      await expect(
        auth.pollForToken(
          mockClient as never,
          'https://example.com/token',
          'device-code',
          'client-id',
          0.01,
          10,
        ),
      ).rejects.toBe(unknownError);
    });

    it('returns false from error checks when error has no body', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const errorWithoutBody = { message: 'no body' };
      const mockClient = {
        request: mock().mockResolvedValue({
          ok: false,
          error: errorWithoutBody,
        }),
      };

      await expect(
        auth.pollForToken(
          mockClient as never,
          'https://example.com/token',
          'device-code',
          'client-id',
          0.01,
          10,
        ),
      ).rejects.toBe(errorWithoutBody);
    });

    it('returns false from error checks when body has no error field', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const errorWithBadBody = { body: { status: 500 } };
      const mockClient = {
        request: mock().mockResolvedValue({
          ok: false,
          error: errorWithBadBody,
        }),
      };

      await expect(
        auth.pollForToken(
          mockClient as never,
          'https://example.com/token',
          'device-code',
          'client-id',
          0.01,
          10,
        ),
      ).rejects.toBe(errorWithBadBody);
    });

    it('throws AuthError when device code expires', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const mockClient = {
        request: mock().mockResolvedValue({
          ok: false,
          error: { body: { error: 'authorization_pending' } },
        }),
      };

      await expect(
        auth.pollForToken(
          mockClient as never,
          'https://example.com/token',
          'device-code',
          'client-id',
          0.01,
          0.02, // Very short expiry
        ),
      ).rejects.toThrow(AuthError);
    });
  });

  describe('credentials loading', () => {
    it('loads stored credentials', async () => {
      const storedData = JSON.stringify({
        apiKey: 'test-key',
        accessToken: 'test-token',
      });
      const store = createMockStore({
        '/tmp/test/credentials.json': storedData,
      });
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const credentials = await auth.loadCredentials();
      expect(credentials.apiKey).toBe('test-key');
      expect(credentials.accessToken).toBe('test-token');
    });

    it('returns empty credentials when no file exists', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const credentials = await auth.loadCredentials();
      expect(credentials).toEqual({});
    });
  });
});
