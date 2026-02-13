import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import type { HmrContext, ModuleNode, Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { CSSHMRHandler } from '../css-extraction/hmr';
import vertzPlugin from '../vite-plugin';

// ─── Helpers ───────────────────────────────────────────────────

/** Call the transform hook directly on a plugin. */
function callTransform(
  plugin: Plugin,
  code: string,
  id: string,
): { code: string; map: unknown } | undefined {
  const transform = plugin.transform as (
    code: string,
    id: string,
  ) => { code: string; map: unknown } | undefined;
  return transform.call(plugin, code, id);
}

/** Simulate configResolved to set production/dev mode. */
function setMode(plugin: Plugin, mode: 'development' | 'production'): void {
  const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
  configResolved.call(plugin, {
    command: mode === 'production' ? 'build' : 'serve',
    mode,
  } as ResolvedConfig);
}

/** Call resolveId on a plugin. */
function callResolveId(plugin: Plugin, id: string): string | undefined {
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  return resolveId.call(plugin, id);
}

/** Call load on a plugin. */
function callLoad(plugin: Plugin, id: string): string | undefined {
  const load = plugin.load as (id: string) => string | undefined;
  return load.call(plugin, id);
}

/** Create a minimal mock module node. */
function createMockModuleNode(overrides: Partial<ModuleNode> = {}): ModuleNode {
  return {
    url: '/test.tsx',
    id: '/test.tsx',
    file: '/test.tsx',
    type: 'js',
    importers: new Set<ModuleNode>(),
    importedModules: new Set<ModuleNode>(),
    ...overrides,
  } as ModuleNode;
}

/**
 * Create a mock HMR context. Uses a typed helper to avoid double type assertions
 * that the biome plugin warns about.
 */
function createHmrContext(opts: {
  file: string;
  modules: ModuleNode[];
  readResult: string;
  moduleGraph?: {
    getModuleById: ReturnType<typeof vi.fn>;
    invalidateModule: ReturnType<typeof vi.fn>;
  };
}): HmrContext {
  const server: Partial<ViteDevServer> = opts.moduleGraph
    ? { moduleGraph: opts.moduleGraph as ViteDevServer['moduleGraph'] }
    : {};

  // Build the context object matching HmrContext shape
  const ctx: HmrContext = Object.assign(Object.create(null) as HmrContext, {
    file: opts.file,
    modules: opts.modules,
    read: () => opts.readResult,
    server: server as ViteDevServer,
    timestamp: Date.now(),
  });

  return ctx;
}

/** Call handleHotUpdate on a plugin. */
function callHandleHotUpdate(plugin: Plugin, ctx: HmrContext): unknown {
  const handleHotUpdate = plugin.handleHotUpdate as (ctx: HmrContext) => unknown;
  return handleHotUpdate.call(plugin, ctx);
}

// ─── Basic Plugin Structure ────────────────────────────────────

describe('Vite Plugin', () => {
  it('has the correct plugin name', () => {
    const plugin = vertzPlugin();
    expect(plugin.name).toBe('vertz');
  });

  it('sets enforce: "pre" to run before esbuild JSX transform', () => {
    const plugin = vertzPlugin();
    expect(plugin.enforce).toBe('pre');
  });

  it('has all required hooks', () => {
    const plugin = vertzPlugin();
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.transform).toBe('function');
    expect(typeof plugin.handleHotUpdate).toBe('function');
    expect(typeof plugin.resolveId).toBe('function');
    expect(typeof plugin.load).toBe('function');
    expect(typeof plugin.generateBundle).toBe('function');
  });

  // ─── Transform Pipeline ────────────────────────────────────

  describe('transform pipeline', () => {
    it('transforms .tsx files with reactive code', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim();

      const result = callTransform(plugin, code, 'component.tsx');

      expect(result).toBeDefined();
      expect(result?.code).toContain('signal(');
      expect(result?.map).toBeDefined();
    });

    it('applies hydration markers to interactive components', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim();

      const result = callTransform(plugin, code, 'Counter.tsx');

      expect(result).toBeDefined();
      // After JSX transform, hydration markers become setAttribute calls
      expect(result?.code).toContain('data-v-id');
      expect(result?.code).toContain('"Counter"');
    });

    it('chains reactive + component + hydration transforms in order', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const code = `
function App() {
  let name = "world";
  return <div>Hello {name}</div>;
}
      `.trim();

      const result = callTransform(plugin, code, 'App.tsx');

      expect(result).toBeDefined();
      // Reactive: let -> signal
      expect(result?.code).toContain('signal(');
      // Component: JSX -> DOM helpers
      expect(result?.code).toContain('__element(');
      // Hydration: data-v-id marker (converted to setAttribute by JSX transform)
      expect(result?.code).toContain('data-v-id');
      expect(result?.code).toContain('"App"');
    });

    it('skips non-tsx/jsx files', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const result = callTransform(plugin, 'const x = 1;', 'file.ts');
      expect(result).toBeUndefined();
    });

    it('skips .css files', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const result = callTransform(plugin, 'body { margin: 0; }', 'styles.css');
      expect(result).toBeUndefined();
    });

    it('transforms .jsx files', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const code = `
function Hello() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim();

      const result = callTransform(plugin, code, 'component.jsx');

      expect(result).toBeDefined();
      expect(result?.code).toContain('signal(');
    });

    it('strips query strings from file IDs', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim();

      const result = callTransform(plugin, code, 'Counter.tsx?v=12345');
      expect(result).toBeDefined();
      expect(result?.code).toContain('signal(');
    });

    it('respects custom include patterns', () => {
      const plugin = vertzPlugin({ include: ['**/*.ui.tsx'] });
      setMode(plugin, 'development');

      const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim();

      // Should NOT transform regular .tsx
      const result1 = callTransform(plugin, code, 'Counter.tsx');
      expect(result1).toBeUndefined();

      // Should transform .ui.tsx
      const result2 = callTransform(plugin, code, 'Counter.ui.tsx');
      expect(result2).toBeDefined();
    });

    it('respects exclude patterns', () => {
      const plugin = vertzPlugin({ exclude: ['**/vendor/**'] });
      setMode(plugin, 'development');

      const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim();

      const result = callTransform(plugin, code, '/src/vendor/Component.tsx');
      expect(result).toBeUndefined();
    });

    it('includes source map in result', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim();

      const result = callTransform(plugin, code, 'Counter.tsx');

      expect(result).toBeDefined();
      expect(result?.map).toBeDefined();
      expect(result?.map).toHaveProperty('version');
      expect(result?.map).toHaveProperty('mappings');
      expect(result?.map).toHaveProperty('sources');
    });

    it('chains hydration source map with compile source map', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      // The hydration transformer inserts ` data-v-id="App"` into the opening
      // <div> tag.  This shifts every subsequent character position.  If the Vite
      // plugin only returns the compile source map (which operates on the
      // post-hydration code), positions after the insertion will be off.
      //
      // We use a component with content AFTER the root JSX opening tag so the
      // source map must correctly trace through both transforms. Specifically,
      // we check that the closing </div> maps back to the correct line/column
      // in the original source.
      const code = ['function App() {', '  let x = 0;', '  return <div>{x}</div>;', '}'].join('\n');

      const result = callTransform(plugin, code, 'App.tsx');
      expect(result).toBeDefined();

      const map = result?.map as {
        version: number;
        sources: string[];
        sourcesContent?: (string | null)[];
        mappings: string;
        names: string[];
      };

      // The source map must reference the original file
      expect(map.sources).toContain('App.tsx');

      // sourcesContent must contain the ORIGINAL source, not the hydrated
      // intermediate.  The hydration transformer inserts data-v-id, so if
      // sourcesContent contains that string, the chaining is broken.
      const content = (map.sourcesContent ?? []).join('');
      expect(content).not.toContain('data-v-id');

      // Use trace-mapping to verify mappings resolve to original positions.
      const tracer = new TraceMap(map);
      const outputCode = result?.code ?? '';
      const lines = outputCode.split('\n');

      // Find "App" function declaration in the output. In the original source
      // "App" starts at line 1, column 9.
      let appLine = -1;
      let appCol = -1;
      for (let i = 0; i < lines.length; i++) {
        const idx = (lines[i] ?? '').indexOf('function App');
        if (idx !== -1) {
          appLine = i + 1;
          appCol = idx + 'function '.length; // column of 'A' in 'App'
          break;
        }
      }
      expect(appLine).toBeGreaterThan(0);

      const appOriginal = originalPositionFor(tracer, {
        line: appLine,
        column: appCol,
      });
      expect(appOriginal.source).toBe('App.tsx');
      expect(appOriginal.line).toBe(1);
    });
  });

  // ─── CSS Extraction (Production) ───────────────────────────

  describe('CSS extraction', () => {
    it('IT-8B-1: production build produces optimized output', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'production');

      const code = `
function Card() {
  let active = false;
  const styles = css({
    card: ['p:4', 'rounded:md', 'bg:primary'],
  });
  return <div class={styles.card}>{active}</div>;
}
      `.trim();

      const result = callTransform(plugin, code, '/src/Card.tsx');

      expect(result).toBeDefined();
      // Reactive transforms applied
      expect(result?.code).toContain('signal(');
      // Hydration markers present (converted to setAttribute by JSX transform)
      expect(result?.code).toContain('data-v-id');
      expect(result?.code).toContain('"Card"');
      // In production, CSS is extracted to a virtual module import
      expect(result?.code).toContain('\0vertz-css:');
    });

    it('injects virtual CSS import in production mode', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'production');

      const code = `
function Card() {
  const styles = css({
    card: ['p:4', 'rounded:md'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      const result = callTransform(plugin, code, '/src/Card.tsx');

      expect(result).toBeDefined();
      expect(result?.code).toContain("import '\0vertz-css:/src/Card.tsx'");
    });

    it('does not inject virtual CSS import in dev mode', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const code = `
function Card() {
  const styles = css({
    card: ['p:4', 'rounded:md'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      const result = callTransform(plugin, code, '/src/Card.tsx');

      expect(result).toBeDefined();
      expect(result?.code).not.toContain('\0vertz-css:');
    });

    it('does not extract CSS when cssExtraction is disabled', () => {
      const plugin = vertzPlugin({ cssExtraction: false });
      setMode(plugin, 'production');

      const code = `
function Card() {
  const styles = css({
    card: ['p:4'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      const result = callTransform(plugin, code, '/src/Card.tsx');

      expect(result).toBeDefined();
      expect(result?.code).not.toContain('\0vertz-css:');
    });
  });

  // ─── Virtual CSS Modules ───────────────────────────────────

  describe('virtual CSS modules', () => {
    it('resolves virtual CSS module IDs', () => {
      const plugin = vertzPlugin();
      const resolved = callResolveId(plugin, '\0vertz-css:/src/Card.tsx');
      expect(resolved).toBe('\0vertz-css:/src/Card.tsx');
    });

    it('does not resolve non-virtual IDs', () => {
      const plugin = vertzPlugin();
      const resolved = callResolveId(plugin, '/src/Card.tsx');
      expect(resolved).toBeUndefined();
    });

    it('loads extracted CSS for virtual modules', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'production');

      // First, transform a file with CSS to populate the extraction cache
      const code = `
function Card() {
  const styles = css({
    card: ['p:4', 'rounded:md'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      callTransform(plugin, code, '/src/Card.tsx');

      // Now load the virtual CSS module
      const css = callLoad(plugin, '\0vertz-css:/src/Card.tsx');
      expect(css).toBeDefined();
      expect(css).toContain('padding');
      expect(css).toContain('border-radius');
    });

    it('returns empty string for unknown virtual modules', () => {
      const plugin = vertzPlugin();
      const css = callLoad(plugin, '\0vertz-css:/src/Unknown.tsx');
      expect(css).toBe('');
    });

    it('does not load non-virtual modules', () => {
      const plugin = vertzPlugin();
      const result = callLoad(plugin, '/src/Card.tsx');
      expect(result).toBeUndefined();
    });
  });

  // ─── CSS HMR ───────────────────────────────────────────────

  describe('CSS HMR', () => {
    it('IT-8B-2: CSS changes trigger HMR without full reload', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      // Initial transform registers CSS
      const originalCode = `
function Card() {
  const styles = css({
    card: ['p:4', 'rounded:md'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      callTransform(plugin, originalCode, '/src/Card.tsx');

      // Update with changed CSS
      const updatedCode = `
function Card() {
  const styles = css({
    card: ['p:8', 'rounded:lg'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      // Create mock HMR context
      const mockModule = createMockModuleNode({ file: '/src/Card.tsx' });
      const mockCssModule = createMockModuleNode({
        id: '\0vertz-css:/src/Card.tsx',
        file: null,
      });

      const mockModuleGraph = {
        getModuleById: vi.fn((id: string) => {
          if (id === '\0vertz-css:/src/Card.tsx') return mockCssModule;
          return undefined;
        }),
        invalidateModule: vi.fn(),
      };

      const hmrCtx = createHmrContext({
        file: '/src/Card.tsx',
        modules: [mockModule],
        readResult: updatedCode,
        moduleGraph: mockModuleGraph,
      });

      const result = callHandleHotUpdate(plugin, hmrCtx);

      // HMR handler should detect the CSS change
      expect(mockModuleGraph.getModuleById).toHaveBeenCalledWith('\0vertz-css:/src/Card.tsx');
      expect(mockModuleGraph.invalidateModule).toHaveBeenCalledWith(mockCssModule);

      // Result should include the CSS module for HMR update
      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain(mockCssModule);
    });

    it('returns undefined for non-CSS changes', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      // File without CSS
      const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim();

      callTransform(plugin, code, '/src/Counter.tsx');

      const updatedCode = `
function Counter() {
  let count = 1;
  return <div>{count}</div>;
}
      `.trim();

      const mockModule = createMockModuleNode({ file: '/src/Counter.tsx' });
      const mockModuleGraph = {
        getModuleById: vi.fn(() => undefined),
        invalidateModule: vi.fn(),
      };

      const hmrCtx = createHmrContext({
        file: '/src/Counter.tsx',
        modules: [mockModule],
        readResult: updatedCode,
        moduleGraph: mockModuleGraph,
      });

      const result = callHandleHotUpdate(plugin, hmrCtx);
      expect(result).toBeUndefined();
    });

    it('skips non-component files in HMR', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const hmrCtx = createHmrContext({
        file: '/src/utils.ts',
        modules: [],
        readResult: 'export const x = 1;',
      });

      const result = callHandleHotUpdate(plugin, hmrCtx);
      expect(result).toBeUndefined();
    });
  });

  // ─── Codegen Watch ─────────────────────────────────────────

  describe('codegen file watching', () => {
    it('IT-8B-3: codegen file change triggers module invalidation', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      // Mock a module from .vertz/generated/ and its importer
      const importerModule = createMockModuleNode({
        file: '/src/App.tsx',
        id: '/src/App.tsx',
      });

      const codegenModule = createMockModuleNode({
        file: '/project/.vertz/generated/types.ts',
        id: '/project/.vertz/generated/types.ts',
        importers: new Set([importerModule]),
      });

      const hmrCtx = createHmrContext({
        file: '/project/.vertz/generated/types.ts',
        modules: [codegenModule],
        readResult: 'export type Route = "/"',
      });

      const result = callHandleHotUpdate(plugin, hmrCtx) as ModuleNode[] | undefined;

      // Should return affected modules including the importer
      expect(result).toBeDefined();
      expect(result).toContain(codegenModule);
      expect(result).toContain(importerModule);
    });

    it('returns undefined for empty codegen module list', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const hmrCtx = createHmrContext({
        file: '/project/.vertz/generated/types.ts',
        modules: [],
        readResult: '',
      });

      const result = callHandleHotUpdate(plugin, hmrCtx) as ModuleNode[] | undefined;
      expect(result).toBeUndefined();
    });
  });

  // ─── Production Build ──────────────────────────────────────

  describe('generateBundle', () => {
    it('emits CSS asset in production build', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'production');

      // Transform files with CSS
      const code = `
function Card() {
  const styles = css({
    card: ['p:4', 'rounded:md'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      callTransform(plugin, code, '/src/Card.tsx');

      // Mock emitFile
      const emitFile = vi.fn();
      const generateBundle = plugin.generateBundle as () => void;
      generateBundle.call({ emitFile });

      expect(emitFile).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'asset',
          fileName: 'assets/vertz.css',
          source: expect.stringContaining('padding'),
        }),
      );
    });

    it('does not emit CSS when disabled', () => {
      const plugin = vertzPlugin({ cssExtraction: false });
      setMode(plugin, 'production');

      const code = `
function Card() {
  const styles = css({
    card: ['p:4'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      callTransform(plugin, code, '/src/Card.tsx');

      const emitFile = vi.fn();
      const generateBundle = plugin.generateBundle as () => void;
      generateBundle.call({ emitFile });

      expect(emitFile).not.toHaveBeenCalled();
    });

    it('does not emit CSS in dev mode', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'development');

      const code = `
function Card() {
  const styles = css({
    card: ['p:4'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      callTransform(plugin, code, '/src/Card.tsx');

      const emitFile = vi.fn();
      const generateBundle = plugin.generateBundle as () => void;
      generateBundle.call({ emitFile });

      expect(emitFile).not.toHaveBeenCalled();
    });

    it('performs dead CSS elimination', () => {
      const plugin = vertzPlugin();
      setMode(plugin, 'production');

      // Only transform one file -- CSS from untransformed files should be eliminated
      const code = `
function Card() {
  const styles = css({
    card: ['p:4'],
  });
  return <div class={styles.card}>Hello</div>;
}
      `.trim();

      callTransform(plugin, code, '/src/Card.tsx');

      const emitFile = vi.fn();
      const generateBundle = plugin.generateBundle as () => void;
      generateBundle.call({ emitFile });

      // Should only contain CSS from Card.tsx, not from any other files
      expect(emitFile).toHaveBeenCalledTimes(1);
      const emittedCSS = emitFile.mock.calls[0][0].source as string;
      expect(emittedCSS).toContain('padding');
    });

    it('emits route-level CSS chunks when routeMap is provided', () => {
      const routeMap = new Map<string, string[]>();
      routeMap.set('/', ['/src/Home.tsx']);
      routeMap.set('/about', ['/src/About.tsx']);

      const plugin = vertzPlugin({ routeMap });
      setMode(plugin, 'production');

      // Transform Home component
      const homeCode = `
function Home() {
  const styles = css({
    home: ['p:4', 'bg:primary'],
  });
  return <div class={styles.home}>Home</div>;
}
      `.trim();
      callTransform(plugin, homeCode, '/src/Home.tsx');

      // Transform About component
      const aboutCode = `
function About() {
  const styles = css({
    about: ['p:8', 'bg:secondary'],
  });
  return <div class={styles.about}>About</div>;
}
      `.trim();
      callTransform(plugin, aboutCode, '/src/About.tsx');

      const emitFile = vi.fn();
      const generateBundle = plugin.generateBundle as () => void;
      generateBundle.call({ emitFile });

      // Should emit per-route CSS files
      expect(emitFile).toHaveBeenCalled();
      const fileNames = emitFile.mock.calls.map((call: [{ fileName: string }]) => call[0].fileName);
      expect(fileNames.some((name: string) => name.includes('route-'))).toBe(true);
    });
  });

  // ─── CSSHMRHandler Integration ─────────────────────────────

  describe('CSSHMRHandler', () => {
    it('detects CSS changes between transforms', () => {
      const handler = new CSSHMRHandler();

      // Register initial CSS
      handler.register('/src/Card.tsx', '.card { padding: 1rem; }');

      // Update with same CSS - no change
      const noChange = handler.update('/src/Card.tsx', '.card { padding: 1rem; }');
      expect(noChange.hasChanged).toBe(false);
      expect(noChange.affectedFiles).toHaveLength(0);

      // Update with different CSS - change detected
      const changed = handler.update('/src/Card.tsx', '.card { padding: 2rem; }');
      expect(changed.hasChanged).toBe(true);
      expect(changed.affectedFiles).toContain('/src/Card.tsx');
    });

    it('tracks multiple files independently', () => {
      const handler = new CSSHMRHandler();

      handler.register('/src/Card.tsx', '.card { padding: 1rem; }');
      handler.register('/src/Button.tsx', '.btn { padding: 0.5rem; }');

      expect(handler.size).toBe(2);

      // Update only Card
      const result = handler.update('/src/Card.tsx', '.card { padding: 2rem; }');
      expect(result.hasChanged).toBe(true);
      expect(result.affectedFiles).toEqual(['/src/Card.tsx']);
    });
  });
});
