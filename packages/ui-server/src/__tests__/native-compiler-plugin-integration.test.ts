/**
 * Tests for native compiler integration with the Bun plugin.
 *
 * Verifies that the plugin correctly uses the native Rust compiler
 * when VERTZ_NATIVE_COMPILER=1 is set, and falls back to ts-morph otherwise.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tryLoadNativeCompiler } from '../bun-plugin/native-compiler-loader';
import { createVertzBunPlugin } from '../bun-plugin/plugin';

// Check if the native binary is available on this platform
function isNativeBinaryAvailable(): boolean {
  const prev = process.env.VERTZ_NATIVE_COMPILER;
  process.env.VERTZ_NATIVE_COMPILER = '1';
  const compiler = tryLoadNativeCompiler();
  if (prev === undefined) {
    delete process.env.VERTZ_NATIVE_COMPILER;
  } else {
    process.env.VERTZ_NATIVE_COMPILER = prev;
  }
  return compiler !== null;
}

const HAS_NATIVE_BINARY = isNativeBinaryAvailable();

// ── Helpers ──────────────────────────────────────────────────────

function createTempProject(): {
  dir: string;
  srcDir: string;
  write: (path: string, content: string) => string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'vertz-native-integration-'));
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(join(dir, '.vertz', 'css'), { recursive: true });

  return {
    dir,
    srcDir,
    write(relativePath: string, content: string): string {
      const fullPath = join(srcDir, relativePath);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content);
      return fullPath;
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function runPluginOnLoad(
  plugin: { name: string; setup: (build: any) => void },
  filePath: string,
): Promise<{ contents: string; loader: string }> {
  const handlers: Array<{ filter: RegExp; cb: (args: { path: string }) => Promise<any> }> = [];

  plugin.setup({
    onLoad(opts: any, cb: any) {
      handlers.push({ filter: opts.filter as RegExp, cb });
    },
  });

  // Find the handler whose filter matches the file path
  const match = handlers.find((h) => h.filter.test(filePath));
  if (!match) {
    throw new Error(
      `Plugin has no onLoad handler matching "${filePath}". ` +
        `Registered filters: ${handlers.map((h) => h.filter).join(', ')}`,
    );
  }
  return match.cb({ path: filePath });
}

// ── Tests ────────────────────────────────────────────────────────

describe('Feature: Native compiler plugin integration', () => {
  const originalEnv = process.env.VERTZ_NATIVE_COMPILER;
  let project: ReturnType<typeof createTempProject>;

  beforeEach(() => {
    project = createTempProject();
  });

  afterEach(() => {
    project.cleanup();
    if (originalEnv === undefined) {
      delete process.env.VERTZ_NATIVE_COMPILER;
    } else {
      process.env.VERTZ_NATIVE_COMPILER = originalEnv;
    }
  });

  // Tests below require the native binary — skip on platforms where it's not built
  const describeWithBinary = HAS_NATIVE_BINARY ? describe : describe.skip;

  describeWithBinary('Given VERTZ_NATIVE_COMPILER=1 and a simple component', () => {
    beforeEach(() => {
      process.env.VERTZ_NATIVE_COMPILER = '1';
    });

    describe('When the plugin processes the file', () => {
      it('Then produces compiled output with native compiler marker', async () => {
        const filePath = project.write('App.tsx', 'function App() { return <div>Hello</div>; }');

        const { plugin } = createVertzBunPlugin({
          projectRoot: project.dir,
          srcDir: project.srcDir,
          hmr: false,
          fastRefresh: false,
        });

        const result = await runPluginOnLoad(plugin, filePath);
        expect(result.contents).toContain('// compiled by vertz-native');
        expect(result.contents).toContain('__element');
      });
    });
  });

  describeWithBinary('Given VERTZ_NATIVE_COMPILER=1 and a component with signals', () => {
    beforeEach(() => {
      process.env.VERTZ_NATIVE_COMPILER = '1';
    });

    describe('When the plugin processes the file', () => {
      it('Then produces reactive transforms (signal/computed)', async () => {
        const filePath = project.write(
          'Counter.tsx',
          `function Counter() {
  let count = 0;
  const doubled = count * 2;
  return <div>{doubled}</div>;
}`,
        );

        const { plugin } = createVertzBunPlugin({
          projectRoot: project.dir,
          srcDir: project.srcDir,
          hmr: false,
          fastRefresh: false,
        });

        const result = await runPluginOnLoad(plugin, filePath);
        expect(result.contents).toContain('signal(');
        expect(result.contents).toContain('computed(');
      });
    });
  });

  describe('Given VERTZ_NATIVE_COMPILER is not set', () => {
    beforeEach(() => {
      delete process.env.VERTZ_NATIVE_COMPILER;
    });

    describe('When the plugin processes the file', () => {
      it('Then uses ts-morph compiler (no native marker)', async () => {
        const filePath = project.write('App.tsx', 'function App() { return <div>Hello</div>; }');

        const { plugin } = createVertzBunPlugin({
          projectRoot: project.dir,
          srcDir: project.srcDir,
          hmr: false,
          fastRefresh: false,
        });

        const result = await runPluginOnLoad(plugin, filePath);
        expect(result.contents).not.toContain('// compiled by vertz-native');
        expect(result.contents).toContain('__element');
      });
    });
  });

  describeWithBinary('Given VERTZ_NATIVE_COMPILER=1 and target=tui', () => {
    beforeEach(() => {
      process.env.VERTZ_NATIVE_COMPILER = '1';
    });

    describe('When the plugin processes the file', () => {
      it('Then uses tui internals import', async () => {
        const filePath = project.write(
          'App.tsx',
          `function App() {
  let count = 0;
  return <div>{count}</div>;
}`,
        );

        const { plugin } = createVertzBunPlugin({
          projectRoot: project.dir,
          srcDir: project.srcDir,
          hmr: false,
          fastRefresh: false,
          target: 'tui',
        });

        const result = await runPluginOnLoad(plugin, filePath);
        expect(result.contents).toContain('@vertz/tui/internals');
      });
    });
  });

  describeWithBinary('Given VERTZ_NATIVE_COMPILER=1 and source map chaining', () => {
    beforeEach(() => {
      process.env.VERTZ_NATIVE_COMPILER = '1';
    });

    describe('When the plugin processes the file', () => {
      it('Then produces output with inline source map', async () => {
        const filePath = project.write('App.tsx', 'function App() { return <div>Hello</div>; }');

        const { plugin } = createVertzBunPlugin({
          projectRoot: project.dir,
          srcDir: project.srcDir,
          hmr: false,
          fastRefresh: false,
        });

        const result = await runPluginOnLoad(plugin, filePath);
        expect(result.contents).toContain('//# sourceMappingURL=data:application/json;base64,');
      });
    });
  });
});
