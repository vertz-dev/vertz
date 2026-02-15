import { describe, expect, it, vi } from 'vitest';
import { createPluginRunner } from '../plugin-runner';
import type { DbPlugin, QueryContext } from '../plugin-types';

describe('createPluginRunner', () => {
  const baseContext: QueryContext = {
    table: 'users',
    operation: 'list',
    args: { where: { id: '1' } },
    fingerprint: '12345',
  };

  describe('runBeforeQuery', () => {
    it('calls beforeQuery hooks on plugins', () => {
      const beforeQuery = vi.fn();
      const plugin: DbPlugin = { name: 'test-plugin', beforeQuery };
      const runner = createPluginRunner([plugin]);

      runner.runBeforeQuery(baseContext);

      expect(beforeQuery).toHaveBeenCalledWith(baseContext);
    });

    it('returns first non-undefined result (first wins)', () => {
      const modified: QueryContext = { ...baseContext, args: { where: { id: '2' } } };
      const plugin1: DbPlugin = {
        name: 'plugin-1',
        beforeQuery: () => modified,
      };
      const plugin2: DbPlugin = {
        name: 'plugin-2',
        beforeQuery: vi.fn(),
      };
      const runner = createPluginRunner([plugin1, plugin2]);

      const result = runner.runBeforeQuery(baseContext);

      expect(result).toBe(modified);
      // plugin2's beforeQuery should NOT be called since plugin1 returned a value
      expect(plugin2.beforeQuery).not.toHaveBeenCalled();
    });

    it('returns undefined when no plugin returns a value', () => {
      const plugin: DbPlugin = {
        name: 'no-op',
        beforeQuery: () => undefined,
      };
      const runner = createPluginRunner([plugin]);

      const result = runner.runBeforeQuery(baseContext);

      expect(result).toBeUndefined();
    });

    it('skips plugins without beforeQuery hook', () => {
      const plugin1: DbPlugin = { name: 'no-hooks' };
      const plugin2: DbPlugin = {
        name: 'has-hook',
        beforeQuery: vi.fn(),
      };
      const runner = createPluginRunner([plugin1, plugin2]);

      runner.runBeforeQuery(baseContext);

      expect(plugin2.beforeQuery).toHaveBeenCalledWith(baseContext);
    });

    it('works with no plugins', () => {
      const runner = createPluginRunner([]);

      const result = runner.runBeforeQuery(baseContext);

      expect(result).toBeUndefined();
    });
  });

  describe('runAfterQuery', () => {
    it('calls afterQuery hooks on plugins', () => {
      const afterQuery = vi.fn().mockReturnValue('transformed');
      const plugin: DbPlugin = { name: 'test-plugin', afterQuery };
      const runner = createPluginRunner([plugin]);

      const result = runner.runAfterQuery(baseContext, [{ id: '1' }]);

      expect(afterQuery).toHaveBeenCalledWith(baseContext, [{ id: '1' }]);
      expect(result).toBe('transformed');
    });

    it('chains transforms across plugins', () => {
      const plugin1: DbPlugin = {
        name: 'plugin-1',
        afterQuery: (_ctx, result) => (result as number[]).map((n) => n * 2),
      };
      const plugin2: DbPlugin = {
        name: 'plugin-2',
        afterQuery: (_ctx, result) => (result as number[]).map((n) => n + 1),
      };
      const runner = createPluginRunner([plugin1, plugin2]);

      const result = runner.runAfterQuery(baseContext, [1, 2, 3]);

      expect(result).toEqual([3, 5, 7]); // [1*2+1, 2*2+1, 3*2+1]
    });

    it('skips plugins without afterQuery hook', () => {
      const plugin1: DbPlugin = { name: 'no-hooks' };
      const afterQuery = vi.fn().mockReturnValue('ok');
      const plugin2: DbPlugin = { name: 'has-hook', afterQuery };
      const runner = createPluginRunner([plugin1, plugin2]);

      const result = runner.runAfterQuery(baseContext, 'original');

      expect(afterQuery).toHaveBeenCalledWith(baseContext, 'original');
      expect(result).toBe('ok');
    });

    it('returns original result when no plugin has afterQuery', () => {
      const runner = createPluginRunner([{ name: 'no-hooks' }]);

      const result = runner.runAfterQuery(baseContext, 'original');

      expect(result).toBe('original');
    });

    it('works with no plugins', () => {
      const runner = createPluginRunner([]);

      const result = runner.runAfterQuery(baseContext, 'original');

      expect(result).toBe('original');
    });

    it('preserves previous result when a plugin returns undefined', () => {
      const plugin1: DbPlugin = {
        name: 'transform',
        afterQuery: (_ctx, result) => (result as number[]).map((n) => n * 10),
      };
      const plugin2: DbPlugin = {
        name: 'logging-only',
        // Observes but does not return a value (returns undefined implicitly)
        afterQuery: () => undefined,
      };
      const plugin3: DbPlugin = {
        name: 'add-one',
        afterQuery: (_ctx, result) => (result as number[]).map((n) => n + 1),
      };
      const runner = createPluginRunner([plugin1, plugin2, plugin3]);

      const result = runner.runAfterQuery(baseContext, [1, 2, 3]);

      // plugin1: [10, 20, 30]
      // plugin2: returns undefined -> chain keeps [10, 20, 30]
      // plugin3: [11, 21, 31]
      expect(result).toEqual([11, 21, 31]);
    });
  });
});
