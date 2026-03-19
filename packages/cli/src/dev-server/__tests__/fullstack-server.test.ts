import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DetectedApp } from '../app-detector';
import {
  formatBanner,
  importServerModule,
  resolveDevMode,
  startDevServer,
} from '../fullstack-server';

describe('resolveDevMode', () => {
  it('returns api-only mode for api-only apps', () => {
    const detected: DetectedApp = {
      type: 'api-only',
      serverEntry: '/project/src/server.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('api-only');
    if (mode.kind === 'api-only') {
      expect(mode.serverEntry).toBe('/project/src/server.ts');
    }
  });

  it('returns full-stack mode with ssrModule: true for app.tsx entry', () => {
    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      uiEntry: '/project/src/app.tsx',
      clientEntry: '/project/src/entry-client.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('full-stack');
    if (mode.kind === 'full-stack') {
      expect(mode.serverEntry).toBe('/project/src/server.ts');
      expect(mode.uiEntry).toBe('/project/src/app.tsx');
      expect(mode.ssrModule).toBe(true);
      expect(mode.clientEntry).toBe('/project/src/entry-client.ts');
    }
  });

  it('returns full-stack mode with ssrModule: false for entry-server.ts', () => {
    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      ssrEntry: '/project/src/entry-server.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('full-stack');
    if (mode.kind === 'full-stack') {
      expect(mode.ssrModule).toBe(false);
      expect(mode.uiEntry).toBe('/project/src/entry-server.ts');
    }
  });

  it('prefers ssrEntry over uiEntry for backward compat', () => {
    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      uiEntry: '/project/src/app.tsx',
      ssrEntry: '/project/src/entry-server.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    if (mode.kind === 'full-stack') {
      expect(mode.uiEntry).toBe('/project/src/entry-server.ts');
      expect(mode.ssrModule).toBe(false);
    }
  });

  it('returns ui-only mode with ssrModule: true for app.tsx', () => {
    const detected: DetectedApp = {
      type: 'ui-only',
      uiEntry: '/project/src/app.tsx',
      clientEntry: '/project/src/entry-client.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('ui-only');
    if (mode.kind === 'ui-only') {
      expect(mode.uiEntry).toBe('/project/src/app.tsx');
      expect(mode.ssrModule).toBe(true);
      expect(mode.clientEntry).toBe('/project/src/entry-client.ts');
    }
  });

  it('returns ui-only mode with ssrModule: false for entry-server.ts', () => {
    const detected: DetectedApp = {
      type: 'ui-only',
      ssrEntry: '/project/src/entry-server.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('ui-only');
    if (mode.kind === 'ui-only') {
      expect(mode.uiEntry).toBe('/project/src/entry-server.ts');
      expect(mode.ssrModule).toBe(false);
    }
  });
});

describe('importServerModule', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vertz-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports a module with a default export that has .handler', async () => {
    const serverPath = join(tmpDir, 'server.ts');
    writeFileSync(
      serverPath,
      `
      const app = { handler: async (req: Request) => new Response('ok') };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.handler).toBeDefined();
    expect(typeof mod.handler).toBe('function');
  });

  it('throws helpful error when module calls .listen() directly (EADDRINUSE)', async () => {
    const serverPath = join(tmpDir, 'server-listen.ts');
    writeFileSync(
      serverPath,
      `
      throw Object.assign(new Error('listen EADDRINUSE: address already in use'), { code: 'EADDRINUSE' });
    `,
    );

    expect(importServerModule(serverPath)).rejects.toThrow('.listen()');
  });

  it('re-throws non-EADDRINUSE import errors', async () => {
    const serverPath = join(tmpDir, 'server-broken.ts');
    writeFileSync(
      serverPath,
      `
      throw new Error('SyntaxError: unexpected token');
    `,
    );

    expect(importServerModule(serverPath)).rejects.toThrow('SyntaxError');
  });

  it('throws when default export has no .handler', async () => {
    const serverPath = join(tmpDir, 'no-handler.ts');
    writeFileSync(
      serverPath,
      `
      export default { notHandler: true };
    `,
    );

    expect(importServerModule(serverPath)).rejects.toThrow('.handler');
  });

  it('throws when module has no default export', async () => {
    const serverPath = join(tmpDir, 'no-default.ts');
    writeFileSync(
      serverPath,
      `
      export const foo = 'bar';
    `,
    );

    expect(importServerModule(serverPath)).rejects.toThrow('default export');
  });

  it('throws when default export is a primitive (e.g. a string)', async () => {
    const serverPath = join(tmpDir, 'string-export.ts');
    writeFileSync(
      serverPath,
      `
      export default 'not-an-object';
    `,
    );

    expect(importServerModule(serverPath)).rejects.toThrow('default export');
  });

  it('extracts sessionResolver when auth.resolveSessionForSSR exists', async () => {
    const serverPath = join(tmpDir, 'server-with-auth.ts');
    writeFileSync(
      serverPath,
      `
      const resolver = async (req: Request) => ({ session: { user: { id: '1', email: 'a@b.c', role: 'user' }, expiresAt: 0 } });
      const app = {
        handler: async (req: Request) => new Response('ok'),
        auth: { resolveSessionForSSR: resolver },
      };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.sessionResolver).toBeDefined();
    expect(typeof mod.sessionResolver).toBe('function');
  });

  it('returns undefined sessionResolver when auth.resolveSessionForSSR is not a function', async () => {
    const serverPath = join(tmpDir, 'server-auth-no-fn.ts');
    writeFileSync(
      serverPath,
      `
      const app = {
        handler: async (req: Request) => new Response('ok'),
        auth: { resolveSessionForSSR: 'not-a-function' },
      };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.sessionResolver).toBeUndefined();
  });

  it('returns undefined sessionResolver when auth is not configured', async () => {
    const serverPath = join(tmpDir, 'server-no-auth.ts');
    writeFileSync(
      serverPath,
      `
      const app = { handler: async (req: Request) => new Response('ok') };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.sessionResolver).toBeUndefined();
  });

  it('extracts requestHandler when present on the server module', async () => {
    const serverPath = join(tmpDir, 'server-with-request-handler.ts');
    writeFileSync(
      serverPath,
      `
      const handler = async (req: Request) => new Response('entity');
      const requestHandler = async (req: Request) => new Response('unified');
      const app = { handler, requestHandler };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.requestHandler).toBeDefined();
    expect(typeof mod.requestHandler).toBe('function');
  });

  it('ignores requestHandler when it is not a function', async () => {
    const serverPath = join(tmpDir, 'server-bad-request-handler.ts');
    writeFileSync(
      serverPath,
      `
      const app = { handler: async (req: Request) => new Response('ok'), requestHandler: 'not-a-function' };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.requestHandler).toBeUndefined();
  });

  it('returns undefined requestHandler when not present', async () => {
    const serverPath = join(tmpDir, 'server-no-request-handler.ts');
    writeFileSync(
      serverPath,
      `
      const app = { handler: async (req: Request) => new Response('ok') };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.requestHandler).toBeUndefined();
  });
});

describe('formatBanner', () => {
  it('includes app type and SSR+HMR mode in banner', () => {
    const banner = formatBanner('full-stack', 3000, 'localhost');

    expect(banner).toContain('full-stack');
    expect(banner).toContain('SSR+HMR');
  });

  it('always shows SSR+HMR (unified mode)', () => {
    const banner = formatBanner('full-stack', 3000, 'localhost');

    expect(banner).toContain('SSR+HMR');
  });

  it('includes local URL', () => {
    const banner = formatBanner('api-only', 4000, 'localhost');

    expect(banner).toContain('http://localhost:4000');
  });

  it('includes API URL for full-stack apps', () => {
    const banner = formatBanner('full-stack', 3000, 'localhost');

    expect(banner).toContain('/api');
  });

  it('includes API URL for api-only apps', () => {
    const banner = formatBanner('api-only', 3000, 'localhost');

    expect(banner).toContain('/api');
  });

  it('does not include API URL for ui-only apps', () => {
    const banner = formatBanner('ui-only', 3000, 'localhost');

    expect(banner).not.toContain('/api');
  });
});

describe('importServerModule — initialize', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vertz-test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts initialize when default export has an initialize function', async () => {
    const serverPath = join(tmpDir, 'server-with-init.ts');
    writeFileSync(
      serverPath,
      `
      let initialized = false;
      const app = {
        handler: async (req: Request) => new Response('ok'),
        initialize: async () => { initialized = true; },
      };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.initialize).toBeDefined();
    expect(typeof mod.initialize).toBe('function');
  });

  it('returns undefined initialize when not present', async () => {
    const serverPath = join(tmpDir, 'server-no-init.ts');
    writeFileSync(
      serverPath,
      `
      const app = { handler: async (req: Request) => new Response('ok') };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.initialize).toBeUndefined();
  });
});

describe('startDevServer', () => {
  let logSpy: Mock<(...args: unknown[]) => unknown>;
  let processOnSpy: Mock<(...args: unknown[]) => unknown>;
  let existsSyncSpy: Mock<(...args: unknown[]) => unknown>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as Mock<
      (...args: unknown[]) => unknown
    >;
    // Track process.on calls to prevent actual signal handlers from being registered
    processOnSpy = vi.spyOn(process, 'on').mockImplementation((() => process) as never) as Mock<
      (...args: unknown[]) => unknown
    >;
  });

  afterEach(() => {
    logSpy.mockRestore();
    processOnSpy.mockRestore();
    existsSyncSpy?.mockRestore();
  });

  it('prints banner and dispatches to api-only server', async () => {
    const pmMod = await import('../process-manager');
    const mockPm = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
      onOutput: vi.fn(),
      onError: vi.fn(),
    };
    const pmSpy = vi.spyOn(pmMod, 'createProcessManager').mockReturnValue(mockPm);

    const detected: DetectedApp = {
      type: 'api-only',
      serverEntry: '/project/src/server.ts',
      projectRoot: '/project',
    };

    // startDevServer returns a promise that only resolves on shutdown signal for api-only
    // We need to trigger the shutdown handler so the promise resolves
    let shutdownFn: (() => Promise<void>) | undefined;
    processOnSpy.mockImplementation(((event: string, handler: () => Promise<void>) => {
      if (event === 'SIGINT' && !shutdownFn) {
        shutdownFn = handler;
      }
      return process;
    }) as never);

    const serverPromise = startDevServer({ detected, port: 4000, host: 'localhost' });

    // Verify banner was printed
    expect(logSpy).toHaveBeenCalled();
    const bannerArg = logSpy.mock.calls[0]?.[0] as string;
    expect(bannerArg).toContain('api-only');

    // Verify process manager was created and started
    expect(pmSpy).toHaveBeenCalled();
    expect(mockPm.start).toHaveBeenCalledWith('/project/src/server.ts', { PORT: '4000' });

    // Verify signal handlers were registered
    expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('SIGHUP', expect.any(Function));

    // Trigger shutdown to resolve the promise
    if (shutdownFn) {
      await shutdownFn();
    }
    await serverPromise;

    pmSpy.mockRestore();
  });

  it('dispatches to Bun dev server for ui-only app', async () => {
    const fsMod = await import('node:fs');
    existsSyncSpy = vi.spyOn(fsMod, 'existsSync').mockReturnValue(false) as Mock<
      (...args: unknown[]) => unknown
    >;

    const mockDevServer = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn(),
      broadcastError: vi.fn(),
      clearError: vi.fn(),
    };

    const uiServerMod = await import('@vertz/ui-server/bun-dev-server');
    const createSpy = vi
      .spyOn(uiServerMod, 'createBunDevServer')
      .mockReturnValue(mockDevServer as never);

    const detected: DetectedApp = {
      type: 'ui-only',
      uiEntry: '/project/src/app.tsx',
      clientEntry: '/project/src/entry-client.ts',
      projectRoot: '/project',
    };

    await startDevServer({ detected, port: 3000, host: 'localhost' });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: './src/app.tsx',
        port: 3000,
        host: 'localhost',
        apiHandler: undefined,
        sessionResolver: undefined,
        ssrModule: true,
        clientEntry: '/src/entry-client.ts',
        projectRoot: '/project',
      }),
    );
    expect(mockDevServer.start).toHaveBeenCalled();

    // Verify signal handlers registered
    expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('SIGHUP', expect.any(Function));

    createSpy.mockRestore();
  });

  it('dispatches to Bun dev server for full-stack app with initialize', async () => {
    const fsMod = await import('node:fs');
    existsSyncSpy = vi.spyOn(fsMod, 'existsSync').mockReturnValue(false) as Mock<
      (...args: unknown[]) => unknown
    >;

    const mockHandler = vi.fn();
    const mockSessionResolver = vi.fn();
    const mockInitialize = vi.fn().mockResolvedValue(undefined);

    const fullstackMod = await import('../fullstack-server');
    const importSpy = vi.spyOn(fullstackMod, 'importServerModule').mockResolvedValue({
      handler: mockHandler as never,
      sessionResolver: mockSessionResolver as never,
      initialize: mockInitialize as never,
    });

    const mockDevServer = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn(),
      broadcastError: vi.fn(),
      clearError: vi.fn(),
    };

    const uiServerMod = await import('@vertz/ui-server/bun-dev-server');
    const createSpy = vi
      .spyOn(uiServerMod, 'createBunDevServer')
      .mockReturnValue(mockDevServer as never);

    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      uiEntry: '/project/src/app.tsx',
      projectRoot: '/project',
    };

    await startDevServer({ detected, port: 3000, host: 'localhost' });

    // Verify importServerModule was called
    expect(importSpy).toHaveBeenCalledWith('/project/src/server.ts');

    // Verify initialize was called
    expect(mockInitialize).toHaveBeenCalled();

    // Verify createBunDevServer was called with api handler and session resolver
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiHandler: mockHandler,
        ssrModule: true,
        projectRoot: '/project',
      }),
    );

    expect(mockDevServer.start).toHaveBeenCalled();

    importSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('dispatches to Bun dev server for full-stack app without initialize', async () => {
    const fsMod = await import('node:fs');
    existsSyncSpy = vi.spyOn(fsMod, 'existsSync').mockReturnValue(false) as Mock<
      (...args: unknown[]) => unknown
    >;

    const mockHandler = vi.fn();

    const fullstackMod = await import('../fullstack-server');
    const importSpy = vi.spyOn(fullstackMod, 'importServerModule').mockResolvedValue({
      handler: mockHandler as never,
      sessionResolver: undefined,
      initialize: undefined,
    });

    const mockDevServer = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn(),
      broadcastError: vi.fn(),
      clearError: vi.fn(),
    };

    const uiServerMod = await import('@vertz/ui-server/bun-dev-server');
    const createSpy = vi
      .spyOn(uiServerMod, 'createBunDevServer')
      .mockReturnValue(mockDevServer as never);

    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      uiEntry: '/project/src/app.tsx',
      projectRoot: '/project',
    };

    await startDevServer({ detected, port: 3000, host: 'localhost' });

    expect(importSpy).toHaveBeenCalledWith('/project/src/server.ts');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiHandler: mockHandler,
        sessionResolver: undefined,
      }),
    );

    importSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('prefers requestHandler over handler for full-stack apps when auth is configured', async () => {
    const fsMod = await import('node:fs');
    existsSyncSpy = vi.spyOn(fsMod, 'existsSync').mockReturnValue(false) as Mock<
      (...args: unknown[]) => unknown
    >;

    const mockHandler = vi.fn();
    const mockRequestHandler = vi.fn();

    const fullstackMod = await import('../fullstack-server');
    const importSpy = vi.spyOn(fullstackMod, 'importServerModule').mockResolvedValue({
      handler: mockHandler as never,
      requestHandler: mockRequestHandler as never,
      sessionResolver: undefined,
      initialize: undefined,
    });

    const mockDevServer = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn(),
      broadcastError: vi.fn(),
      clearError: vi.fn(),
    };

    const uiServerMod = await import('@vertz/ui-server/bun-dev-server');
    const createSpy = vi
      .spyOn(uiServerMod, 'createBunDevServer')
      .mockReturnValue(mockDevServer as never);

    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      uiEntry: '/project/src/app.tsx',
      projectRoot: '/project',
    };

    await startDevServer({ detected, port: 3000, host: 'localhost' });

    // Use direct identity check — bun's objectContaining doesn't distinguish vi.fn() instances
    const passedConfig = createSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(passedConfig.apiHandler).toBe(mockRequestHandler);

    importSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('passes openapi config when openapi.json exists', async () => {
    const fsMod = await import('node:fs');
    existsSyncSpy = vi.spyOn(fsMod, 'existsSync').mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('openapi.json');
    }) as Mock<(...args: unknown[]) => unknown>;

    const fullstackMod = await import('../fullstack-server');
    const importSpy = vi.spyOn(fullstackMod, 'importServerModule').mockResolvedValue({
      handler: vi.fn() as never,
      sessionResolver: undefined,
      initialize: undefined,
    });

    const mockDevServer = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn(),
      broadcastError: vi.fn(),
      clearError: vi.fn(),
    };

    const uiServerMod = await import('@vertz/ui-server/bun-dev-server');
    const createSpy = vi
      .spyOn(uiServerMod, 'createBunDevServer')
      .mockReturnValue(mockDevServer as never);

    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      uiEntry: '/project/src/app.tsx',
      projectRoot: '/project',
    };

    await startDevServer({ detected, port: 3000, host: 'localhost' });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        openapi: { specPath: '/project/.vertz/generated/openapi.json' },
      }),
    );

    importSpy.mockRestore();
    createSpy.mockRestore();
  });
});
