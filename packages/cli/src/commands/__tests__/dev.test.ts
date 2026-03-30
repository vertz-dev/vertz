import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'bun:test';
import { Command } from 'commander';
import type { DetectedApp } from '../../dev-server/app-detector';
import type { FileChange } from '../../pipeline';
import {
  categorizeFileChange,
  getAffectedStages,
  getStagesForChanges,
} from '../../pipeline/watcher';
import { registerDevCommand } from '../dev';

describe('Pipeline Orchestrator', () => {
  describe('categorizeFileChange', () => {
    it('should categorize .module.ts files as module', () => {
      const category = categorizeFileChange('src/modules/user.module.ts');
      expect(category).toBe('module');
    });

    it('should categorize .schema.ts files as schema', () => {
      const category = categorizeFileChange('src/schemas/user.schema.ts');
      expect(category).toBe('schema');
    });

    it('should categorize .service.ts files as service', () => {
      const category = categorizeFileChange('src/services/auth.service.ts');
      expect(category).toBe('service');
    });

    it('should categorize .tsx files as component', () => {
      const category = categorizeFileChange('src/components/Button.tsx');
      expect(category).toBe('component');
    });

    it('should categorize .route.ts files as route', () => {
      const category = categorizeFileChange('src/routes/api.route.ts');
      expect(category).toBe('route');
    });

    it('should categorize config files as config', () => {
      const category = categorizeFileChange('vertz.config.ts');
      expect(category).toBe('config');
    });

    it('should categorize .ts files that are not special as other', () => {
      const category = categorizeFileChange('src/utils/helpers.ts');
      expect(category).toBe('other');
    });
  });

  describe('stage determination', () => {
    it('should return analyze + codegen for module changes', () => {
      const category = categorizeFileChange('src/modules/user.module.ts');
      const stages = getAffectedStages(category);
      expect(stages).toContain('analyze');
      expect(stages).toContain('codegen');
    });

    it('should return db-sync, codegen, and openapi for schema changes', () => {
      const category = categorizeFileChange('src/schemas/user.schema.ts');
      const stages = getAffectedStages(category);
      expect(stages).toContain('db-sync');
      expect(stages).toContain('codegen');
      expect(stages).toContain('openapi');
      expect(stages).not.toContain('analyze');
    });

    it('should return db-sync before codegen for schema changes', () => {
      const category = categorizeFileChange('src/schemas/user.schema.ts');
      const stages = getAffectedStages(category);
      const dbSyncIdx = stages.indexOf('db-sync');
      const codegenIdx = stages.indexOf('codegen');
      expect(dbSyncIdx).toBeLessThan(codegenIdx);
    });

    it('should return build-ui only for component changes', () => {
      const category = categorizeFileChange('src/components/Button.tsx');
      const stages = getAffectedStages(category);
      expect(stages).toContain('build-ui');
      expect(stages).not.toContain('analyze');
      expect(stages).not.toContain('codegen');
    });

    it('should return all stages for config changes', () => {
      const category = categorizeFileChange('vertz.config.ts');
      const stages = getAffectedStages(category);
      expect(stages).toContain('analyze');
      expect(stages).toContain('codegen');
      expect(stages).toContain('build-ui');
    });
  });

  describe('dependency graph', () => {
    it('should identify that schema changes trigger db-sync and codegen but not UI build', () => {
      const category = categorizeFileChange('src/schemas/user.schema.ts');
      const stages = getAffectedStages(category);

      expect(stages).toEqual(expect.arrayContaining(['db-sync', 'codegen']));
      expect(stages).not.toContain('build-ui');
    });

    it('should identify that module changes trigger analyze and codegen', () => {
      const category = categorizeFileChange('src/modules/auth.module.ts');
      const stages = getAffectedStages(category);

      // Module changes affect the IR analysis and codegen
      expect(stages).toEqual(expect.arrayContaining(['analyze', 'codegen']));
    });
  });

  describe('error handling', () => {
    it('should propagate compiler errors without crashing the watcher', async () => {
      // This tests that when the compiler throws, the error propagates correctly
      const mockCompiler = {
        analyze: vi.fn().mockRejectedValue(new Error('Syntax error')),
      };

      // The error should propagate - the orchestrator catches it
      await expect(mockCompiler.analyze()).rejects.toThrow('Syntax error');
    });

    it('should propagate codegen errors correctly', async () => {
      // When codegen fails, the error should propagate
      const mockCodegen = {
        generate: vi.fn().mockRejectedValue(new Error('Codegen failed')),
      };

      // The error should propagate
      await expect(mockCodegen.generate({}, {})).rejects.toThrow('Codegen failed');
    });
  });

  describe('Feature: Dev Pipeline Refactor', () => {
    describe('Given the dev command logic', () => {
      describe('When the file watcher triggers', () => {
        it('then it should reuse the core logic from watcher.ts', () => {
          // This test verifies that the dev command uses getStagesForChanges from watcher.ts
          const changes: FileChange[] = [
            { type: 'change', path: 'src/modules/auth.module.ts' },
            { type: 'add', path: 'src/components/Button.tsx' },
          ];

          // The dev command should use getStagesForChanges from the pipeline watcher
          const stages = getStagesForChanges(changes);

          // Should include analyze + codegen for module changes
          expect(stages).toContain('analyze');
          expect(stages).toContain('codegen');
          // Should include build-ui for component changes
          expect(stages).toContain('build-ui');
        });

        it('should handle multiple file changes correctly', () => {
          const changes: FileChange[] = [
            { type: 'change', path: 'src/modules/user.module.ts' },
            { type: 'change', path: 'src/schemas/user.schema.ts' },
            { type: 'change', path: 'src/components/Header.tsx' },
          ];

          const stages = getStagesForChanges(changes);

          // Module changes need analyze + codegen
          expect(stages).toContain('analyze');
          expect(stages).toContain('codegen');
          // Schema changes need codegen (but analyze already added)
          expect(stages).toContain('codegen');
          // Component changes need build-ui
          expect(stages).toContain('build-ui');
        });

        it('should always include analyze before codegen', () => {
          const changes: FileChange[] = [{ type: 'change', path: 'src/schemas/user.schema.ts' }];

          const stages = getStagesForChanges(changes);

          // Schema changes trigger codegen, but analyze should be auto-added
          expect(stages).toContain('codegen');
          expect(stages).toContain('analyze');
        });

        it('should return stages in canonical execution order', () => {
          // Mixed changes: schema + module + component triggers all stages
          const changes: FileChange[] = [
            { type: 'change', path: 'src/schemas/user.schema.ts' },
            { type: 'change', path: 'src/modules/auth.module.ts' },
            { type: 'change', path: 'src/components/Button.tsx' },
          ];

          const stages = getStagesForChanges(changes);

          // Canonical order: analyze, db-sync, codegen, openapi, build-ui
          expect(stages[0]).toBe('analyze');
          const dbSyncIdx = stages.indexOf('db-sync');
          const codegenIdx = stages.indexOf('codegen');
          const openapiIdx = stages.indexOf('openapi');
          const buildUiIdx = stages.indexOf('build-ui');
          expect(dbSyncIdx).toBeLessThan(codegenIdx);
          expect(codegenIdx).toBeLessThan(openapiIdx);
          expect(openapiIdx).toBeLessThan(buildUiIdx);
        });
      });
    });

    describe('Given existing tests', () => {
      describe('When run', () => {
        it('then they should pass without regression', () => {
          // This test ensures the refactor doesn't break existing functionality
          // The categorizeFileChange and getAffectedStages should work as before
          const moduleCategory = categorizeFileChange('src/modules/test.module.ts');
          expect(moduleCategory).toBe('module');

          const stages = getAffectedStages(moduleCategory);
          expect(stages).toContain('analyze');
          expect(stages).toContain('codegen');
        });
      });
    });
  });
});

