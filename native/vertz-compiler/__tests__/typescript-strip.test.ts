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

describe('Feature: TypeScript syntax stripping', () => {
  describe('Given an interface declaration', () => {
    describe('When compiled', () => {
      it('Then strips the interface from output', () => {
        const code = compileAndGetCode(`
          interface Props {
            name: string;
            onClick: () => void;
          }

          function Greeting({ name }: Props) {
            return <div>{name}</div>;
          }
        `);

        expect(code).not.toContain('interface');
        expect(code).not.toContain('name: string');
        // The component should still compile
        expect(code).toContain('Greeting');
      });
    });
  });

  describe('Given type parameters on a function call', () => {
    describe('When compiled', () => {
      it('Then strips type parameters from the call', () => {
        const code = compileAndGetCode(`
          function ProductPage() {
            const { id } = useParams<'/products/:id'>();
            return <div>{id}</div>;
          }
        `);

        expect(code).not.toContain("<'/products/:id'>");
        expect(code).toContain('useParams(');
      });
    });
  });

  describe('Given an as type assertion', () => {
    describe('When compiled', () => {
      it('Then strips the as expression from output', () => {
        const code = compileAndGetCode(`
          function SearchBox() {
            let query = '';
            return <input onInput={(e) => { query = (e.target as HTMLInputElement).value; }} />;
          }
        `);

        expect(code).not.toContain('as HTMLInputElement');
        expect(code).toContain('e.target');
      });
    });
  });

  describe('Given a type alias declaration', () => {
    describe('When compiled', () => {
      it('Then strips the type alias from output', () => {
        const code = compileAndGetCode(`
          type Status = 'active' | 'inactive';

          function StatusBadge() {
            let status: Status = 'active';
            return <div>{status}</div>;
          }
        `);

        expect(code).not.toContain("type Status");
        expect(code).not.toContain("'active' | 'inactive'");
      });
    });
  });

  describe('Given type annotations on function parameters', () => {
    describe('When compiled', () => {
      it('Then strips parameter type annotations', () => {
        const code = compileAndGetCode(`
          function Counter() {
            let count = 0;
            const increment = (amount: number) => { count += amount; };
            return <button onClick={() => increment(1)}>{count}</button>;
          }
        `);

        // The type annotation `: number` should be stripped
        expect(code).not.toContain(': number');
      });
    });
  });

  describe('Given a return type annotation', () => {
    describe('When compiled', () => {
      it('Then strips the return type', () => {
        const code = compileAndGetCode(`
          function getLabel(): string {
            return 'hello';
          }

          function App() {
            return <div>{getLabel()}</div>;
          }
        `);

        expect(code).not.toContain('): string');
      });
    });
  });

  describe('Given a non-null assertion', () => {
    describe('When compiled', () => {
      it('Then strips the ! operator', () => {
        const code = compileAndGetCode(`
          function App() {
            const el = document.getElementById('root')!;
            return <div />;
          }
        `);

        // The non-null assertion should be removed
        expect(code).not.toMatch(/getElementById\('root'\)!/);
      });
    });
  });

  describe('Given type-only imports', () => {
    describe('When compiled', () => {
      it('Then strips type-only import declarations', () => {
        const code = compileAndGetCode(`
          import type { FC } from 'react';

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain("import type");
        expect(code).not.toContain("from 'react'");
      });
    });
  });

  describe('Given mixed type and value imports', () => {
    describe('When compiled', () => {
      it('Then strips only the type specifier', () => {
        const code = compileAndGetCode(`
          import { type FC, useState } from 'some-lib';

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('type FC');
        expect(code).toContain('useState');
        expect(code).toContain("from 'some-lib'");
      });
    });
  });

  describe('Given all-type named import specifiers', () => {
    describe('When compiled', () => {
      it('Then removes the entire import declaration', () => {
        const code = compileAndGetCode(`
          import { type A, type B } from 'lib';

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain("from 'lib'");
        expect(code).not.toContain('type A');
        expect(code).not.toContain('type B');
      });

      it('Then keeps import with default specifier when named are all type', () => {
        const code = compileAndGetCode(`
          import Lib, { type A } from 'lib';

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('type A');
        expect(code).not.toContain('{ }');
        expect(code).not.toContain('{  }');
        expect(code).toContain('Lib');
        expect(code).toContain("from 'lib'");
      });
    });
  });

  describe('Given declare statements', () => {
    describe('When compiled', () => {
      it('Then strips declare const', () => {
        const code = compileAndGetCode(`
          declare const foo: string;

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('declare');
        expect(code).not.toContain('foo');
      });

      it('Then strips declare function', () => {
        const code = compileAndGetCode(`
          declare function bar(): void;

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('declare');
        expect(code).not.toContain('bar');
      });

      it('Then strips declare class', () => {
        const code = compileAndGetCode(`
          declare class Baz {}

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('declare');
        expect(code).not.toContain('Baz');
      });

      it('Then strips declare module', () => {
        const code = compileAndGetCode(`
          declare module "foo" {
            export function hello(): void;
          }

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('declare module');
      });

      it('Then strips declare enum', () => {
        const code = compileAndGetCode(`
          declare enum Color { Red, Green, Blue }

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('declare enum');
        expect(code).not.toContain('Color');
      });

      it('Then strips export declare const', () => {
        const code = compileAndGetCode(`
          export declare const x: number;

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('declare');
        expect(code).not.toMatch(/export\s+declare/);
      });

      it('Then preserves non-declare namespace with runtime code', () => {
        const code = compileAndGetCode(`
          namespace Utils {
            export function add(a: number, b: number) { return a + b; }
          }

          function App() {
            return <div>hello</div>;
          }
        `);

        // Runtime namespace must NOT be stripped
        expect(code).toContain('Utils');
      });

      it('Then preserves non-declare enum', () => {
        const code = compileAndGetCode(`
          enum Direction { Up, Down, Left, Right }

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).toContain('Direction');
      });
    });
  });

  describe('Given signal .value interaction with TS expression wrappers', () => {
    describe('When compiled', () => {
      it('Then preserves .value through as expression', () => {
        const code = compileAndGetCode(`
          function App() {
            let x = 0;
            const y = x as number;
            return <div>{y}</div>;
          }
        `);

        expect(code).toContain('x.value');
        expect(code).not.toContain('as number');
      });

      it('Then preserves .value through non-null assertion', () => {
        const code = compileAndGetCode(`
          function App() {
            let x = 0;
            const y = x!;
            return <div>{y}</div>;
          }
        `);

        expect(code).toContain('x.value');
        expect(code).not.toMatch(/x\.value!/);
      });

      it('Then preserves .value through satisfies expression', () => {
        const code = compileAndGetCode(`
          function App() {
            let x = 0;
            const y = x satisfies number;
            return <div>{y}</div>;
          }
        `);

        expect(code).toContain('x.value');
        expect(code).not.toContain('satisfies');
      });
    });
  });

  // ─── F-12: export type stripping ──────────────────────────────────────────

  describe('Given export type { ... } re-exports', () => {
    describe('When compiled', () => {
      it('Then strips export type { Foo }', () => {
        const code = compileAndGetCode(`
          export type { Foo };

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('export type');
        expect(code).not.toContain('Foo');
      });

      it('Then strips export type { Foo } from source', () => {
        const code = compileAndGetCode(`
          export type { Foo } from './types';

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('export type');
        expect(code).not.toContain('Foo');
        expect(code).not.toContain('./types');
      });

      it('Then strips individual type specifiers from mixed exports', () => {
        const code = compileAndGetCode(`
          export { type Foo, bar } from './module';

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('Foo');
        expect(code).toContain('bar');
        expect(code).toContain("'./module'");
      });

      it('Then strips all-type specifier exports entirely', () => {
        const code = compileAndGetCode(`
          export { type Foo, type Bar } from './types';

          function App() {
            return <div>hello</div>;
          }
        `);

        expect(code).not.toContain('Foo');
        expect(code).not.toContain('Bar');
        expect(code).not.toContain('./types');
      });
    });
  });
});
