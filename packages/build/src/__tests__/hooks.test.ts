import { describe, expect, it } from '@vertz/test';
import { normalizeHooks, runHooks } from '../hooks';
import type { PostBuildContext, PostBuildHook } from '../types';

const emptyCtx: PostBuildContext = {
  outputFiles: [],
  outDir: '/tmp/dist',
  packageJson: {},
};

describe('normalizeHooks', () => {
  it('returns empty array for undefined', () => {
    expect(normalizeHooks(undefined)).toEqual([]);
  });

  it('wraps plain function as hook', () => {
    const fn = () => {};
    const hooks = normalizeHooks(fn);
    expect(hooks).toHaveLength(1);
    expect(hooks[0].name).toBe('custom');
    expect(hooks[0].handler).toBe(fn);
  });

  it('wraps single hook object in array', () => {
    const hook: PostBuildHook = { name: 'test', handler: async () => {} };
    const hooks = normalizeHooks(hook);
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toBe(hook);
  });

  it('passes array through', () => {
    const arr: PostBuildHook[] = [
      { name: 'a', handler: async () => {} },
      { name: 'b', handler: async () => {} },
    ];
    const hooks = normalizeHooks(arr);
    expect(hooks).toBe(arr);
  });
});

describe('runHooks', () => {
  it('runs hooks sequentially in order', async () => {
    const order: string[] = [];

    const hooks: PostBuildHook[] = [
      { name: 'first', handler: async () => { order.push('first'); } },
      { name: 'second', handler: async () => { order.push('second'); } },
    ];

    await runHooks(hooks, emptyCtx);
    expect(order).toEqual(['first', 'second']);
  });

  it('passes context to hook handler', async () => {
    let receivedCtx: PostBuildContext | undefined;

    const hooks: PostBuildHook[] = [
      { name: 'check-ctx', handler: async (ctx) => { receivedCtx = ctx; } },
    ];

    await runHooks(hooks, emptyCtx);
    expect(receivedCtx).toBe(emptyCtx);
  });

  it('propagates hook errors', async () => {
    const hooks: PostBuildHook[] = [
      { name: 'fail', handler: async () => { throw new Error('hook failed'); } },
    ];

    await expect(runHooks(hooks, emptyCtx)).rejects.toThrow('hook failed');
  });

  it('handles empty hooks array', async () => {
    await runHooks([], emptyCtx);
    // no error
  });
});
