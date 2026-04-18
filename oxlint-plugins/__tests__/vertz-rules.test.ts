import { afterEach, describe, expect, it } from '@vertz/test';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Tests for the oxlint JS plugin vertz-rules.
 *
 * Runs oxlint on fixture strings with only the custom plugin enabled
 * and checks that each rule flags the expected patterns.
 */

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const PLUGIN_PATH = resolve(PROJECT_ROOT, 'oxlint-plugins/vertz-rules.js');

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  tmpDirs.length = 0;
});

function runOxlint(args: string[], cwd = PROJECT_ROOT): string {
  // vtz's execSync doesn't reliably capture stdout on non-zero exit,
  // so redirect to a temp file and read it back.
  const outPath = `/tmp/oxlint-out-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const quoted = args.map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(' ');
  try {
    execSync(`vtzx oxlint ${quoted} > ${outPath} 2>&1`, { cwd });
  } catch {
    // oxlint exits non-zero when it finds lint errors — that's expected
  }
  const contents = readFileSync(outPath, 'utf8');
  rmSync(outPath, { force: true });
  return contents;
}

async function lintFixture(
  code: string,
  rules: Record<string, string>,
  filename = 'fixture.ts',
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpDir = `/tmp/oxlint-test-${id}`;
  tmpDirs.push(tmpDir);
  mkdirSync(tmpDir, { recursive: true });

  const config = {
    $schema: './node_modules/oxlint/configuration_schema.json',
    // Disable all default categories so only our rules fire
    categories: {
      correctness: 'off',
      suspicious: 'off',
      style: 'off',
      pedantic: 'off',
      nursery: 'off',
      restriction: 'off',
    },
    plugins: [],
    jsPlugins: [PLUGIN_PATH],
    rules,
  };

  writeFileSync(`${tmpDir}/.oxlintrc.json`, JSON.stringify(config, null, 2));
  writeFileSync(`${tmpDir}/${filename}`, code);

  return runOxlint(['--config', `${tmpDir}/.oxlintrc.json`, `${tmpDir}/${filename}`]);
}

/**
 * Runs `tsc --noEmit` on the given source and returns TS diagnostics.
 * Used to verify that autofix output passes strict TypeScript.
 */
function tscFixture(source: string): { code: number; message: string }[] {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpDir = `/tmp/tsc-fixture-${id}`;
  tmpDirs.push(tmpDir);
  mkdirSync(tmpDir, { recursive: true });

  const tsconfig = {
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'preserve',
      noEmit: true,
      skipLibCheck: true,
      isolatedModules: true,
    },
    include: ['fixture.tsx'],
  };

  writeFileSync(`${tmpDir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));
  writeFileSync(`${tmpDir}/fixture.tsx`, source);

  const outPath = `/tmp/tsc-out-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    execSync(`tsc --noEmit --pretty false -p '${tmpDir}/tsconfig.json' > ${outPath} 2>&1`, {
      cwd: tmpDir,
    });
  } catch {
    // tsc exits non-zero on diagnostics
  }
  const raw = readFileSync(outPath, 'utf8');
  rmSync(outPath, { force: true });

  const diagnostics: { code: number; message: string }[] = [];
  for (const line of raw.split('\n')) {
    const match = line.match(/error TS(\d+):\s*(.*)$/);
    if (match) diagnostics.push({ code: Number(match[1]), message: match[2] });
  }
  return diagnostics;
}

/**
 * Runs oxlint with `--fix` on the fixture and returns the rewritten file.
 */
async function lintFixtureWithFix(
  code: string,
  rules: Record<string, string>,
  filename = 'fixture.ts',
): Promise<{ fixed: string; lintOutput: string }> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpDir = `/tmp/oxlint-fix-${id}`;
  tmpDirs.push(tmpDir);
  mkdirSync(tmpDir, { recursive: true });

  const config = {
    $schema: './node_modules/oxlint/configuration_schema.json',
    categories: {
      correctness: 'off',
      suspicious: 'off',
      style: 'off',
      pedantic: 'off',
      nursery: 'off',
      restriction: 'off',
    },
    plugins: [],
    jsPlugins: [PLUGIN_PATH],
    rules,
  };

  const fixturePath = `${tmpDir}/${filename}`;
  writeFileSync(`${tmpDir}/.oxlintrc.json`, JSON.stringify(config, null, 2));
  writeFileSync(fixturePath, code);

  const lintOutput = runOxlint(['--fix', '--config', `${tmpDir}/.oxlintrc.json`, fixturePath]);

  const fixed = readFileSync(fixturePath, 'utf8');
  return { fixed, lintOutput };
}

// ---------------------------------------------------------------------------
// no-double-cast
// ---------------------------------------------------------------------------
describe('no-double-cast', () => {
  const rules = { 'vertz-rules/no-double-cast': 'error' };

  it('flags `as unknown as T` double assertion', async () => {
    const output = await lintFixture(`const x = {} as unknown as string;`, rules);
    expect(output).toContain('double type assertion');
  });

  it('does NOT flag single `as T` assertion', async () => {
    const output = await lintFixture(`const x = {} as string;`, rules);
    expect(output).not.toContain('double type assertion');
  });

  it('does NOT flag `as T` without unknown in middle', async () => {
    const output = await lintFixture(`const x = ("hello" as string) as string;`, rules);
    // The middle type is `string`, not `unknown` — should not flag
    expect(output).not.toContain('double type assertion');
  });
});

// ---------------------------------------------------------------------------
// no-internals-import
// ---------------------------------------------------------------------------
describe('no-internals-import', () => {
  const rules = { 'vertz-rules/no-internals-import': 'error' };

  it('flags import from @vertz/core/internals', async () => {
    const output = await lintFixture(`import { something } from '@vertz/core/internals';`, rules);
    expect(output).toContain('@vertz/core/internals');
  });

  it('does NOT flag import from @vertz/core', async () => {
    const output = await lintFixture(`import { something } from '@vertz/core';`, rules);
    expect(output).not.toContain('Do not import');
  });

  it('does NOT flag import from other packages', async () => {
    const output = await lintFixture(`import { something } from '@vertz/server';`, rules);
    expect(output).not.toContain('Do not import');
  });
});

// ---------------------------------------------------------------------------
// no-throw-plain-error
// ---------------------------------------------------------------------------
describe('no-throw-plain-error', () => {
  const rules = { 'vertz-rules/no-throw-plain-error': 'error' };

  it('flags throw new Error(msg)', async () => {
    const output = await lintFixture(`throw new Error('something went wrong');`, rules);
    expect(output).toContain('VertzException');
  });

  it('flags throw new Error() without arguments', async () => {
    const output = await lintFixture(`throw new Error();`, rules);
    expect(output).toContain('VertzException');
  });

  it('does NOT flag throw new BadRequestException()', async () => {
    const output = await lintFixture(`throw new BadRequestException('invalid input');`, rules);
    expect(output).not.toContain('VertzException');
  });

  it('does NOT flag throw new TypeError()', async () => {
    const output = await lintFixture(`throw new TypeError('expected string');`, rules);
    expect(output).not.toContain('VertzException');
  });
});

// ---------------------------------------------------------------------------
// no-wrong-effect
// ---------------------------------------------------------------------------
describe('no-wrong-effect', () => {
  const rules = { 'vertz-rules/no-wrong-effect': 'error' };

  it('flags effect() call', async () => {
    const output = await lintFixture(`effect(() => { console.log('side effect'); });`, rules);
    expect(output).toContain('effect() was removed');
  });

  it('does NOT flag domEffect() call', async () => {
    const output = await lintFixture(`domEffect(() => { console.log('dom'); });`, rules);
    expect(output).not.toContain('effect() was removed');
  });

  it('does NOT flag lifecycleEffect() call', async () => {
    const output = await lintFixture(
      `lifecycleEffect(() => { console.log('lifecycle'); });`,
      rules,
    );
    expect(output).not.toContain('effect() was removed');
  });

  it('does NOT flag obj.effect() method call', async () => {
    const output = await lintFixture(`obj.effect(() => {});`, rules);
    // Only bare `effect()` calls should match, not member expressions
    expect(output).not.toContain('effect() was removed');
  });
});

// ---------------------------------------------------------------------------
// no-body-jsx
// ---------------------------------------------------------------------------
describe('no-body-jsx', () => {
  const rules = { 'vertz-rules/no-body-jsx': 'error' };

  it('flags const x = <div />', async () => {
    const output = await lintFixture(`const el = <div />;`, rules, 'fixture.tsx');
    expect(output).toContain('JSX outside the return tree');
  });

  it('flags let x = <span>text</span>', async () => {
    const output = await lintFixture(`let el = <span>text</span>;`, rules, 'fixture.tsx');
    expect(output).toContain('JSX outside the return tree');
  });

  it('flags const x = (<div />) as HTMLElement', async () => {
    const output = await lintFixture(`const el = (<div />) as HTMLElement;`, rules, 'fixture.tsx');
    expect(output).toContain('JSX outside the return tree');
  });

  it('does NOT flag JSX in return statement', async () => {
    const output = await lintFixture(
      `function App() { return <div>hello</div>; }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('JSX outside the return tree');
  });
});

