/**
 * Build Command Tests
 *
 * Tests for the vertz build CLI command.
 * Verifies app type detection dispatch and proper exit codes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock the production-build module to avoid real bundling
vi.mock('../../production-build', () => {
  const mockBuild = vi.fn().mockResolvedValue({
    success: true,
    stages: { codegen: true, typecheck: true, bundle: true },
    manifest: {
      entryPoint: 'src/server.ts',
      outputDir: '.vertz/build',
      generatedFiles: [],
      size: 1000,
      buildTime: Date.now(),
      target: 'node',
    },
    durationMs: 100,
  });

  const mockDispose = vi.fn().mockResolvedValue(undefined);

  return {
    BuildOrchestrator: vi.fn(() => ({
      build: mockBuild,
      dispose: mockDispose,
    })),
    buildUI: vi.fn().mockResolvedValue({
      success: true,
      durationMs: 100,
    }),
  };
});

// Mock findProjectRoot to return a controlled temp dir
let tmpDir: string;

vi.mock('../../utils/paths', () => ({
  findProjectRoot: vi.fn(() => tmpDir),
}));

describe('buildAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = join(import.meta.dir, `.tmp-build-test-${Date.now()}`);
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should export buildAction function', async () => {
    const { buildAction } = await import('../build');
    expect(buildAction).toBeDefined();
    expect(typeof buildAction).toBe('function');
  });

  it('should be an async function that returns a number', async () => {
    // Create an API-only project
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');
    writeFileSync(join(tmpDir, 'package.json'), '{}');

    const { buildAction } = await import('../build');
    const result = buildAction({ noTypecheck: true });

    expect(result).toBeInstanceOf(Promise);

    const exitCode = await result;
    expect(typeof exitCode).toBe('number');
  });

  it('should return exit code 1 when no app entries are found', async () => {
    // Empty src/ — no server.ts, no app.tsx
    writeFileSync(join(tmpDir, 'package.json'), '{}');

    const { buildAction } = await import('../build');
    const exitCode = await buildAction();

    expect(exitCode).toBe(1);
  });

  it('should dispatch to API build for api-only projects', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');
    writeFileSync(join(tmpDir, 'package.json'), '{}');

    const { buildAction } = await import('../build');
    const { BuildOrchestrator } = await import('../../production-build');

    const exitCode = await buildAction({ noTypecheck: true });

    expect(exitCode).toBe(0);
    expect(BuildOrchestrator).toHaveBeenCalled();
  });

  it('should dispatch to UI build for ui-only projects', async () => {
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');
    writeFileSync(join(tmpDir, 'package.json'), '{}');

    const { buildAction } = await import('../build');
    const { buildUI } = await import('../../production-build');

    const exitCode = await buildAction();

    expect(exitCode).toBe(0);
    expect(buildUI).toHaveBeenCalled();
  });

  it('should dispatch to full-stack build for projects with both server and UI', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');
    writeFileSync(join(tmpDir, 'package.json'), '{}');

    const { buildAction } = await import('../build');
    const { BuildOrchestrator, buildUI } = await import('../../production-build');

    const exitCode = await buildAction();

    expect(exitCode).toBe(0);
    // Full-stack runs both API and UI builds
    expect(BuildOrchestrator).toHaveBeenCalled();
    expect(buildUI).toHaveBeenCalled();
  });

  it('should return exit code 1 for ui-only project without client entry', async () => {
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    // No entry-client.ts
    writeFileSync(join(tmpDir, 'package.json'), '{}');

    const { buildAction } = await import('../build');
    const exitCode = await buildAction();

    expect(exitCode).toBe(1);
  });
});
