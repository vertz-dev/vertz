import { describe, it, expect, vi } from 'vitest';
import { EntityStore } from '../entity-store';
import { effect } from '../../runtime/signal';

interface User {
  id: string;
  name: string;
  age?: number;
  tags?: string[];
  address?: { city: string; zip?: string };
}

interface Post {
  id: string;
  title: string;
  authorId: string;
}

describe('EntityStore - get/has/size', () => {
  it('get returns undefined signal for missing entity', () => {
    const store = new EntityStore();
    const signal = store.get<User>('User', '999');
    expect(signal.value).toBeUndefined();
  });

  it('get returns signal with data after merge', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    const signal = store.get<User>('User', '1');
    expect(signal.value).toEqual({ id: '1', name: 'Alice' });
  });

  it('get returns same signal instance on repeated calls (identity stability)', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    const signal1 = store.get<User>('User', '1');
    const signal2 = store.get<User>('User', '1');
    expect(signal1).toBe(signal2); // same object reference
  });

  it('has returns false for missing, true for existing', () => {
    const store = new EntityStore();
    expect(store.has('User', '1')).toBe(false);
    store.merge('User', { id: '1', name: 'Alice' });
    expect(store.has('User', '1')).toBe(true);
  });

  it('size returns 0 for empty type, correct count after merges', () => {
    const store = new EntityStore();
    expect(store.size('User')).toBe(0);
    store.merge('User', { id: '1', name: 'Alice' });
    expect(store.size('User')).toBe(1);
    store.merge('User', [
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' }
    ]);
    expect(store.size('User')).toBe(3);
  });
});

describe('EntityStore - merge', () => {
  it('merge single entity creates new entry', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
  });

  it('merge array of entities creates all entries', () => {
    const store = new EntityStore();
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' }
    ]);
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<User>('User', '2').value).toEqual({ id: '2', name: 'Bob' });
  });

  it('merge existing entity updates signal value', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });
    const signal = store.get<User>('User', '1');
    
    store.merge('User', { id: '1', age: 30 });
    
    expect(signal.value).toEqual({ id: '1', name: 'Alice', age: 30 });
  });

  it('merge with new fields enriches (doesn\'t lose existing fields)', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    store.merge('User', { id: '1', age: 30 });
    
    expect(store.get<User>('User', '1').value).toEqual({ 
      id: '1', 
      name: 'Alice', 
      age: 30 
    });
  });

  it('merge with unchanged data does NOT trigger signal update', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });
    
    const signal = store.get<User>('User', '1');
    let updateCount = 0;
    effect(() => {
      signal.value; // subscribe
      updateCount++;
    });
    
    const initialCount = updateCount;
    store.merge('User', { id: '1', name: 'Alice', age: 25 }); // same data
    
    expect(updateCount).toBe(initialCount); // no additional update
  });

  it('merge with changed field triggers signal update', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });
    
    const signal = store.get<User>('User', '1');
    let updateCount = 0;
    effect(() => {
      signal.value;
      updateCount++;
    });
    
    const initialCount = updateCount;
    store.merge('User', { id: '1', age: 30 }); // changed
    
    expect(updateCount).toBe(initialCount + 1);
  });

  it('merge wraps in batch (multiple entities = single reactive flush)', () => {
    const store = new EntityStore();
    
    let flushCount = 0;
    effect(() => {
      store.get<User>('User', '1').value;
      store.get<User>('User', '2').value;
      flushCount++;
    });
    
    const initialCount = flushCount;
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' }
    ]);
    
    // Only one effect re-run despite two entity creations
    expect(flushCount).toBe(initialCount + 1);
  });

  it('merge with undefined fields does not overwrite existing fields', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });
    store.merge('User', { id: '1', age: undefined });
    
    expect(store.get<User>('User', '1').value).toEqual({ 
      id: '1', 
      name: 'Alice', 
      age: 25 
    });
  });

  it('merge with empty array is no-op', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    store.merge('User', []);
    
    expect(store.size('User')).toBe(1);
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
  });

  it('merge entity with array field replaces entire array', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', tags: ['old', 'stale'] });
    store.merge('User', { id: '1', tags: ['new'] });
    
    expect(store.get<User>('User', '1').value?.tags).toEqual(['new']);
  });

  it('merge entity with nested object field replaces entire object', () => {
    const store = new EntityStore();
    store.merge('User', { 
      id: '1', 
      name: 'Alice', 
      address: { city: 'SF', zip: '94102' } 
    });
    store.merge('User', { id: '1', address: { city: 'NYC' } });
    
    expect(store.get<User>('User', '1').value?.address).toEqual({ city: 'NYC' });
  });

  it('merge called inside an effect does not cause infinite re-trigger', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });
    
    let effectRuns = 0;
    effect(() => {
      const user = store.get<User>('User', '1').value;
      effectRuns++;
      
      if (user && user.age === 25) {
        // This merge should NOT re-trigger this effect
        store.merge('User', { id: '1', age: 30 });
      }
    });
    
    // Effect runs once initially, merge happens but doesn't re-trigger
    expect(effectRuns).toBeLessThan(5); // Not infinite
  });
});

