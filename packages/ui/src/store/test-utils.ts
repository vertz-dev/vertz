import { EntityStore } from './entity-store';

/**
 * Create a pre-populated EntityStore for testing.
 * 
 * @param data - Entity data keyed by type → id → entity
 * @returns A new EntityStore with the data already merged
 * 
 * @example
 * ```ts
 * const store = createTestStore({
 *   User: {
 *     '1': { id: '1', name: 'Alice' },
 *     '2': { id: '2', name: 'Bob' }
 *   }
 * });
 * 
 * expect(store.get('User', '1').value).toEqual({ id: '1', name: 'Alice' });
 * ```
 */
export function createTestStore(
  data: Record<string, Record<string, unknown>>
): EntityStore {
  const store = new EntityStore();
  
  for (const [type, entities] of Object.entries(data)) {
    const entityArray = Object.values(entities);
    if (entityArray.length > 0) {
      store.merge(type, entityArray as any);
    }
  }
  
  return store;
}
