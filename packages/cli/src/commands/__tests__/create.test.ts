import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createAction } from '../create';

describe('createAction', () => {
  const testDir = '/tmp/vertz-create-test';

  beforeEach(async () => {
    // Set up test environment
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('creates a new Vertz project with bun runtime', async () => {
    const originalCwd = process.cwd();

    // Change to test directory
    process.chdir(testDir);

    const result = await createAction({
      projectName: 'my-test-app',
      runtime: 'bun',
      example: false,
    });

    expect(result.ok).toBe(true);

    // Verify project was created
    const projectPath = path.join(testDir, 'my-test-app');
    const files = await fs.readdir(projectPath);

    expect(files).toContain('package.json');
    expect(files).toContain('tsconfig.json');
    expect(files).toContain('vertz.config.ts');
    expect(files).toContain('src');

    // Restore original directory
    process.chdir(originalCwd);
  });

  it('creates a new Vertz project with example module', async () => {
    const originalCwd = process.cwd();

    process.chdir(testDir);

    const result = await createAction({
      projectName: 'app-with-example',
      runtime: 'bun',
      example: true,
    });

    expect(result.ok).toBe(true);

    // Verify example module was created
    const modulesPath = path.join(testDir, 'app-with-example', 'src', 'modules');
    const moduleFiles = await fs.readdir(modulesPath);

    expect(moduleFiles).toContain('health.module.ts');
    expect(moduleFiles).toContain('health.router.ts');
    expect(moduleFiles).toContain('health.service.ts');
    expect(moduleFiles).toContain('health.module-def.ts');

    process.chdir(originalCwd);
  });

  it('creates a new Vertz project with node runtime', async () => {
    const originalCwd = process.cwd();

    process.chdir(testDir);

    const result = await createAction({
      projectName: 'node-app',
      runtime: 'node',
      example: false,
    });

    expect(result.ok).toBe(true);

    const packageJsonPath = path.join(testDir, 'node-app', 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    // Verify Node-specific configuration
    expect(packageJson.scripts.dev).toContain('tsx');
    expect(packageJson.devDependencies).toHaveProperty('@types/node');

    process.chdir(originalCwd);
  });

  it('creates a new Vertz project with deno runtime', async () => {
    const originalCwd = process.cwd();

    process.chdir(testDir);

    const result = await createAction({
      projectName: 'deno-app',
      runtime: 'deno',
      example: false,
    });

    expect(result.ok).toBe(true);

    // Verify Deno-specific configuration
    const denoJsonPath = path.join(testDir, 'deno-app', 'deno.json');
    const denoJson = JSON.parse(await fs.readFile(denoJsonPath, 'utf-8'));

    expect(denoJson.imports).toBeDefined();
    expect(denoJson.tasks).toBeDefined();

    process.chdir(originalCwd);
  });

  it('returns err when project name is missing', async () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    const result = await createAction({} as any);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Project name is required');
    }

    process.chdir(originalCwd);
  });

  it('returns err when project name is invalid', async () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    const result = await createAction({
      projectName: 'Invalid_Project_Name!',
      runtime: 'bun',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('must be lowercase');
    }

    process.chdir(originalCwd);
  });

  it('returns err when directory already exists', async () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    // Create the directory first
    await fs.mkdir(path.join(testDir, 'existing-app'));

    const result = await createAction({
      projectName: 'existing-app',
      runtime: 'bun',
      example: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('already exists');
    }

    process.chdir(originalCwd);
  });
});