describe('EntityStore - remove', () => {
  it('remove deletes entity signal', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    expect(store.has('User', '1')).toBe(true);
    
    store.remove('User', '1');
    
    expect(store.has('User', '1')).toBe(false);
    expect(store.get<User>('User', '1').value).toBeUndefined();
  });

  it('remove on missing entity is no-op', () => {
    const store = new EntityStore();
    expect(() => store.remove('User', '999')).not.toThrow();
  });

  it('remove triggers type change listeners', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    
    const listener = vi.fn();
    store.onTypeChange('User', listener);
    
    store.remove('User', '1');
    
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('after remove, get returns undefined signal', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    const signal = store.get<User>('User', '1');
    
    store.remove('User', '1');
    
    expect(signal.value).toBeUndefined();
  });
});

describe('EntityStore - getMany', () => {
  it('returns signal of array matching IDs', () => {
    const store = new EntityStore();
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' }
    ]);
    
    const signal = store.getMany<User>('User', ['1', '3']);
    
    expect(signal.value).toEqual([
      { id: '1', name: 'Alice' },
      { id: '3', name: 'Charlie' }
    ]);
  });

  it('array updates when underlying entities change', () => {
    const store = new EntityStore();
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' }
    ]);
    
    const signal = store.getMany<User>('User', ['1', '2']);
    
    store.merge('User', { id: '1', name: 'Alicia' });
    
    expect(signal.value).toEqual([
      { id: '1', name: 'Alicia' },
      { id: '2', name: 'Bob' }
    ]);
  });

  it('missing IDs produce undefined in array', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    
    const signal = store.getMany<User>('User', ['1', '999', '2']);
    
    expect(signal.value).toEqual([
      { id: '1', name: 'Alice' },
      undefined,
      undefined
    ]);
  });

  it('getMany with empty IDs array returns empty signal array', () => {
    const store = new EntityStore();
    const signal = store.getMany<User>('User', []);
    expect(signal.value).toEqual([]);
  });

  it('getMany repeated calls return independent computed signals', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    
    const signal1 = store.getMany<User>('User', ['1']);
    const signal2 = store.getMany<User>('User', ['1']);
    
    expect(signal1).not.toBe(signal2); // different instances
    expect(signal1.value).toEqual(signal2.value); // same values
  });
});

describe('EntityStore - onTypeChange', () => {
  it('fires on merge of new entity (create)', () => {
    const store = new EntityStore();
    const listener = vi.fn();
    store.onTypeChange('User', listener);
    
    store.merge('User', { id: '1', name: 'Alice' });
    
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires on remove', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    
    const listener = vi.fn();
    store.onTypeChange('User', listener);
    
    store.remove('User', '1');
    
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on merge of existing entity (update)', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    
    const listener = vi.fn();
    store.onTypeChange('User', listener);
    
    store.merge('User', { id: '1', name: 'Alicia' }); // update
    
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns unsubscribe function that works', () => {
    const store = new EntityStore();
    const listener = vi.fn();
    const unsubscribe = store.onTypeChange('User', listener);
    
    unsubscribe();
    store.merge('User', { id: '1', name: 'Alice' });
    
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple listeners on same type all fire', () => {
    const store = new EntityStore();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    
    store.onTypeChange('User', listener1);
    store.onTypeChange('User', listener2);
    
    store.merge('User', { id: '1', name: 'Alice' });
    
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});

describe('EntityStore - edge cases', () => {
  it('multiple entity types coexist without interference', () => {
    const store = new EntityStore();
    
    store.merge('User', { id: '1', name: 'Alice' });
    store.merge('Post', { id: '1', title: 'Hello', authorId: '1' });
    
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<Post>('Post', '1').value).toEqual({ 
      id: '1', 
      title: 'Hello', 
      authorId: '1' 
    });
  });

  it('merge inside existing batch coalesces correctly', async () => {
    const store = new EntityStore();
    
    let effectRuns = 0;
    effect(() => {
      store.get<User>('User', '1').value;
      store.get<User>('User', '2').value;
      effectRuns++;
    });
    
    const initialRuns = effectRuns;
    
    // Manual batch wrapping the merge (which also batches internally)
    const { batch } = await import('../../runtime/scheduler');
    batch(() => {
      store.merge('User', { id: '1', name: 'Alice' });
      store.merge('User', { id: '2', name: 'Bob' });
    });
    
    // Should still only trigger one effect run
    expect(effectRuns).toBe(initialRuns + 1);
  });
});
