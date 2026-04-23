import { describe, expect, it } from '@vertz/test';
import { createMutationEventBus } from '../mutation-event-bus';

describe('MutationEventBus', () => {
  it('delivers emit to matching entity type subscriber', () => {
    const bus = createMutationEventBus();
    const calls: string[] = [];

    bus.subscribe('tasks', () => calls.push('tasks'));
    bus.subscribe('projects', () => calls.push('projects'));

    bus.emit('tasks');
    expect(calls).toEqual(['tasks']);
  });

  it('does not deliver to non-matching entity type', () => {
    const bus = createMutationEventBus();
    const calls: string[] = [];

    bus.subscribe('tasks', () => calls.push('tasks'));

    bus.emit('projects');
    expect(calls).toEqual([]);
  });

  it('unsubscribe stops delivery', () => {
    const bus = createMutationEventBus();
    const calls: string[] = [];

    const unsub = bus.subscribe('tasks', () => calls.push('hit'));
    bus.emit('tasks');
    expect(calls).toEqual(['hit']);

    unsub();
    bus.emit('tasks');
    expect(calls).toEqual(['hit']); // no new call
  });

  it('multiple subscribers all receive emit', () => {
    const bus = createMutationEventBus();
    const calls: string[] = [];

    bus.subscribe('tasks', () => calls.push('a'));
    bus.subscribe('tasks', () => calls.push('b'));

    bus.emit('tasks');
    expect(calls).toEqual(['a', 'b']);
  });

  it('clear removes all listeners', () => {
    const bus = createMutationEventBus();
    const calls: string[] = [];

    bus.subscribe('tasks', () => calls.push('tasks'));
    bus.subscribe('projects', () => calls.push('projects'));
    bus.clear();

    bus.emit('tasks');
    bus.emit('projects');
    expect(calls).toEqual([]);
  });

  describe('getVersion', () => {
    it('returns 0 for entity types that have never been emitted', () => {
      const bus = createMutationEventBus();
      expect(bus.getVersion('tasks')).toBe(0);
    });

    it('increments on every emit for the same entity type', () => {
      const bus = createMutationEventBus();
      bus.emit('tasks');
      expect(bus.getVersion('tasks')).toBe(1);
      bus.emit('tasks');
      expect(bus.getVersion('tasks')).toBe(2);
    });

    it('tracks versions per entity type independently', () => {
      const bus = createMutationEventBus();
      bus.emit('tasks');
      bus.emit('tasks');
      bus.emit('projects');
      expect(bus.getVersion('tasks')).toBe(2);
      expect(bus.getVersion('projects')).toBe(1);
      expect(bus.getVersion('other')).toBe(0);
    });

    it('increments even when no subscribers are registered', () => {
      const bus = createMutationEventBus();
      bus.emit('tasks');
      expect(bus.getVersion('tasks')).toBe(1);
    });

    it('clear resets versions alongside listeners', () => {
      const bus = createMutationEventBus();
      bus.emit('tasks');
      bus.emit('projects');
      bus.clear();
      expect(bus.getVersion('tasks')).toBe(0);
      expect(bus.getVersion('projects')).toBe(0);
    });
  });
});
