import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../event-bus';
import { fingerprint } from '../fingerprint';
import { createPluginRunner } from '../plugin-runner';
import type { DbPlugin, QueryContext } from '../plugin-types';

/**
 * Integration tests for cache-readiness primitives (IT-6-1, IT-6-2, IT-6-3).
 */
describe('Plugin Integration Tests', () => {
  // IT-6-1: Mutation event bus emits events on create/update/delete
  it('IT-6-1: event bus emits events on create, update, and delete mutations', () => {
    const bus = createEventBus();
    const events: Array<{ type: string; table: string; data: unknown }> = [];

    bus.on((event) => {
      events.push(event);
    });

    bus.emit({ type: 'create', table: 'users', data: { id: '1', name: 'Alice' } });
    bus.emit({ type: 'update', table: 'users', data: { id: '1', name: 'Bob' } });
    bus.emit({ type: 'delete', table: 'users', data: { id: '1' } });

    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe('create');
    expect(events[0]?.table).toBe('users');
    expect(events[0]?.data).toEqual({ id: '1', name: 'Alice' });
    expect(events[1]?.type).toBe('update');
    expect(events[2]?.type).toBe('delete');
  });

  // IT-6-2: Query fingerprinting produces stable hashes
  it('IT-6-2: fingerprint produces stable hashes for same query shape', () => {
    const shape1 = {
      table: 'users',
      operation: 'findMany',
      where: { email: 'alice@example.com', active: true },
      select: { id: true, email: true },
    };

    const shape2 = {
      table: 'users',
      operation: 'findMany',
      where: { email: 'bob@example.com', active: false },
      select: { id: true, email: true },
    };

    const fp1 = fingerprint(shape1);
    const fp2 = fingerprint(shape2);

    expect(fp1).toBe(fp2);

    // Different shape produces different fingerprint
    const shape3 = {
      table: 'users',
      operation: 'findMany',
      where: { name: 'Charlie' },
      select: { id: true, email: true },
    };

    expect(fingerprint(shape3)).not.toBe(fp1);

    // Stability: calling twice on same object gives same result
    expect(fingerprint(shape1)).toBe(fp1);
  });

  // IT-6-3: Plugin beforeQuery hook is invoked
  it('IT-6-3: plugin beforeQuery hook is invoked and first non-undefined return wins', () => {
    const context: QueryContext = {
      table: 'users',
      operation: 'findMany',
      args: { where: { id: '1' } },
      fingerprint: 'abc123',
    };

    const cachedResult: QueryContext = {
      ...context,
      args: { ...context.args, cached: true },
    };

    const cachePlugin: DbPlugin = {
      name: 'cache-plugin',
      beforeQuery: (ctx) => {
        if (ctx.table === 'users') {
          return cachedResult;
        }
        return undefined;
      },
    };

    const logPlugin: DbPlugin = {
      name: 'log-plugin',
      beforeQuery: vi.fn(),
      afterQuery: vi.fn().mockImplementation((_ctx, result) => result),
    };

    const runner = createPluginRunner([cachePlugin, logPlugin]);

    // beforeQuery: cache plugin returns first, log plugin should NOT be called
    const beforeResult = runner.runBeforeQuery(context);
    expect(beforeResult).toBe(cachedResult);
    expect(logPlugin.beforeQuery).not.toHaveBeenCalled();

    // afterQuery: both plugins get called in chain
    const queryResult = [{ id: '1', name: 'Alice' }];
    const afterResult = runner.runAfterQuery(context, queryResult);
    expect(logPlugin.afterQuery).toHaveBeenCalledWith(context, queryResult);
    expect(afterResult).toEqual(queryResult);
  });
});
