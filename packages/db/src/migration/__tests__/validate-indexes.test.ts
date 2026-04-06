import { describe, expect, it } from 'bun:test';
import type { ColumnSnapshot, IndexSnapshot, TableSnapshot } from '../snapshot';
import { validateColumns, validateIndexes } from '../validate-indexes';

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

  it('warns when using ivfflat index type on sqlite', () => {
    const tables = makeTable([{ columns: ['embedding'], type: 'ivfflat' }]);
    const warnings = validateIndexes(tables, 'sqlite');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('ivfflat');
    expect(warnings[0]).toContain('sqlite');
  });

  it('returns no warnings for ivfflat on postgres', () => {
    const tables = makeTable([{ columns: ['embedding'], type: 'ivfflat' }]);
    expect(validateIndexes(tables, 'postgres')).toEqual([]);
  });
});

describe('validateColumns', () => {
  function makeTableWithColumns(
    columns: Record<string, ColumnSnapshot>,
  ): Record<string, TableSnapshot> {
    return {
      documents: {
        columns,
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    };
  }

  it('warns about vector column type on sqlite', () => {
    const tables = makeTableWithColumns({
      id: { type: 'uuid', nullable: false, primary: true, unique: false },
      embedding: { type: 'vector', nullable: false, primary: false, unique: false, dimensions: 1536 },
    });
    const warnings = validateColumns(tables, 'sqlite');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('vector');
    expect(warnings[0]).toContain('sqlite');
    expect(warnings[0]).toContain('embedding');
  });

  it('returns no warnings for vector column on postgres', () => {
    const tables = makeTableWithColumns({
      embedding: { type: 'vector', nullable: false, primary: false, unique: false, dimensions: 1536 },
    });
    expect(validateColumns(tables, 'postgres')).toEqual([]);
  });

  it('returns no warnings for non-vector columns on sqlite', () => {
    const tables = makeTableWithColumns({
      title: { type: 'text', nullable: false, primary: false, unique: false },
    });
    expect(validateColumns(tables, 'sqlite')).toEqual([]);
  });
});