// ---------------------------------------------------------------------------
// no-try-catch-result
// ---------------------------------------------------------------------------
describe('no-try-catch-result', () => {
  const rules = { 'vertz-rules/no-try-catch-result': 'error' };

  it('flags try/catch wrapping stack.open()', async () => {
    const output = await lintFixture(
      `async function handler() {
        try {
          const result = await stack.open(Dialog, {});
        } catch {
          // dismissed
        }
      }`,
      rules,
    );
    expect(output).toContain('error-as-value');
  });

  it('flags try/catch wrapping dialogs.open()', async () => {
    const output = await lintFixture(
      `async function handler() {
        try {
          const result = await dialogs.open(EditDialog, { task });
        } catch (e) {
          console.error(e);
        }
      }`,
      rules,
    );
    expect(output).toContain('error-as-value');
  });

  it('flags try/catch/finally wrapping .open()', async () => {
    const output = await lintFixture(
      `async function handler() {
        try {
          const result = await stack.open(Dialog, {});
        } catch {
          // dismissed
        } finally {
          cleanup();
        }
      }`,
      rules,
    );
    expect(output).toContain('error-as-value');
  });

  it('does NOT flag .open() outside try/catch', async () => {
    const output = await lintFixture(
      `async function handler() {
        const result = await stack.open(Dialog, {});
        if (result.ok) doSomething();
      }`,
      rules,
    );
    expect(output).not.toContain('error-as-value');
  });

  it('does NOT flag try/catch around fetch()', async () => {
    const output = await lintFixture(
      `async function handler() {
        try {
          const data = await fetch('/api');
        } catch (e) {
          handleError(e);
        }
      }`,
      rules,
    );
    expect(output).not.toContain('error-as-value');
  });
});

