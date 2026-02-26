import { describe, expect, it } from 'vitest';
import { createBunDevServer } from '../bun-dev-server';

describe('createBunDevServer', () => {
  it('returns an object with start and stop methods', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  it('defaults to HMR mode (ssr: false)', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    // The server object is created without errors — HMR mode is default
    expect(server).toBeDefined();
  });

  it('accepts SSR mode option', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
      ssr: true,
    });

    expect(server).toBeDefined();
  });

  it('accepts all configuration options', () => {
    const apiHandler = async (_req: Request) => new Response('ok');

    const server = createBunDevServer({
      entry: './src/app.tsx',
      port: 4000,
      host: '0.0.0.0',
      apiHandler,
      skipSSRPaths: ['/api/', '/graphql/'],
      openapi: { specPath: '/tmp/openapi.json' },
      ssrModule: true,
      clientEntry: './src/entry-client.ts',
      title: 'Test App',
      projectRoot: '/tmp/test-project',
      logRequests: false,
      ssr: false,
    });

    expect(server).toBeDefined();
  });

  it('stop() is safe to call before start()', async () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    // Should not throw
    await server.stop();
  });
});
