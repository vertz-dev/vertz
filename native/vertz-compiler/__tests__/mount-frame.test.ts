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

describe('Feature: Mount frame transform', () => {
  describe('Given a component with a single return statement', () => {
    describe('When compiled', () => {
      it('Then wraps body with __pushMountFrame / try-catch / __flushMountFrame', () => {
        const code = compileAndGetCode(
          `function MyComponent() {\n  return <div>Hello</div>;\n}`,
        );
        expect(code).toContain('__pushMountFrame()');
        expect(code).toContain('__flushMountFrame()');
        expect(code).toContain('__discardMountFrame(__mfDepth)');
        expect(code).toContain('const __mfResult0');
        expect(code).toContain('return __mfResult0');
      });

      it('Then generates __mfDepth = __pushMountFrame() and __discardMountFrame(__mfDepth)', () => {
        const code = compileAndGetCode(
          `function MyComponent() {\n  return <div>Hello</div>;\n}`,
        );
        expect(code).toContain('const __mfDepth = __pushMountFrame()');
        expect(code).toContain('__discardMountFrame(__mfDepth)');
      });
    });
  });

  describe('Given a component with multiple return statements', () => {
    describe('When compiled', () => {
      it('Then inserts __flushMountFrame before each return', () => {
        const code = compileAndGetCode(
          `function MyComponent() {\n  if (true) { return <div>A</div>; }\n  return <div>B</div>;\n}`,
        );
        const flushCount = (code.match(/__flushMountFrame\(\)/g) ?? []).length;
        expect(flushCount).toBe(2);
      });

      it('Then uses unique variable names per return (__mfResult0, __mfResult1)', () => {
        const code = compileAndGetCode(
          `function MyComponent() {\n  if (true) { return <div>A</div>; }\n  return <div>B</div>;\n}`,
        );
        expect(code).toContain('__mfResult0');
        expect(code).toContain('__mfResult1');
      });
    });
  });

  describe('Given a braceless if with early return', () => {
    describe('When compiled', () => {
      it('Then wraps the replacement in braces to produce valid JS', () => {
        const code = compileAndGetCode(
          `function MyComponent() {\n  if (true) return <div>A</div>;\n  return <div>B</div>;\n}`,
        );
        // Braceless if should be wrapped in { } for valid JS
        expect(code).toMatch(/if \(.+\) \{ const __mfResult0/);
      });
    });
  });

  describe('Given a bare return statement', () => {
    describe('When compiled', () => {
      it('Then inserts __flushMountFrame before the bare return', () => {
        const code = compileAndGetCode(
          `function MyComponent() {\n  if (true) return;\n  return <div>Content</div>;\n}`,
        );
        const flushCount = (code.match(/__flushMountFrame\(\)/g) ?? []).length;
        expect(flushCount).toBe(2);
      });
    });
  });

  describe('Given an arrow component with expression body', () => {
    describe('When compiled', () => {
      it('Then converts to block body with mount frame wrapping', () => {
        const code = compileAndGetCode(
          `const MyComponent = () => <div>Hello</div>;`,
        );
        expect(code).toContain('__pushMountFrame()');
        expect(code).toContain('__flushMountFrame()');
      });
    });
  });

  describe('Given a component that does NOT use onMount', () => {
    describe('When compiled', () => {
      it('Then still injects mount frame (unconditional)', () => {
        const code = compileAndGetCode(
          `function MyComponent() {\n  return <div>Hello</div>;\n}`,
        );
        expect(code).toContain('__pushMountFrame()');
        expect(code).toContain('__flushMountFrame()');
      });
    });
  });

  describe('Given a file with multiple component functions', () => {
    describe('When compiled', () => {
      it('Then wraps each component independently without corrupting the other', () => {
        const code = compileAndGetCode(`
function Header() {
  return <h1>Header</h1>;
}

function Footer() {
  return <footer>Footer</footer>;
}
        `);
        // Both components should have mount frame wrapping
        const pushCount = (code.match(/__pushMountFrame\(\)/g) ?? []).length;
        expect(pushCount).toBe(2);

        // The output must be valid JS — catch blocks must be INSIDE each function
        const catchCount = (code.match(/catch \(__mfErr\)/g) ?? []).length;
        expect(catchCount).toBe(2);

        // Each function's catch block must appear before its closing brace,
        // not after it (which would produce invalid JS)
        expect(code).not.toMatch(/\}\s*\n\s*\} catch \(__mfErr\)/);
      });
    });
  });

  describe('Given a component with nested function containing return', () => {
    describe('When compiled', () => {
      it('Then does NOT wrap the nested function return', () => {
        const code = compileAndGetCode(`
          function MyComponent() {
            const helper = () => { return 42; };
            return <div>Hello</div>;
          }
        `);
        // Only 1 flush for the component-level return, not the nested one
        const flushCount = (code.match(/__flushMountFrame\(\)/g) ?? []).length;
        expect(flushCount).toBe(1);
      });
    });
  });
});
