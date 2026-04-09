import { describe, expect, it } from '@vertz/test';
import { createContext, useContext } from '../../component/context';
import { type ListAnimationHooks, ListAnimationContext } from '../list-animation-context';

describe('ListAnimationContext', () => {
  it('is a context that can be provided and consumed', () => {
    expect(ListAnimationContext).toBeDefined();

    const hooks: ListAnimationHooks = {
      onBeforeReconcile: () => {},
      onAfterReconcile: () => {},
      onItemEnter: () => {},
      onItemExit: (_node, _key, done) => done(),
    };

    let consumed: ListAnimationHooks | undefined;
    ListAnimationContext.Provider(hooks, () => {
      consumed = useContext(ListAnimationContext);
    });

    expect(consumed).toBe(hooks);
  });

  it('returns undefined when not provided', () => {
    const ctx = useContext(ListAnimationContext);
    expect(ctx).toBeUndefined();
  });
});
