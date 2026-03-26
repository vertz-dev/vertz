/**
 * Cross-compiler equivalence tests.
 *
 * Runs the same source through both the TypeScript (ts-morph) compiler
 * and the Rust (native) compiler, verifying semantically equivalent output.
 *
 * These tests are the gold standard for Phase 0.8 — any behavioral difference
 * between the two compilers is a bug in the Rust compiler.
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { compile as tsCompile } from '@vertz/ui-compiler';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

function loadNativeCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: { filename?: string; fastRefresh?: boolean; target?: string },
    ) => {
      code: string;
      css?: string;
      map?: string;
      diagnostics?: Array<{ message: string; line?: number; column?: number }>;
    };
  };
}

/**
 * Compare two compiler outputs for semantic equivalence.
 *
 * We verify that the same TRANSFORM BEHAVIORS are present in both outputs.
 * Acceptable differences:
 * - Import precision (native may import fewer unused helpers)
 * - Whitespace, formatting, comment differences
 * - Getter syntax style (arrow `() =>` vs named `get prop() {}`)
 *
 * What must match:
 * - Same reactive transforms (signal, computed, .value)
 * - Same JSX transform output (__element, __child, etc.)
 * - Same mount frame wrapping
 */
function assertEquivalentOutput(
  tsCode: string,
  nativeCode: string,
  label: string,
) {
  // Strip the native marker comment for comparison
  const cleanNative = nativeCode.replace('// compiled by vertz-native\n', '');

  // Check key transform patterns are present in both
  const patterns = [
    { name: 'signal(', check: (s: string) => s.includes('signal(') },
    { name: 'computed(', check: (s: string) => s.includes('computed(') },
    { name: '__element(', check: (s: string) => s.includes('__element(') },
    { name: '__pushMountFrame', check: (s: string) => s.includes('__pushMountFrame') },
    { name: '__flushMountFrame', check: (s: string) => s.includes('__flushMountFrame') },
    { name: '.value', check: (s: string) => s.includes('.value') },
  ];

  for (const pattern of patterns) {
    const inTs = pattern.check(tsCode);
    const inNative = pattern.check(cleanNative);
    if (inTs !== inNative) {
      throw new Error(
        `[${label}] Pattern "${pattern.name}" mismatch: ` +
          `ts-morph=${inTs}, native=${inNative}`,
      );
    }
  }

  // Verify that imports native uses are valid (subset check — native may be more precise)
  const nativeImports = extractImportedSymbols(cleanNative);
  const tsImports = extractImportedSymbols(tsCode);
  const allValidSymbols = new Set(tsImports);

  // Native imports should be a subset of TS imports (or known valid symbols)
  const knownRuntimeSymbols = new Set([
    'signal', 'computed', 'effect', 'batch', 'untrack',
    '__element', '__child', '__attr', '__prop', '__on', '__append',
    '__pushMountFrame', '__flushMountFrame', '__discardMountFrame',
    '__enterChildren', '__exitChildren', '__conditional', '__list',
    '__listValue', '__insert', '__show', '__spread', '__classList',
    '__staticText', '__styleStr',
  ]);
  for (const sym of nativeImports) {
    if (!allValidSymbols.has(sym) && !knownRuntimeSymbols.has(sym)) {
      throw new Error(
        `[${label}] Native imports unknown symbol "${sym}" not found in TS output`,
      );
    }
  }
}

