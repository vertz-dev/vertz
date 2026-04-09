import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/** Mock schema that returns the value of a single key as-is. */
function singleKeySchema<K extends string>(key: K) {
  return mockSchema<Record<K, string>>((input) => {
    const rec = input as Record<string, string | undefined>;
    const val = rec[key];
    if (val !== undefined) {
      return { ok: true, data: { [key]: val } as Record<K, string> };
    }
    return { ok: false, error: { message: `${key} is required` } };
  });
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

  describe('with load property', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'vertz-env-validator-'));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('file values override process.env values', () => {
      process.env.PORT = '3000';
      const envFile = join(tempDir, '.env');
      writeFileSync(envFile, 'PORT=4000');

      const env = createEnv({
        load: [envFile],
        schema: singleKeySchema('PORT'),
      });

      expect(env.PORT).toBe('4000');
    });

    it('later files override earlier files', () => {
      const env1 = join(tempDir, '.env');
      const env2 = join(tempDir, '.env.local');
      writeFileSync(env1, 'PORT=3000');
      writeFileSync(env2, 'PORT=5000');

      const env = createEnv({
        load: [env1, env2],
        schema: singleKeySchema('PORT'),
      });

      expect(env.PORT).toBe('5000');
    });

    it('explicit env overrides file values', () => {
      const envFile = join(tempDir, '.env');
      writeFileSync(envFile, 'PORT=4000');

      const env = createEnv({
        load: [envFile],
        schema: singleKeySchema('PORT'),
        env: { PORT: '9000' },
      });

      expect(env.PORT).toBe('9000');
    });

    it('file-only keys are available in the result', () => {
      delete process.env.SECRET_KEY;
      const envFile = join(tempDir, '.env');
      writeFileSync(envFile, 'SECRET_KEY=my-secret');

      const env = createEnv({
        load: [envFile],
        schema: singleKeySchema('SECRET_KEY'),
      });

      expect(env.SECRET_KEY).toBe('my-secret');
    });

    it('missing load files do not throw', () => {
      process.env.FOO = 'bar';
      const missing = join(tempDir, '.env.local');

      const env = createEnv({
        load: [missing],
        schema: singleKeySchema('FOO'),
      });

      expect(env.FOO).toBe('bar');
    });

    it('omitted load behaves identically to current behavior', () => {
      process.env.APP = 'vertz';

      const env = createEnv({
        schema: singleKeySchema('APP'),
      });

      expect(env.APP).toBe('vertz');
    });
  });
});
