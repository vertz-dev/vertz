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
      options?: { filename?: string; fastRefresh?: boolean; target?: string },
    ) => {
      code: string;
      css?: string;
      map?: string;
      diagnostics?: Array<{ message: string; line?: number; column?: number }>;
    };
  };
}

describe('Feature: Body JSX diagnostics', () => {
  describe('Given a component with JSX outside the return tree', () => {
    describe('When compiled', () => {
      it('Then produces a jsx-outside-tree diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const el = <div>hi</div>;
  return <span>hello</span>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('jsx-outside-tree'),
        );
        expect(diag).toBeDefined();
        expect(diag!.line).toBe(2);
      });
    });
  });

  describe('Given a component with JSX only in the return statement', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  return <div>hi</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const jsxDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('jsx-outside-tree'),
        );
        expect(jsxDiags.length).toBe(0);
      });
    });
  });

  describe('Given a component with JSX inside an arrow function', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic (deferred execution)', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const render = () => <div>hi</div>;
  return <span>{render()}</span>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const jsxDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('jsx-outside-tree'),
        );
        expect(jsxDiags.length).toBe(0);
      });
    });
  });

  describe('Given nested JSX outside return tree', () => {
    describe('When compiled', () => {
      it('Then produces only ONE diagnostic for outermost JSX', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const el = <div><span>nested</span></div>;
  return <p>hello</p>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const jsxDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('jsx-outside-tree'),
        );
        expect(jsxDiags.length).toBe(1);
      });
    });
  });

  describe('Given a component with no JSX at all', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function helper() {
  return 'hello';
}`;
        const result = compile(source, { filename: 'src/helper.ts' });
        const jsxDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('jsx-outside-tree'),
        );
        expect(jsxDiags.length).toBe(0);
      });
    });
  });

  describe('Given a non-component file', () => {
    describe('When compiled', () => {
      it('Then produces no JSX diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `const x = 42; export default x;`;
        const result = compile(source, { filename: 'src/utils.ts' });
        const jsxDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('jsx-outside-tree'),
        );
        expect(jsxDiags.length).toBe(0);
      });
    });
  });

  describe('Given multiple body-level JSX nodes', () => {
    describe('When compiled', () => {
      it('Then produces multiple diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const a = <div>a</div>;
  const b = <span>b</span>;
  return <p>hello</p>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const jsxDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('jsx-outside-tree'),
        );
        expect(jsxDiags.length).toBe(2);
      });
    });
  });

  describe('Given JSX inside a function expression', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const render = function() { return <div>hi</div>; };
  return <span>{render()}</span>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const jsxDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('jsx-outside-tree'),
        );
        expect(jsxDiags.length).toBe(0);
      });
    });
  });
});
