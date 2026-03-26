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
});
