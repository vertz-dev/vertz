import { describe, it, expect } from 'vitest';
import { QueryResultIndex } from '../query-result-index';

describe('QueryResultIndex', () => {
  it('set/get: stores and retrieves ID arrays', () => {
    const index = new QueryResultIndex();
    index.set('users:active', ['1', '2', '3']);
    expect(index.get('users:active')).toEqual(['1', '2', '3']);
  });

  it('set overwrites existing index', () => {
    const index = new QueryResultIndex();
    index.set('users:active', ['1', '2']);
    index.set('users:active', ['3', '4', '5']);
    expect(index.get('users:active')).toEqual(['3', '4', '5']);
  });

  it('get returns undefined for missing query', () => {
    const index = new QueryResultIndex();
    expect(index.get('nonexistent')).toBeUndefined();
  });

  it('removeEntity: removes ID from all indices', () => {
    const index = new QueryResultIndex();
    index.set('query1', ['1', '2', '3']);
    index.set('query2', ['2', '4', '5']);
    index.set('query3', ['6', '7']);
    
    index.removeEntity('2');
    
    expect(index.get('query1')).toEqual(['1', '3']);
    expect(index.get('query2')).toEqual(['4', '5']);
    expect(index.get('query3')).toEqual(['6', '7']); // untouched
  });

  it('removeEntity: no-op if ID not in any index', () => {
    const index = new QueryResultIndex();
    index.set('query1', ['1', '2']);
    
    index.removeEntity('999'); // doesn't exist
    
    expect(index.get('query1')).toEqual(['1', '2']); // unchanged
  });

  it('clear: removes specific query index', () => {
    const index = new QueryResultIndex();
    index.set('query1', ['1', '2']);
    index.set('query2', ['3', '4']);
    
    index.clear('query1');
    
    expect(index.get('query1')).toBeUndefined();
    expect(index.get('query2')).toEqual(['3', '4']); // still there
  });

  it('ordering is preserved', () => {
    const index = new QueryResultIndex();
    index.set('ordered', ['5', '2', '9', '1']);
    expect(index.get('ordered')).toEqual(['5', '2', '9', '1']);
  });

  it('handles empty arrays', () => {
    const index = new QueryResultIndex();
    index.set('empty', []);
    expect(index.get('empty')).toEqual([]);
  });

  it('removeEntity from empty indices is safe', () => {
    const index = new QueryResultIndex();
    expect(() => index.removeEntity('1')).not.toThrow();
  });
});
