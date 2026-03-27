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
      components?: Array<{
        name: string;
        bodyStart: number;
        bodyEnd: number;
        variables?: Array<{
          name: string;
          kind: string;
          start: number;
          end: number;
          signalProperties?: string[];
          plainProperties?: string[];
          fieldSignalProperties?: string[];
          isReactiveSource?: boolean;
        }>;
      }>;
    };
  };
}

function compileAndGetCode(source: string): string {
  const { compile } = loadCompiler();
  const result = compile(source, { filename: 'test.tsx' });
  return result.code;
}

describe('Feature: Signal transform', () => {
  describe('Given a let variable classified as a signal', () => {
    describe('When compiled', () => {
      it('Then wraps the declaration in signal() with HMR key', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            return <div>{count}</div>;
          }
        `);
        expect(code).toContain("signal(0, 'count')");
        // let should become const
        expect(code).not.toMatch(/let\s+count\s*=/);
        expect(code).toMatch(/const\s+count\s*=\s*signal/);
      });

      it('Then replaces let with const', () => {
        const code = compileAndGetCode(`
          function App() {
            let visible = true;
            return <div>{visible}</div>;
          }
        `);
        expect(code).toMatch(/const\s+visible\s*=\s*signal/);
        expect(code).not.toMatch(/let\s+visible/);
      });
    });
  });

  describe('Given a signal variable referenced in non-JSX code', () => {
    describe('When compiled', () => {
      it('Then inserts .value on references', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const doubled = count * 2;
            return <div>{doubled}</div>;
          }
        `);
        expect(code).toContain('count.value * 2');
      });
    });
  });

  describe('Given a signal variable assigned a new value', () => {
    describe('When compiled', () => {
      it('Then inserts .value on the assignment target', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const handler = () => { count = 5; };
            return <button onClick={handler}>{count}</button>;
          }
        `);
        expect(code).toContain('count.value = 5');
      });
    });
  });

  describe('Given a signal variable with compound assignment', () => {
    describe('When compiled', () => {
      it('Then inserts .value on += assignment', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const inc = () => { count += 1; };
            return <button onClick={inc}>{count}</button>;
          }
        `);
        expect(code).toContain('count.value += 1');
      });
    });
  });

  describe('Given a signal variable with postfix increment', () => {
    describe('When compiled', () => {
      it('Then inserts .value on the postfix expression', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const inc = () => { count++; };
            return <button onClick={inc}>{count}</button>;
          }
        `);
        expect(code).toContain('count.value++');
      });
    });
  });

  describe('Given a signal variable with prefix increment', () => {
    describe('When compiled', () => {
      it('Then inserts .value on the prefix expression', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const inc = () => { ++count; };
            return <button onClick={inc}>{count}</button>;
          }
        `);
        expect(code).toContain('++count.value');
      });
    });
  });

  describe('Given a signal variable used in shorthand property', () => {
    describe('When compiled', () => {
      it('Then keeps shorthand as-is (Signal object flows through)', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            const obj = { count };
            return <div>{obj}</div>;
          }
        `);
        // Signals must flow as SignalImpl objects through data structures
        // (context values, props) so that consumers can subscribe to changes.
        // Shorthand stays as-is: { count } (NOT { count: count.value }).
        expect(code).toContain('{ count }');
        expect(code).not.toContain('count: count.value');
      });

      it('Then does NOT expand shorthand for non-signal variables', () => {
        const code = compileAndGetCode(`
          function App() {
            const label = 'hello';
            const obj = { label };
            return <div>{obj}</div>;
          }
        `);
        // Non-signal shorthand stays as-is
        expect(code).toContain('{ label }');
        expect(code).not.toContain('label: label.value');
      });

      it('Then does NOT expand shorthand for shadowed signal names', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            const handler = (count) => {
              const obj = { count };
              return obj;
            };
            return <div onClick={handler}>{count}</div>;
          }
        `);
        // Inside the callback, count is shadowed by the parameter
        // The shorthand should NOT be expanded there
        expect(code).toContain('{ count }');
      });
    });
  });

  describe('Given multiple signal variables', () => {
    describe('When compiled', () => {
      it('Then transforms all signals with unique HMR keys', () => {
        const code = compileAndGetCode(`
          function App() {
            let x = 1;
            let y = 2;
            return <div>{x}{y}</div>;
          }
        `);
        expect(code).toContain("signal(1, 'x')");
        expect(code).toContain("signal(2, 'y')");
      });
    });
  });

  describe('Given a signal variable NOT referenced in JSX (static let)', () => {
    describe('When compiled', () => {
      it('Then does NOT wrap in signal()', () => {
        const code = compileAndGetCode(`
          function App() {
            let temp = 0;
            console.log(temp);
            return <div>hello</div>;
          }
        `);
        expect(code).not.toContain('signal(');
        expect(code).toContain('let temp = 0');
      });
    });
  });

  describe('Given a signal variable with spread pattern', () => {
    describe('When compiled', () => {
      it('Then transforms spread correctly with .value', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = ['a'];
            const add = () => { items = [...items, 'b']; };
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.value = [...items.value');
      });
    });
  });

  describe('Given a query() signal API variable', () => {
    describe('When compiled', () => {
      it('Then appends .value on signal property accesses (2-level)', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            const tasks = query(() => fetchTasks());
            const errorMsg = tasks.error ? 'Error' : '';
            return <div>{errorMsg}</div>;
          }
        `);
        expect(code).toContain('tasks.error.value');
      });

      it('Then does NOT append .value on plain property accesses', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            const tasks = query(() => fetchTasks());
            const handler = () => tasks.refetch();
            return <div>{tasks.data}</div>;
          }
        `);
        expect(code).not.toContain('tasks.refetch.value');
      });
    });
  });

  describe('Given a form() with field signal properties (3-level chain)', () => {
    describe('When compiled', () => {
      it('Then appends .value at end of 3-level field chain', () => {
        const code = compileAndGetCode(`
          import { form } from '@vertz/ui';
          function CreateTask() {
            const taskForm = form(() => createTask());
            const titleError = taskForm.title.error;
            return <div>{titleError}</div>;
          }
        `);
        expect(code).toContain('taskForm.title.error.value');
      });
    });
  });

  describe('Given a signal variable shadowed by a callback parameter', () => {
    describe('When compiled', () => {
      it('Then does NOT add .value to the shadowed parameter', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const handler = (count) => { console.log(count); };
            return <div onClick={handler}>{count}</div>;
          }
        `);
        // The count inside the callback refers to the parameter, not the signal
        expect(code).toContain('console.log(count)');
        expect(code).not.toContain('console.log(count.value)');
        // But JSX reference should still get .value (now inside transformed __child)
        expect(code).toContain('count.value');
      });
    });
  });

  describe('Given a signal used in a member expression', () => {
    describe('When compiled', () => {
      it('Then inserts .value on the signal object', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            const str = count.toString();
            return <div>{str}</div>;
          }
        `);
        expect(code).toContain('count.value.toString()');
      });
    });
  });

  describe('Given a signal API property accessed in JSX', () => {
    describe('When compiled', () => {
      it('Then appends .value on signal property in JSX child', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            const tasks = query(() => fetchTasks());
            return <div>{tasks.data}</div>;
          }
        `);
        expect(code).toContain('tasks.data.value');
      });
    });
  });
});
