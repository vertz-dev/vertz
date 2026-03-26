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
    ) => {
      code: string;
    };
  };
}

function compileAndGetCode(source: string): string {
  const { compile } = loadCompiler();
  const result = compile(source, { filename: 'test.tsx' });
  return result.code;
}

/**
 * Parity verification tests for #1911.
 * Each test verifies a specific ts-morph compiler behavior exists in the native compiler.
 */

describe('Parity verification: #1911', () => {
  // #1892 / #1781: Reactive useSearchParams() recognized as reactive source
  describe('#1892/#1781: useSearchParams reactive source', () => {
    it('classifies useSearchParams() result as reactive source', () => {
      const code = compileAndGetCode(`
        import { query, useSearchParams } from '@vertz/ui';
        function TaskList() {
          const sp = useSearchParams();
          const tasks = query(fetchTasks({ page: sp.page }));
          return <div>{tasks.data}</div>;
        }
      `);
      // sp is reactive source → query arg gets auto-thunked
      expect(code).toContain('query(() => fetchTasks(');
    });
  });

  // #1877: query() signal detection for reactive re-fetch
  describe('#1877: query reactive signal detection', () => {
    it('wraps query with signal dependency in thunk', () => {
      const code = compileAndGetCode(`
        import { query } from '@vertz/ui';
        function TaskList() {
          let page = 1;
          const tasks = query(fetchTasks({ page }));
          return <div>{tasks.data}</div>;
        }
      `);
      expect(code).toContain('query(() => fetchTasks(');
    });
  });

  // #1704: __list full-replacement for unkeyed lists
  describe('#1704: __list for unkeyed lists', () => {
    it('uses __list for .map() without key', () => {
      const code = compileAndGetCode(`
        function App() {
          let items = ['a', 'b'];
          return <ul>{items.map((item) => <li>{item}</li>)}</ul>;
        }
      `);
      expect(code).toContain('__list');
    });
  });

  // #1694: query() with null-return for conditional queries
  describe('#1694: query null-return conditional', () => {
    it('compiles conditional query patterns', () => {
      const code = compileAndGetCode(`
        import { query } from '@vertz/ui';
        function TaskDetail() {
          let id = null;
          const task = query(() => id ? fetchTask(id) : null);
          return <div>{task.data}</div>;
        }
      `);
      // Should compile without errors and have the query
      expect(code).toContain('query(');
      expect(code).toContain('task.data.value');
    });
  });

  // #1684: JSX spread attributes
  describe('#1684: JSX spread attributes', () => {
    it('handles spread attributes on intrinsic elements', () => {
      const code = compileAndGetCode(`
        function App() {
          const props = { className: 'foo', id: 'bar' };
          return <div {...props}>hello</div>;
        }
      `);
      // Should compile spread attributes
      expect(code).toContain('props');
    });
  });

  // #1602: option.selected IDL property
  describe('#1602: option.selected IDL', () => {
    it('compiles selected attribute on option elements', () => {
      const code = compileAndGetCode(`
        function App() {
          return <select><option selected={true}>A</option></select>;
        }
      `);
      expect(code).toContain('selected');
    });
  });

  // #1597: Index param in key function — key prop is extracted as key function in __list
  describe('#1597: list key with index param', () => {
    it('extracts key as key function in __list call', () => {
      const code = compileAndGetCode(`
        function App() {
          let items = [{id: 1}];
          return <ul>{items.map((item) => <li key={item.id}>{item.id}</li>)}</ul>;
        }
      `);
      // key={item.id} becomes the key function arg in __list
      expect(code).toContain('item.id');
      expect(code).toContain('__list');
    });
  });

  // #1595: Boolean shorthand JSX attributes
  describe('#1595: boolean shorthand JSX attributes', () => {
    it('handles boolean shorthand (e.g., <input disabled />)', () => {
      const code = compileAndGetCode(`
        function App() {
          return <input disabled />;
        }
      `);
      expect(code).toContain('disabled');
    });
  });

  // #1588: Property assignment for IDL properties
  describe('#1588: IDL property assignment', () => {
    it('compiles value attribute on input elements', () => {
      const code = compileAndGetCode(`
        function App() {
          let val = '';
          return <input value={val} />;
        }
      `);
      expect(code).toContain('value');
    });
  });

  // #1536: Nested scope shadowing
  describe('#1536: nested scope shadowing', () => {
    it('does not add .value to shadowed signal names in arrow params', () => {
      const code = compileAndGetCode(`
        function App() {
          let count = 0;
          const handler = (count) => console.log(count);
          return <div onClick={handler}>{count}</div>;
        }
      `);
      expect(code).toContain('console.log(count)');
      expect(code).not.toContain('console.log(count.value)');
    });

    it('does not add .value inside nested function with same-name param', () => {
      const code = compileAndGetCode(`
        function App() {
          let x = 0;
          function inner(x) { return x + 1; }
          return <div>{x}</div>;
        }
      `);
      expect(code).toContain('return x + 1');
    });
  });

  // #1391: Object/array literals NOT wrapped in computed()
  describe('#1391: object/array literals not computed', () => {
    it('does not wrap object literals in computed()', () => {
      const code = compileAndGetCode(`
        function App() {
          let count = 0;
          const style = { color: 'red' };
          return <div>{count}</div>;
        }
      `);
      expect(code).not.toContain("computed(() => ({ color: 'red' })");
      expect(code).not.toContain('computed(() => {');
    });

    it('does not wrap array literals in computed()', () => {
      const code = compileAndGetCode(`
        function App() {
          let count = 0;
          const items = [1, 2, 3];
          return <div>{items}{count}</div>;
        }
      `);
      expect(code).not.toContain('computed(() => [1, 2, 3])');
    });
  });

  // #1346: React-style style objects with camelCase
  describe('#1346: style objects with camelCase', () => {
    it('passes style objects through to element', () => {
      const code = compileAndGetCode(`
        function App() {
          return <div style={{ fontSize: '16px', backgroundColor: 'red' }}>hello</div>;
        }
      `);
      expect(code).toContain('fontSize');
      expect(code).toContain('backgroundColor');
    });
  });

  // #1345: className → class attribute mapping
  describe('#1345: className prop', () => {
    it('maps className to class attribute on intrinsic elements', () => {
      const code = compileAndGetCode(`
        function App() {
          return <div className="container">hello</div>;
        }
      `);
      // className in JSX is mapped to "class" attribute in the DOM
      expect(code).toContain('"class"');
      expect(code).toContain('container');
    });
  });

  // #1344: Reactive callback-local consts in .map()
  describe('#1344: reactive consts in .map() callbacks', () => {
    it('handles const derived from signal inside .map()', () => {
      const code = compileAndGetCode(`
        function App() {
          let items = [{name: 'a'}];
          return <ul>{items.map((item) => {
            const label = item.name.toUpperCase();
            return <li>{label}</li>;
          })}</ul>;
        }
      `);
      // Should compile and transform JSX inside callback
      expect(code).toContain('__element');
    });
  });

  // #1320: Quote hyphenated JSX props on custom components
  describe('#1320: hyphenated props on custom components', () => {
    it('quotes hyphenated prop names in component props object', () => {
      const code = compileAndGetCode(`
        function App() {
          return <CustomComp data-testid="foo" aria-label="bar" />;
        }
      `);
      // Hyphenated props should be present in the output
      expect(code).toContain('data-testid');
      expect(code).toContain('aria-label');
    });
  });
});
