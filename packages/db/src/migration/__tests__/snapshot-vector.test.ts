import { describe, expect, it } from 'bun:test';
import { d } from '../../d';
import { createSnapshot } from '../snapshot';

describe('vector column snapshot', () => {
  it('captures vector type and dimensions', () => {
    const table = d.table('documents', {
      id: d.uuid().primary(),
      embedding: d.vector(1536),
    });
    const snapshot = createSnapshot([table]);
    const col = snapshot.tables['documents'].columns['embedding'];
    expect(col.type).toBe('vector');
    expect(col.dimensions).toBe(1536);
  });

  it('captures dimensions for different sizes', () => {
    const table = d.table('docs', {
      id: d.uuid().primary(),
      small: d.vector(384),
      large: d.vector(3072),
    });
    const snapshot = createSnapshot([table]);
    expect(snapshot.tables['docs'].columns['small'].dimensions).toBe(384);
    expect(snapshot.tables['docs'].columns['large'].dimensions).toBe(3072);
  });

  it('preserves dimensions through nullable modifier', () => {
    const table = d.table('docs', {
      id: d.uuid().primary(),
      embedding: d.vector(1536).nullable(),
    });
    const snapshot = createSnapshot([table]);
    const col = snapshot.tables['docs'].columns['embedding'];
    expect(col.type).toBe('vector');
    expect(col.dimensions).toBe(1536);
    expect(col.nullable).toBe(true);
  });

  it('does not add dimensions to non-vector columns', () => {
    const table = d.table('docs', {
      id: d.uuid().primary(),
      title: d.text(),
    });
    const snapshot = createSnapshot([table]);
    expect(snapshot.tables['docs'].columns['title'].dimensions).toBeUndefined();
  });
});
