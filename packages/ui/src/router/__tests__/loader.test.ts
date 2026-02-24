import { describe, expect, test, vi } from 'bun:test';
import type { MatchedRoute } from '../define-routes';
import { executeLoaders } from '../loader';

function makeMatchedRoute(
  loader?: MatchedRoute['route']['loader'],
  params: Record<string, string> = {},
): MatchedRoute {
  return {
    params,
    route: {
      component: () => document.createElement('div'),
      loader,
      pattern: '/test',
    },
  };
}

describe('executeLoaders', () => {
  test('executes a single loader and returns data', async () => {
    const loader = vi.fn().mockResolvedValue({ name: 'Alice' });
    const matched = [makeMatchedRoute(loader, { id: '1' })];

    const results = await executeLoaders(matched, { id: '1' });

    expect(loader).toHaveBeenCalledWith({
      params: { id: '1' },
      signal: expect.any(AbortSignal),
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ name: 'Alice' });
  });

  test('executes parent and child loaders in parallel', async () => {
    const order: string[] = [];

    const parentLoader = vi.fn(async () => {
      order.push('parent-start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('parent-end');
      return { users: [] };
    });

    const childLoader = vi.fn(async () => {
      order.push('child-start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('child-end');
      return { user: { id: '1' } };
    });

    const matched = [makeMatchedRoute(parentLoader), makeMatchedRoute(childLoader, { id: '1' })];

    const results = await executeLoaders(matched, { id: '1' });

    // Both started before either ended (parallel)
    expect(order[0]).toBe('parent-start');
    expect(order[1]).toBe('child-start');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ users: [] });
    expect(results[1]).toEqual({ user: { id: '1' } });
  });

  test('returns undefined for routes without loaders', async () => {
    const matched = [
      makeMatchedRoute(undefined),
      makeMatchedRoute(vi.fn().mockResolvedValue({ data: true }), { id: '1' }),
    ];

    const results = await executeLoaders(matched, { id: '1' });

    expect(results).toHaveLength(2);
    expect(results[0]).toBeUndefined();
    expect(results[1]).toEqual({ data: true });
  });

  test('propagates loader errors', async () => {
    const loaderError = new TypeError('fetch failed');
    const loader = vi.fn().mockRejectedValue(loaderError);
    const matched = [makeMatchedRoute(loader)];

    await expect(executeLoaders(matched, {})).rejects.toThrow('fetch failed');
  });

  test('handles synchronous loaders', async () => {
    const loader = vi.fn().mockReturnValue({ sync: true });
    const matched = [makeMatchedRoute(loader)];

    const results = await executeLoaders(matched, {});
    expect(results[0]).toEqual({ sync: true });
  });

  test('passes AbortSignal to loader context', async () => {
    const controller = new AbortController();
    const loader = vi.fn().mockResolvedValue({ ok: true });
    const matched = [makeMatchedRoute(loader, { id: '1' })];

    await executeLoaders(matched, { id: '1' }, controller.signal);

    expect(loader).toHaveBeenCalledWith({
      params: { id: '1' },
      signal: controller.signal,
    });
  });

  test('provides a fallback AbortSignal when none given', async () => {
    const loader = vi.fn().mockResolvedValue({ ok: true });
    const matched = [makeMatchedRoute(loader)];

    await executeLoaders(matched, {});

    expect(loader).toHaveBeenCalledWith({
      params: {},
      signal: expect.any(AbortSignal),
    });
    // Fallback signal should not be aborted
    const ctx = loader.mock.calls[0][0] as { signal: AbortSignal };
    expect(ctx.signal.aborted).toBe(false);
  });
});
