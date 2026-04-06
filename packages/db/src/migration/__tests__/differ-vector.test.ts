import { describe, expect, it } from 'bun:test';
import { computeDiff } from '../differ';
import type { SchemaSnapshot } from '../snapshot';

function makeSnapshot(overrides: Partial<SchemaSnapshot> = {}): SchemaSnapshot {
  return {
    version: 1,
    tables: {},
    enums: {},
    ...overrides,
  };
}

describe('computeDiff — vector index fields', () => {
  it('changing m produces index_removed + index_added', () => {
    const before = makeSnapshot({
      tables: {
        documents: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [
            {
              columns: ['embedding'],
              type: 'hnsw',
              opclass: 'vector_cosine_ops',
              m: 16,
              efConstruction: 64,
            },
          ],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const after = makeSnapshot({
      tables: {
        documents: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [
            {
              columns: ['embedding'],
              type: 'hnsw',
              opclass: 'vector_cosine_ops',
              m: 32,
              efConstruction: 64,
            },
          ],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const { changes } = computeDiff(before, after);
    const removed = changes.filter((c) => c.type === 'index_removed');
    const added = changes.filter((c) => c.type === 'index_added');

    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(added[0].indexM).toBe(32);
  });

  it('adding opclass produces index_removed + index_added', () => {
    const before = makeSnapshot({
      tables: {
        documents: {
          columns: {
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [{ columns: ['embedding'], type: 'hnsw' }],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const after = makeSnapshot({
      tables: {
        documents: {
          columns: {
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [{ columns: ['embedding'], type: 'hnsw', opclass: 'vector_cosine_ops' }],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const { changes } = computeDiff(before, after);
    expect(changes.filter((c) => c.type === 'index_removed')).toHaveLength(1);
    expect(changes.filter((c) => c.type === 'index_added')).toHaveLength(1);
    expect(changes.find((c) => c.type === 'index_added')?.indexOpclass).toBe('vector_cosine_ops');
  });

  it('identical HNSW indexes produce no diff', () => {
    const idx = {
      columns: ['embedding'] as string[],
      type: 'hnsw' as const,
      opclass: 'vector_cosine_ops',
      m: 16,
      efConstruction: 64,
    };
    const snapshot = makeSnapshot({
      tables: {
        documents: {
          columns: {
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [idx],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const { changes } = computeDiff(snapshot, snapshot);
    expect(changes).toHaveLength(0);
  });

  it('index_added populates all vector fields from IndexSnapshot', () => {
    const before = makeSnapshot({
      tables: {
        documents: {
          columns: {
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const after = makeSnapshot({
      tables: {
        documents: {
          columns: {
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [
            {
              columns: ['embedding'],
              type: 'hnsw',
              opclass: 'vector_cosine_ops',
              m: 16,
              efConstruction: 64,
            },
          ],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const { changes } = computeDiff(before, after);
    const added = changes.find((c) => c.type === 'index_added');
    expect(added).toBeDefined();
    expect(added!.indexType).toBe('hnsw');
    expect(added!.indexOpclass).toBe('vector_cosine_ops');
    expect(added!.indexM).toBe(16);
    expect(added!.indexEfConstruction).toBe(64);
  });

  it('IVFFlat index_added populates lists field', () => {
    const before = makeSnapshot({
      tables: {
        documents: {
          columns: {
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const after = makeSnapshot({
      tables: {
        documents: {
          columns: {
            embedding: {
              type: 'vector',
              nullable: false,
              primary: false,
              unique: false,
              dimensions: 1536,
            },
          },
          indexes: [
            {
              columns: ['embedding'],
              type: 'ivfflat',
              opclass: 'vector_cosine_ops',
              lists: 100,
            },
          ],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const { changes } = computeDiff(before, after);
    const added = changes.find((c) => c.type === 'index_added');
    expect(added).toBeDefined();
    expect(added!.indexType).toBe('ivfflat');
    expect(added!.indexOpclass).toBe('vector_cosine_ops');
    expect(added!.indexLists).toBe(100);
  });

  it('non-vector indexes still diff correctly', () => {
    const before = makeSnapshot({
      tables: {
        posts: {
          columns: {
            title: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['title'], type: 'btree' }],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const after = makeSnapshot({
      tables: {
        posts: {
          columns: {
            title: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['title'], type: 'gin' }],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    const { changes } = computeDiff(before, after);
    expect(changes.filter((c) => c.type === 'index_removed')).toHaveLength(1);
    expect(changes.filter((c) => c.type === 'index_added')).toHaveLength(1);
  });
});