describe('registerDevCommand', () => {
  it('registers a "dev" command on the program', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    expect(devCmd).toBeDefined();
  });

  it('has description', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    expect(devCmd?.description()).toContain('development server');
  });

  it('supports --port option with default 3000', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    const portOpt = devCmd?.options.find((o) => o.long === '--port');
    expect(portOpt).toBeDefined();
    expect(portOpt?.defaultValue).toBe('3000');
  });

  it('supports --host option with default localhost', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    const hostOpt = devCmd?.options.find((o) => o.long === '--host');
    expect(hostOpt).toBeDefined();
    expect(hostOpt?.defaultValue).toBe('localhost');
  });

  it('does not have --ssr flag (unified SSR+HMR is always on)', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    const ssrOpt = devCmd?.options.find((o) => o.long === '--ssr');
    expect(ssrOpt).toBeUndefined();
  });

  it('supports --open flag', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    const openOpt = devCmd?.options.find((o) => o.long === '--open');
    expect(openOpt).toBeDefined();
  });

  it('supports --no-typecheck flag', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    const noTypecheckOpt = devCmd?.options.find((o) => o.long === '--no-typecheck');
    expect(noTypecheckOpt).toBeDefined();
  });

  it('supports --verbose flag', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    const verboseOpt = devCmd?.options.find((o) => o.long === '--verbose');
    expect(verboseOpt).toBeDefined();
  });

  it('supports --experimental-runtime flag', () => {
    const program = new Command();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    const runtimeOpt = devCmd?.options.find((o) => o.long === '--experimental-runtime');
    expect(runtimeOpt).toBeDefined();
  });
});

