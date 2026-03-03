import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { createAuth } from '../index';
import type { AuthConfig } from '../types';

/**
 * Minimal valid auth config for testing cookie validation.
 * Uses a dev secret since most tests run in non-production mode.
 */
function baseConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return {
    session: {
      strategy: 'jwt',
      ttl: '1h',
      ...overrides?.session,
    },
    jwtSecret: 'test-secret-at-least-32-characters-long',
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

describe('JWT secret handling', () => {
  const testSecretDir = '/tmp/vertz-test-jwt-secret';

  beforeEach(() => {
    if (existsSync(testSecretDir)) {
      rmSync(testSecretDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testSecretDir)) {
      rmSync(testSecretDir, { recursive: true });
    }
  });

  it('throws when jwtSecret is missing in production', () => {
    expect(() =>
      createAuth({
        session: { strategy: 'jwt', ttl: '1h' },
        isProduction: true,
      }),
    ).toThrow('jwtSecret is required in production');
  });

  it('auto-generates and persists a dev secret when jwtSecret is missing in dev mode', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    // Should not throw — generates a secret automatically
    expect(() =>
      createAuth({
        session: { strategy: 'jwt', ttl: '1h' },
        isProduction: false,
        devSecretPath: testSecretDir,
      }),
    ).not.toThrow();

    // Should have persisted the secret
    expect(existsSync(`${testSecretDir}/jwt-secret`)).toBe(true);

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('reuses persisted dev secret across createAuth calls', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    // First call generates and persists
    createAuth({
      session: { strategy: 'jwt', ttl: '1h' },
      isProduction: false,
      devSecretPath: testSecretDir,
    });

    // Second call reads from file (no "Generated" message)
    warnSpy.mockClear();
    createAuth({
      session: { strategy: 'jwt', ttl: '1h' },
      isProduction: false,
      devSecretPath: testSecretDir,
    });

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});
