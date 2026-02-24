import { describe, it, expect } from 'bun:test';
import { EntityStore } from '../entity-store';
import type { SerializedStore } from '../types';

interface User {
  id: string;
  name: string;
  age?: number;
}

interface Post {
  id: string;
  title: string;
}

describe('EntityStore - hydration', () => {
  it('dehydrate returns entities as plain objects (not signals)', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 30 });
    
    const serialized = store.dehydrate();
    
    expect(serialized.entities.User).toEqual({
      '1': { id: '1', name: 'Alice', age: 30 }
    });
    expect(typeof serialized.entities.User?.['1']).toBe('object');
  });

  it('dehydrate includes query indices', () => {
    const store = new EntityStore();
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' }
    ]);
    
    // Access internal query index for testing
    (store as any)._queryIndices.set('users:all', ['1', '2']);
    
    const serialized = store.dehydrate();
    
    expect(serialized.queries).toEqual({
      'users:all': { ids: ['1', '2'] }
    });
  });

  it('hydrate populates store from serialized data', () => {
    const store = new EntityStore();
    const data: SerializedStore = {
      entities: {
        User: {
          '1': { id: '1', name: 'Alice' },
          '2': { id: '2', name: 'Bob' }
        }
      }
    };
    
    store.hydrate(data);
    
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<User>('User', '2').value).toEqual({ id: '2', name: 'Bob' });
  });

  it('hydrate + get returns correct signal values', () => {
    const store = new EntityStore();
    const data: SerializedStore = {
      entities: {
        User: {
          '1': { id: '1', name: 'Alice', age: 30 }
        }
      }
    };
    
    store.hydrate(data);
    const signal = store.get<User>('User', '1');
    
    expect(signal.value).toEqual({ id: '1', name: 'Alice', age: 30 });
  });

  it('hydrate then merge enriches entities', () => {
    const store = new EntityStore();
    const data: SerializedStore = {
      entities: {
        User: {
          '1': { id: '1', name: 'Alice' }
        }
      }
    };
    
    store.hydrate(data);
    store.merge('User', { id: '1', age: 30 });
    
    expect(store.get<User>('User', '1').value).toEqual({ 
      id: '1', 
      name: 'Alice', 
      age: 30 
    });
  });

  it('dehydrate → hydrate round-trip preserves all data', () => {
    const store1 = new EntityStore();
    store1.merge('User', [
      { id: '1', name: 'Alice', age: 30 },
      { id: '2', name: 'Bob', age: 25 }
    ]);
    store1.merge('Post', [
      { id: 'p1', title: 'Hello' },
      { id: 'p2', title: 'World' }
    ]);
    
    const serialized = store1.dehydrate();
    
    const store2 = new EntityStore();
    store2.hydrate(serialized);
    
    expect(store2.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice', age: 30 });
    expect(store2.get<User>('User', '2').value).toEqual({ id: '2', name: 'Bob', age: 25 });
    expect(store2.get<Post>('Post', 'p1').value).toEqual({ id: 'p1', title: 'Hello' });
    expect(store2.get<Post>('Post', 'p2').value).toEqual({ id: 'p2', title: 'World' });
  });

  it('hydrate with empty data is no-op', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    
    store.hydrate({ entities: {} });
    
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
  });

  it('hydrate into non-empty store merges (doesn\'t replace)', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    store.merge('Post', { id: 'p1', title: 'Existing' });
    
    const data: SerializedStore = {
      entities: {
        User: {
          '2': { id: '2', name: 'Bob' }
        }
      }
    };
    
    store.hydrate(data);
    
    // Original entities still there
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<Post>('Post', 'p1').value).toEqual({ id: 'p1', title: 'Existing' });
    // New entity added
    expect(store.get<User>('User', '2').value).toEqual({ id: '2', name: 'Bob' });
  });

  it('multiple entity types in serialized data', () => {
    const store = new EntityStore();
    const data: SerializedStore = {
      entities: {
        User: {
          '1': { id: '1', name: 'Alice' }
        },
        Post: {
          'p1': { id: 'p1', title: 'Hello' }
        }
      }
    };
    
    store.hydrate(data);
    
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<Post>('Post', 'p1').value).toEqual({ id: 'p1', title: 'Hello' });
  });

  it('query indices survive round-trip', () => {
    const store1 = new EntityStore();
    store1.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' }
    ]);
    (store1 as any)._queryIndices.set('users:all', ['1', '2']);
    
    const serialized = store1.dehydrate();
    
    const store2 = new EntityStore();
    store2.hydrate(serialized);
    
    expect((store2 as any)._queryIndices.get('users:all')).toEqual(['1', '2']);
  });

  it('initialData option hydrates on construction', () => {
    const data: SerializedStore = {
      entities: {
        User: {
          '1': { id: '1', name: 'Alice' }
        }
      }
    };
    
    const store = new EntityStore({ initialData: data });
    
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
  });
});
