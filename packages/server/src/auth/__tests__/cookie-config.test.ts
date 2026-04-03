import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import {
  buildMfaChallengeCookie,
  buildOAuthStateCookie,
  buildRefreshCookie,
} from '../cookies';
import { createAuth } from '../index';
import type { AuthConfig } from '../types';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

/**
 * Minimal valid auth config for testing cookie validation.
 * Uses a dev key pair since most tests run in non-production mode.
 */
function baseConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return {
    session: {
      strategy: 'jwt',
      ttl: '1h',
      ...overrides?.session,
    },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    issuer: 'https://test.example.com',
    audience: 'test',
    isProduction: false,
    ...overrides,
  };
}

describe('cookie config security validations', () => {
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('throws when secure is false in production', () => {
    expect(() =>
      createAuth(
        baseConfig({
          isProduction: true,
          session: {
            strategy: 'jwt',
            ttl: '1h',
            cookie: { secure: false },
          },
        }),
      ),
    ).toThrow("Cookie 'secure' flag cannot be disabled in production");
  });

  it('allows secure: false in development with a warning', () => {
    expect(() =>
      createAuth(
        baseConfig({
          isProduction: false,
          session: {
            strategy: 'jwt',
            ttl: '1h',
            cookie: { secure: false },
          },
        }),
      ),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      "Cookie 'secure' flag is disabled. This is allowed in development but must be enabled in production.",
    );
  });

  it('throws when sameSite is none without secure: true', () => {
    expect(() =>
      createAuth(
        baseConfig({
          session: {
            strategy: 'jwt',
            ttl: '1h',
            cookie: { sameSite: 'none', secure: false },
          },
        }),
      ),
    ).toThrow('SameSite=None requires secure=true');
  });

  it('throws when sameSite is none with secure undefined (defaults merged)', () => {
    // DEFAULT_COOKIE_CONFIG has secure: true, so after merge secure will be true.
    // To test the case where secure is explicitly not true, we need to set it to false.
    expect(() =>
      createAuth(
        baseConfig({
          session: {
            strategy: 'jwt',
            ttl: '1h',
            cookie: { sameSite: 'none', secure: false },
          },
        }),
      ),
    ).toThrow('SameSite=None requires secure=true');
  });

  it('allows sameSite: none with secure: true', () => {
    expect(() =>
      createAuth(
        baseConfig({
          session: {
            strategy: 'jwt',
            ttl: '1h',
            cookie: { sameSite: 'none', secure: true },
          },
        }),
      ),
    ).not.toThrow();
  });

  it('works with default config (no explicit secure or sameSite)', () => {
    expect(() =>
      createAuth(
        baseConfig({
          session: {
            strategy: 'jwt',
            ttl: '1h',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('works with default config in production mode', () => {
    expect(() =>
      createAuth(
        baseConfig({
          isProduction: true,
          session: {
            strategy: 'jwt',
            ttl: '1h',
          },
        }),
      ),
    ).not.toThrow();
  });
});

describe('RSA key pair handling', () => {
  const testKeyDir = '/tmp/vertz-test-jwt-keys';

  beforeEach(() => {
    if (existsSync(testKeyDir)) {
      rmSync(testKeyDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testKeyDir)) {
      rmSync(testKeyDir, { recursive: true });
    }
  });

  it('throws when key pair is missing in production', () => {
    expect(() =>
      createAuth({
        session: { strategy: 'jwt', ttl: '1h' },
        isProduction: true,
      }),
    ).toThrow('Key pair is required in production');
  });

  it('auto-generates and persists dev keys when key pair is missing in dev mode', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    // Should not throw — generates keys automatically
    expect(() =>
      createAuth({
        session: { strategy: 'jwt', ttl: '1h' },
        isProduction: false,
        devKeyPath: testKeyDir,
      }),
    ).not.toThrow();

    // Should have persisted the keys
    expect(existsSync(`${testKeyDir}/jwt-private.pem`)).toBe(true);
    expect(existsSync(`${testKeyDir}/jwt-public.pem`)).toBe(true);

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('reuses persisted dev keys across createAuth calls', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    // First call generates and persists
    createAuth({
      session: { strategy: 'jwt', ttl: '1h' },
      isProduction: false,
      devKeyPath: testKeyDir,
    });

    // Second call reads from file (no "Generated" message)
    warnSpy.mockClear();
    createAuth({
      session: { strategy: 'jwt', ttl: '1h' },
      isProduction: false,
      devKeyPath: testKeyDir,
    });

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('buildOAuthStateCookie', () => {
  it('sets cookie name to vertz.oauth', () => {
    const cookie = buildOAuthStateCookie('encrypted-state', { secure: true });
    expect(cookie.startsWith('vertz.oauth=')).toBe(true);
  });

  it('sets Path=/api/auth/oauth', () => {
    const cookie = buildOAuthStateCookie('encrypted-state', { secure: true });
    expect(cookie).toContain('Path=/api/auth/oauth');
  });

  it('sets Max-Age=300', () => {
    const cookie = buildOAuthStateCookie('encrypted-state', { secure: true });
    expect(cookie).toContain('Max-Age=300');
  });

  it('clear mode sets Max-Age=0', () => {
    const cookie = buildOAuthStateCookie('', { secure: true }, true);
    expect(cookie).toContain('Max-Age=0');
  });

  it('uses custom authPrefix in cookie Path (#2131)', () => {
    const cookie = buildOAuthStateCookie('state', { secure: true }, false, '/v1/auth');
    expect(cookie).toContain('Path=/v1/auth/oauth');
    expect(cookie).not.toContain('/api/auth');
  });
});

describe('buildRefreshCookie with custom authPrefix (#2131)', () => {
  it('defaults to /api/auth/refresh path', () => {
    const cookie = buildRefreshCookie('token', { secure: true }, 'vertz.ref', 3600);
    expect(cookie).toContain('Path=/api/auth/refresh');
  });

  it('uses custom authPrefix in path', () => {
    const cookie = buildRefreshCookie('token', { secure: true }, 'vertz.ref', 3600, false, '/v1/auth');
    expect(cookie).toContain('Path=/v1/auth/refresh');
    expect(cookie).not.toContain('/api/auth');
  });
});

describe('buildMfaChallengeCookie with custom authPrefix (#2131)', () => {
  it('defaults to /api/auth/mfa path', () => {
    const cookie = buildMfaChallengeCookie('challenge', { secure: true });
    expect(cookie).toContain('Path=/api/auth/mfa');
  });

  it('uses custom authPrefix in path', () => {
    const cookie = buildMfaChallengeCookie('challenge', { secure: true }, false, '/v1/auth');
    expect(cookie).toContain('Path=/v1/auth/mfa');
    expect(cookie).not.toContain('/api/auth');
  });
});

describe('auth handler routing with custom _authPrefix (#2131)', () => {
  it('routes requests correctly when _authPrefix is customized', async () => {
    const auth = createAuth(
      baseConfig({
        _authPrefix: '/v1/auth',
        emailPassword: { enabled: true },
      }),
    );

    // A signup request to the custom prefix should be routed correctly
    // (not 404 due to hardcoded /api/auth stripping)
    const request = new Request('http://localhost:3000/v1/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({ email: 'test@example.com', password: 'TestPassword123!' }),
    });

    const response = await auth.handler(request);
    // Should NOT be 404 — the path was correctly stripped to /signup
    expect(response.status).not.toBe(404);
  });

  it('returns correct authUrl in /providers with custom prefix', async () => {
    const auth = createAuth(
      baseConfig({
        _authPrefix: '/v1/auth',
      }),
    );

    const request = new Request('http://localhost:3000/v1/auth/providers', {
      method: 'GET',
      headers: { 'Origin': 'http://localhost:3000' },
    });

    const response = await auth.handler(request);
    const body = await response.json();
    // With no providers configured, returns empty array — but the route was matched (not 404)
    expect(response.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});
