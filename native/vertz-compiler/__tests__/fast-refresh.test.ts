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
      options?: { filename?: string; fastRefresh?: boolean },
    ) => {
      code: string;
      map?: string;
      diagnostics?: Array<{ message: string; line?: number; column?: number }>;
    };
  };
}

describe('Feature: Fast Refresh registration', () => {
  describe('Given a component function', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then injects preamble with module ID', () => {
        const { compile } = loadCompiler();
        const source = 'function TaskCard() { return <div />; }';
        const result = compile(source, { filename: 'src/TaskCard.tsx', fastRefresh: true });
        expect(result.code).toContain("const __$fr = globalThis[Symbol.for('vertz:fast-refresh')]");
        expect(result.code).toContain("const __$moduleId = 'src/TaskCard.tsx'");
      });

      it('Then generates per-component wrapper', () => {
        const { compile } = loadCompiler();
        const source = 'function TaskCard() { return <div />; }';
        const result = compile(source, { filename: 'src/TaskCard.tsx', fastRefresh: true });
        expect(result.code).toContain('const __$orig_TaskCard = TaskCard');
        expect(result.code).toContain('TaskCard = function(...__$args)');
        expect(result.code).toContain('__$refreshTrack(__$moduleId');
      });

      it('Then generates registration call with component hash', () => {
        const { compile } = loadCompiler();
        const source = 'function TaskCard() { return <div />; }';
        const result = compile(source, { filename: 'src/TaskCard.tsx', fastRefresh: true });
        expect(result.code).toContain("__$refreshReg(__$moduleId, 'TaskCard', TaskCard,");
      });

      it('Then generates epilogue with perform call', () => {
        const { compile } = loadCompiler();
        const source = 'function TaskCard() { return <div />; }';
        const result = compile(source, { filename: 'src/TaskCard.tsx', fastRefresh: true });
        expect(result.code).toContain('__$refreshPerform(__$moduleId)');
      });
    });
  });

  describe('Given multiple components in one file', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then generates individual wrappers for each component', () => {
        const { compile } = loadCompiler();
        const source = [
          'function Header() { return <header />; }',
          'function Footer() { return <footer />; }',
        ].join('\n');
        const result = compile(source, { filename: 'src/Layout.tsx', fastRefresh: true });
        expect(result.code).toContain('const __$orig_Header = Header');
        expect(result.code).toContain('const __$orig_Footer = Footer');
        expect(result.code).toContain("__$refreshReg(__$moduleId, 'Header', Header,");
        expect(result.code).toContain("__$refreshReg(__$moduleId, 'Footer', Footer,");
        // Only one preamble
        const preambleMatches = result.code.match(/__\$moduleId/g);
        expect(preambleMatches!.length).toBeGreaterThan(1);
      });
    });
  });

  describe('Given a component function', () => {
    describe('When compiled WITHOUT fastRefresh', () => {
      it('Then does NOT inject any Fast Refresh code', () => {
        const { compile } = loadCompiler();
        const source = 'function TaskCard() { return <div />; }';
        const result = compile(source, { filename: 'src/TaskCard.tsx' });
        expect(result.code).not.toContain('__$refreshReg');
        expect(result.code).not.toContain('__$moduleId');
        expect(result.code).not.toContain('__$refreshPerform');
      });
    });
  });

  describe('Given a source file with no components', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then does NOT inject any Fast Refresh code', () => {
        const { compile } = loadCompiler();
        const source = 'const x = 1; export default x;';
        const result = compile(source, { filename: 'src/utils.ts', fastRefresh: true });
        expect(result.code).not.toContain('__$refreshReg');
        expect(result.code).not.toContain('__$refreshPerform');
      });
    });
  });

  describe('Given a component with changed code', () => {
    describe('When compiled twice with different body content', () => {
      it('Then produces different component hashes', () => {
        const { compile } = loadCompiler();
        const source1 = 'function App() { return <div>Hello</div>; }';
        const source2 = 'function App() { return <div>World</div>; }';
        const result1 = compile(source1, { filename: 'src/App.tsx', fastRefresh: true });
        const result2 = compile(source2, { filename: 'src/App.tsx', fastRefresh: true });
        // Extract the hash from __$refreshReg calls
        const hash1 = result1.code.match(/__\$refreshReg\(__\$moduleId, 'App', App, '([^']+)'\)/)?.[1];
        const hash2 = result2.code.match(/__\$refreshReg\(__\$moduleId, 'App', App, '([^']+)'\)/)?.[1];
        expect(hash1).toBeDefined();
        expect(hash2).toBeDefined();
        expect(hash1).not.toBe(hash2);
      });
    });
  });

  describe('Given a component wrapper', () => {
    describe('When generated', () => {
      it('Then includes scope management calls', () => {
        const { compile } = loadCompiler();
        const source = 'function TaskCard() { return <div />; }';
        const result = compile(source, { filename: 'src/TaskCard.tsx', fastRefresh: true });
        expect(result.code).toContain('__$pushScope()');
        expect(result.code).toContain('__$getCtx()');
        expect(result.code).toContain('__$startSigCol()');
        expect(result.code).toContain('__$stopSigCol()');
        expect(result.code).toContain('__$popScope()');
      });
    });
  });

  describe('Given a preamble', () => {
    describe('When generated', () => {
      it('Then includes no-op defaults for all runtime functions', () => {
        const { compile } = loadCompiler();
        const source = 'function App() { return <div />; }';
        const result = compile(source, { filename: 'src/App.tsx', fastRefresh: true });
        expect(result.code).toContain('__$refreshReg = () => {}');
        expect(result.code).toContain('__$refreshPerform = () => {}');
        expect(result.code).toContain('pushScope: __$pushScope = () => []');
        expect(result.code).toContain('popScope: __$popScope = () => {}');
      });
    });
  });
});
