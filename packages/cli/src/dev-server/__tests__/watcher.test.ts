import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileChange } from '../watcher';
import { createWatcher } from '../watcher';

describe('createWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a watcher with close method', () => {
    const watcher = createWatcher('/tmp/test-dir');
    expect(watcher).toBeDefined();
    expect(typeof watcher.close).toBe('function');
    watcher.close();
  });

  it('has on method for registering change handlers', () => {
    const watcher = createWatcher('/tmp/test-dir');
    expect(typeof watcher.on).toBe('function');
    watcher.close();
  });

  it('emits batched changes after debounce period', () => {
    const handler = vi.fn();
    const watcher = createWatcher('/tmp/test-dir');
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/test-dir/file.ts' });

    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith([{ type: 'change', path: '/tmp/test-dir/file.ts' }]);
    watcher.close();
  });

  it('batches rapid changes within debounce window', () => {
    const handler = vi.fn();
    const watcher = createWatcher('/tmp/test-dir');
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/test-dir/a.ts' });
    vi.advanceTimersByTime(50);
    watcher._emit({ type: 'add', path: '/tmp/test-dir/b.ts' });
    vi.advanceTimersByTime(50);

    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith([
      { type: 'change', path: '/tmp/test-dir/a.ts' },
      { type: 'add', path: '/tmp/test-dir/b.ts' },
    ]);
    watcher.close();
  });

  it('ignores node_modules paths', () => {
    const handler = vi.fn();
    const watcher = createWatcher('/tmp/test-dir');
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/test-dir/node_modules/pkg/index.js' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
    watcher.close();
  });

  it('ignores .git paths', () => {
    const handler = vi.fn();
    const watcher = createWatcher('/tmp/test-dir');
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/test-dir/.git/objects/abc' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
    watcher.close();
  });

  it('ignores .vertz/generated paths', () => {
    const handler = vi.fn();
    const watcher = createWatcher('/tmp/test-dir');
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/test-dir/.vertz/generated/routes.ts' });
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
    watcher.close();
  });

  it('close cancels pending changes', () => {
    const handler = vi.fn();
    const watcher = createWatcher('/tmp/test-dir');
    watcher.on('change', handler);

    watcher._emit({ type: 'change', path: '/tmp/test-dir/file.ts' });
    watcher.close();

    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
  });
});
