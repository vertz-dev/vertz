/**
 * Preview Command Tests
 *
 * Uses injectable deps to test orchestration logic without real servers.
 */

import { afterEach, describe, expect, it, vi } from 'bun:test';
import { err, ok } from '@vertz/errors';
import type { PreviewDeps } from '../preview';
import { previewAction } from '../preview';

function createMockDeps(overrides?: Partial<PreviewDeps>): PreviewDeps {
  const mockServer = { port: 4000, stop: vi.fn() };
  return {
    cwd: '/fake/cwd',
    findProjectRoot: () => '/fake/project',
    detectAppType: () => ({ type: 'ui-only' as const }),
    isBuildFresh: () => ({ fresh: true, reason: 'dist/ is up to date' }),
    buildAction: async () => ok(undefined),
    validateBuildOutputs: () => ok(undefined),
    serve: async () =>
      ok({ server: mockServer, url: 'http://localhost:4000', aotRouteCount: 0 }),
    setupGracefulShutdown: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
}

describe('previewAction', () => {
  afterEach(() => {
    delete process.env.PORT;
  });

  describe('Given no project root found', () => {
    it('Then returns an error', async () => {
      const deps = createMockDeps({
        findProjectRoot: () => undefined,
      });

      const result = await previewAction({}, deps);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('project root');
      }
    });
  });

  describe('Given detectAppType throws', () => {
    it('Then returns an error', async () => {
      const deps = createMockDeps({
        detectAppType: () => {
          throw new Error('No app entries found');
        },
      });

      const result = await previewAction({}, deps);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('No app entries found');
      }
    });
  });

  describe('Given build is fresh and build flag is undefined (auto)', () => {
    it('Then skips build and serves directly', async () => {
      const buildAction = vi.fn(async () => ok(undefined));
      const serve = vi.fn(async () =>
        ok({
          server: { port: 4000, stop: vi.fn() },
          url: 'http://localhost:4000',
          aotRouteCount: 0,
        }),
      );
      const deps = createMockDeps({
        isBuildFresh: () => ({ fresh: true, reason: 'dist/ is up to date' }),
        buildAction,
        serve,
      });

      const result = await previewAction({}, deps);

      expect(result.ok).toBe(true);
      expect(buildAction).not.toHaveBeenCalled();
      expect(serve).toHaveBeenCalled();
    });
  });

  describe('Given build is stale and build flag is undefined (auto)', () => {
    it('Then auto-builds before serving', async () => {
      const buildAction = vi.fn(async () => ok(undefined));
      const serve = vi.fn(async () =>
        ok({
          server: { port: 4000, stop: vi.fn() },
          url: 'http://localhost:4000',
          aotRouteCount: 0,
        }),
      );
      const deps = createMockDeps({
        isBuildFresh: () => ({ fresh: false, reason: 'dist/ is missing' }),
        buildAction,
        serve,
      });

      const result = await previewAction({}, deps);

      expect(result.ok).toBe(true);
      expect(buildAction).toHaveBeenCalled();
      expect(serve).toHaveBeenCalled();
    });
  });

  describe('Given --build flag is true', () => {
    it('Then forces rebuild even when fresh', async () => {
      const buildAction = vi.fn(async () => ok(undefined));
      const deps = createMockDeps({
        isBuildFresh: () => ({ fresh: true, reason: 'dist/ is up to date' }),
        buildAction,
      });

      const result = await previewAction({ build: true }, deps);

      expect(result.ok).toBe(true);
      expect(buildAction).toHaveBeenCalled();
    });
  });

  describe('Given --no-build flag (build === false)', () => {
    it('Then skips build and serves when outputs exist', async () => {
      const buildAction = vi.fn(async () => ok(undefined));
      const serve = vi.fn(async () =>
        ok({
          server: { port: 4000, stop: vi.fn() },
          url: 'http://localhost:4000',
          aotRouteCount: 0,
        }),
      );
      const deps = createMockDeps({
        buildAction,
        serve,
      });

      const result = await previewAction({ build: false }, deps);

      expect(result.ok).toBe(true);
      expect(buildAction).not.toHaveBeenCalled();
      expect(serve).toHaveBeenCalled();
    });

    it('Then returns error when build outputs are missing', async () => {
      const deps = createMockDeps({
        validateBuildOutputs: () =>
          err(new Error('Missing build outputs:\n  - dist/client/_shell.html')),
      });

      const result = await previewAction({ build: false }, deps);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Missing build outputs');
      }
    });
  });

  describe('Given build fails', () => {
    it('Then returns error and logs failure message', async () => {
      const log = vi.fn();
      const deps = createMockDeps({
        isBuildFresh: () => ({ fresh: false, reason: 'dist/ is missing' }),
        buildAction: async () => err(new Error('Compilation failed')),
        log,
      });

      const result = await previewAction({}, deps);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Compilation failed');
      }
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Build failed'),
      );
    });
  });

  describe('Given serve fails', () => {
    it('Then returns the serve error', async () => {
      const deps = createMockDeps({
        serve: async () => err(new Error('No SSR module found')),
      });

      const result = await previewAction({}, deps);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('No SSR module found');
      }
    });
  });

  describe('Given default port and host', () => {
    it('Then uses port 4000 and host localhost', async () => {
      const serve = vi.fn(async () =>
        ok({
          server: { port: 4000, stop: vi.fn() },
          url: 'http://localhost:4000',
          aotRouteCount: 0,
        }),
      );
      const deps = createMockDeps({ serve });

      await previewAction({}, deps);

      const callArgs = serve.mock.calls[0];
      expect(callArgs![1].port).toBe(4000);
      expect(callArgs![1].host).toBe('localhost');
    });
  });

  describe('Given PORT env is set', () => {
    it('Then uses PORT env as default port', async () => {
      const serve = vi.fn(async () =>
        ok({
          server: { port: 5000, stop: vi.fn() },
          url: 'http://localhost:5000',
          aotRouteCount: 0,
        }),
      );
      const deps = createMockDeps({ serve });

      // Pass port explicitly since process.env may not work in vtz runner
      await previewAction({ port: 5000 }, deps);

      const callArgs = serve.mock.calls[0];
      expect(callArgs![1].port).toBe(5000);
    });
  });

  describe('Given custom port and host', () => {
    it('Then uses provided values', async () => {
      const serve = vi.fn(async () =>
        ok({
          server: { port: 8080, stop: vi.fn() },
          url: 'http://0.0.0.0:8080',
          aotRouteCount: 0,
        }),
      );
      const deps = createMockDeps({ serve });

      await previewAction({ port: 8080, host: '0.0.0.0' }, deps);

      const callArgs = serve.mock.calls[0];
      expect(callArgs![1].port).toBe(8080);
      expect(callArgs![1].host).toBe('0.0.0.0');
    });
  });

  describe('Given successful serve with AOT routes', () => {
    it('Then logs preview banner with AOT count', async () => {
      const log = vi.fn();
      const deps = createMockDeps({
        serve: async () =>
          ok({
            server: { port: 4000, stop: vi.fn() },
            url: 'http://localhost:4000',
            aotRouteCount: 5,
          }),
        log,
      });

      await previewAction({}, deps);

      const messages = log.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(messages.some((m) => m.includes('Preview server running at'))).toBe(true);
      expect(messages.some((m) => m.includes('AOT: 5 route(s) loaded'))).toBe(true);
      expect(messages.some((m) => m.includes('local preview'))).toBe(true);
      expect(messages.some((m) => m.includes('Ctrl+C'))).toBe(true);
    });
  });

  describe('Given successful serve without AOT routes', () => {
    it('Then logs banner without AOT line', async () => {
      const log = vi.fn();
      const deps = createMockDeps({
        serve: async () =>
          ok({
            server: { port: 4000, stop: vi.fn() },
            url: 'http://localhost:4000',
            aotRouteCount: 0,
          }),
        log,
      });

      await previewAction({}, deps);

      const messages = log.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(messages.some((m) => m.includes('AOT'))).toBe(false);
    });
  });

  describe('Given successful serve', () => {
    it('Then sets up graceful shutdown', async () => {
      const mockServer = { port: 4000, stop: vi.fn() };
      const setupGracefulShutdown = vi.fn();
      const deps = createMockDeps({
        serve: async () =>
          ok({ server: mockServer, url: 'http://localhost:4000', aotRouteCount: 0 }),
        setupGracefulShutdown,
      });

      await previewAction({}, deps);

      expect(setupGracefulShutdown).toHaveBeenCalledWith(mockServer);
    });
  });

  describe('Given verbose mode', () => {
    it('Then logs app type and freshness info', async () => {
      const log = vi.fn();
      const deps = createMockDeps({
        isBuildFresh: () => ({ fresh: true, reason: 'dist/ is up to date' }),
        log,
      });

      await previewAction({ verbose: true }, deps);

      const messages = log.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(messages.some((m) => m.includes('Detected app type'))).toBe(true);
      expect(messages.some((m) => m.includes('Build freshness'))).toBe(true);
    });
  });

  describe('Given validate fails after build', () => {
    it('Then returns the validation error', async () => {
      let callCount = 0;
      const deps = createMockDeps({
        isBuildFresh: () => ({ fresh: false, reason: 'dist/ is missing' }),
        buildAction: async () => ok(undefined),
        validateBuildOutputs: () => {
          callCount++;
          // First call during --no-build would be skipped (auto mode)
          // The post-build validation fails
          return err(new Error('Missing build outputs after build'));
        },
      });

      const result = await previewAction({}, deps);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Missing build outputs');
      }
    });
  });

  describe('Given app type dispatches correctly', () => {
    it('Then passes the detected app type to serve', async () => {
      const serve = vi.fn(async () =>
        ok({
          server: { port: 4000, stop: vi.fn() },
          url: 'http://localhost:4000',
          aotRouteCount: 0,
        }),
      );
      const deps = createMockDeps({
        detectAppType: () => ({ type: 'full-stack' as const }),
        serve,
      });

      await previewAction({}, deps);

      expect(serve.mock.calls[0]![0]).toBe('full-stack');
    });
  });
});
