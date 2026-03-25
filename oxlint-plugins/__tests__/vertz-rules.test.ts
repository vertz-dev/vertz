import { afterEach, describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';

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

async function lintFixture(
  code: string,
  rules: Record<string, string>,
  filename = 'fixture.ts',
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpDir = `/tmp/oxlint-test-${id}`;
  tmpDirs.push(tmpDir);

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

  await Bun.write(`${tmpDir}/.oxlintrc.json`, JSON.stringify(config, null, 2));
  await Bun.write(`${tmpDir}/${filename}`, code);

  const proc = Bun.spawn(
    ['bunx', 'oxlint', '--config', `${tmpDir}/.oxlintrc.json`, `${tmpDir}/${filename}`],
    {
      cwd: PROJECT_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  return stdout + stderr;
}

// ---------------------------------------------------------------------------
// no-double-cast
// ---------------------------------------------------------------------------
describe('no-double-cast', () => {
  const rules = { 'vertz-rules/no-double-cast': 'error' };

  it('flags `as unknown as T` double assertion', async () => {
    const output = await lintFixture(
      `const x = {} as unknown as string;`,
      rules,
    );
    expect(output).toContain('double type assertion');
  });

  it('does NOT flag single `as T` assertion', async () => {
    const output = await lintFixture(
      `const x = {} as string;`,
      rules,
    );
    expect(output).not.toContain('double type assertion');
  });

  it('does NOT flag `as T` without unknown in middle', async () => {
    const output = await lintFixture(
      `const x = ("hello" as string) as string;`,
      rules,
    );
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
    const output = await lintFixture(
      `import { something } from '@vertz/core/internals';`,
      rules,
    );
    expect(output).toContain('@vertz/core/internals');
  });

  it('does NOT flag import from @vertz/core', async () => {
    const output = await lintFixture(
      `import { something } from '@vertz/core';`,
      rules,
    );
    expect(output).not.toContain('Do not import');
  });

  it('does NOT flag import from other packages', async () => {
    const output = await lintFixture(
      `import { something } from '@vertz/server';`,
      rules,
    );
    expect(output).not.toContain('Do not import');
  });
});

// ---------------------------------------------------------------------------
// no-throw-plain-error
// ---------------------------------------------------------------------------
describe('no-throw-plain-error', () => {
  const rules = { 'vertz-rules/no-throw-plain-error': 'error' };

  it('flags throw new Error(msg)', async () => {
    const output = await lintFixture(
      `throw new Error('something went wrong');`,
      rules,
    );
    expect(output).toContain('VertzException');
  });

  it('flags throw new Error() without arguments', async () => {
    const output = await lintFixture(
      `throw new Error();`,
      rules,
    );
    expect(output).toContain('VertzException');
  });

  it('does NOT flag throw new BadRequestException()', async () => {
    const output = await lintFixture(
      `throw new BadRequestException('invalid input');`,
      rules,
    );
    expect(output).not.toContain('VertzException');
  });

  it('does NOT flag throw new TypeError()', async () => {
    const output = await lintFixture(
      `throw new TypeError('expected string');`,
      rules,
    );
    expect(output).not.toContain('VertzException');
  });
});

// ---------------------------------------------------------------------------
// no-wrong-effect
// ---------------------------------------------------------------------------
describe('no-wrong-effect', () => {
  const rules = { 'vertz-rules/no-wrong-effect': 'error' };

  it('flags effect() call', async () => {
    const output = await lintFixture(
      `effect(() => { console.log('side effect'); });`,
      rules,
    );
    expect(output).toContain('effect() was removed');
  });

  it('does NOT flag domEffect() call', async () => {
    const output = await lintFixture(
      `domEffect(() => { console.log('dom'); });`,
      rules,
    );
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
    const output = await lintFixture(
      `obj.effect(() => {});`,
      rules,
    );
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
    const output = await lintFixture(
      `const el = <div />;`,
      rules,
      'fixture.tsx',
    );
    expect(output).toContain('JSX outside the return tree');
  });

  it('flags let x = <span>text</span>', async () => {
    const output = await lintFixture(
      `let el = <span>text</span>;`,
      rules,
      'fixture.tsx',
    );
    expect(output).toContain('JSX outside the return tree');
  });

  it('flags const x = (<div />) as HTMLElement', async () => {
    const output = await lintFixture(
      `const el = (<div />) as HTMLElement;`,
      rules,
      'fixture.tsx',
    );
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
