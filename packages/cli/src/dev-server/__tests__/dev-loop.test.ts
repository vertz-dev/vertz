import { describe, expect, it, vi } from 'bun:test';
import type { DevLoopDeps } from '../dev-loop';
import { createDevLoop } from '../dev-loop';
import type { FileChange } from '../watcher';

function createMockDeps(overrides?: Partial<DevLoopDeps>): DevLoopDeps {
  return {
    compile: vi.fn().mockResolvedValue({
      success: true,
      ir: {
        modules: [],
        middleware: [],
        schemas: [],
        diagnostics: [],
        dependencyGraph: { nodes: [], edges: [] },
        app: { name: 'test' },
      },
      diagnostics: [],
    }),
    startProcess: vi.fn(),
    stopProcess: vi.fn().mockResolvedValue(undefined),
    onFileChange: vi.fn(),
    onCompileSuccess: vi.fn(),
    onCompileError: vi.fn(),
    ...overrides,
  };
}

describe('createDevLoop', () => {
  it('returns a dev loop with start and stop', () => {
    const loop = createDevLoop(createMockDeps());
    expect(typeof loop.start).toBe('function');
    expect(typeof loop.stop).toBe('function');
  });

  it('start compiles and starts process on success', async () => {
    const deps = createMockDeps();
    const loop = createDevLoop(deps);

    await loop.start();

    expect(deps.compile).toHaveBeenCalledOnce();
    expect(deps.startProcess).toHaveBeenCalledOnce();
    expect(deps.onCompileSuccess).toHaveBeenCalledOnce();
  });

  it('start compiles but does not start process on failure', async () => {
    const deps = createMockDeps({
      compile: vi.fn().mockResolvedValue({
        success: false,
        ir: {
          modules: [],
          middleware: [],
          schemas: [],
          diagnostics: [],
          dependencyGraph: { nodes: [], edges: [] },
          app: { name: 'test' },
        },
        diagnostics: [
          { severity: 'error', code: 'VERTZ_MISSING_RESPONSE_SCHEMA', message: 'oops' },
        ],
      }),
    });
    const loop = createDevLoop(deps);

    await loop.start();

    expect(deps.compile).toHaveBeenCalledOnce();
    expect(deps.startProcess).not.toHaveBeenCalled();
    expect(deps.onCompileError).toHaveBeenCalledOnce();
  });

  it('stop calls stopProcess', async () => {
    const deps = createMockDeps();
    const loop = createDevLoop(deps);

    await loop.start();
    await loop.stop();

    expect(deps.stopProcess).toHaveBeenCalledOnce();
  });

  it('registers file change handler', async () => {
    const deps = createMockDeps();
    const loop = createDevLoop(deps);

    await loop.start();

    expect(deps.onFileChange).toHaveBeenCalledOnce();
    expect(typeof (deps.onFileChange as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      'function',
    );
  });

  it('recompiles and restarts process on file change', async () => {
    let changeHandler: ((changes: FileChange[]) => void) | undefined;
    const deps = createMockDeps({
      onFileChange: vi.fn((handler) => {
        changeHandler = handler;
      }),
    });
    const loop = createDevLoop(deps);

    await loop.start();
    expect(changeHandler).toBeDefined();

    await changeHandler?.([{ type: 'change', path: '/project/src/app.ts' }]);

    expect(deps.compile).toHaveBeenCalledTimes(2);
    expect(deps.stopProcess).toHaveBeenCalledOnce();
    expect(deps.startProcess).toHaveBeenCalledTimes(2);
  });

  it('does not restart process on failed recompile', async () => {
    let changeHandler: ((changes: FileChange[]) => void) | undefined;
    let callCount = 0;
    const deps = createMockDeps({
      compile: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            ir: {
              modules: [],
              middleware: [],
              schemas: [],
              diagnostics: [],
              dependencyGraph: { nodes: [], edges: [] },
              app: { name: 'test' },
            },
            diagnostics: [],
          });
        }
        return Promise.resolve({
          success: false,
          ir: {
            modules: [],
            middleware: [],
            schemas: [],
            diagnostics: [],
            dependencyGraph: { nodes: [], edges: [] },
            app: { name: 'test' },
          },
          diagnostics: [
            { severity: 'error', code: 'VERTZ_MISSING_RESPONSE_SCHEMA', message: 'oops' },
          ],
        });
      }),
      onFileChange: vi.fn((handler) => {
        changeHandler = handler;
      }),
    });
    const loop = createDevLoop(deps);

    await loop.start();
    await changeHandler?.([{ type: 'change', path: '/project/src/app.ts' }]);

    expect(deps.compile).toHaveBeenCalledTimes(2);
    expect(deps.startProcess).toHaveBeenCalledTimes(1);
    expect(deps.onCompileError).toHaveBeenCalledOnce();
  });
});
