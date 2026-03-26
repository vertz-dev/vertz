import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { tryLoadNativeCompiler } from '../bun-plugin/native-compiler-loader';

describe('Feature: Native compiler loader', () => {
  const originalEnv = process.env.VERTZ_NATIVE_COMPILER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VERTZ_NATIVE_COMPILER;
    } else {
      process.env.VERTZ_NATIVE_COMPILER = originalEnv;
    }
  });

  describe('Given VERTZ_NATIVE_COMPILER is not set', () => {
    beforeEach(() => {
      delete process.env.VERTZ_NATIVE_COMPILER;
    });

    describe('When tryLoadNativeCompiler() is called', () => {
      it('Then returns null (feature flag not enabled)', () => {
        const compiler = tryLoadNativeCompiler();
        expect(compiler).toBeNull();
      });
    });
  });

  describe('Given VERTZ_NATIVE_COMPILER=1 and the binary exists', () => {
    beforeEach(() => {
      process.env.VERTZ_NATIVE_COMPILER = '1';
    });

    describe('When tryLoadNativeCompiler() is called', () => {
      it('Then returns a compiler with a compile function', () => {
        const compiler = tryLoadNativeCompiler();
        expect(compiler).not.toBeNull();
        expect(typeof compiler!.compile).toBe('function');
      });
    });

    describe('When compile() is called with valid source', () => {
      it('Then returns compiled code', () => {
        const compiler = tryLoadNativeCompiler()!;
        const result = compiler.compile('function App() { return <div>Hello</div>; }', {
          filename: 'test.tsx',
        });
        expect(typeof result.code).toBe('string');
        expect(result.code.length).toBeGreaterThan(0);
      });
    });

    describe('When compile() is called with target option', () => {
      it('Then uses the specified target for imports', () => {
        const compiler = tryLoadNativeCompiler()!;
        const result = compiler.compile(
          'function App() { let count = 0; return <div>{count}</div>; }',
          { filename: 'test.tsx', target: 'tui' },
        );
        expect(result.code).toContain('@vertz/tui/internals');
      });
    });

    describe('When compile() is called with fastRefresh option', () => {
      it('Then injects fast refresh registration when enabled', () => {
        const compiler = tryLoadNativeCompiler()!;
        const result = compiler.compile('function App() { return <div>Hello</div>; }', {
          filename: 'test.tsx',
          fastRefresh: true,
        });
        expect(result.code).toContain('__$refreshReg');
      });

      it('Then does not inject fast refresh when disabled', () => {
        const compiler = tryLoadNativeCompiler()!;
        const result = compiler.compile('function App() { return <div>Hello</div>; }', {
          filename: 'test.tsx',
          fastRefresh: false,
        });
        expect(result.code).not.toContain('__register');
      });
    });
  });

  describe('Given VERTZ_NATIVE_COMPILER=0', () => {
    beforeEach(() => {
      process.env.VERTZ_NATIVE_COMPILER = '0';
    });

    describe('When tryLoadNativeCompiler() is called', () => {
      it('Then returns null (feature flag explicitly disabled)', () => {
        const compiler = tryLoadNativeCompiler();
        expect(compiler).toBeNull();
      });
    });
  });
});
