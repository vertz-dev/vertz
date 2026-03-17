import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';

/**
 * Tests for the no-try-catch-result GritQL rule.
 *
 * Runs biome lint on fixture strings and checks that the rule:
 * - Flags try/catch wrapping `.open()` calls (error-as-value APIs)
 * - Does NOT flag try/catch around non-Result APIs (fetch, fs, etc.)
 * - Does NOT flag `.open()` calls outside try/catch
 */

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const PLUGIN_PATH = resolve(PROJECT_ROOT, 'biome-plugins/no-try-catch-result.grit');

async function lintFixture(code: string): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpDir = `/tmp/biome-test-${id}`;
  const configPath = `${tmpDir}/biome.json`;
  const fixturePath = `${tmpDir}/fixture.ts`;

  await Bun.write(
    configPath,
    JSON.stringify({
      $schema: 'https://biomejs.dev/schemas/2.3.14/schema.json',
      plugins: [PLUGIN_PATH],
      linter: { enabled: true, rules: { recommended: false } },
    }),
  );
  await Bun.write(fixturePath, code);

  const proc = Bun.spawn(['bunx', 'biome', 'lint', '--config-path', tmpDir, fixturePath], {
    cwd: PROJECT_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  return stdout + stderr;
}

describe('no-try-catch-result', () => {
  it('flags try/catch wrapping stack.open()', async () => {
    const output = await lintFixture(`
      async function _handler() {
        try {
          const result = await stack.open(Dialog, {});
        } catch {
          // dismissed
        }
      }
    `);
    expect(output).toContain('error-as-value');
  });

  it('flags try/catch with catch param wrapping dialogs.open()', async () => {
    const output = await lintFixture(`
      async function _handler() {
        try {
          const result = await dialogs.open(Dialog, {});
        } catch (e) {
          console.error(e);
        }
      }
    `);
    expect(output).toContain('error-as-value');
  });

  it('does NOT flag .open() outside try/catch', async () => {
    const output = await lintFixture(`
      async function _handler() {
        const result = await stack.open(Dialog, {});
        if (result.ok) doSomething();
      }
    `);
    expect(output).not.toContain('error-as-value');
  });

  it('flags try/catch/finally wrapping .open()', async () => {
    const output = await lintFixture(`
      async function _handler() {
        try {
          const result = await stack.open(Dialog, {});
        } catch {
          // dismissed
        } finally {
          cleanup();
        }
      }
    `);
    expect(output).toContain('error-as-value');
  });

  it('does NOT flag try/catch around non-Result APIs', async () => {
    const output = await lintFixture(`
      async function _handler() {
        try {
          const data = await fetch('/api');
        } catch (e) {
          handleError(e);
        }
      }
    `);
    expect(output).not.toContain('error-as-value');
  });
});
