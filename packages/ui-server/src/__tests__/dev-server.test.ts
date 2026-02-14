import { describe, expect, test } from 'vitest';
import { createDevServer } from '../dev-server';

describe('createDevServer', () => {
  test('returns a DevServer object with listen and close methods', () => {
    const server = createDevServer({
      entry: '/src/entry-server.ts',
      port: 9999,
    });

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
  });

  test('accepts all configuration options', () => {
    const server = createDevServer({
      entry: '/src/entry-server.ts',
      port: 8080,
      host: 'localhost',
      skipModuleInvalidation: true,
      logRequests: false,
      middleware: (_req, _res, next) => next(),
      viteConfig: { root: '/tmp' },
    });

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
  });

  test('uses default port 5173 when not specified', () => {
    const server = createDevServer({
      entry: '/src/entry-server.ts',
    });

    expect(server).toBeDefined();
  });
});
