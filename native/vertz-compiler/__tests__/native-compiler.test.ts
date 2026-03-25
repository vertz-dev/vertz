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
    ) => { code: string; map?: string; diagnostics?: Array<{ message: string; line?: number; column?: number }> };
  };
}

describe('Feature: Native compiler NAPI binding', () => {
  describe('Given a TypeScript source string', () => {
    describe('When compile() is called via the NAPI binding', () => {
      it('Then returns transformed code as a string', () => {
        const { compile } = loadCompiler();
        const result = compile('const x = 1;', { filename: 'test.ts' });
        expect(result.code).toContain('// compiled by vertz-native');
        expect(typeof result.code).toBe('string');
      });

      it('Then preserves the original source content', () => {
        const { compile } = loadCompiler();
        const result = compile('const x = 1;', { filename: 'test.ts' });
        expect(result.code).toContain('const x = 1;');
      });
    });
  });

  describe('Given a TSX source string', () => {
    describe('When compile() is called', () => {
      it('Then parses and returns the source with the comment header', () => {
        const { compile } = loadCompiler();
        const source = 'function App() { return <div>Hello</div>; }';
        const result = compile(source, { filename: 'App.tsx' });
        expect(result.code).toContain('// compiled by vertz-native');
        expect(typeof result.code).toBe('string');
      });
    });
  });

  describe('Given invalid syntax', () => {
    describe('When compile() is called', () => {
      it('Then returns diagnostics with line/column info', () => {
        const { compile } = loadCompiler();
        const result = compile('const = ;', { filename: 'bad.ts' });
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics!.length).toBeGreaterThan(0);
        expect(result.diagnostics![0].line).toBeDefined();
        expect(result.diagnostics![0].column).toBeDefined();
        expect(typeof result.diagnostics![0].message).toBe('string');
      });
    });
  });

  describe('Given valid source with no options', () => {
    describe('When compile() is called without options', () => {
      it('Then still returns valid result', () => {
        const { compile } = loadCompiler();
        const result = compile('const x = 1;');
        expect(result.code).toContain('// compiled by vertz-native');
        expect(typeof result.code).toBe('string');
      });
    });
  });

  describe('Given source with a source map request', () => {
    describe('When compile() is called with a filename', () => {
      it('Then returns a source map string', () => {
        const { compile } = loadCompiler();
        const result = compile('const x = 1;', { filename: 'test.ts' });
        expect(result.map).toBeDefined();
        expect(typeof result.map).toBe('string');
        const map = JSON.parse(result.map!);
        expect(map.version).toBe(3);
        expect(map.sources).toContain('test.ts');
      });
    });
  });
});
