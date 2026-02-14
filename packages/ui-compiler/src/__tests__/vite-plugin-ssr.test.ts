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

    it('should return a middleware function when SSR is enabled', () => {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const configureServer = plugin.configureServer as Function;
      expect(configureServer).toBeDefined();

      // configureServer returns a function (post-middleware) when SSR is enabled
      const mockServer = {} as ViteDevServer;
      const postMiddleware = configureServer.call(plugin, mockServer);
      expect(typeof postMiddleware).toBe('function');
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