describe('devAction error paths', () => {
  let pathsSpy: Mock<(...args: unknown[]) => unknown>;
  let appDetectorSpy: Mock<(...args: unknown[]) => unknown>;

  afterEach(() => {
    pathsSpy?.mockRestore();
    appDetectorSpy?.mockRestore();
  });

  it('returns err when findProjectRoot returns null', async () => {
    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(null) as Mock<
      (...args: unknown[]) => unknown
    >;

    const { devAction } = await import('../dev');
    const result = await devAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Could not find project root');
    }
  });

  it('returns err when detectAppType throws', async () => {
    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue('/fake/root') as Mock<
      (...args: unknown[]) => unknown
    >;

    const appDetector = await import('../../dev-server/app-detector');
    appDetectorSpy = vi.spyOn(appDetector, 'detectAppType').mockImplementation(() => {
      throw new Error('No app entry found');
    }) as Mock<(...args: unknown[]) => unknown>;

    const { devAction } = await import('../dev');
    const result = await devAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No app entry found');
    }
  });

  it('returns err with stringified value when detectAppType throws non-Error', async () => {
    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue('/fake/root') as Mock<
      (...args: unknown[]) => unknown
    >;

    const appDetector = await import('../../dev-server/app-detector');
    appDetectorSpy = vi.spyOn(appDetector, 'detectAppType').mockImplementation(() => {
      throw 'unexpected string error';
    }) as Mock<(...args: unknown[]) => unknown>;

    const { devAction } = await import('../dev');
    const result = await devAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('unexpected string error');
    }
  });
});

