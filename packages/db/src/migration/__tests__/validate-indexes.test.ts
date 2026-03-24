import { describe, expect, it } from 'bun:test';
import type { IndexSnapshot, TableSnapshot } from '../snapshot';
import { validateIndexes } from '../validate-indexes';

function makeTable(indexes: IndexSnapshot[]): Record<string, TableSnapshot> {
  return {
    posts: {
      columns: {
        id: { type: 'uuid', nullable: false, primary: true, unique: false },
        title: { type: 'text', nullable: false, primary: false, unique: false },
      },
      indexes,
      foreignKeys: [],
      _metadata: {},
    },
  };
}

describe('validateIndexes', () => {
  it('returns no warnings for plain indexes on any dialect', () => {
    const tables = makeTable([{ columns: ['title'] }]);
    expect(validateIndexes(tables, 'postgres')).toEqual([]);
    expect(validateIndexes(tables, 'sqlite')).toEqual([]);
  });

  it('returns no warnings for postgres-specific index types on postgres', () => {
    const tables = makeTable([
      { columns: ['title'], type: 'gin' },
      { columns: ['title'], type: 'hash' },
      { columns: ['title'], type: 'gist' },
      { columns: ['title'], type: 'brin' },
      { columns: ['title'], type: 'hnsw' },
    ]);
    expect(validateIndexes(tables, 'postgres')).toEqual([]);
  });

  it('warns when using gin index type on sqlite', () => {
    const tables = makeTable([{ columns: ['title'], type: 'gin' }]);
    const warnings = validateIndexes(tables, 'sqlite');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('posts');
    expect(warnings[0]).toContain('gin');
    expect(warnings[0]).toContain('sqlite');
  });

  it('warns for all postgres-only index types on sqlite', () => {
    const tables = makeTable([
      { columns: ['title'], type: 'hash' },
      { columns: ['title'], type: 'gist' },
      { columns: ['title'], type: 'brin' },
    ]);
    const warnings = validateIndexes(tables, 'sqlite');
    expect(warnings).toHaveLength(3);
  });

  it('warns when using hnsw index type on sqlite', () => {
    const tables = makeTable([{ columns: ['title'], type: 'hnsw' }]);
    const warnings = validateIndexes(tables, 'sqlite');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('hnsw');
    expect(warnings[0]).toContain('sqlite');
  });

  it('allows btree on both dialects without warning', () => {
    const tables = makeTable([{ columns: ['title'], type: 'btree' }]);
    expect(validateIndexes(tables, 'postgres')).toEqual([]);
    expect(validateIndexes(tables, 'sqlite')).toEqual([]);
  });

  it('allows partial indexes (where) on both dialects', () => {
    const tables = makeTable([{ columns: ['title'], where: "status = 'active'" }]);
    expect(validateIndexes(tables, 'postgres')).toEqual([]);
    expect(validateIndexes(tables, 'sqlite')).toEqual([]);
  });
});
