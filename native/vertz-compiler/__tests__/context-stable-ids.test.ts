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

describe('Feature: Context stable ID injection', () => {
  describe('Given a createContext() call with no arguments', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then injects undefined and stable ID string', () => {
        const { compile } = loadCompiler();
        const source = "const Ctx = createContext<string>();";
        const result = compile(source, { filename: 'src/ctx.tsx', fastRefresh: true });
        // TS type parameter <string> is stripped; only the JS args remain
        expect(result.code).toContain("createContext(undefined, 'src/ctx.tsx::Ctx')");
      });
    });
  });

  describe('Given a createContext() call with a default value', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then appends stable ID after existing argument', () => {
        const { compile } = loadCompiler();
        const source = "const Settings = createContext<Config>(defaultConfig);";
        const result = compile(source, { filename: 'src/settings.tsx', fastRefresh: true });
        expect(result.code).toContain(", 'src/settings.tsx::Settings'");
      });
    });
  });

  describe('Given multiple createContext() calls', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then injects stable IDs for all of them', () => {
        const { compile } = loadCompiler();
        const source = [
          "const ThemeCtx = createContext<Theme>();",
          "const AuthCtx = createContext<Auth>();",
        ].join('\n');
        const result = compile(source, { filename: 'src/app.tsx', fastRefresh: true });
        expect(result.code).toContain("'src/app.tsx::ThemeCtx'");
        expect(result.code).toContain("'src/app.tsx::AuthCtx'");
      });
    });
  });

  describe('Given a createContext() call', () => {
    describe('When compiled WITHOUT fastRefresh', () => {
      it('Then does NOT inject stable IDs', () => {
        const { compile } = loadCompiler();
        const source = "const Ctx = createContext<string>();";
        const result = compile(source, { filename: 'src/ctx.tsx' });
        expect(result.code).not.toContain('::Ctx');
      });
    });
  });

  describe('Given a non-createContext call expression', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then does not modify the call', () => {
        const { compile } = loadCompiler();
        const source = "const data = fetchData();";
        const result = compile(source, { filename: 'src/data.tsx', fastRefresh: true });
        expect(result.code).not.toContain('::');
        expect(result.code).toContain('fetchData()');
      });
    });
  });

  describe('Given a createContext inside a function (not module-level)', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then does not inject stable ID', () => {
        const { compile } = loadCompiler();
        const source = `function setup() {
  const Ctx = createContext<string>();
  return Ctx;
}`;
        const result = compile(source, { filename: 'src/setup.tsx', fastRefresh: true });
        // Inside a function body — not a module-level const declaration
        expect(result.code).not.toContain("'src/setup.tsx::Ctx'");
      });
    });
  });

  describe('Given an exported createContext() call', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then injects stable ID for export const pattern', () => {
        const { compile } = loadCompiler();
        const source = "export const RouterCtx = createContext<Router>();";
        const result = compile(source, { filename: 'src/router.tsx', fastRefresh: true });
        expect(result.code).toContain("'src/router.tsx::RouterCtx'");
      });
    });
  });

  describe('Given a let declaration with createContext', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then also injects stable ID (matches TS behavior)', () => {
        const { compile } = loadCompiler();
        const source = "let Ctx = createContext<string>();";
        const result = compile(source, { filename: 'src/ctx.tsx', fastRefresh: true });
        expect(result.code).toContain("'src/ctx.tsx::Ctx'");
      });
    });
  });
});