// ---------------------------------------------------------------------------
// no-narrowing-let
// ---------------------------------------------------------------------------
describe('no-narrowing-let', () => {
  const rules = { 'vertz-rules/no-narrowing-let': 'error' };

  it('reports union-typed `let` in a top-level component body (.tsx)', async () => {
    const output = await lintFixture(
      `export function Panel() {
        let panel: 'code' | 'spec' = 'code';
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).toContain('narrows to its initializer');
  });

  it('does NOT fire in `.ts` files', async () => {
    const output = await lintFixture(
      `export function setup() {
        let panel: 'code' | 'spec' = 'code';
        return panel;
      }`,
      rules,
      'fixture.ts',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire in nested functions', async () => {
    const output = await lintFixture(
      `export function Page() {
        function inner() {
          let panel: 'code' | 'spec' = 'code';
          return panel;
        }
        return <div>{inner()}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on `const` with union annotation', async () => {
    const output = await lintFixture(
      `export function Page() {
        const panel: 'code' | 'spec' = 'code';
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on non-union annotation (array)', async () => {
    const output = await lintFixture(
      `export function Page() {
        let items: string[] = [];
        return <div>{items.length}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on plain string annotation', async () => {
    const output = await lintFixture(
      `export function Page() {
        let name: string = 'hello';
        return <div>{name}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on destructuring patterns', async () => {
    const output = await lintFixture(
      `export function Page() {
        let { a }: { a: 'x' | 'y' } = { a: 'x' };
        return <div>{a}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on `let` without initializer', async () => {
    const output = await lintFixture(
      `export function Page() {
        let panel: 'code' | 'spec';
        panel = 'code';
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on `let` without type annotation', async () => {
    const output = await lintFixture(
      `export function Page() {
        let panel = 'code';
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('reports on components exported as default', async () => {
    const output = await lintFixture(
      `export default function Page() {
        let panel: 'code' | 'spec' = 'code';
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).toContain('narrows to its initializer');
  });

  it('reports on arrow function components at module scope', async () => {
    const output = await lintFixture(
      `export const Page = () => {
        let panel: 'code' | 'spec' = 'code';
        return <div>{panel}</div>;
      };`,
      rules,
      'fixture.tsx',
    );
    expect(output).toContain('narrows to its initializer');
  });

  it('autofixes to `let x: T = v as T` form (literal initializer)', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let panel: 'code' | 'spec' = 'code';
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(`let panel: 'code' | 'spec' = 'code' as 'code' | 'spec'`);
  });

  it('autofix preserves the variable annotation', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let status: 'idle' | 'loading' | 'error' = 'idle';
        return <div>{status}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(
      `let status: 'idle' | 'loading' | 'error' = 'idle' as 'idle' | 'loading' | 'error'`,
    );
  });

  it('autofix strips `as const` before casting to the union', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let panel: 'code' | 'spec' = 'code' as const;
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(`let panel: 'code' | 'spec' = 'code' as 'code' | 'spec'`);
    expect(fixed).not.toContain(`'code' as const as 'code'`);
  });

  it('autofix wraps sequence-expression initializer in parens', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let panel: 'code' | 'spec' = (1, 'code');
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(`= (1, 'code') as 'code' | 'spec'`);
  });

  it('autofix leaves safe bare expressions unwrapped', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        const initial = getInitial();
        let panel: 'code' | 'spec' = initial;
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(`let panel: 'code' | 'spec' = initial as 'code' | 'spec'`);
  });

  it('autofix handles multi-declarator statements independently', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let panel: 'code' | 'spec' = 'code', status: 'on' | 'off' = 'on';
        return <div>{panel}{status}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(`panel: 'code' | 'spec' = 'code' as 'code' | 'spec'`);
    expect(fixed).toContain(`status: 'on' | 'off' = 'on' as 'on' | 'off'`);
  });

  it('autofix output no longer trips the rule', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let panel: 'code' | 'spec' = 'code';
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    const secondPass = await lintFixture(fixed, rules, 'fixture.tsx');
    expect(secondPass).not.toContain('narrows to its initializer');
  });

  it('original code under tsc reports TS2367 (baseline: the bug exists)', () => {
    const diagnostics = tscFixture(
      `export function Panel() {
        let panel: 'code' | 'spec' = 'code';
        const isSpec = panel === 'spec';
        setTimeout(() => { panel = 'spec'; }, 0);
        return isSpec;
      }`,
    );
    const hasTS2367 = diagnostics.some((d) => d.code === 2367);
    expect(hasTS2367).toBe(true);
  });

  it('autofix output under tsc does NOT report TS2367', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let panel: 'code' | 'spec' = 'code';
        const isSpec = panel === 'spec';
        setTimeout(() => { panel = 'spec'; }, 0);
        return isSpec;
      }`,
      rules,
      'fixture.tsx',
    );
    const diagnostics = tscFixture(fixed);
    const hasTS2367 = diagnostics.some((d) => d.code === 2367);
    expect(hasTS2367).toBe(false);
  });

  it('fires on narrower-union cast that still narrows (BLOCKER 1 regression)', async () => {
    const output = await lintFixture(
      `export function Panel() {
        let mode: 'a' | 'b' | 'c' = foo() as 'a' | 'b';
        return <div>{mode}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).toContain('narrows to its initializer');
  });

  it('autofix wraps narrower-union cast in chained cast to the declared type', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let mode: 'a' | 'b' | 'c' = foo() as 'a' | 'b';
        return <div>{mode}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(`mode: 'a' | 'b' | 'c' = foo() as 'a' | 'b' as 'a' | 'b' | 'c'`);
  });

  it('fires on aliased union type (BLOCKER 2: the state-machine pattern)', async () => {
    const output = await lintFixture(
      `type Status = 'idle' | 'loading' | 'error';
      export function Panel() {
        let s: Status = 'idle';
        return <div>{s}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).toContain('narrows to its initializer');
  });

  it('autofixes aliased union to `let x: Alias = v as Alias`', async () => {
    const { fixed } = await lintFixtureWithFix(
      `type Status = 'idle' | 'loading' | 'error';
      export function Panel() {
        let s: Status = 'idle';
        return <div>{s}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(`let s: Status = 'idle' as Status`);
  });

  it('aliased-union autofix clears TS2367 (baseline + after)', async () => {
    const src = `type Status = 'idle' | 'loading' | 'error';
      export function Panel() {
        let s: Status = 'idle';
        const isLoading = s === 'loading';
        setTimeout(() => { s = 'loading'; }, 0);
        return isLoading;
      }`;
    const before = tscFixture(src);
    expect(before.some((d) => d.code === 2367)).toBe(true);
    const { fixed } = await lintFixtureWithFix(src, rules, 'fixture.tsx');
    const after = tscFixture(fixed);
    expect(after.some((d) => d.code === 2367)).toBe(false);
  });

  it('does NOT fire on aliased non-union type reference', async () => {
    const output = await lintFixture(
      `type Count = number;
      export function Panel() {
        let c: Count = 0;
        return <div>{c}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on unresolved type reference (alias not in file)', async () => {
    const output = await lintFixture(
      `import type { Status } from './types';
      export function Panel() {
        let s: Status = 'idle';
        return <div>{s}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on `T | null = null` (SHOULD-FIX 5: TS does not narrow)', async () => {
    const output = await lintFixture(
      `export function Panel() {
        let selectedId: string | null = null;
        return <div>{selectedId}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('does NOT fire on `T | undefined = undefined` (SHOULD-FIX 5: TS does not narrow)', async () => {
    const output = await lintFixture(
      `export function Panel() {
        let editedPrompt: string | undefined = undefined;
        return <div>{editedPrompt}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).not.toContain('narrows to its initializer');
  });

  it('STILL fires on `T | null = <non-null>` (narrowing happens when init is not null)', async () => {
    const output = await lintFixture(
      `export function Panel() {
        let mode: 'a' | 'b' | null = 'a';
        return <div>{mode}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(output).toContain('narrows to its initializer');
  });

  it('autofix for `v as OtherT` produces `v as OtherT as T`', async () => {
    const { fixed } = await lintFixtureWithFix(
      `export function Panel() {
        let panel: 'code' | 'spec' = getValue() as string;
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    expect(fixed).toContain(
      `let panel: 'code' | 'spec' = getValue() as string as 'code' | 'spec'`,
    );
  });

  it('lint message contains the fix example and docs URL (LLM-friendly)', async () => {
    const output = await lintFixture(
      `export function Panel() {
        let panel: 'code' | 'spec' = 'code';
        return <div>{panel}</div>;
      }`,
      rules,
      'fixture.tsx',
    );
    // oxlint reformats the message across multiple lines in its report; assert
    // the distinctive fragments are present.
    expect(output).toContain('let panel');
    expect(output).toContain("'code' as 'code' | 'spec'");
    expect(output).toContain('vertz.dev/guides/ui/reactivity');
  });
});
