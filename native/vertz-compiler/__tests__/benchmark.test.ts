/**
 * Benchmark tests: native Rust compiler vs TypeScript ts-morph compiler.
 *
 * Measures per-file compilation time and multi-file cold start for both
 * compilers. The native compiler should be 20-50x faster.
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
    ) => { code: string };
  };
}

// ── Test fixtures ────────────────────────────────────────────────

const SIMPLE_COMPONENT = `function App() {
  return <div class="container">Hello World</div>;
}`;

const REACTIVE_COMPONENT = `function Counter() {
  let count = 0;
  const doubled = count * 2;
  const message = doubled > 10 ? 'Big!' : 'Small';

  return (
    <div>
      <span>{count}</span>
      <span>{doubled}</span>
      <p>{message}</p>
      <button onClick={() => { count++; }}>Increment</button>
    </div>
  );
}`;

const COMPLEX_COMPONENT = `import { query } from '@vertz/ui';

function TaskList() {
  let filter = 'all';
  let searchText = '';
  const tasks = query(() => fetch('/api/tasks'));
  const filtered = filter === 'all'
    ? tasks.data
    : tasks.data?.filter(t => t.status === filter);
  const count = filtered?.length ?? 0;

  return (
    <div class="task-list">
      <header>
        <h1>Tasks ({count})</h1>
        <input
          value={searchText}
          onInput={(e) => { searchText = e.target.value; }}
          placeholder="Search..."
        />
        <select value={filter} onChange={(e) => { filter = e.target.value; }}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="done">Done</option>
        </select>
      </header>
      <ul>
        {filtered?.map(task => (
          <li key={task.id} class={task.done ? 'done' : ''}>
            <span>{task.title}</span>
            <button onClick={() => { task.done = !task.done; }}>Toggle</button>
          </li>
        ))}
      </ul>
      {tasks.loading && <div class="loading">Loading...</div>}
      {tasks.error && <div class="error">{tasks.error.message}</div>}
    </div>
  );
}`;

// Generate N files for multi-file benchmark
function generateFiles(count: number): Array<{ source: string; filename: string }> {
  const files: Array<{ source: string; filename: string }> = [];
  for (let i = 0; i < count; i++) {
    files.push({
      source: `function Component${i}() {
  let count${i} = 0;
  const doubled${i} = count${i} * 2;
  return (
    <div class="comp-${i}">
      <span>{count${i}}</span>
      <span>{doubled${i}}</span>
      <button onClick={() => { count${i}++; }}>+</button>
    </div>
  );
}`,
      filename: `Component${i}.tsx`,
    });
  }
  return files;
}

// ── Benchmark helpers ────────────────────────────────────────────

function benchmarkMs(fn: () => void, iterations: number): { totalMs: number; avgMs: number } {
  // Warm up
  fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const totalMs = performance.now() - start;

  return {
    totalMs: Math.round(totalMs * 100) / 100,
    avgMs: Math.round((totalMs / iterations) * 100) / 100,
  };
}

// ── Benchmark tests ──────────────────────────────────────────────

describe('Feature: Compilation benchmarks', () => {
  const nativeCompiler = loadNativeCompiler();
  const ITERATIONS = 100;

  describe('Given a simple component (static content)', () => {
    it('Then native compiler is at least 5x faster than ts-morph', () => {
      const tsResult = benchmarkMs(
        () => tsCompile(SIMPLE_COMPONENT, { filename: 'simple.tsx' }),
        ITERATIONS,
      );
      const nativeResult = benchmarkMs(
        () => nativeCompiler.compile(SIMPLE_COMPONENT, { filename: 'simple.tsx' }),
        ITERATIONS,
      );

      const speedup = tsResult.avgMs / nativeResult.avgMs;

      console.log(`\n  Simple component (${ITERATIONS} iterations):`);
      console.log(`    ts-morph:  ${tsResult.avgMs}ms avg (${tsResult.totalMs}ms total)`);
      console.log(`    native:    ${nativeResult.avgMs}ms avg (${nativeResult.totalMs}ms total)`);
      console.log(`    speedup:   ${speedup.toFixed(1)}x`);

      expect(speedup).toBeGreaterThan(5);
    });
  });

  describe('Given a reactive component (signals + computeds + mutations)', () => {
    it('Then native compiler is at least 5x faster than ts-morph', () => {
      const tsResult = benchmarkMs(
        () => tsCompile(REACTIVE_COMPONENT, { filename: 'counter.tsx' }),
        ITERATIONS,
      );
      const nativeResult = benchmarkMs(
        () => nativeCompiler.compile(REACTIVE_COMPONENT, { filename: 'counter.tsx' }),
        ITERATIONS,
      );

      const speedup = tsResult.avgMs / nativeResult.avgMs;

      console.log(`\n  Reactive component (${ITERATIONS} iterations):`);
      console.log(`    ts-morph:  ${tsResult.avgMs}ms avg (${tsResult.totalMs}ms total)`);
      console.log(`    native:    ${nativeResult.avgMs}ms avg (${nativeResult.totalMs}ms total)`);
      console.log(`    speedup:   ${speedup.toFixed(1)}x`);

      expect(speedup).toBeGreaterThan(5);
    });
  });

  describe('Given a complex component (query + list + conditionals)', () => {
    it('Then native compiler is at least 5x faster than ts-morph', () => {
      const tsResult = benchmarkMs(
        () => tsCompile(COMPLEX_COMPONENT, { filename: 'task-list.tsx' }),
        ITERATIONS,
      );
      const nativeResult = benchmarkMs(
        () => nativeCompiler.compile(COMPLEX_COMPONENT, { filename: 'task-list.tsx' }),
        ITERATIONS,
      );

      const speedup = tsResult.avgMs / nativeResult.avgMs;

      console.log(`\n  Complex component (${ITERATIONS} iterations):`);
      console.log(`    ts-morph:  ${tsResult.avgMs}ms avg (${tsResult.totalMs}ms total)`);
      console.log(`    native:    ${nativeResult.avgMs}ms avg (${nativeResult.totalMs}ms total)`);
      console.log(`    speedup:   ${speedup.toFixed(1)}x`);

      expect(speedup).toBeGreaterThan(5);
    });
  });

  describe('Given 50 files cold start', () => {
    it('Then native compiler completes 50 files at least 5x faster', () => {
      const files = generateFiles(50);

      const tsStart = performance.now();
      for (const file of files) {
        tsCompile(file.source, { filename: file.filename });
      }
      const tsTotalMs = Math.round((performance.now() - tsStart) * 100) / 100;

      const nativeStart = performance.now();
      for (const file of files) {
        nativeCompiler.compile(file.source, { filename: file.filename });
      }
      const nativeTotalMs = Math.round((performance.now() - nativeStart) * 100) / 100;

      const speedup = tsTotalMs / nativeTotalMs;

      console.log(`\n  50-file cold start:`);
      console.log(`    ts-morph:  ${tsTotalMs}ms`);
      console.log(`    native:    ${nativeTotalMs}ms`);
      console.log(`    speedup:   ${speedup.toFixed(1)}x`);

      expect(speedup).toBeGreaterThan(5);
    });
  });

  describe('Given per-file absolute timing targets', () => {
    it('Then native compiler compiles a simple file in under 5ms', () => {
      // Warm up
      nativeCompiler.compile(SIMPLE_COMPONENT, { filename: 'simple.tsx' });

      const start = performance.now();
      nativeCompiler.compile(SIMPLE_COMPONENT, { filename: 'simple.tsx' });
      const elapsed = performance.now() - start;

      console.log(`\n  Native single-file: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(5);
    });

    it('Then native compiler compiles a complex file in under 10ms', () => {
      // Warm up
      nativeCompiler.compile(COMPLEX_COMPONENT, { filename: 'complex.tsx' });

      const start = performance.now();
      nativeCompiler.compile(COMPLEX_COMPONENT, { filename: 'complex.tsx' });
      const elapsed = performance.now() - start;

      console.log(`\n  Native complex single-file: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(10);
    });
  });
});
