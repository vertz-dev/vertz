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

describe('Feature: SSR safety diagnostics', () => {
  describe('Given a component using browser-only globals at top level', () => {
    describe('When compiled', () => {
      it('Then produces a diagnostic for localStorage', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const theme = localStorage.getItem('theme');
  return <div>{theme}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics!.length).toBeGreaterThanOrEqual(1);
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('localStorage'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('ssr-unsafe-api');
        expect(diag!.line).toBe(2);
      });
    });
  });

  describe('Given a component using browser-only global inside onMount callback', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  onMount(() => {
    localStorage.getItem('theme');
  });
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a component using browser-only global inside typeof guard', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  if (typeof localStorage !== 'undefined') {
    localStorage.getItem('theme');
  }
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a direct typeof operand', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const hasStorage = typeof localStorage !== 'undefined';
  return <div>{String(hasStorage)}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a component using document.querySelector at top level', () => {
    describe('When compiled', () => {
      it('Then produces a diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const el = document.querySelector('.app');
  return <div>{el?.textContent}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('document.querySelector'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('ssr-unsafe-api');
        expect(diag!.line).toBe(2);
      });
    });
  });

  describe('Given a component using document.querySelector inside callback', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const handleClick = () => {
    document.querySelector('.app');
  };
  return <div onClick={handleClick}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a component using multiple browser-only APIs', () => {
    describe('When compiled', () => {
      it('Then produces multiple diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const theme = localStorage.getItem('theme');
  navigator.userAgent;
  return <div>{theme}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const ssrDiags = result.diagnostics!.filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBeGreaterThanOrEqual(2);
        expect(ssrDiags.some((d) => d.message.includes('localStorage'))).toBe(
          true,
        );
        expect(ssrDiags.some((d) => d.message.includes('navigator'))).toBe(
          true,
        );
      });
    });
  });

  describe('Given a component with no browser-only APIs', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const msg = 'Hello';
  return <div>{msg}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a non-component file', () => {
    describe('When compiled', () => {
      it('Then produces no SSR safety diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `const theme = localStorage.getItem('theme');
export default theme;`;
        const result = compile(source, { filename: 'src/utils.ts' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a component using browser-only global inside event handler arrow function', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  return <button onClick={() => { requestAnimationFrame(() => {}); }}>Click</button>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a component using browser-only global inside ternary typeof guard', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const theme = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : 'default';
  return <div>{theme}</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a component using browser-only global inside logical AND typeof guard', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  typeof localStorage !== 'undefined' && localStorage.setItem('x', '1');
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a component using typeof window guard', () => {
    describe('When compiled', () => {
      it('Then suppresses all browser globals inside the guard', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  if (typeof window !== 'undefined') {
    localStorage.getItem('theme');
  }
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(0);
      });
    });
  });

  describe('Given a typeof guard for one global does not protect another', () => {
    describe('When compiled', () => {
      it('Then flags the unprotected global', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  if (typeof localStorage !== 'undefined') {
    navigator.userAgent;
  }
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const ssrDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('ssr-unsafe-api'),
        );
        expect(ssrDiags.length).toBe(1);
        expect(ssrDiags[0].message).toContain('navigator');
      });
    });
  });
});
