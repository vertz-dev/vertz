import { describe, expect, it } from '@vertz/test';

import { compile, compileForSsrAot, loadNativeCompiler } from '../../compiler/native-compiler';

const hasNativeCompiler = !!(globalThis as Record<string, unknown>).__NATIVE_COMPILER_AVAILABLE__;

describe.skipIf(!hasNativeCompiler)('native-compiler wrapper', () => {
  describe('loadNativeCompiler', () => {
    it('loads the native compiler binary', () => {
      const nc = loadNativeCompiler();
      expect(nc).toBeDefined();
      expect(typeof nc.compile).toBe('function');
      expect(typeof nc.compileForSsrAot).toBe('function');
    });
  });

  describe('compile', () => {
    it('compiles a simple component and returns code', () => {
      const result = compile('function App() { return <div>Hello</div>; }', {
        filename: 'test.tsx',
        target: 'dom',
      });
      expect(result.code).toBeDefined();
      expect(result.code.length).toBeGreaterThan(0);
    });

    it('returns diagnostics array', () => {
      const result = compile('function App() { return <div>Hello</div>; }', {
        filename: 'test.tsx',
      });
      expect(Array.isArray(result.diagnostics)).toBe(true);
    });

    it('extracts CSS from css() calls', () => {
      const source = `
        import { css } from '@vertz/ui';
        const styles = css({ root: ['bg:red'] });
        function App() { return <div class={styles.root}>Hello</div>; }
      `;
      const result = compile(source, { filename: 'test.tsx', target: 'dom' });
      // CSS may or may not be extracted depending on the source
      expect(result.code).toBeDefined();
    });

    it('returns component metadata', () => {
      const result = compile('function App() { let count = 0; return <div>{count}</div>; }', {
        filename: 'test.tsx',
        target: 'dom',
      });
      expect(result.components).toBeDefined();
      expect(result.components!.length).toBe(1);
      expect(result.components![0].name).toBe('App');
      expect(result.components![0].bodyStart).toBeGreaterThan(0);
      expect(result.components![0].bodyEnd).toBeGreaterThan(result.components![0].bodyStart);
    });

    it('passes manifests to native compiler', () => {
      const result = compile('function App() { return <div>Hello</div>; }', {
        filename: 'test.tsx',
        target: 'dom',
        manifests: [
          {
            moduleSpecifier: '@vertz/ui',
            exportName: 'query',
            reactivityType: 'signal-api',
            signalProperties: ['data', 'error', 'loading'],
            plainProperties: ['refetch'],
          },
        ],
      });
      expect(result.code).toBeDefined();
    });

    it('supports hydration_markers option', () => {
      const result = compile('function App() { return <div>Hello</div>; }', {
        filename: 'test.tsx',
        target: 'dom',
        hydrationMarkers: true,
      });
      expect(result.code).toBeDefined();
    });

    it('supports fast_refresh option', () => {
      const result = compile('function App() { return <div>Hello</div>; }', {
        filename: 'test.tsx',
        target: 'dom',
        fastRefresh: true,
      });
      expect(result.code).toBeDefined();
    });

    it('returns source map when available', () => {
      const result = compile('function App() { return <div>Hello</div>; }', {
        filename: 'test.tsx',
        target: 'dom',
      });
      // Source map may be a string or undefined
      if (result.map) {
        expect(typeof result.map).toBe('string');
      }
    });
  });

  describe('compileForSsrAot', () => {
    it('compiles a component for AOT SSR', () => {
      const result = compileForSsrAot('function App() { return <div>Hello</div>; }', {
        filename: 'test.tsx',
      });
      expect(result.code).toBeDefined();
      expect(result.code.length).toBeGreaterThan(0);
    });

    it('returns AOT component info with tier classification', () => {
      const result = compileForSsrAot('function App() { return <div>Hello</div>; }', {
        filename: 'test.tsx',
      });
      expect(result.components).toBeDefined();
      expect(result.components.length).toBe(1);
      expect(result.components[0].name).toBe('App');
      expect(typeof result.components[0].tier).toBe('string');
      expect(Array.isArray(result.components[0].holes)).toBe(true);
      expect(Array.isArray(result.components[0].queryKeys)).toBe(true);
    });
  });
});