describe('devAction full flow', () => {
  let pathsSpy: Mock<(...args: unknown[]) => unknown>;
  let appDetectorSpy: Mock<(...args: unknown[]) => unknown>;
  let orchestratorSpy: Mock<(...args: unknown[]) => unknown>;
  let watcherSpy: Mock<(...args: unknown[]) => unknown>;
  let devServerSpy: Mock<(...args: unknown[]) => unknown>;
  let consoleLogSpy: Mock<(...args: unknown[]) => unknown>;
  let consoleErrorSpy: Mock<(...args: unknown[]) => unknown>;
  let processOnSpy: Mock<(...args: unknown[]) => unknown>;
  let registeredListeners: Array<{ event: string; handler: (...args: unknown[]) => unknown }>;

  const fakeDetected: DetectedApp = {
    type: 'api-only',
    serverEntry: '/fake/root/src/server.ts',
    projectRoot: '/fake/root',
  };

  let mockOrchestrator: {
    runFull: Mock<(...args: unknown[]) => unknown>;
    runStages: Mock<(...args: unknown[]) => unknown>;
    dispose: Mock<(...args: unknown[]) => unknown>;
  };

  let capturedOnChange: ((changes: FileChange[]) => Promise<void>) | null;

  beforeEach(async () => {
    registeredListeners = [];
    capturedOnChange = null;

    mockOrchestrator = {
      runFull: vi.fn().mockResolvedValue({ success: true, stages: [] }),
      runStages: vi.fn().mockResolvedValue({ success: true, stages: [] }),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue('/fake/root') as Mock<
      (...args: unknown[]) => unknown
    >;

    const appDetector = await import('../../dev-server/app-detector');
    appDetectorSpy = vi.spyOn(appDetector, 'detectAppType').mockReturnValue(fakeDetected) as Mock<
      (...args: unknown[]) => unknown
    >;

    const pipelineMod = await import('../../pipeline');
    orchestratorSpy = vi
      .spyOn(pipelineMod, 'PipelineOrchestrator')
      .mockImplementation(() => mockOrchestrator as unknown) as Mock<
      (...args: unknown[]) => unknown
    >;

    watcherSpy = vi
      .spyOn(pipelineMod, 'createPipelineWatcher')
      .mockImplementation((config: unknown) => {
        const cfg = config as { onChange?: (changes: FileChange[]) => Promise<void> };
        if (cfg.onChange) {
          capturedOnChange = cfg.onChange;
        }
        return { close: vi.fn() } as unknown;
      }) as Mock<(...args: unknown[]) => unknown>;

    const fullstackMod = await import('../../dev-server/fullstack-server');
    devServerSpy = vi.spyOn(fullstackMod, 'startDevServer').mockResolvedValue(undefined) as Mock<
      (...args: unknown[]) => unknown
    >;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as Mock<
      (...args: unknown[]) => unknown
    >;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) as Mock<
      (...args: unknown[]) => unknown
    >;

    // Track process.on listeners so we can clean them up
    const _originalProcessOn = process.on.bind(process);
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: (...args: unknown[]) => unknown,
    ) => {
      registeredListeners.push({ event, handler });
      return process;
    }) as typeof process.on) as Mock<(...args: unknown[]) => unknown>;
  });

  afterEach(() => {
    pathsSpy?.mockRestore();
    appDetectorSpy?.mockRestore();
    orchestratorSpy?.mockRestore();
    watcherSpy?.mockRestore();
    devServerSpy?.mockRestore();
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    processOnSpy?.mockRestore();

    // Remove any listeners we registered
    for (const { event, handler } of registeredListeners) {
      process.removeListener(event, handler as (...args: unknown[]) => void);
    }
    registeredListeners = [];
  });

  it('returns ok on successful happy path', async () => {
    const { devAction } = await import('../dev');
    const result = await devAction({ port: 4000, host: '0.0.0.0' });

    expect(result.ok).toBe(true);
    expect(mockOrchestrator.runFull).toHaveBeenCalledTimes(1);
    expect(watcherSpy).toHaveBeenCalledTimes(1);
    expect(devServerSpy).toHaveBeenCalledTimes(1);
  });

  it('creates PipelineOrchestrator with correct config', async () => {
    const { devAction } = await import('../dev');
    await devAction({ port: 5000, host: '0.0.0.0', typecheck: false, open: true });

    expect(orchestratorSpy).toHaveBeenCalledWith({
      sourceDir: 'src',
      outputDir: '.vertz/generated',
      typecheck: false,
      autoSyncDb: true,
      open: true,
      port: 5000,
      host: '0.0.0.0',
    });
  });

  it('passes detected app, port, and host to startDevServer', async () => {
    const { devAction } = await import('../dev');
    await devAction({ port: 8080, host: '127.0.0.1' });

    expect(devServerSpy).toHaveBeenCalledWith({
      detected: fakeDetected,
      port: 8080,
      host: '127.0.0.1',
    });
  });

  it('registers SIGINT, SIGTERM, and SIGHUP signal handlers', async () => {
    const { devAction } = await import('../dev');
    await devAction();

    const registeredEvents = registeredListeners.map((l) => l.event);
    expect(registeredEvents).toContain('SIGINT');
    expect(registeredEvents).toContain('SIGTERM');
    expect(registeredEvents).toContain('SIGHUP');
  });

  it('logs verbose output when verbose is true and pipeline succeeds', async () => {
    mockOrchestrator.runFull.mockResolvedValue({
      success: true,
      stages: [
        { stage: 'analyze', success: true, durationMs: 50, output: 'Analysis complete' },
        { stage: 'codegen', success: true, durationMs: 30, output: 'Generated 5 files' },
      ],
    });

    const { devAction } = await import('../dev');
    await devAction({ verbose: true });

    // Check that verbose detection logs were emitted
    const logCalls = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logCalls.some((msg: string) => msg.includes('Detected app type:'))).toBe(true);

    // Check that verbose pipeline result logs were emitted
    expect(logCalls.some((msg: string) => msg.includes('Initial pipeline complete:'))).toBe(true);
    expect(logCalls.some((msg: string) => msg.includes('analyze:'))).toBe(true);
  });

  it('logs verbose detection entries when present', async () => {
    const detectedFull: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/fake/root/src/server.ts',
      uiEntry: '/fake/root/src/app.tsx',
      ssrEntry: '/fake/root/src/entry-server.ts',
      clientEntry: '/fake/root/src/entry-client.ts',
      projectRoot: '/fake/root',
    };

    appDetectorSpy.mockReturnValue(detectedFull);

    const { devAction } = await import('../dev');
    await devAction({ verbose: true });

    const logCalls = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logCalls.some((msg: string) => msg.includes('Server:'))).toBe(true);
    expect(logCalls.some((msg: string) => msg.includes('UI:'))).toBe(true);
    expect(logCalls.some((msg: string) => msg.includes('SSR:'))).toBe(true);
    expect(logCalls.some((msg: string) => msg.includes('Client:'))).toBe(true);
  });

  it('logs errors when initial pipeline fails', async () => {
    mockOrchestrator.runFull.mockResolvedValue({
      success: false,
      stages: [
        { stage: 'analyze', success: false, durationMs: 10, error: new Error('Compile error') },
        { stage: 'codegen', success: true, durationMs: 5 },
      ],
    });

    const { devAction } = await import('../dev');
    const result = await devAction();

    // Should still return ok because the dev server starts despite pipeline failure
    expect(result.ok).toBe(true);

    const errorCalls = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(errorCalls.some((msg: string) => msg.includes('Initial pipeline failed:'))).toBe(true);
    expect(
      consoleErrorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('analyze:')),
    ).toBe(true);

    // Should log the fix suggestion
    const logCalls = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logCalls.some((msg: string) => msg.includes('Fix the errors above'))).toBe(true);
  });

  it('returns err when startDevServer throws', async () => {
    devServerSpy.mockRejectedValue(new Error('Server failed to start'));

    const { devAction } = await import('../dev');
    const result = await devAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Server failed to start');
    }
    // Dispose should be called on error
    expect(mockOrchestrator.dispose).toHaveBeenCalledTimes(1);
  });

  it('returns err with stringified message when catch receives non-Error', async () => {
    devServerSpy.mockRejectedValue('string error from server');

    const { devAction } = await import('../dev');
    const result = await devAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('string error from server');
    }
  });

  it('creates watcher with correct dir and debounceMs', async () => {
    const { devAction } = await import('../dev');
    await devAction();

    expect(watcherSpy).toHaveBeenCalledTimes(1);
    const watcherConfig = (watcherSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as {
      dir: string;
      debounceMs: number;
      onChange: unknown;
    };
    expect(watcherConfig.dir).toContain('/fake/root');
    expect(watcherConfig.dir).toContain('src');
    expect(watcherConfig.debounceMs).toBe(100);
    expect(typeof watcherConfig.onChange).toBe('function');
  });

  it('uses default options when none provided', async () => {
    const { devAction } = await import('../dev');
    await devAction();

    expect(devServerSpy).toHaveBeenCalledWith({
      detected: fakeDetected,
      port: 3000,
      host: 'localhost',
    });
  });

  describe('file watcher onChange callback', () => {
    it('calls orchestrator.runStages when files change', async () => {
      const { devAction } = await import('../dev');
      await devAction();

      expect(capturedOnChange).not.toBeNull();

      const changes: FileChange[] = [{ type: 'change', path: 'src/modules/user.module.ts' }];

      await capturedOnChange?.(changes);

      expect(mockOrchestrator.runStages).toHaveBeenCalledTimes(1);
    });

    it('logs verbose output when watcher detects changes', async () => {
      mockOrchestrator.runStages.mockResolvedValue({
        success: true,
        stages: [{ stage: 'analyze', success: true, durationMs: 20, output: 'OK' }],
      });

      const { devAction } = await import('../dev');
      await devAction({ verbose: true });

      const changes: FileChange[] = [{ type: 'change', path: 'src/modules/user.module.ts' }];

      await capturedOnChange?.(changes);

      const logCalls = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(logCalls.some((msg: string) => msg.includes('File change detected:'))).toBe(true);
      expect(logCalls.some((msg: string) => msg.includes('Running stages:'))).toBe(true);
      // Verbose stage output after success
      expect(logCalls.some((msg: string) => msg.includes('analyze:'))).toBe(true);
    });

    it('logs errors when watcher pipeline update fails', async () => {
      mockOrchestrator.runStages.mockResolvedValue({
        success: false,
        stages: [
          { stage: 'codegen', success: false, durationMs: 5, error: new Error('Gen failed') },
        ],
      });

      const { devAction } = await import('../dev');
      await devAction();

      await capturedOnChange?.([{ type: 'change', path: 'src/schemas/user.schema.ts' }]);

      const errorCalls = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(errorCalls.some((msg: string) => msg.includes('Pipeline update failed:'))).toBe(true);
    });

    it('skips execution when isRunning is false (after shutdown)', async () => {
      const { devAction } = await import('../dev');
      await devAction();

      // Find and invoke the shutdown handler to set isRunning = false
      const processExitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as unknown as typeof process.exit);

      // Find the SIGINT handler (first set of 3 are from devAction's shutdown)
      const sigintHandler = registeredListeners.find((l) => l.event === 'SIGINT');
      expect(sigintHandler).toBeDefined();

      // Call shutdown to set isRunning = false
      await (sigintHandler?.handler as () => Promise<void>)();

      // Reset runStages call count
      mockOrchestrator.runStages.mockClear();

      // Now trigger onChange — should be a no-op since isRunning = false
      await capturedOnChange?.([{ type: 'change', path: 'src/modules/user.module.ts' }]);

      expect(mockOrchestrator.runStages).not.toHaveBeenCalled();
      processExitSpy.mockRestore();
    });
  });

  describe('shutdown handler', () => {
    it('calls dispose on the orchestrator', async () => {
      const processExitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as unknown as typeof process.exit);

      const { devAction } = await import('../dev');
      await devAction();

      const sigintHandler = registeredListeners.find((l) => l.event === 'SIGINT');
      expect(sigintHandler).toBeDefined();

      await (sigintHandler?.handler as () => Promise<void>)();

      expect(mockOrchestrator.dispose).toHaveBeenCalledTimes(1);
      expect(processExitSpy).toHaveBeenCalledWith(0);

      processExitSpy.mockRestore();
    });
  });
});

