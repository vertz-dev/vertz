import { describe, expect, it } from '@vertz/test';
import { getMutationEventBus, resetMutationEventBus } from '../mutation-event-bus-singleton';

describe('MutationEventBus singleton', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getMutationEventBus();
    const b = getMutationEventBus();
    expect(a).toBe(b);
  });

  it('reset creates a new instance', () => {
    const before = getMutationEventBus();
    resetMutationEventBus();
    const after = getMutationEventBus();
    expect(after).not.toBe(before);
  });

  it('reset clears subscriptions from the previous instance', () => {
    const bus = getMutationEventBus();
    const calls: string[] = [];
    bus.subscribe('tasks', () => calls.push('hit'));

    resetMutationEventBus();

    // New instance — old subscription should not fire
    getMutationEventBus().emit('tasks');
    expect(calls).toEqual([]);
  });
});
