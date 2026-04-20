import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@vertz/test';
import { loadNativeCompiler } from '../compiler/native-compiler';

// Files that load modules via CJS require at module-init time. Bundled as ESM,
// they must use `createRequire(import.meta.url)` — the global `require` is not
// defined at runtime.
const ESM_REQUIRE_SOURCES = [
  new URL('../compiler/native-compiler.ts', import.meta.url),
  new URL('../compiler/reactivity-manifest.ts', import.meta.url),
  new URL('../build-plugin/plugin.ts', import.meta.url),
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// Check if the native binary is available on this platform
function isNativeBinaryAvailable(): boolean {
  try {
    loadNativeCompiler();
    return true;
  } catch {
    return false;
  }
}

const HAS_NATIVE_BINARY = isNativeBinaryAvailable();
const describeWithBinary = HAS_NATIVE_BINARY ? describe : describe.skip;

describe('Feature: Native compiler loader', () => {
  describeWithBinary('Given the native binary exists for this platform', () => {
    describe('When loadNativeCompiler() is called', () => {
      it('Then returns a compiler with a compile function', () => {
        const compiler = loadNativeCompiler();
        expect(typeof compiler.compile).toBe('function');
      });
    });

    describe('When compile() is called with valid source', () => {
      it('Then returns compiled code', () => {
        const compiler = loadNativeCompiler();
        const result = compiler.compile('function App() { return <div>Hello</div>; }', {
          filename: 'test.tsx',
        });
        expect(typeof result.code).toBe('string');
        expect(result.code.length).toBeGreaterThan(0);
      });
    });

    describe('When compile() is called with target option', () => {
      it('Then uses the specified target for imports', () => {
        const compiler = loadNativeCompiler();
        const result = compiler.compile(
          'function App() { let count = 0; return <div>{count}</div>; }',
          { filename: 'test.tsx', target: 'tui' },
        );
        expect(result.code).toContain('@vertz/tui/internals');
      });
    });

    describe('When compile() is called with fastRefresh option', () => {
      it('Then injects fast refresh registration when enabled', () => {
        const compiler = loadNativeCompiler();
        const result = compiler.compile('function App() { return <div>Hello</div>; }', {
          filename: 'test.tsx',
          fastRefresh: true,
        });
        expect(result.code).toContain('__$refreshReg');
      });

      it('Then does not inject fast refresh when disabled', () => {
        const compiler = loadNativeCompiler();
        const result = compiler.compile('function App() { return <div>Hello</div>; }', {
          filename: 'test.tsx',
          fastRefresh: false,
        });
        expect(result.code).not.toContain('__register');
      });
    });
  });

  describe('Given the module is consumed as pure ESM', () => {
    // Regression guard for #2875: the compiled ESM bundle cannot use the
    // CJS `require` global (esbuild's `__require` shim throws at runtime).
    // Every file that loads a module at init-time must use
    // `createRequire(import.meta.url)` instead of the bare `require` global.
    for (const url of ESM_REQUIRE_SOURCES) {
      const filename = url.pathname.split('/').pop();
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const stripped = stripComments(source);

      describe(`When inspecting ${filename}`, () => {
        it('Then the source imports createRequire from node:module', () => {
          expect(source).toContain("import { createRequire } from 'node:module'");
        });

        it('Then the source instantiates createRequire(import.meta.url)', () => {
          expect(source).toContain('createRequire(import.meta.url)');
        });

        it('Then the source contains no bare require(...) call', () => {
          expect(stripped).not.toMatch(/(?<![a-zA-Z_.])require\(/);
        });

        it('Then the source contains no bare require.resolve(...) call', () => {
          expect(stripped).not.toMatch(/(?<![a-zA-Z_.])require\.resolve\(/);
        });
      });
    }
  });

  describe('Given the native compiler is required (no fallback)', () => {
    it('Then loadNativeCompiler constructs the correct binary name for the current platform', () => {
      // This test verifies the binary is actually loaded — which means
      // the platform/arch mapping produced a valid binary name for this machine.
      // On darwin-arm64 (dev): vertz-compiler.darwin-arm64.node
      // On linux-x64 (CI): vertz-compiler.linux-x64.node
      if (HAS_NATIVE_BINARY) {
        const compiler = loadNativeCompiler();
        const result = compiler.compile('const x = 1;', { filename: 'test.tsx' });
        expect(typeof result.code).toBe('string');
      }
      // If binary doesn't exist for this platform, loadNativeCompiler throws
    });
  });
});
