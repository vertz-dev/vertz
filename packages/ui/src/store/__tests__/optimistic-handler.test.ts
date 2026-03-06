import { describe, expect, it } from 'bun:test';
import { EntityStore } from '../entity-store';
import { createOptimisticHandler } from '../optimistic-handler';

describe('createOptimisticHandler', () => {
  it('apply() adds optimistic layer to entity in store', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', title: 'Buy milk', completed: false });

    const handler = createOptimisticHandler(store);
    handler.apply(
      { entityType: 'todos', kind: 'update', id: '1', body: { completed: true } },
      'm_1',
    );

    const state = store.inspect('todos', '1');
    expect(state?.visible).toEqual({ id: '1', title: 'Buy milk', completed: true });
    expect(state?.base).toEqual({ id: '1', title: 'Buy milk', completed: false });
  });

  it('apply() returns rollback that restores original state on update', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', title: 'Buy milk', completed: false });

    const handler = createOptimisticHandler(store);
    const rollback = handler.apply(
      { entityType: 'todos', kind: 'update', id: '1', body: { completed: true } },
      'm_1',
    );

    rollback?.();

    const state = store.inspect('todos', '1');
    expect(state?.visible).toEqual({ id: '1', title: 'Buy milk', completed: false });
    expect(state?.layers.size).toBe(0);
  });

  it('commit() updates base with server data and removes layer', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', title: 'Buy milk', completed: false });

    const handler = createOptimisticHandler(store);
    handler.apply(
      { entityType: 'todos', kind: 'update', id: '1', body: { completed: true } },
      'm_1',
    );

    handler.commit({ entityType: 'todos', kind: 'update', id: '1' }, 'm_1', {
      id: '1',
      title: 'Buy milk',
      completed: true,
      updatedAt: '2024-01-01',
    });

    const state = store.inspect('todos', '1');
    expect(state?.base).toEqual({
      id: '1',
      title: 'Buy milk',
      completed: true,
      updatedAt: '2024-01-01',
    });
    expect(state?.layers.size).toBe(0);
  });

  it('apply() handles delete: removes entity, rollback restores it', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', title: 'Buy milk', completed: false });

    const handler = createOptimisticHandler(store);
    const rollback = handler.apply({ entityType: 'todos', kind: 'delete', id: '1' }, 'm_1');

    expect(store.has('todos', '1')).toBe(false);

    rollback?.();

    expect(store.has('todos', '1')).toBe(true);
    expect(store.get('todos', '1').peek()).toEqual({
      id: '1',
      title: 'Buy milk',
      completed: false,
    });
  });

  it('commit() for create merges new entity into store', () => {
    const store = new EntityStore();
    const handler = createOptimisticHandler(store);

    handler.commit({ entityType: 'todos', kind: 'create' }, 'm_1', {
      id: '2',
      title: 'New todo',
      completed: false,
    });

    expect(store.has('todos', '2')).toBe(true);
    expect(store.get('todos', '2').peek()).toEqual({
      id: '2',
      title: 'New todo',
      completed: false,
    });
  });

  it('apply() returns undefined for create (no optimistic apply)', () => {
    const store = new EntityStore();
    const handler = createOptimisticHandler(store);

    const rollback = handler.apply(
      { entityType: 'todos', kind: 'create', body: { title: 'New' } },
      'm_1',
    );

    expect(rollback).toBeUndefined();
  });
});
