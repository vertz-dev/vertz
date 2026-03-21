import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createDescriptor } from '@vertz/fetch';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
import type { DisposeFn } from '../../runtime/signal-types';
import { resetMutationEventBus } from '../../store/mutation-event-bus-singleton';
import {
  __registrySize,
  invalidate,
  invalidateTenantQueries,
  registerActiveQuery,
  resetQueryRegistry,
} from '../invalidate';
import { query, resetDefaultQueryCache } from '../query';

describe('invalidate()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDefaultQueryCache();
    resetMutationEventBus();
    resetQueryRegistry();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('query registry', () => {
    it('registerActiveQuery adds entry, unregister removes it', () => {
      const refetch = vi.fn();
      const meta = { entityType: 'tasks', kind: 'list' as const };

      const unregister = registerActiveQuery(meta, refetch);
      expect(__registrySize()).toBe(1);

      unregister();
      expect(__registrySize()).toBe(0);
    });

    it('supports multiple registrations for the same entity type', () => {
      const refetch1 = vi.fn();
      const refetch2 = vi.fn();
      const meta = { entityType: 'tasks', kind: 'list' as const };

      const unsub1 = registerActiveQuery(meta, refetch1);
      const unsub2 = registerActiveQuery(meta, refetch2);
      expect(__registrySize()).toBe(2);

      unsub1();
      expect(__registrySize()).toBe(1);

      unsub2();
      expect(__registrySize()).toBe(0);
    });
  });

  describe('invalidate with list descriptor', () => {
    it('calls refetch on all active list queries for that entity type', () => {
      const refetch1 = vi.fn();
      const refetch2 = vi.fn();
      const meta = { entityType: 'tasks', kind: 'list' as const };

      registerActiveQuery(meta, refetch1);
      registerActiveQuery(meta, refetch2);

      const descriptor = createDescriptor(
        'GET',
        '/tasks',
        () => Promise.resolve({ ok: true as const, data: { data: { items: [] } } }),
        undefined,
        { entityType: 'tasks', kind: 'list' },
      );

      invalidate(descriptor);

      expect(refetch1).toHaveBeenCalledTimes(1);
      expect(refetch2).toHaveBeenCalledTimes(1);
    });

    it('does not call refetch on queries for a different entity type', () => {
      const taskRefetch = vi.fn();
      const projectRefetch = vi.fn();

      registerActiveQuery({ entityType: 'tasks', kind: 'list' }, taskRefetch);
      registerActiveQuery({ entityType: 'projects', kind: 'list' }, projectRefetch);

      const descriptor = createDescriptor(
        'GET',
        '/tasks',
        () => Promise.resolve({ ok: true as const, data: { data: { items: [] } } }),
        undefined,
        { entityType: 'tasks', kind: 'list' },
      );

      invalidate(descriptor);

      expect(taskRefetch).toHaveBeenCalledTimes(1);
      expect(projectRefetch).not.toHaveBeenCalled();
    });

    it('does not call refetch on get queries when invalidating with list descriptor', () => {
      const listRefetch = vi.fn();
      const getRefetch = vi.fn();

      registerActiveQuery({ entityType: 'tasks', kind: 'list' }, listRefetch);
      registerActiveQuery({ entityType: 'tasks', kind: 'get', id: '1' }, getRefetch);

      const descriptor = createDescriptor(
        'GET',
        '/tasks',
        () => Promise.resolve({ ok: true as const, data: { data: { items: [] } } }),
        undefined,
        { entityType: 'tasks', kind: 'list' },
      );

      invalidate(descriptor);

      expect(listRefetch).toHaveBeenCalledTimes(1);
      expect(getRefetch).not.toHaveBeenCalled();
    });
  });

  describe('invalidate with get descriptor', () => {
    it('calls refetch only on the matching get query by id', () => {
      const refetch1 = vi.fn();
      const refetch2 = vi.fn();

      registerActiveQuery({ entityType: 'tasks', kind: 'get', id: '1' }, refetch1);
      registerActiveQuery({ entityType: 'tasks', kind: 'get', id: '2' }, refetch2);

      const descriptor = createDescriptor(
        'GET',
        '/tasks/1',
        () => Promise.resolve({ ok: true as const, data: { data: { id: '1' } } }),
        undefined,
        { entityType: 'tasks', kind: 'get', id: '1' },
      );

      invalidate(descriptor);

      expect(refetch1).toHaveBeenCalledTimes(1);
      expect(refetch2).not.toHaveBeenCalled();
    });
  });

  describe('invalidate with get descriptor without id', () => {
    it('is a no-op — does not match any get queries', () => {
      const refetch1 = vi.fn();
      const refetch2 = vi.fn();

      registerActiveQuery({ entityType: 'tasks', kind: 'get', id: '1' }, refetch1);
      registerActiveQuery({ entityType: 'tasks', kind: 'get', id: '2' }, refetch2);

      const descriptor = createDescriptor(
        'GET',
        '/tasks',
        () => Promise.resolve({ ok: true as const, data: { data: {} } }),
        undefined,
        // get descriptor without id — should be a no-op
        { entityType: 'tasks', kind: 'get' },
      );

      invalidate(descriptor);

      expect(refetch1).not.toHaveBeenCalled();
      expect(refetch2).not.toHaveBeenCalled();
    });
  });

  describe('after unregister', () => {
    it('invalidate does not call refetch on unregistered queries', () => {
      const refetch = vi.fn();
      const meta = { entityType: 'tasks', kind: 'list' as const };

      const unregister = registerActiveQuery(meta, refetch);
      unregister();

      const descriptor = createDescriptor(
        'GET',
        '/tasks',
        () => Promise.resolve({ ok: true as const, data: { data: { items: [] } } }),
        undefined,
        { entityType: 'tasks', kind: 'list' },
      );

      invalidate(descriptor);

      expect(refetch).not.toHaveBeenCalled();
    });
  });

  describe('integration with query()', () => {
    let scope: DisposeFn[];

    beforeEach(() => {
      scope = pushScope();
    });
    afterEach(() => {
      popScope();
      runCleanups(scope);
    });

    it('query() auto-registers and invalidate() triggers refetch', async () => {
      let callCount = 0;
      const descriptor = createDescriptor(
        'GET',
        '/tasks',
        () => {
          callCount++;
          return Promise.resolve({
            ok: true as const,
            data: { data: { items: [{ id: '1', title: `call-${callCount}` }] } },
          });
        },
        undefined,
        { entityType: 'tasks', kind: 'list' },
      );

      const result = query(descriptor);

      // Wait for initial fetch
      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
      expect(callCount).toBe(1);

      // Invalidate — should trigger refetch
      const invalidateDescriptor = createDescriptor(
        'GET',
        '/tasks',
        () => Promise.resolve({ ok: true as const, data: { data: { items: [] } } }),
        undefined,
        { entityType: 'tasks', kind: 'list' },
      );
      invalidate(invalidateDescriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
      expect(callCount).toBe(2);
    });

    it('disposed query is not affected by invalidate', async () => {
      let callCount = 0;
      const descriptor = createDescriptor(
        'GET',
        '/tasks',
        () => {
          callCount++;
          return Promise.resolve({
            ok: true as const,
            data: { data: { items: [] } },
          });
        },
        undefined,
        { entityType: 'tasks', kind: 'list' },
      );

      const result = query(descriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
      expect(callCount).toBe(1);

      result.dispose();

      const invalidateDescriptor = createDescriptor(
        'GET',
        '/tasks',
        () => Promise.resolve({ ok: true as const, data: { data: { items: [] } } }),
        undefined,
        { entityType: 'tasks', kind: 'list' },
      );
      invalidate(invalidateDescriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
      // Should NOT have refetched after dispose
      expect(callCount).toBe(1);
    });
  });

  describe('invalidateTenantQueries()', () => {
    describe('Given registered queries with mixed tenantScoped flags', () => {
      it('Then only queries with tenantScoped=true call refetch', () => {
        const taskRefetch = vi.fn();
        const templateRefetch = vi.fn();

        registerActiveQuery({ entityType: 'tasks', kind: 'list', tenantScoped: true }, taskRefetch);
        registerActiveQuery(
          { entityType: 'templates', kind: 'list', tenantScoped: false },
          templateRefetch,
        );

        invalidateTenantQueries();

        expect(taskRefetch).toHaveBeenCalledOnce();
        expect(templateRefetch).not.toHaveBeenCalled();
      });
    });

    describe('Given registered queries where none are tenantScoped', () => {
      it('Then no queries are refetched', () => {
        const refetch1 = vi.fn();
        const refetch2 = vi.fn();

        registerActiveQuery({ entityType: 'settings', kind: 'get', id: 'global' }, refetch1);
        registerActiveQuery(
          { entityType: 'templates', kind: 'list', tenantScoped: false },
          refetch2,
        );

        invalidateTenantQueries();

        expect(refetch1).not.toHaveBeenCalled();
        expect(refetch2).not.toHaveBeenCalled();
      });
    });

    describe('Given both get and list tenant-scoped queries', () => {
      it('Then both get and list queries call refetch', () => {
        const listRefetch = vi.fn();
        const getRefetch = vi.fn();

        registerActiveQuery({ entityType: 'tasks', kind: 'list', tenantScoped: true }, listRefetch);
        registerActiveQuery(
          { entityType: 'tasks', kind: 'get', id: '1', tenantScoped: true },
          getRefetch,
        );

        invalidateTenantQueries();

        expect(listRefetch).toHaveBeenCalledOnce();
        expect(getRefetch).toHaveBeenCalledOnce();
      });
    });

    describe('Given queries with clearData callbacks', () => {
      it('Then clearData is called before refetch for tenant-scoped queries', () => {
        const order: string[] = [];
        const clearData = vi.fn(() => order.push('clear'));
        const refetch = vi.fn(() => order.push('refetch'));

        registerActiveQuery(
          { entityType: 'tasks', kind: 'list', tenantScoped: true },
          refetch,
          clearData,
        );

        invalidateTenantQueries();

        expect(clearData).toHaveBeenCalledOnce();
        expect(refetch).toHaveBeenCalledOnce();
        expect(order).toEqual(['clear', 'refetch']);
      });

      it('Then clearData is NOT called for non-tenant-scoped queries', () => {
        const clearData = vi.fn();
        const refetch = vi.fn();

        registerActiveQuery(
          { entityType: 'templates', kind: 'list', tenantScoped: false },
          refetch,
          clearData,
        );

        invalidateTenantQueries();

        expect(clearData).not.toHaveBeenCalled();
        expect(refetch).not.toHaveBeenCalled();
      });
    });

    describe('Given a query registered without clearData callback', () => {
      it('Then refetch is still called (clearData is optional)', () => {
        const refetch = vi.fn();

        registerActiveQuery({ entityType: 'tasks', kind: 'list', tenantScoped: true }, refetch);

        invalidateTenantQueries();

        expect(refetch).toHaveBeenCalledOnce();
      });
    });

    describe('Given queries with tenantScoped undefined (legacy)', () => {
      it('Then they are NOT affected (undefined !== true)', () => {
        const refetch = vi.fn();

        registerActiveQuery({ entityType: 'tasks', kind: 'list' }, refetch);

        invalidateTenantQueries();

        expect(refetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('descriptor without entity metadata', () => {
    it('is a no-op — does not throw', () => {
      const refetch = vi.fn();
      registerActiveQuery({ entityType: 'tasks', kind: 'list' }, refetch);

      // Descriptor without entity metadata
      const descriptor = createDescriptor('GET', '/custom', () =>
        Promise.resolve({ ok: true as const, data: { data: 'test' } }),
      );

      invalidate(descriptor);

      expect(refetch).not.toHaveBeenCalled();
    });
  });
});
