import { afterEach, describe, expect, it } from 'bun:test';
import { createEnv } from '../env-validator';

/**
 * Minimal mock schema that satisfies the Schema<T> interface
 * used by createEnv (only `safeParse` is called at runtime).
 */
function mockSchema<T>(
  validate: (input: unknown) => { ok: true; data: T } | { ok: false; error: { message: string } },
) {
  return { safeParse: validate } as import('../../types/env').EnvConfig<T>['schema'];
}

describe('createEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('validates env against schema and returns typed result', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://localhost/db';

    const env = createEnv({
      schema: mockSchema<{ NODE_ENV: string; DATABASE_URL: string }>((input) => {
        const rec = input as Record<string, string | undefined>;
        if (rec.NODE_ENV && rec.DATABASE_URL) {
          return { ok: true, data: { NODE_ENV: rec.NODE_ENV, DATABASE_URL: rec.DATABASE_URL } };
        }
        return { ok: false, error: { message: 'Missing required vars' } };
      }),
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.DATABASE_URL).toBe('postgres://localhost/db');
  });

  it('throws when validation fails', () => {
    delete process.env.REQUIRED_VAR;

    const act = () =>
      createEnv({
        schema: mockSchema<{ REQUIRED_VAR: string }>(() => ({
          ok: false,
          error: { message: 'REQUIRED_VAR is required' },
        })),
      });

    expect(act).toThrow('Environment validation failed');
    expect(act).toThrow('REQUIRED_VAR');
  });

  it('returns a frozen object', () => {
    process.env.APP_NAME = 'vertz';

    const env = createEnv({
      schema: mockSchema<{ APP_NAME: string }>((input) => {
        const rec = input as Record<string, string | undefined>;
        return { ok: true, data: { APP_NAME: rec.APP_NAME ?? '' } };
      }),
    });

    expect(Object.isFrozen(env)).toBe(true);
  });

  it('uses explicit env record when provided', () => {
    const env = createEnv({
      schema: mockSchema<{ MY_VAR: string }>((input) => {
        const rec = input as Record<string, string | undefined>;
        return { ok: true, data: { MY_VAR: rec.MY_VAR ?? '' } };
      }),
      env: { MY_VAR: 'hello' },
    });

    expect(env.MY_VAR).toBe('hello');
  });

  it('explicit env takes precedence over process.env', () => {
    process.env.FOO = 'from-process';

    const env = createEnv({
      schema: mockSchema<{ FOO: string }>((input) => {
        const rec = input as Record<string, string | undefined>;
        return { ok: true, data: { FOO: rec.FOO ?? '' } };
      }),
      env: { FOO: 'from-config' },
    });

    expect(env.FOO).toBe('from-config');
  });

  it('deep-freezes nested objects in the result', () => {
    const env = createEnv({
      schema: mockSchema<{ DB: { HOST: string; PORT: string } }>(() => ({
        ok: true,
        data: { DB: { HOST: 'localhost', PORT: '5432' } },
      })),
      env: {},
    });

    expect(Object.isFrozen(env.DB)).toBe(true);
  });

  it('falls back to process.env when no explicit env is provided', () => {
    process.env.TOKEN = 'abc123';

    const env = createEnv({
      schema: mockSchema<{ TOKEN: string }>((input) => {
        const rec = input as Record<string, string | undefined>;
        return { ok: true, data: { TOKEN: rec.TOKEN ?? '' } };
      }),
    });

    expect(env.TOKEN).toBe('abc123');
  });
});
