import { describe, expect, it } from 'bun:test';
import { d } from '../../d';

describe('vector index options', () => {
  it('creates HNSW index with opclass and tuning params', () => {
    const idx = d.index('embedding', {
      type: 'hnsw',
      opclass: 'vector_cosine_ops',
      m: 16,
      efConstruction: 64,
    });
    expect(idx.type).toBe('hnsw');
    expect(idx.opclass).toBe('vector_cosine_ops');
    expect(idx.m).toBe(16);
    expect(idx.efConstruction).toBe(64);
  });

  it('creates IVFFlat index with opclass and lists', () => {
    const idx = d.index('embedding', {
      type: 'ivfflat',
      opclass: 'vector_cosine_ops',
      lists: 100,
    });
    expect(idx.type).toBe('ivfflat');
    expect(idx.opclass).toBe('vector_cosine_ops');
    expect(idx.lists).toBe(100);
  });

  it('allows opclass on non-vector index types', () => {
    const idx = d.index('slug', {
      type: 'btree',
      opclass: 'text_pattern_ops',
    });
    expect(idx.opclass).toBe('text_pattern_ops');
  });

  it('throws when HNSW-only params used with ivfflat', () => {
    expect(() =>
      d.index('embedding', { type: 'ivfflat', opclass: 'vector_cosine_ops', m: 16 }),
    ).toThrow();
    expect(() =>
      d.index('embedding', { type: 'ivfflat', opclass: 'vector_cosine_ops', efConstruction: 64 }),
    ).toThrow();
  });

  it('throws when IVFFlat-only params used with hnsw', () => {
    expect(() =>
      d.index('embedding', { type: 'hnsw', opclass: 'vector_cosine_ops', lists: 100 }),
    ).toThrow();
  });

  it('throws when vector params used without vector index type', () => {
    expect(() => d.index('title', { m: 16 })).toThrow();
    expect(() => d.index('title', { efConstruction: 64 })).toThrow();
    expect(() => d.index('title', { lists: 100 })).toThrow();
  });

  it('throws when opclass contains SQL injection', () => {
    expect(() =>
      d.index('embedding', {
        type: 'hnsw',
        opclass: 'vector_cosine_ops); DROP TABLE users; --',
      }),
    ).toThrow(/Invalid opclass identifier/);
  });

  it('throws when opclass contains spaces', () => {
    expect(() => d.index('embedding', { type: 'hnsw', opclass: 'not an identifier' })).toThrow(
      /Invalid opclass identifier/,
    );
  });

  it('allows valid opclass identifiers', () => {
    const idx = d.index('embedding', {
      type: 'hnsw',
      opclass: 'vector_l2_ops',
    });
    expect(idx.opclass).toBe('vector_l2_ops');
  });
});
