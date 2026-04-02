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

describe('Feature: Mutation diagnostics', () => {
  describe('Given a const array mutated with push and referenced in JSX', () => {
    describe('When compiled', () => {
      it('Then produces a non-reactive-mutation diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const items = [1, 2, 3];
  items.push(4);
  return <div>{items.length}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('non-reactive-mutation'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('push');
        expect(diag!.message).toContain('items');
      });
    });
  });

  describe('Given a let array mutated with push and referenced in JSX', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic (let = reactive)', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  let items = [1, 2, 3];
  items.push(4);
  return <div>{items.length}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const mutDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('non-reactive-mutation'),
        );
        expect(mutDiags.length).toBe(0);
      });
    });
  });

  describe('Given a const array mutated but NOT referenced in JSX', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const items = [1, 2, 3];
  items.push(4);
  return <div>hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const mutDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('non-reactive-mutation'),
        );
        expect(mutDiags.length).toBe(0);
      });
    });
  });

  describe('Given a const array referenced in JSX but NOT mutated', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const items = [1, 2, 3];
  return <div>{items.length}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const mutDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('non-reactive-mutation'),
        );
        expect(mutDiags.length).toBe(0);
      });
    });
  });

  describe('Given a const object with property assignment and referenced in JSX', () => {
    describe('When compiled', () => {
      it('Then produces a non-reactive-mutation diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const obj = { name: 'test' };
  obj.name = 'updated';
  return <div>{obj.name}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('non-reactive-mutation'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('obj');
      });
    });
  });

  describe('Given a const array mutated with sort and referenced in JSX', () => {
    describe('When compiled', () => {
      it('Then produces a non-reactive-mutation diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const items = [3, 1, 2];
  items.sort();
  return <ul>{items.map(i => <li>{i}</li>)}</ul>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('non-reactive-mutation'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('sort');
      });
    });
  });

  describe('Given no mutations in component', () => {
    describe('When compiled', () => {
      it('Then produces no mutation diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const msg = 'Hello';
  return <div>{msg}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const mutDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('non-reactive-mutation'),
        );
        expect(mutDiags.length).toBe(0);
      });
    });
  });
});
