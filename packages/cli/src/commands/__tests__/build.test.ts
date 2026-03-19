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

  it('should return err when api-only build fails', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');

    orchestratorSpy.mockImplementation(
      () =>
        ({
          build: vi.fn().mockResolvedValue({
            success: false,
            error: 'esbuild compilation error',
          }),
          dispose: vi.fn().mockResolvedValue(undefined),
        }) as unknown,
    );

    const { buildAction } = await import('../build');
    const result = await buildAction({ noTypecheck: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('esbuild compilation error');
    }
  });

  it('should return err when ui-only buildUI fails', async () => {
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');

    buildUISpy.mockResolvedValue({
      success: false,
      error: 'UI build compilation failed',
    });

    const { buildAction } = await import('../build');
    const result = await buildAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('UI build compilation failed');
    }
  });

  it('should return err when full-stack API build step fails', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');

    orchestratorSpy.mockImplementation(
      () =>
        ({
          build: vi.fn().mockResolvedValue({
            success: false,
            error: 'API stage failed in full-stack build',
          }),
          dispose: vi.fn().mockResolvedValue(undefined),
        }) as unknown,
    );

    const { buildAction } = await import('../build');
    const result = await buildAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('API stage failed in full-stack build');
    }
  });

  it('should return err when findProjectRoot returns undefined', async () => {
    pathsSpy.mockReturnValue(undefined);

    const { buildAction } = await import('../build');
    const result = await buildAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('project root');
    }
  });

  it('should log verbose output for api-only build', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { buildAction } = await import('../build');
      await buildAction({ verbose: true, noTypecheck: true });

      const calls = logSpy.mock.calls.map((c) => c[0]);
      expect(
        calls.some((c: string) => typeof c === 'string' && c.includes('Detected app type')),
      ).toBe(true);
      expect(
        calls.some((c: string) => typeof c === 'string' && c.includes('Build configuration')),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('should return err when api-only has no server entry', async () => {
    // Create a scenario where detectAppType returns api-only but serverEntry is undefined
    // This happens when we mock detectAppType directly
    const appDetector = await import('../../dev-server/app-detector');
    // @ts-expect-error — intentionally passing undefined serverEntry to test missing entry guard
    const detectSpy = vi.spyOn(appDetector, 'detectAppType').mockReturnValue({
      type: 'api-only',
      serverEntry: undefined,
      projectRoot: tmpDir,
    });

    try {
      const { buildAction } = await import('../build');
      const result = await buildAction();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No server entry point');
      }
    } finally {
      detectSpy.mockRestore();
    }
  });

  it('should return err when build throws an unexpected error', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');

    orchestratorSpy.mockImplementation(
      () =>
        ({
          build: vi.fn().mockRejectedValue(new Error('unexpected crash')),
          dispose: vi.fn().mockResolvedValue(undefined),
        }) as unknown,
    );

    const { buildAction } = await import('../build');
    const result = await buildAction({ noTypecheck: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('unexpected crash');
    }
  });

  it('should log generated files summary when present', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');

    orchestratorSpy.mockImplementation(
      () =>
        ({
          build: vi.fn().mockResolvedValue({
            ...mockBuildResult,
            manifest: {
              ...mockBuildResult.manifest,
              generatedFiles: [
                { type: 'route', path: 'routes.ts' },
                { type: 'route', path: 'routes2.ts' },
                { type: 'schema', path: 'schema.ts' },
              ],
            },
          }),
          dispose: vi.fn().mockResolvedValue(undefined),
        }) as unknown,
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { buildAction } = await import('../build');
      const result = await buildAction({ noTypecheck: true });

      expect(result.ok).toBe(true);
      const calls = logSpy.mock.calls.map((c) => c[0]);
      expect(
        calls.some((c: string) => typeof c === 'string' && c.includes('Generated Files')),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('should return err for ui-only project without SSR entry', async () => {
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');

    // Force ui-only detection with clientEntry but no uiEntry/ssrEntry
    const appDetector = await import('../../dev-server/app-detector');
    const detectSpy = vi.spyOn(appDetector, 'detectAppType').mockReturnValue({
      type: 'ui-only',
      clientEntry: join(tmpDir, 'src', 'entry-client.ts'),
      projectRoot: tmpDir,
    });

    try {
      const { buildAction } = await import('../build');
      const result = await buildAction();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No server entry point');
      }
    } finally {
      detectSpy.mockRestore();
    }
  });

  it('should log verbose output for ui-only build', async () => {
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { buildAction } = await import('../build');
      await buildAction({ verbose: true });

      const calls = logSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c: string) => typeof c === 'string' && c.includes('Client entry'))).toBe(
        true,
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it('should return err when full-stack UI build step fails', async () => {
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {};');
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');

    buildUISpy.mockResolvedValue({
      success: false,
      error: 'UI build failed in full-stack',
    });

    const { buildAction } = await import('../build');
    const result = await buildAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('UI build failed in full-stack');
    }
  });

  it('should read SEO metadata from package.json', async () => {
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        vertz: { title: 'My App', description: 'A test app' },
      }),
    );

    const { buildAction } = await import('../build');
    await buildAction();

    // Verify buildUI was called with the SEO metadata
    expect(buildUISpy).toHaveBeenCalled();
    const callArgs = buildUISpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs.title).toBe('My App');
    expect(callArgs.description).toBe('A test app');
  });
});
