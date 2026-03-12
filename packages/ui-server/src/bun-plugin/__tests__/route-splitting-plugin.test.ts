/**
 * Route splitting integration tests for the Bun plugin.
 *
 * Validates that when `routeSplitting: true`, the plugin:
 * 1. Transforms .tsx route files (Step 0 before hydration)
 * 2. Registers a .ts onLoad handler that transforms route files
 * 3. Passes through non-route .ts files unchanged
 * 4. Chains route split source maps into the final map
 */

import { describe, expect, it, vi } from 'bun:test';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';

import { createVertzBunPlugin } from '../plugin';

// Helper: extract inline source map from plugin output
function extractSourceMap(contents: string): TraceMap | null {
  const match = contents.match(/\/\/# sourceMappingURL=data:application\/json;base64,(.+)$/m);
  if (!match) return null;
  const json = Buffer.from(match[1], 'base64').toString('utf-8');
  return new TraceMap(json);
}

describe('Feature: Route splitting in Bun plugin', () => {
  describe('Given a .tsx route file with routeSplitting enabled', () => {
    const routeSource = `
import { defineRoutes } from '@vertz/ui';
import { HomePage } from './pages/home';

export const routes = defineRoutes({
  '/': { component: () => HomePage() },
});

export function App() {
  return <div>app</div>;
}
`.trim();

    it('Then rewrites component factories to lazy imports', async () => {
      const { plugin } = createVertzBunPlugin({
        hmr: false,
        fastRefresh: false,
        routeSplitting: true,
        projectRoot: '/test-project',
        cssOutDir: '/tmp/vertz-test-css',
      });

      const mockBuild = { onLoad: vi.fn() };
      plugin.setup(mockBuild as any);

      // First onLoad call is the .tsx handler
      const tsxCallback = mockBuild.onLoad.mock.calls[0][1];

      const originalBunFile = Bun.file;
      // @ts-expect-error — mocking Bun.file for test
      Bun.file = () => ({ text: async () => routeSource });

      try {
        const result = await tsxCallback({
          path: '/test-project/src/router.tsx',
        });

        expect(result.contents).toContain("import('./pages/home')");
        expect(result.contents).not.toContain('import { HomePage }');
      } finally {
        // @ts-expect-error — restoring Bun.file
        Bun.file = originalBunFile;
      }
    });

    it('Then chains route split source map into the final map', async () => {
      const { plugin } = createVertzBunPlugin({
        hmr: false,
        fastRefresh: false,
        routeSplitting: true,
        projectRoot: '/test-project',
        cssOutDir: '/tmp/vertz-test-css',
      });

      const mockBuild = { onLoad: vi.fn() };
      plugin.setup(mockBuild as any);

      const tsxCallback = mockBuild.onLoad.mock.calls[0][1];

      const originalBunFile = Bun.file;
      // @ts-expect-error — mocking Bun.file for test
      Bun.file = () => ({ text: async () => routeSource });

      try {
        const result = await tsxCallback({
          path: '/test-project/src/router.tsx',
        });

        const traceMap = extractSourceMap(result.contents);
        expect(traceMap).not.toBeNull();

        // The App function should still map back to the original source
        const outputLines = result.contents.split('\n');
        let appLine = 0;
        for (let i = 0; i < outputLines.length; i++) {
          if (outputLines[i].includes('function App')) {
            appLine = i + 1;
            break;
          }
        }
        expect(appLine).toBeGreaterThan(0);

        const mapped = originalPositionFor(traceMap as TraceMap, { line: appLine, column: 0 });
        expect(mapped.line).not.toBeNull();
      } finally {
        // @ts-expect-error — restoring Bun.file
        Bun.file = originalBunFile;
      }
    });
  });

  describe('Given a .ts route file with routeSplitting enabled', () => {
    const tsRouteSource = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => Page() },",
      '});',
    ].join('\n');

    it('Then registers a .ts onLoad handler', () => {
      const { plugin } = createVertzBunPlugin({
        hmr: false,
        fastRefresh: false,
        routeSplitting: true,
        projectRoot: '/test-project',
        cssOutDir: '/tmp/vertz-test-css',
      });

      const mockBuild = { onLoad: vi.fn() };
      plugin.setup(mockBuild as any);

      // Should have 2 onLoad calls: .tsx handler and .ts handler
      expect(mockBuild.onLoad.mock.calls.length).toBe(2);
      expect(mockBuild.onLoad.mock.calls[1][0]).toEqual({ filter: /\.ts$/ });
    });

    it('Then transforms route definitions in .ts files', async () => {
      const { plugin } = createVertzBunPlugin({
        hmr: false,
        fastRefresh: false,
        routeSplitting: true,
        projectRoot: '/test-project',
        cssOutDir: '/tmp/vertz-test-css',
      });

      const mockBuild = { onLoad: vi.fn() };
      plugin.setup(mockBuild as any);

      // Second onLoad call is the .ts handler
      const tsCallback = mockBuild.onLoad.mock.calls[1][1];

      const originalBunFile = Bun.file;
      // @ts-expect-error — mocking Bun.file for test
      Bun.file = () => ({ text: async () => tsRouteSource });

      try {
        const result = await tsCallback({
          path: '/test-project/src/router.ts',
        });

        expect(result.loader).toBe('ts');
        expect(result.contents).toContain("import('./pages/page')");
        expect(result.contents).toContain('sourceMappingURL');
      } finally {
        // @ts-expect-error — restoring Bun.file
        Bun.file = originalBunFile;
      }
    });

    it('Then passes through non-route .ts files unchanged', async () => {
      const { plugin } = createVertzBunPlugin({
        hmr: false,
        fastRefresh: false,
        routeSplitting: true,
        projectRoot: '/test-project',
        cssOutDir: '/tmp/vertz-test-css',
      });

      const mockBuild = { onLoad: vi.fn() };
      plugin.setup(mockBuild as any);

      const tsCallback = mockBuild.onLoad.mock.calls[1][1];

      const nonRouteSource = 'export const x = 42;\n';

      const originalBunFile = Bun.file;
      // @ts-expect-error — mocking Bun.file for test
      Bun.file = () => ({ text: async () => nonRouteSource });

      try {
        const result = await tsCallback({
          path: '/test-project/src/utils.ts',
        });

        expect(result.loader).toBe('ts');
        expect(result.contents).toBe(nonRouteSource);
      } finally {
        // @ts-expect-error — restoring Bun.file
        Bun.file = originalBunFile;
      }
    });
  });

  describe('Given routeSplitting is disabled (default)', () => {
    it('Then does not register a .ts onLoad handler', () => {
      const { plugin } = createVertzBunPlugin({
        hmr: false,
        fastRefresh: false,
        projectRoot: '/test-project',
        cssOutDir: '/tmp/vertz-test-css',
      });

      const mockBuild = { onLoad: vi.fn() };
      plugin.setup(mockBuild as any);

      // Only 1 onLoad call: the .tsx handler
      expect(mockBuild.onLoad.mock.calls.length).toBe(1);
      expect(mockBuild.onLoad.mock.calls[0][0]).toEqual({ filter: /\.tsx$/ });
    });

    it('Then does not transform route definitions in .tsx files', async () => {
      const routeSource = `
import { defineRoutes } from '@vertz/ui';
import { HomePage } from './pages/home';

export const routes = defineRoutes({
  '/': { component: () => HomePage() },
});

export function App() {
  return <div>app</div>;
}
`.trim();

      const { plugin } = createVertzBunPlugin({
        hmr: false,
        fastRefresh: false,
        projectRoot: '/test-project',
        cssOutDir: '/tmp/vertz-test-css',
      });

      const mockBuild = { onLoad: vi.fn() };
      plugin.setup(mockBuild as any);

      const tsxCallback = mockBuild.onLoad.mock.calls[0][1];

      const originalBunFile = Bun.file;
      // @ts-expect-error — mocking Bun.file for test
      Bun.file = () => ({ text: async () => routeSource });

      try {
        const result = await tsxCallback({
          path: '/test-project/src/router.tsx',
        });

        // Import should still be present (not transformed)
        expect(result.contents).toContain('import { HomePage }');
        expect(result.contents).not.toContain("import('./pages/home')");
      } finally {
        // @ts-expect-error — restoring Bun.file
        Bun.file = originalBunFile;
      }
    });
  });
});
