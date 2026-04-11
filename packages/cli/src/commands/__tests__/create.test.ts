import { afterEach, beforeEach, describe, expect, it, type MockFunction } from '@vertz/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createAction } from '../create';

describe('createAction', () => {
  const testDir = '/tmp/vertz-create-test';

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('includes the package version in the creating message', async () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    const logSpy = spyOn(console, 'log').mockImplementation(() => {}) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const pkg = JSON.parse(
      await fs.readFile(path.resolve(import.meta.dir, '../../../package.json'), 'utf-8'),
    );

    await createAction({ projectName: 'version-test-app', version: pkg.version });

    const creatingMsg = logSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].startsWith('Creating Vertz app:'),
    );
    expect(creatingMsg).toBeDefined();
    expect(creatingMsg?.[0]).toContain(`(v${pkg.version})`);

    logSpy.mockRestore();
    process.chdir(originalCwd);
  });

  it('creates a new full-stack Vertz project', async () => {
    const originalCwd = process.cwd();

    process.chdir(testDir);

    const result = await createAction({ projectName: 'my-test-app', version: '0.0.0' });

    expect(result.ok).toBe(true);

    // Verify project was created with full-stack structure
    const projectPath = path.join(testDir, 'my-test-app');
    const files = await fs.readdir(projectPath);

    expect(files).toContain('package.json');
    expect(files).toContain('tsconfig.json');
    expect(files).toContain('vertz.config.ts');
    expect(files).toContain('src');

    // Verify api/ convention (server-only files)
    const apiFiles = await fs.readdir(path.join(projectPath, 'src', 'api'));
    expect(apiFiles).toContain('server.ts');
    expect(apiFiles).toContain('schema.ts');
    expect(apiFiles).toContain('db.ts');

    // Verify UI files (client.ts is a UI concern, lives in src/)
    const srcFiles = await fs.readdir(path.join(projectPath, 'src'));
    expect(srcFiles).toContain('client.ts');
    expect(srcFiles).toContain('app.tsx');
    expect(srcFiles).toContain('entry-client.ts');

    process.chdir(originalCwd);
  });

  it('returns err when project name is missing', async () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    const result = await createAction({ version: '0.0.0' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Project name is required');
    }

    process.chdir(originalCwd);
  });

  it('returns err when project name is invalid', async () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    const result = await createAction({ projectName: 'Invalid_Project_Name!', version: '0.0.0' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('must be lowercase');
    }

    process.chdir(originalCwd);
  });

  it('returns err when directory already exists', async () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    await fs.mkdir(path.join(testDir, 'existing-app'));

    const result = await createAction({ projectName: 'existing-app', version: '0.0.0' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('already exists');
    }

    process.chdir(originalCwd);
  });
});
