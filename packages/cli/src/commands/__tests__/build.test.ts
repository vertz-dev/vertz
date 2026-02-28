/**
 * Build Command Tests
 *
 * Tests for the vertz build CLI command.
 * Verifies app type detection dispatch and proper Result returns.
 *
 * NOTE: This test file avoids vi.mock() for shared modules (production-build,
 * utils/paths) because Bun test runs all files in one process and vi.mock()
 * is permanent — it would break orchestrator.test.ts and ui-build-pipeline.test.ts.
 * Instead, we spy on individual functions in beforeEach/afterEach.
 */

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('buildAction', () => {
  let tmpDir: string;
  let pathsSpy: Mock<(...args: unknown[]) => unknown>;
  let orchestratorSpy: Mock<(...args: unknown[]) => unknown>;
  let buildUISpy: Mock<(...args: unknown[]) => unknown>;

  const mockBuildResult = {
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
  };

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `.vertz-build-test-${Date.now()}`);
    mkdirSync(join(tmpDir, 'src'), { recursive: true });

    // Spy on findProjectRoot to return our temp dir
    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as Mock<
      (...args: unknown[]) => unknown
    >;

    // Spy on BuildOrchestrator to avoid real bundling
    const prodBuild = await import('../../production-build');
    orchestratorSpy = vi.spyOn(prodBuild, 'BuildOrchestrator').mockImplementation(
      () =>
        ({
          build: vi.fn().mockResolvedValue(mockBuildResult),
          dispose: vi.fn().mockResolvedValue(undefined),
        }) as unknown,
    ) as Mock<(...args: unknown[]) => unknown>;

    buildUISpy = vi.spyOn(prodBuild, 'buildUI').mockResolvedValue({
      success: true,
      durationMs: 100,
    }) as Mock<(...args: unknown[]) => unknown>;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    pathsSpy.mockRestore();
    orchestratorSpy.mockRestore();
    buildUISpy.mockRestore();
  });

  it('should export buildAction function', async () => {
    const { buildAction } = await import('../build');
    expect(buildAction).toBeDefined();
    expect(typeof buildAction).toBe('function');
  });

  it('should be an async function that returns a Result', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');

    const { buildAction } = await import('../build');
    const resultPromise = buildAction({ noTypecheck: true });

    expect(resultPromise).toBeInstanceOf(Promise);

    const result = await resultPromise;
    expect(result).toHaveProperty('ok');
  });

  it('should return err when no app entries are found', async () => {
    const { buildAction } = await import('../build');
    const result = await buildAction();

    expect(result.ok).toBe(false);
  });

  it('should dispatch to API build for api-only projects', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');

    const { buildAction } = await import('../build');
    const result = await buildAction({ noTypecheck: true });

    expect(result.ok).toBe(true);
    expect(orchestratorSpy).toHaveBeenCalled();
  });

  it('should dispatch to UI build for ui-only projects', async () => {
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');

    const { buildAction } = await import('../build');
    const result = await buildAction();

    expect(result.ok).toBe(true);
    expect(buildUISpy).toHaveBeenCalled();
  });

  it('should dispatch to full-stack build for projects with both server and UI', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');

    const { buildAction } = await import('../build');
    const result = await buildAction();

    expect(result.ok).toBe(true);
    expect(orchestratorSpy).toHaveBeenCalled();
    expect(buildUISpy).toHaveBeenCalled();
  });

  it('should return err for ui-only project without client entry', async () => {
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');

    const { buildAction } = await import('../build');
    const result = await buildAction();

    expect(result.ok).toBe(false);
  });
});