function extractImportedSymbols(code: string): string[] {
  const symbols: string[] = [];
  const importRegex = /import\s*\{([^}]+)\}\s*from/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const names = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    symbols.push(...names);
  }
  return symbols;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Feature: Cross-compiler equivalence', () => {
  const nativeCompiler = loadNativeCompiler();
  const filename = 'test.tsx';

  function compileBoth(source: string) {
    const tsResult = tsCompile(source, { filename });
    const nativeResult = nativeCompiler.compile(source, { filename });
    return { ts: tsResult, native: nativeResult };
  }

  describe('Given a simple component with static content', () => {
    it('Then both compilers produce equivalent JSX transforms', () => {
      const source = `function App() {
  return <div class="container">Hello World</div>;
}`;
      const { ts, native } = compileBoth(source);
      assertEquivalentOutput(ts.code, native.code, 'static-content');
    });
  });

  describe('Given a component with a signal variable', () => {
    it('Then both compilers produce signal() wrapping and .value access', () => {
      const source = `function Counter() {
  let count = 0;
  return <div>{count}</div>;
}`;
      const { ts, native } = compileBoth(source);
      assertEquivalentOutput(ts.code, native.code, 'signal');
      expect(ts.code).toContain('signal(');
      expect(native.code).toContain('signal(');
    });
  });

  describe('Given a component with a computed variable', () => {
    it('Then both compilers produce computed() wrapping', () => {
      const source = `function Counter() {
  let count = 0;
  const doubled = count * 2;
  return <div>{doubled}</div>;
}`;
      const { ts, native } = compileBoth(source);
      assertEquivalentOutput(ts.code, native.code, 'computed');
      expect(ts.code).toContain('computed(');
      expect(native.code).toContain('computed(');
    });
  });

  describe('Given a component with mutation (count++)', () => {
    it('Then both compilers produce mutation transforms', () => {
      const source = `function Counter() {
  let count = 0;
  return <button onClick={() => { count++; }}>{count}</button>;
}`;
      const { ts, native } = compileBoth(source);
      // Both should have signal, mount frame, and event handling
      assertEquivalentOutput(ts.code, native.code, 'mutation');
    });
  });

  describe('Given a component with props destructuring', () => {
    it('Then both compilers convert to __props access', () => {
      const source = `function Card({ title, onClick }: { title: string; onClick: () => void }) {
  return <div onClick={onClick}>{title}</div>;
}`;
      const { ts, native } = compileBoth(source);
      expect(ts.code).toContain('__props');
      expect(native.code).toContain('__props');
    });
  });

  describe('Given a component with default prop values', () => {
    it('Then both compilers preserve defaults', () => {
      const source = `function Badge({ variant = 'default' }: { variant?: string }) {
  return <span>{variant}</span>;
}`;
      const { ts, native } = compileBoth(source);
      expect(ts.code).toContain('__props');
      expect(native.code).toContain('__props');
      // Both should have a default value mechanism
      expect(ts.code).toContain("'default'");
      expect(native.code).toContain("'default'");
    });
  });

  describe('Given a component with conditional rendering', () => {
    it('Then both compilers produce __conditional', () => {
      const source = `function Toggle() {
  let isOpen = false;
  return <div>{isOpen && <span>Open</span>}</div>;
}`;
      const { ts, native } = compileBoth(source);
      expect(ts.code).toContain('__conditional');
      expect(native.code).toContain('__conditional');
    });
  });

  describe('Given a component with list rendering', () => {
    it('Then both compilers produce __list', () => {
      const source = `function TaskList() {
  let items = ['a', 'b'];
  return <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>;
}`;
      const { ts, native } = compileBoth(source);
      expect(ts.code).toContain('__list');
      expect(native.code).toContain('__list');
    });
  });

  describe('Given a component with reactive props (getter wrapping)', () => {
    it('Then both compilers wrap reactive props in getters', () => {
      const source = `function App() {
  let isActive = false;
  return <Badge variant={isActive ? 'active' : 'inactive'} />;
}`;
      const { ts, native } = compileBoth(source);
      // Both should produce getter for reactive prop
      // TS uses arrow `() =>`, native uses named `get variant() {}`
      const tsHasGetter = ts.code.includes('() =>') || ts.code.includes('get variant');
      const nativeHasGetter =
        native.code.includes('() =>') || native.code.includes('get variant');
      expect(tsHasGetter).toBe(true);
      expect(nativeHasGetter).toBe(true);
    });
  });

  describe('Given a component with multiple elements', () => {
    it('Then both compilers produce equivalent nested element structures', () => {
      const source = `function Layout() {
  return (
    <div class="layout">
      <header>Title</header>
      <main>Content</main>
      <footer>Footer</footer>
    </div>
  );
}`;
      const { ts, native } = compileBoth(source);
      assertEquivalentOutput(ts.code, native.code, 'nested-elements');
    });
  });

  describe('Given an arrow function component', () => {
    it('Then both compilers handle arrow expression bodies', () => {
      const source = `const App = () => <div>Hello</div>;`;
      const { ts, native } = compileBoth(source);
      // Both should transform the component (mount frame at minimum)
      expect(ts.code).toContain('__pushMountFrame');
      expect(native.code).toContain('__pushMountFrame');
    });
  });

  describe('Given a component with signal property access (query)', () => {
    it('Then both compilers insert .value on signal properties', () => {
      const source = `import { query } from '@vertz/ui';
function TaskList() {
  const tasks = query(() => fetch('/api/tasks'));
  return <div>{tasks.data}</div>;
}`;
      const { ts, native } = compileBoth(source);
      // Both should insert .value for signal property access
      expect(ts.code).toContain('tasks.data.value');
      expect(native.code).toContain('tasks.data.value');
    });
  });

  describe('Given a component with css() calls', () => {
    it('Then both compilers handle CSS shorthands', () => {
      const source = `function Panel() {
  const styles = css({ panel: ['bg:background', 'p:4', 'rounded:lg'] });
  return <div class={styles.panel}>Content</div>;
}`;
      const { ts, native } = compileBoth(source);
      // Both should produce valid output (native does CSS transform, TS doesn't)
      expect(ts.code).toContain('__element');
      expect(native.code).toContain('__element');
    });
  });

  describe('Given a component with ternary conditional', () => {
    it('Then both compilers produce __conditional for ternary', () => {
      const source = `function Status() {
  let loading = true;
  return <div>{loading ? <span>Loading...</span> : <span>Done</span>}</div>;
}`;
      const { ts, native } = compileBoth(source);
      expect(ts.code).toContain('__conditional');
      expect(native.code).toContain('__conditional');
    });
  });

  describe('Given a component with static text children', () => {
    it('Then both compilers handle static text', () => {
      const source = `function Hello() {
  return <p>Hello, world!</p>;
}`;
      const { ts, native } = compileBoth(source);
      assertEquivalentOutput(ts.code, native.code, 'static-text');
    });
  });

  describe('Given target=tui', () => {
    it('Then both compilers use @vertz/tui/internals', () => {
      const source = `function App() {
  let count = 0;
  return <div>{count}</div>;
}`;
      const tsResult = tsCompile(source, { filename, target: 'tui' });
      const nativeResult = nativeCompiler.compile(source, { filename, target: 'tui' });
      expect(tsResult.code).toContain('@vertz/tui/internals');
      expect(nativeResult.code).toContain('@vertz/tui/internals');
    });
  });

  describe('Known limitation: cross-file reactivity manifests', () => {
    it('Then TS compiler with manifests inserts .value for user hook signal props', () => {
      // This test documents the known gap: the native compiler does NOT
      // support cross-file reactivity manifests. When a component imports
      // a custom hook that returns signal properties, the TS compiler
      // (with manifests) correctly inserts .value, but the native compiler
      // cannot because it has no manifest support.
      //
      // This gap is gated behind VERTZ_NATIVE_COMPILER=1 (opt-in) and
      // the plugin logs a warning when user manifests are detected.
      const source = `import { useTaskStore } from './stores';
function TaskList() {
  const store = useTaskStore();
  return <div>{store.tasks}</div>;
}`;
      // TS compiler WITH manifests would insert store.tasks.value
      // (only if the manifest tells it that useTaskStore returns {tasks: Signal})
      const tsResult = tsCompile(source, {
        filename,
        manifests: {
          './stores': {
            exports: {
              useTaskStore: {
                kind: 'function',
                reactivity: {
                  type: 'signal-api',
                  signalProperties: new Set(['tasks']),
                  plainProperties: new Set([]),
                },
              },
            },
          },
        },
      });

      // Native compiler WITHOUT manifests treats store.tasks as plain access
      const nativeResult = nativeCompiler.compile(source, { filename });

      // TS with manifests: inserts .value
      expect(tsResult.code).toContain('store.tasks.value');
      // Native without manifests: does NOT insert .value (known limitation)
      expect(nativeResult.code).not.toContain('store.tasks.value');
    });
  });
});
