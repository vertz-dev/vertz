import { describe, expect, it } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI_PATH = path.resolve(import.meta.dir, '../../bin/create-vertz-app.ts');
const PKG_PATH = path.resolve(import.meta.dir, '../../package.json');
const DIST_PATH = path.resolve(import.meta.dir, '../../dist/index.js');

describe('create-vertz-app CLI', () => {
  describe('--version', () => {
    it('outputs the version from package.json (not hardcoded)', async () => {
      const pkg = JSON.parse(await fs.readFile(PKG_PATH, 'utf-8'));
      const proc = Bun.spawn(['bun', CLI_PATH, '--version'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      expect(stdout.trim()).toBe(pkg.version);
    });
  });

  describe('scaffold output', () => {
    const hasDist = existsSync(DIST_PATH);

    it.skipIf(!hasDist)('includes the package version in the creating message', async () => {
      const pkg = JSON.parse(await fs.readFile(PKG_PATH, 'utf-8'));
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertz-cli-'));

      const proc = Bun.spawn(['bun', CLI_PATH, 'test-app'], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: tempDir,
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      expect(stdout).toContain(`(v${pkg.version})`);

      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
    });
  });
});
