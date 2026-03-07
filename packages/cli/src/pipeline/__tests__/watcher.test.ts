import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createPipelineWatcher, createWatcher } from '../watcher';

describe('createWatcher (pipeline)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits batched changes to registered handler after debounce', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: 'src/app.ts' });

    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(handler).toHaveBeenCalledOnce();
    watcher.close();
  });

  it('adds category to each change in the batch', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: 'src/users.schema.ts' });
    vi.advanceTimersByTime(100);

    const batch = handler.mock.calls[0]![0];
    expect(batch[0].category).toBe('schema');
    watcher.close();
  });

  it('batches rapid changes within debounce window', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: 'src/a.ts' });
    vi.advanceTimersByTime(50);
    watcher._emit({ type: 'add', path: 'src/b.schema.ts' });
    vi.advanceTimersByTime(50);

    // Timer reset on second emit — not fired yet
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(handler).toHaveBeenCalledOnce();
    const batch = handler.mock.calls[0]![0];
    expect(batch).toHaveLength(2);
    watcher.close();
  });

  it('ignores node_modules paths', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/node_modules/pkg/index.js' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
    watcher.close();
  });

  it('ignores .git paths', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/.git/HEAD' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
    watcher.close();
  });

  it('ignores .vertz/generated paths', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/.vertz/generated/types.ts' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
    watcher.close();
  });

  it('ignores dist paths', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/dist/index.js' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
    watcher.close();
  });

  it('accepts custom ignore patterns', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp', ignorePatterns: ['/custom-ignore/'] });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/custom-ignore/file.ts' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();

    // Default patterns are replaced, so node_modules is no longer ignored
    watcher._emit({ type: 'change', path: '/tmp/node_modules/pkg.js' });
    vi.advanceTimersByTime(100);

    expect(handler).toHaveBeenCalledOnce();
    watcher.close();
  });

  it('calls onChange callback in addition to registered handlers', () => {
    const handler = vi.fn();
    const onChange = vi.fn();
    const watcher = createWatcher({ dir: '/tmp', onChange });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: 'src/app.ts' });
    vi.advanceTimersByTime(100);

    expect(handler).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    watcher.close();
  });

  it('close cancels pending changes', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: 'src/app.ts' });
    watcher.close();

    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts custom debounce delay', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp', debounceMs: 500 });
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: 'src/app.ts' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);

    expect(handler).toHaveBeenCalledOnce();
    watcher.close();
  });

  it('does not fire handler when no changes are pending', () => {
    const handler = vi.fn();
    const watcher = createWatcher({ dir: '/tmp' });
    watcher.on('change', handler);

    // No _emit calls — just advance time
    vi.advanceTimersByTime(200);

    expect(handler).not.toHaveBeenCalled();
    watcher.close();
  });
});

describe('PipelineWatcherImpl', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches schema changes to db-sync and codegen handlers', () => {
    const dbSyncHandler = vi.fn();
    const codegenHandler = vi.fn();
    const buildUiHandler = vi.fn();
    const pw = createPipelineWatcher({ dir: '/tmp' });
    pw.on('db-sync', dbSyncHandler);
    pw.on('codegen', codegenHandler);
    pw.on('build-ui', buildUiHandler);

    // Access internal watcher via the implementation
    const impl = pw as import('../watcher').PipelineWatcherImpl;
    // PipelineWatcherImpl wraps createWatcher with onChange, so we need
    // to trigger via the internal watcher's _emit. Access it indirectly
    // by using the onChange callback path.

    // Since PipelineWatcherImpl doesn't expose _emit, we test via
    // the onChange integration — createWatcher calls onChange which
    // calls handleChanges. We can trigger this by directly calling
    // handleChanges with typed changes.
    (impl as any)['handleChanges']([
      { type: 'change' as const, path: 'src/users.schema.ts', category: 'schema' as const },
    ]);

    expect(dbSyncHandler).toHaveBeenCalledOnce();
    expect(codegenHandler).toHaveBeenCalledOnce();
    expect(buildUiHandler).not.toHaveBeenCalled();

    pw.close();
  });

  it('dispatches component changes to build-ui handler only', () => {
    const analyzeHandler = vi.fn();
    const buildUiHandler = vi.fn();
    const pw = createPipelineWatcher({ dir: '/tmp' });
    pw.on('analyze', analyzeHandler);
    pw.on('build-ui', buildUiHandler);

    (pw as any)['handleChanges']([
      { type: 'change' as const, path: 'src/Button.tsx', category: 'component' as const },
    ]);

    expect(buildUiHandler).toHaveBeenCalledOnce();
    expect(analyzeHandler).not.toHaveBeenCalled();

    pw.close();
  });

  it('dispatches module changes to analyze and codegen handlers', () => {
    const analyzeHandler = vi.fn();
    const codegenHandler = vi.fn();
    const pw = createPipelineWatcher({ dir: '/tmp' });
    pw.on('analyze', analyzeHandler);
    pw.on('codegen', codegenHandler);

    (pw as any)['handleChanges']([
      { type: 'change' as const, path: 'src/auth.module.ts', category: 'module' as const },
    ]);

    expect(analyzeHandler).toHaveBeenCalledOnce();
    expect(codegenHandler).toHaveBeenCalledOnce();

    pw.close();
  });

  it('does not register handlers after close', () => {
    const handler = vi.fn();
    const pw = createPipelineWatcher({ dir: '/tmp' });
    pw.close();

    pw.on('analyze', handler);

    // Try to trigger — should be a no-op
    (pw as any)['handleChanges']([
      { type: 'change' as const, path: 'src/auth.module.ts', category: 'module' as const },
    ]);

    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches to multiple handlers on the same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const pw = createPipelineWatcher({ dir: '/tmp' });
    pw.on('build-ui', handler1);
    pw.on('build-ui', handler2);

    (pw as any)['handleChanges']([
      { type: 'change' as const, path: 'src/Button.tsx', category: 'component' as const },
    ]);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();

    pw.close();
  });
});
