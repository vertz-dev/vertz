import { describe, it, expect } from 'vitest';
import { createTestStore } from '../test-utils';

interface User {
  id: string;
  name: string;
}

interface Post {
  id: string;
  title: string;
}

describe('createTestStore', () => {
  it('creates store pre-populated with entities', () => {
    const store = createTestStore({
      User: {
        '1': { id: '1', name: 'Alice' },
        '2': { id: '2', name: 'Bob' }
      }
    });
    
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<User>('User', '2').value).toEqual({ id: '2', name: 'Bob' });
  });

  it('get works immediately after creation', () => {
    const store = createTestStore({
      User: {
        '42': { id: '42', name: 'Test User' }
      }
    });
    
    const signal = store.get<User>('User', '42');
    expect(signal.value).toEqual({ id: '42', name: 'Test User' });
  });

  it('supports multiple entity types', () => {
    const store = createTestStore({
      User: {
        '1': { id: '1', name: 'Alice' }
      },
      Post: {
        'p1': { id: 'p1', title: 'Hello World' }
      }
    });
    
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<Post>('Post', 'p1').value).toEqual({ id: 'p1', title: 'Hello World' });
  });

  it('empty input creates empty store', () => {
    const store = createTestStore({});
    
    expect(store.size('User')).toBe(0);
    expect(store.get<User>('User', '1').value).toBeUndefined();
  });

  it('returned store is a real EntityStore (merge/remove work)', () => {
    const store = createTestStore({
      User: {
        '1': { id: '1', name: 'Alice' }
      }
    });
    
    // Test merge
    store.merge('User', { id: '2', name: 'Bob' });
    expect(store.get<User>('User', '2').value).toEqual({ id: '2', name: 'Bob' });
    
    // Test remove
    store.remove('User', '1');
    expect(store.has('User', '1')).toBe(false);
  });

  it('handles missing id field gracefully', () => {
    const store = createTestStore({
      User: {
        '1': { id: '1', name: 'Alice' },
        '2': { id: '2', name: 'Bob' }
      }
    });
    
    expect(store.size('User')).toBe(2);
  });
});
