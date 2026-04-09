/**
 * Bun test preload — mocks unavailable modules so tests don't crash
 * on CI or local environments missing platform binaries / workspace deps.
 *
 * 1. Native compiler: mocked when the platform binary isn't available.
 *    Tests that need real compilation use `describe.skipIf(!hasNativeCompiler)`.
 *
 * 2. @vertz/ui-auth: mocked when the package can't be resolved (circular
 *    workspace dep — ui-auth depends on ui-server, so it's not in devDeps).
 *
 * Added to bunfig.toml [test].preload.
 */
import { mock } from 'bun:test';

// ── Native compiler availability ────────────────────────────────

let nativeCompilerAvailable = false;
try {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const binaryName = `vertz-compiler.${platform}-${arch}.node`;
  require.resolve(`@vertz/native-compiler/${binaryName}`);
  nativeCompilerAvailable = true;
} catch {
  // Binary not available — mock the module
}

// Export for tests to use with describe.skipIf
(globalThis as Record<string, unknown>).__NATIVE_COMPILER_AVAILABLE__ = nativeCompilerAvailable;

if (!nativeCompilerAvailable) {
  const mockImpl = () => ({
    compile(source: string) {
      return { code: source, css: undefined, map: undefined, diagnostics: [] };
    },

    compileForSsrAot(source: string) {
      const components: Array<{
        name: string;
        tier: string;
        holes: string[];
        queryKeys: string[];
        code: string;
      }> = [];
      const fnRegex = /export\s+function\s+(\w+)\s*\(([^)]*)\)/g;
      let match;
      while ((match = fnRegex.exec(source)) !== null) {
        const name = match[1]!;
        const params = match[2]!.trim();
        const body = source.slice(match.index);

        let tier: string;
        if (body.includes('try') && body.includes('catch')) {
          tier = 'runtime-fallback';
        } else if (params.length > 0) {
          tier = 'data-driven';
        } else {
          tier = 'static';
        }

        components.push({ name, tier, holes: [], queryKeys: [], code: '' });
      }

      if (components.length === 0 && source.trim().length > 0) {
        throw new Error('Mock: no exported components found');
      }

      return { code: source, components };
    },

    loadNativeCompiler() {
      throw new Error(
        'Native compiler binary not available (mock). ' +
          'Tests that need the real compiler should use describe.skipIf.',
      );
    },

    tryLoadNativeCompiler() {
      return null;
    },
  });

  mock.module('../compiler/native-compiler', mockImpl);
  mock.module('./compiler/native-compiler', mockImpl);
}

// ── @vertz/ui-auth availability ──────────────────────────────────
// Circular workspace dep: ui-auth depends on ui-server, so it can't
// be in devDeps. Mock it when the package isn't resolvable (CI).

let uiAuthAvailable = false;
try {
  require.resolve('@vertz/ui-auth');
  uiAuthAvailable = true;
} catch {
  // Package not available
}

if (!uiAuthAvailable) {
  mock.module('@vertz/ui-auth', () => ({
    ProtectedRoute({ children }: { children?: (() => unknown) | unknown }) {
      const span = document.createElement('span');
      span.style.display = 'contents';
      if (typeof children === 'function') {
        const result = children();
        if (result instanceof Node) span.appendChild(result);
      }
      return span;
    },
  }));
}
