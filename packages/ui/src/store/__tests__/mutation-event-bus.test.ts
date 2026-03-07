import { describe, expect, it } from 'bun:test';
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
});
