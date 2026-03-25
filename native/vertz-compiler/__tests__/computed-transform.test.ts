import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: { filename?: string },
    ) => { code: string };
  };
}

function compileAndGetCode(source: string): string {
  const { compile } = loadCompiler();
  const result = compile(source, { filename: 'test.tsx' });
  return result.code;
}

describe('Feature: Computed transform', () => {
  describe('Given a const derived from a signal variable', () => {
    describe('When compiled', () => {
      it('Then wraps initializer in computed(() => ...)', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const doubled = count * 2;
            return <div>{doubled}</div>;
          }
        `);
        expect(code).toContain('computed(() => count.value * 2)');
      });
    });
  });

  describe('Given a chained computed (const derived from another computed)', () => {
    describe('When compiled', () => {
      it('Then wraps both in computed()', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const doubled = count * 2;
            const label = 'Value: ' + doubled;
            return <div>{label}</div>;
          }
        `);
        expect(code).toContain('computed(() => count.value * 2)');
        expect(code).toContain("computed(() => 'Value: ' + doubled.value)");
      });
    });
  });

  describe('Given a computed variable read outside JSX', () => {
    describe('When compiled', () => {
      it('Then inserts .value on reads', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            const doubled = count * 2;
            console.log(doubled);
            return <div>{doubled}</div>;
          }
        `);
        expect(code).toContain('console.log(doubled.value)');
      });
    });
  });

  describe('Given a computed used in shorthand property', () => {
    describe('When compiled', () => {
      it('Then expands shorthand to unwrap .value', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            const offset = count + 10;
            const obj = { offset };
            return <div>{obj}</div>;
          }
        `);
        // Unlike signals, computeds expand shorthand: { offset } → { offset: offset.value }
        expect(code).toContain('offset: offset.value');
      });
    });
  });

  describe('Given a const with no reactive dependencies (static)', () => {
    describe('When compiled', () => {
      it('Then does NOT wrap in computed()', () => {
        const code = compileAndGetCode(`
          function App() {
            const title = 'Hello';
            return <div>{title}</div>;
          }
        `);
        expect(code).not.toContain('computed(');
        expect(code).toContain("const title = 'Hello'");
      });
    });
  });

  describe('Given a destructured signal API (query)', () => {
    describe('When compiled', () => {
      it('Then adds .value to signal property references and leaves plain properties unchanged', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            const { data, loading, refetch } = query(() => fetchTasks());
            return <div>{data}{loading}</div>;
          }
        `);
        // Destructured signal properties get .value on references
        expect(code).toContain('data.value');
        expect(code).toContain('loading.value');
        // Plain properties do NOT get .value
        expect(code).not.toContain('refetch.value');
      });
    });
  });

  describe('Given a function definition depending on a signal', () => {
    describe('When compiled', () => {
      it('Then does NOT wrap the function in computed()', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            const handler = () => { count++; };
            return <button onClick={handler}>{count}</button>;
          }
        `);
        // Functions are stable references (static), not computed
        expect(code).not.toContain('const handler = computed(');
      });
    });
  });

  describe('Given a computed variable shadowed by a callback parameter', () => {
    describe('When compiled', () => {
      it('Then does NOT add .value to the shadowed parameter', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            const doubled = count * 2;
            const handler = (doubled) => console.log(doubled);
            return <div>{doubled}</div>;
          }
        `);
        // The doubled inside the callback is the parameter, not the computed
        expect(code).toContain('console.log(doubled)');
        expect(code).not.toContain('console.log(doubled.value)');
      });
    });
  });

  describe('Given a const derived from a signal API property', () => {
    describe('When compiled', () => {
      it('Then wraps in computed() with .value on the signal property', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            const tasks = query(() => fetchTasks());
            const hasError = tasks.error ? true : false;
            return <div>{hasError}</div>;
          }
        `);
        expect(code).toContain('computed(() => tasks.error.value ? true : false)');
      });
    });
  });
});
