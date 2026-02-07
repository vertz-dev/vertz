import { describe, it, expect, afterEach } from 'vitest';
import { s } from '@vertz/schema';
import { createEnv } from '../env-validator';

describe('createEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('validates env against schema and returns typed result', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://localhost/db';

    const env = createEnv({
      schema: s.object({
        NODE_ENV: s.string(),
        DATABASE_URL: s.string(),
      }),
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.DATABASE_URL).toBe('postgres://localhost/db');
  });

  it('applies defaults from schema when env var is missing', () => {
    process.env.HOST = 'localhost';

    const env = createEnv({
      schema: s.object({
        HOST: s.string(),
        PORT: s.string().default('3000'),
      }),
    });

    expect(env.HOST).toBe('localhost');
    expect(env.PORT).toBe('3000');
  });

  it('throws with formatted error listing all invalid/missing vars', () => {
    delete process.env.REQUIRED_VAR;
    delete process.env.ANOTHER_VAR;

    const act = () =>
      createEnv({
        schema: s.object({
          REQUIRED_VAR: s.string(),
          ANOTHER_VAR: s.string(),
        }),
      });

    expect(act).toThrow('Environment validation failed');
    expect(act).toThrow('REQUIRED_VAR');
    expect(act).toThrow('ANOTHER_VAR');
  });

  it('returns a frozen object', () => {
    process.env.APP_NAME = 'vertz';

    const env = createEnv({
      schema: s.object({
        APP_NAME: s.string(),
      }),
    });

    expect(Object.isFrozen(env)).toBe(true);
  });

  it('deep-freezes nested objects in the result', () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';

    const env = createEnv({
      schema: s.object({
        DB: s
          .object({
            HOST: s.string(),
            PORT: s.string(),
          })
          .default({ HOST: 'localhost', PORT: '5432' }),
      }),
    });

    expect(Object.isFrozen(env.DB)).toBe(true);
  });
});
