import { describe, expect, it, vi } from 'vitest';
import type { ConfigStore, TokenResponse } from '../auth';
import { AuthError, createAuthManager } from '../auth';

function createMockStore(data: Record<string, string> = {}): ConfigStore {
  const store = new Map(Object.entries(data));
  return {
    read: vi.fn(async (path: string) => store.get(path) ?? null),
    write: vi.fn(async (path: string, content: string) => {
      store.set(path, content);
    }),
    remove: vi.fn(async (path: string) => {
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

  describe('device code flow', () => {
    it('initiates device code flow with correct parameters', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          data: {
            device_code: 'device-123',
            user_code: 'ABCD-1234',
            verification_uri: 'https://example.com/verify',
            expires_in: 300,
            interval: 5,
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
        request: vi.fn().mockResolvedValue({
          data: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
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

      const mockClient = { request: vi.fn() };

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
        request: vi.fn().mockRejectedValue(new Error('Token expired')),
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
        request: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount < 3) {
            const error = { body: { error: 'authorization_pending' } };
            throw error;
          }
          return {
            data: {
              access_token: 'polled-token',
              token_type: 'Bearer',
              expires_in: 3600,
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

    it('throws AuthError when device code expires', async () => {
      const store = createMockStore();
      const auth = createAuthManager({ configDir: '/tmp/test' }, store);

      const mockClient = {
        request: vi.fn().mockRejectedValue({
          body: { error: 'authorization_pending' },
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
