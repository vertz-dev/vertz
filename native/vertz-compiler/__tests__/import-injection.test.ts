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

describe('Feature: Import injection', () => {
  describe('Given a component using signals and elements', () => {
    describe('When compiled', () => {
      it('Then includes signal import from @vertz/ui', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  let count = 0;
  return <div>{count}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.code).toContain("import { signal } from '@vertz/ui';");
      });

      it('Then includes DOM helper imports from @vertz/ui/internals', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  let count = 0;
  return <div>{count}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.code).toContain("from '@vertz/ui/internals';");
        expect(result.code).toContain('__element');
      });
    });
  });

  describe('Given a component with computed values', () => {
    describe('When compiled', () => {
      it('Then includes both signal and computed imports', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  let count = 0;
  const doubled = count * 2;
  return <div>{doubled}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.code).toContain('signal');
        expect(result.code).toContain('computed');
        expect(result.code).toContain("from '@vertz/ui'");
      });
    });
  });

  describe('Given a component with event handlers', () => {
    describe('When compiled', () => {
      it('Then includes __on in DOM imports', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  return <button onClick={() => {}}>Click</button>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.code).toContain('__on');
      });
    });
  });

  describe('Given a source file with no components', () => {
    describe('When compiled', () => {
      it('Then does not inject any imports', () => {
        const { compile } = loadCompiler();
        const source = 'const x = 1; export default x;';
        const result = compile(source, { filename: 'src/utils.ts' });
        expect(result.code).not.toContain("import {");
      });
    });
  });

  describe('Given imports are sorted alphabetically', () => {
    describe('When compiled', () => {
      it('Then DOM helpers are in alphabetical order', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  let count = 0;
  return <div onClick={() => {}}>{count}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        // Extract the internals import
        const internalsMatch = result.code.match(/import \{ ([^}]+) \} from '@vertz\/ui\/internals'/);
        expect(internalsMatch).toBeTruthy();
        const imports = internalsMatch![1].split(', ');
        const sorted = [...imports].sort();
        expect(imports).toEqual(sorted);
      });
    });
  });

  describe('Given a component with conditional rendering', () => {
    describe('When compiled', () => {
      it('Then includes __conditional in imports', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  let show = true;
  return <div>{show ? <span>Yes</span> : <span>No</span>}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.code).toContain('__conditional');
      });
    });
  });

  describe('Given a component with list rendering', () => {
    describe('When compiled', () => {
      it('Then includes __list in imports', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const items = [1, 2, 3];
  return <ul>{items.map(i => <li>{i}</li>)}</ul>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.code).toContain('__list');
      });
    });
  });

  describe('Given mount frame is used', () => {
    describe('When compiled', () => {
      it('Then includes mount frame helpers in imports', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.code).toContain('__pushMountFrame');
        expect(result.code).toContain('__flushMountFrame');
      });
    });
  });

  describe('Given target is tui', () => {
    describe('When compiled', () => {
      it('Then imports from @vertz/tui/internals instead', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx', target: 'tui' });
        expect(result.code).toContain("from '@vertz/tui/internals'");
        expect(result.code).not.toContain("from '@vertz/ui/internals'");
      });
    });
  });

  describe('Given imports are placed before transformed code', () => {
    describe('When compiled', () => {
      it('Then import statements appear at the top of the output', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  let count = 0;
  return <div>{count}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const lines = result.code.split('\n');
        // After the "// compiled by vertz-native" line, imports should come first
        const importLineIndex = lines.findIndex(l => l.startsWith('import'));
        const functionLineIndex = lines.findIndex(l => l.includes('function App'));
        expect(importLineIndex).toBeLessThan(functionLineIndex);
      });
    });
  });
});
