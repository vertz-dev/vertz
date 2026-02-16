import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createAction } from '../create';
import { promises as fs } from 'node:fs';
import path from 'node:path';

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
    
    await createAction({
      projectName: 'my-test-app',
      runtime: 'bun',
      example: false,
    });
    
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
    
    await createAction({
      projectName: 'app-with-example',
      runtime: 'bun',
      example: true,
    });
    
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
    
    await createAction({
      projectName: 'node-app',
      runtime: 'node',
      example: false,
    });
    
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
    
    await createAction({
      projectName: 'deno-app',
      runtime: 'deno',
      example: false,
    });
    
    // Verify Deno-specific configuration
    const denoJsonPath = path.join(testDir, 'deno-app', 'deno.json');
    const denoJson = JSON.parse(await fs.readFile(denoJsonPath, 'utf-8'));
    
    expect(denoJson.imports).toBeDefined();
    expect(denoJson.tasks).toBeDefined();
    
    process.chdir(originalCwd);
  });

  it('fails when project name is missing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    const originalCwd = process.cwd();
    process.chdir(testDir);
    
    try {
      await createAction({} as any);
      fail('Expected process.exit to be called');
    } catch (error) {
      expect((error as Error).message).toBe('process.exit called');
    }
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Project name is required')
    );
    
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    process.chdir(originalCwd);
  });

  it('fails when project name is invalid', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    const originalCwd = process.cwd();
    process.chdir(testDir);
    
    try {
      await createAction({
        projectName: 'Invalid_Project_Name!',
        runtime: 'bun',
      });
      fail('Expected process.exit to be called');
    } catch (error) {
      expect((error as Error).message).toBe('process.exit called');
    }
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('must be lowercase')
    );
    
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    process.chdir(originalCwd);
  });

  it('fails when directory already exists', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    const originalCwd = process.cwd();
    process.chdir(testDir);
    
    // Create the directory first
    await fs.mkdir(path.join(testDir, 'existing-app'));
    
    try {
      await createAction({
        projectName: 'existing-app',
        runtime: 'bun',
        example: false, // Explicitly pass example to avoid prompts
      });
      fail('Expected process.exit to be called');
    } catch (error) {
      expect((error as Error).message).toBe('process.exit called');
    }
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('already exists')
    );
    
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    process.chdir(originalCwd);
  });
});