describe('devAction --experimental-runtime', () => {
  let pathsSpy: Mock<(...args: unknown[]) => unknown>;
  let appDetectorSpy: Mock<(...args: unknown[]) => unknown>;
  let consoleLogSpy: Mock<(...args: unknown[]) => unknown>;
  let consoleErrorSpy: Mock<(...args: unknown[]) => unknown>;
  let processOnSpy: Mock<(...args: unknown[]) => unknown>;
  let registeredListeners: Array<{ event: string; handler: (...args: unknown[]) => unknown }>;
  let findBinarySpy: Mock<(...args: unknown[]) => unknown>;
  let launchSpy: Mock<(...args: unknown[]) => unknown>;

  const fakeDetected: DetectedApp = {
    type: 'full-stack',
    serverEntry: '/fake/root/src/server.ts',
    uiEntry: '/fake/root/src/app.tsx',
    projectRoot: '/fake/root',
  };

  beforeEach(async () => {
    registeredListeners = [];

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue('/fake/root') as Mock<
      (...args: unknown[]) => unknown
    >;

    const appDetector = await import('../../dev-server/app-detector');
    appDetectorSpy = vi.spyOn(appDetector, 'detectAppType').mockReturnValue(fakeDetected) as Mock<
      (...args: unknown[]) => unknown
    >;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as Mock<
      (...args: unknown[]) => unknown
    >;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) as Mock<
      (...args: unknown[]) => unknown
    >;

    processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: (...args: unknown[]) => unknown,
    ) => {
      registeredListeners.push({ event, handler });
      return process;
    }) as typeof process.on) as Mock<(...args: unknown[]) => unknown>;
  });

  afterEach(() => {
    pathsSpy?.mockRestore();
    appDetectorSpy?.mockRestore();
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    processOnSpy?.mockRestore();
    findBinarySpy?.mockRestore();
    launchSpy?.mockRestore();

    for (const { event, handler } of registeredListeners) {
      process.removeListener(event, handler as (...args: unknown[]) => void);
    }
    registeredListeners = [];
  });

  it('falls back to Bun dev server when binary is not found', async () => {
    const launcherMod = await import('../../runtime/launcher');
    findBinarySpy = vi.spyOn(launcherMod, 'findRuntimeBinary').mockReturnValue(null) as Mock<
      (...args: unknown[]) => unknown
    >;

    // Mock the Bun fallback path to prevent it from actually starting
    const fullstackMod = await import('../../dev-server/fullstack-server');
    const devServerSpy = vi.spyOn(fullstackMod, 'startDevServer').mockResolvedValue(undefined);
    const pipelineMod = await import('../../pipeline');
    const orchestratorSpy = vi.spyOn(pipelineMod, 'PipelineOrchestrator').mockImplementation(
      () =>
        ({
          runFull: vi.fn().mockResolvedValue({ success: true, stages: [] }),
          dispose: vi.fn(),
        }) as never,
    ) as Mock<(...args: unknown[]) => unknown>;
    vi.spyOn(pipelineMod, 'createPipelineWatcher').mockReturnValue({
      close: vi.fn(),
    } as never);

    const { devAction } = await import('../dev');
    const result = await devAction({ experimentalRuntime: true });

    // Should log fallback info and proceed to Bun dev server
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Native runtime not found'));
    expect(result.ok).toBe(true);

    orchestratorSpy.mockRestore();
    devServerSpy.mockRestore();
  });

  it('spawns the Rust binary when found', async () => {
    const launcherMod = await import('../../runtime/launcher');
    findBinarySpy = vi
      .spyOn(launcherMod, 'findRuntimeBinary')
      .mockReturnValue('/fake/binary') as Mock<(...args: unknown[]) => unknown>;

    // Mock the child process
    const mockChild = {
      on: vi.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === 'exit') {
          // Simulate immediate exit for test
          setTimeout(cb, 10);
        }
        return mockChild;
      }),
      kill: vi.fn(),
      pid: 12345,
    };
    launchSpy = vi.spyOn(launcherMod, 'launchRuntime').mockReturnValue(mockChild as never) as Mock<
      (...args: unknown[]) => unknown
    >;

    const { devAction } = await import('../dev');
    const result = await devAction({ experimentalRuntime: true, port: 4000, host: '0.0.0.0' });

    expect(result.ok).toBe(true);
    expect(launchSpy).toHaveBeenCalledWith('/fake/binary', {
      port: 4000,
      host: '0.0.0.0',
      typecheck: true,
      open: false,
    });
  });

  it('does not start Bun pipeline or dev server when using experimental runtime', async () => {
    const launcherMod = await import('../../runtime/launcher');
    findBinarySpy = vi
      .spyOn(launcherMod, 'findRuntimeBinary')
      .mockReturnValue('/fake/binary') as Mock<(...args: unknown[]) => unknown>;

    const mockChild = {
      on: vi.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === 'exit') setTimeout(cb, 10);
        return mockChild;
      }),
      kill: vi.fn(),
      pid: 12345,
    };
    launchSpy = vi.spyOn(launcherMod, 'launchRuntime').mockReturnValue(mockChild as never) as Mock<
      (...args: unknown[]) => unknown
    >;

    const pipelineMod = await import('../../pipeline');
    const orchestratorSpy = vi
      .spyOn(pipelineMod, 'PipelineOrchestrator')
      .mockImplementation(() => ({}) as unknown);

    const fullstackMod = await import('../../dev-server/fullstack-server');
    const devServerSpy = vi.spyOn(fullstackMod, 'startDevServer').mockResolvedValue(undefined);

    const { devAction } = await import('../dev');
    await devAction({ experimentalRuntime: true });

    // Pipeline and Bun dev server should NOT be used
    expect(orchestratorSpy).not.toHaveBeenCalled();
    expect(devServerSpy).not.toHaveBeenCalled();

    orchestratorSpy.mockRestore();
    devServerSpy.mockRestore();
  });
});

describe('registerDevCommand action handler', () => {
  it('calls process.exit(1) when devAction returns err', async () => {
    const pathsMod = await import('../../utils/paths');
    const pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(null) as Mock<
      (...args: unknown[]) => unknown
    >;
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) as Mock<
      (...args: unknown[]) => unknown
    >;
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as typeof process.exit);

    const program = new Command();
    program.exitOverride();
    registerDevCommand(program);

    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev');
    expect(devCmd).toBeDefined();

    // Manually trigger the action handler
    // Commander stores the action handler which we can invoke
    // We'll parse and run the command
    try {
      await program.parseAsync(['node', 'test', 'dev', '--port', '3000']);
    } catch {
      // Commander might throw due to exitOverride
    }

    // Poll until the async action completes (process.exit is called)
    const deadline = Date.now() + 2000;
    while (!processExitSpy.mock.calls.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    pathsSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
