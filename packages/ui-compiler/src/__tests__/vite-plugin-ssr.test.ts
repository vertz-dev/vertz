import type { Plugin, ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import vertzPlugin from '../vite-plugin';

// ─── Helpers ───────────────────────────────────────────────────

/** Get the virtual module loader for a given ID. */
function callLoad(plugin: Plugin, id: string): string | undefined {
  const load = plugin.load as (id: string) => string | undefined;
  return load?.call(plugin, id);
}

/** Get the resolveId hook result. */
function callResolveId(plugin: Plugin, id: string): string | undefined {
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  return resolveId?.call(plugin, id);
}

describe('vertzPlugin SSR', () => {
  describe('SSR option parsing', () => {
    it('should accept ssr: true', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('vertz');
    });

    it('should accept ssr options object', () => {
      const plugin = vertzPlugin({
        ssr: { entry: '/src/app.ts', mode: 'buffered' },
      }) as Plugin;
      expect(plugin).toBeDefined();
    });
  });

  describe('virtual SSR entry module', () => {
    it('should resolve the virtual SSR entry ID', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const result = callResolveId(plugin, '\0vertz:ssr-entry');
      expect(result).toBe('\0vertz:ssr-entry');
    });

    it('should not resolve unrelated virtual IDs', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const result = callResolveId(plugin, '\0some-other-module');
      expect(result).toBeUndefined();
    });

    it('should generate SSR entry code for the virtual module', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('installDomShim');
      expect(code).toContain('renderToStream');
      expect(code).toContain('streamToString');
      expect(code).toContain('toVNode');
      expect(code).toContain('renderToString');
      expect(code).toContain('getInjectedCSS');
    });

    it('should include collectCSS helper using getInjectedCSS', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('collectCSS');
      expect(code).toContain('getInjectedCSS');
      expect(code).toContain('data-vertz-css');
    });

    it('should return { html, css } from renderToString', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('return { html, css }');
    });

    it('should import removeDomShim from dom-shim', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('removeDomShim');
    });

    it('should import compileTheme from @vertz/ui for theme CSS injection', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('compileTheme');
    });

    it('should compile and inject theme CSS when user module exports theme', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      // Should check for theme export and compile it
      expect(code).toContain('userModule.theme');
      expect(code).toContain('compileTheme');
    });

    it('should include collectCSS helper using getInjectedCSS', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('collectCSS');
      expect(code).toContain('getInjectedCSS');
      expect(code).toContain('data-vertz-css');
    });

    it('should return { html, css } from renderToString', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('return { html, css }');
    });

    it('should import compileTheme from @vertz/ui for theme CSS injection', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('compileTheme');
    });

    it('should compile and inject theme CSS when user module exports theme', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();
      expect(code).toContain('userModule.theme');
      expect(code).toContain('compileTheme');
    });

    it('should use the configured entry in the generated code', () => {
      const plugin = vertzPlugin({ ssr: { entry: '/src/my-app.ts' } }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain('/src/my-app.ts');
    });

    it('should use default entry /src/index.ts when not specified', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain('/src/index.ts');
    });
  });

  describe('configureServer hook', () => {
    it('should not configure server when SSR is disabled', () => {
      const plugin = vertzPlugin() as Plugin;
      // configureServer should be undefined or return nothing
      const configureServer = plugin.configureServer as Function | undefined;
      if (configureServer) {
        const result = configureServer.call(plugin, {} as ViteDevServer);
        expect(result).toBeUndefined();
      }
    });

    it('should register middleware directly when SSR is enabled (pre-hook)', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const configureServer = plugin.configureServer as Function;
      expect(configureServer).toBeDefined();

      // configureServer should register middleware directly via server.middlewares.use()
      // and NOT return a post-hook function, to avoid Vite's SPA fallback rewriting URLs
      const useFn = vi.fn();
      const mockServer = {
        middlewares: { use: useFn },
        config: { root: '/tmp' },
      } as unknown as ViteDevServer;
      const result = configureServer.call(plugin, mockServer);
      expect(useFn).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should invalidate user entry module graph on each SSR request', async () => {
      const plugin = vertzPlugin({ ssr: { entry: '/src/index.ts' } }) as Plugin;
      const configureServer = plugin.configureServer as Function;

      // Track which modules get invalidated
      const invalidatedModules: string[] = [];

      // Create mock module nodes forming a dependency graph:
      //   SSR entry → user entry (/src/index.ts) → router.ts
      const routerMod = {
        id: '/src/router.ts',
        ssrImportedModules: new Set(),
      };
      const userEntryMod = {
        id: '/src/index.ts',
        ssrImportedModules: new Set([routerMod]),
      };
      const ssrEntryMod = {
        id: '\0vertz:ssr-entry',
        ssrImportedModules: new Set([userEntryMod]),
      };

      const invalidateModule = vi.fn((mod: { id: string }) => {
        invalidatedModules.push(mod.id);
      });

      const mockServer = {
        middlewares: { use: vi.fn() },
        config: { root: '/tmp' },
        moduleGraph: {
          getModuleById: vi.fn((id: string) => {
            if (id === '\0vertz:ssr-entry') return ssrEntryMod;
            return undefined;
          }),
          invalidateModule,
        },
        transformIndexHtml: vi.fn((_url: string, html: string) => html),
        ssrLoadModule: vi.fn(() => ({
          renderToString: () => '<div>SSR</div>',
        })),
        ssrFixStacktrace: vi.fn(),
      } as unknown as ViteDevServer;

      // Register the middleware
      configureServer.call(plugin, mockServer);
      const middleware = (mockServer.middlewares.use as ReturnType<typeof vi.fn>).mock.calls[0][0];

      // Write a temporary index.html for the test
      const tmpDir = '/tmp/vertz-test-' + Date.now();
      const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(
        `${tmpDir}/index.html`,
        '<!DOCTYPE html><html><body><div id="app"><!--ssr-outlet--></div><script type="module" src="/src/index.ts"></script></body></html>',
      );

      // Update mock server to use the temp dir
      (mockServer.config as { root: string }).root = tmpDir;

      const req = {
        url: '/tasks/new',
        headers: { accept: 'text/html' },
      };
      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      // Should have walked the SSR entry's import tree and invalidated everything
      expect(invalidatedModules).toContain('\0vertz:ssr-entry');
      expect(invalidatedModules).toContain('/src/index.ts');
      expect(invalidatedModules).toContain('/src/router.ts');

      // Clean up
      rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('two-pass rendering in generated SSR entry', () => {
    it('should use ssrStorage.run for two-pass rendering', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain('ssrStorage.run');
    });

    it('should call createApp twice (discovery + render)', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      const matches = code?.match(/createApp\(\)/g);
      expect(matches).toHaveLength(2);
    });

    it('should await SSR queries between passes', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain('getSSRQueries');
      expect(code).toContain('Promise.allSettled');
    });

    it('should use configured ssrTimeout', () => {
      const plugin = vertzPlugin({ ssr: { ssrTimeout: 500 } }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain('setGlobalSSRTimeout(500)');
    });

    it('should default ssrTimeout to 300', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain('setGlobalSSRTimeout(300)');
    });

    it('should clean up in finally block', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain('finally');
      expect(code).toContain('clearGlobalSSRTimeout');
      expect(code).toContain('removeDomShim');
    });

    it('should import ssrStorage, getSSRQueries, and timeout helpers from @vertz/ui-server', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain("from '@vertz/ui-server'");
      expect(code).toMatch(/import\s+\{[^}]*ssrStorage[^}]*\}/);
      expect(code).toMatch(/import\s+\{[^}]*getSSRQueries[^}]*\}/);
      expect(code).toMatch(/import\s+\{[^}]*setGlobalSSRTimeout[^}]*\}/);
      expect(code).toMatch(/import\s+\{[^}]*clearGlobalSSRTimeout[^}]*\}/);
    });

    it('should clear queries list between passes', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const code = callLoad(plugin, '\0vertz:ssr-entry');
      expect(code).toContain('store.queries = []');
    });
  });

  describe('SSROptions.ssrTimeout', () => {
    it('should accept ssrTimeout in ssr options', () => {
      const plugin = vertzPlugin({
        ssr: { entry: '/src/app.ts', ssrTimeout: 500 },
      }) as Plugin;
      expect(plugin).toBeDefined();
    });
  });

  describe('JSX runtime alias', () => {
    it('should return JSX aliases for SSR builds', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const config = plugin.config as Function;
      const result = config.call(
        plugin,
        {},
        { isSsrBuild: true, command: 'build', mode: 'production' },
      );

      expect(result).toBeDefined();
      expect(result?.resolve?.alias).toEqual({
        '@vertz/ui/jsx-runtime': '@vertz/ui-server/jsx-runtime',
        '@vertz/ui/jsx-dev-runtime': '@vertz/ui-server/jsx-runtime',
      });
    });

    it('should not return aliases for non-SSR builds', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const config = plugin.config as Function;
      const result = config.call(
        plugin,
        {},
        { isSsrBuild: false, command: 'serve', mode: 'development' },
      );

      expect(result).toBeUndefined();
    });

    it('should not return aliases when SSR is not enabled', () => {
      const plugin = vertzPlugin() as Plugin;
      const config = plugin.config as Function;
      const result = config.call(
        plugin,
        {},
        { isSsrBuild: true, command: 'build', mode: 'production' },
      );

      expect(result).toBeUndefined();
    });
  });
});
