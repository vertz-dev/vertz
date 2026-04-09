import { describe, expect, it } from '@vertz/test';
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

describe('vector index snapshot', () => {
  it('captures HNSW index options in snapshot', () => {
    const table = d.table(
      'documents',
      {
        id: d.uuid().primary(),
        embedding: d.vector(1536),
      },
      {
        indexes: [
          d.index('embedding', {
            type: 'hnsw',
            opclass: 'vector_cosine_ops',
            m: 16,
            efConstruction: 64,
          }),
        ],
      },
    );
    const snapshot = createSnapshot([table]);
    const idx = snapshot.tables['documents'].indexes[0];
    expect(idx.type).toBe('hnsw');
    expect(idx.opclass).toBe('vector_cosine_ops');
    expect(idx.m).toBe(16);
    expect(idx.efConstruction).toBe(64);
    expect(idx.lists).toBeUndefined();
  });

  it('captures IVFFlat index options in snapshot', () => {
    const table = d.table(
      'docs',
      {
        id: d.uuid().primary(),
        embedding: d.vector(384),
      },
      {
        indexes: [
          d.index('embedding', {
            type: 'ivfflat',
            opclass: 'vector_l2_ops',
            lists: 100,
          }),
        ],
      },
    );
    const snapshot = createSnapshot([table]);
    const idx = snapshot.tables['docs'].indexes[0];
    expect(idx.type).toBe('ivfflat');
    expect(idx.opclass).toBe('vector_l2_ops');
    expect(idx.lists).toBe(100);
    expect(idx.m).toBeUndefined();
  });

  it('does not add vector fields to non-vector indexes', () => {
    const table = d.table(
      'posts',
      {
        id: d.uuid().primary(),
        title: d.text(),
      },
      {
        indexes: [d.index('title', { type: 'gin' })],
      },
    );
    const snapshot = createSnapshot([table]);
    const idx = snapshot.tables['posts'].indexes[0];
    expect(idx.opclass).toBeUndefined();
    expect(idx.m).toBeUndefined();
  });
});
