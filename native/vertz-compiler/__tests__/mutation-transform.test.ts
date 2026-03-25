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

describe('Feature: Mutation analysis and transform', () => {
  describe('Given a .push() call on a signal array', () => {
    describe('When compiled', () => {
      it('Then wraps with peek/notify pattern', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [];
            const add = () => { items.push('x'); };
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.peek().push');
        expect(code).toContain('items.notify()');
      });
    });
  });

  describe('Given a property assignment on a signal object', () => {
    describe('When compiled', () => {
      it('Then wraps with peek/notify pattern', () => {
        const code = compileAndGetCode(`
          function App() {
            let user = { name: '' };
            const rename = () => { user.name = 'Bob'; };
            return <div>{user}</div>;
          }
        `);
        expect(code).toContain('user.peek().name');
        expect(code).toContain('user.notify()');
      });
    });
  });

  describe('Given an index assignment on a signal array', () => {
    describe('When compiled', () => {
      it('Then wraps with peek/notify pattern', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [1, 2, 3];
            const update = () => { items[0] = 99; };
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.peek()[0]');
        expect(code).toContain('items.notify()');
      });
    });
  });

  describe('Given a delete expression on a signal object', () => {
    describe('When compiled', () => {
      it('Then wraps with peek/notify pattern', () => {
        const code = compileAndGetCode(`
          function App() {
            let config = { debug: true };
            const clean = () => { delete config.debug; };
            return <div>{config}</div>;
          }
        `);
        expect(code).toContain('config.peek().debug');
        expect(code).toContain('config.notify()');
      });
    });
  });

  describe('Given Object.assign on a signal object', () => {
    describe('When compiled', () => {
      it('Then wraps with peek/notify pattern', () => {
        const code = compileAndGetCode(`
          function App() {
            let user = { name: '' };
            const update = () => { Object.assign(user, { name: 'Bob' }); };
            return <div>{user}</div>;
          }
        `);
        expect(code).toContain('Object.assign(user.peek()');
        expect(code).toContain('user.notify()');
      });
    });
  });

  describe('Given a self-referential mutation', () => {
    describe('When compiled', () => {
      it('Then transforms all references to use peek()', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [];
            const add = () => { items.push(items.length); };
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.peek().push(items.peek().length)');
      });
    });
  });

  describe('Given multiple array mutation methods', () => {
    describe('When compiled', () => {
      it('Then transforms .pop() with peek/notify', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [1, 2];
            const remove = () => { items.pop(); };
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.peek().pop()');
        expect(code).toContain('items.notify()');
      });

      it('Then transforms .splice() with peek/notify', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [1, 2, 3];
            const remove = () => { items.splice(1, 1); };
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.peek().splice(1, 1)');
        expect(code).toContain('items.notify()');
      });

      it('Then transforms .sort() with peek/notify', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [3, 1, 2];
            const doSort = () => { items.sort(); };
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.peek().sort()');
        expect(code).toContain('items.notify()');
      });

      it('Then transforms .reverse() with peek/notify', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [1, 2, 3];
            const doReverse = () => { items.reverse(); };
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.peek().reverse()');
        expect(code).toContain('items.notify()');
      });
    });
  });

  describe('Given a mutation inside an expression-body arrow', () => {
    describe('When compiled', () => {
      it('Then transforms the mutation correctly', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [];
            const add = () => items.push('x');
            return <div>{items}</div>;
          }
        `);
        expect(code).toContain('items.peek().push');
        expect(code).toContain('items.notify()');
      });
    });
  });

  describe('Given a variable with a similar name to a signal', () => {
    describe('When compiled', () => {
      it('Then does NOT transform unrelated variables', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [];
            const add = () => { items.push('x'); };
            const myitems = [1, 2, 3];
            console.log(myitems.length);
            return <div>{items}</div>;
          }
        `);
        // myitems should NOT be transformed
        expect(code).toContain('myitems.length');
        expect(code).not.toContain('myitems.peek()');
      });
    });
  });
});
