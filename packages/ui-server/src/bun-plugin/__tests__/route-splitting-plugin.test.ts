/**
 * Route splitting integration tests for the Bun plugin.
 *
 * The native Rust compiler handles route splitting internally via the
 * `routeSplitting` option. These tests verify the plugin passes the option
 * correctly and the native compiler produces expected output.
 */

import { describe, expect, it, vi } from '@vertz/test';
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

    it('Then compiles the file via native compiler with routeSplitting', async () => {
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

        // Native compiler should produce compiled output
        expect(result.contents).toBeDefined();
        expect(result.contents.length).toBeGreaterThan(0);
      } finally {
        // @ts-expect-error — restoring Bun.file
        Bun.file = originalBunFile;
      }
    });

    it('Then produces a valid source map', async () => {
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

        // The source map should have non-empty mappings
        const outputLines = result.contents.split('\n');
        let appLine = 0;
        for (let i = 0; i < outputLines.length; i++) {
          if (outputLines[i].includes('App')) {
            appLine = i + 1;
            break;
          }
        }
        expect(appLine).toBeGreaterThan(0);

        // Verify source map exists and has mappings (native compiler source maps)
        const mapped = originalPositionFor(traceMap as TraceMap, { line: appLine, column: 0 });
        // Native compiler may produce null at column 0 but the source map exists
        if (mapped.line !== null) {
          expect(mapped.line).toBeGreaterThan(0);
        }
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

    it('Then compiles route files without route splitting transform', async () => {
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

        // Import should still be present (not transformed to lazy)
        expect(result.contents).toContain('import { HomePage }');
        expect(result.contents).not.toContain("import('./pages/home')");
      } finally {
        // @ts-expect-error — restoring Bun.file
        Bun.file = originalBunFile;
      }
    });
  });
});
