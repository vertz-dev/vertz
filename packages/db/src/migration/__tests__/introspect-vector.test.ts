import { describe, expect, it } from '@vertz/test';
import type { MigrationQueryFn } from '../runner';
import { introspectPostgres } from '../introspect';

/**
 * Create a mock queryFn that returns predefined results for specific query patterns.
 */
function createMockQueryFn(
  responses: Array<{ pattern: string | RegExp; rows: Record<string, unknown>[] }>,
): MigrationQueryFn {
  return async (sql: string, _params: unknown[]) => {
    for (const { pattern, rows } of responses) {
      if (typeof pattern === 'string' ? sql.includes(pattern) : pattern.test(sql)) {
        return { rows };
      }
    }
    return { rows: [] };
  };
}

describe('introspectPostgres — vector columns', () => {
  const baseResponses: Array<{ pattern: string | RegExp; rows: Record<string, unknown>[] }> = [
    {
      pattern: 'information_schema.tables',
      rows: [{ table_name: 'documents' }],
    },
    {
      pattern: 'table_constraints tc',
      rows: [],
    },
  ];

  it('introspects vector column with dimensions from format_type', async () => {
    const queryFn = createMockQueryFn([
      ...baseResponses,
      {
        pattern: 'information_schema.columns',
        rows: [
          {
            column_name: 'id',
            data_type: 'uuid',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'uuid',
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
          },
          {
            column_name: 'embedding',
            data_type: 'USER-DEFINED',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'vector',
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
          },
        ],
      },
      {
        pattern: 'format_type',
        rows: [
          { column_name: 'id', full_type: 'uuid' },
          { column_name: 'embedding', full_type: 'vector(1536)' },
        ],
      },
      {
        pattern: 'pg_index',
        rows: [],
      },
    ]);

    const snapshot = await introspectPostgres(queryFn);
    const embedding = snapshot.tables.documents?.columns.embedding;

    expect(embedding).toBeDefined();
    expect(embedding!.type).toBe('vector');
    expect(embedding!.dimensions).toBe(1536);
  });

  it('introspects vector column without dimensions', async () => {
    const queryFn = createMockQueryFn([
      ...baseResponses,
      {
        pattern: 'information_schema.columns',
        rows: [
          {
            column_name: 'embedding',
            data_type: 'USER-DEFINED',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'vector',
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
          },
        ],
      },
      {
        pattern: 'format_type',
        rows: [{ column_name: 'embedding', full_type: 'vector' }],
      },
      {
        pattern: 'pg_index',
        rows: [],
      },
    ]);

    const snapshot = await introspectPostgres(queryFn);
    const embedding = snapshot.tables.documents?.columns.embedding;

    expect(embedding).toBeDefined();
    expect(embedding!.type).toBe('vector');
    expect(embedding!.dimensions).toBeUndefined();
  });

  it('non-vector USER-DEFINED columns remain unchanged', async () => {
    const queryFn = createMockQueryFn([
      ...baseResponses,
      {
        pattern: 'information_schema.columns',
        rows: [
          {
            column_name: 'status',
            data_type: 'USER-DEFINED',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'task_status',
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
          },
        ],
      },
      {
        pattern: 'format_type',
        rows: [{ column_name: 'status', full_type: 'task_status' }],
      },
      {
        pattern: 'pg_index',
        rows: [],
      },
    ]);

    const snapshot = await introspectPostgres(queryFn);
    const status = snapshot.tables.documents?.columns.status;

    expect(status).toBeDefined();
    expect(status!.type).toBe('USER-DEFINED');
    expect(status!.udtName).toBe('task_status');
    expect(status!.dimensions).toBeUndefined();
  });
});

describe('introspectPostgres — vector index options', () => {
  it('introspects HNSW index with opclass and reloptions', async () => {
    const queryFn = createMockQueryFn([
      {
        pattern: 'information_schema.tables',
        rows: [{ table_name: 'documents' }],
      },
      {
        pattern: 'table_constraints tc',
        rows: [],
      },
      {
        pattern: 'information_schema.columns',
        rows: [
          {
            column_name: 'embedding',
            data_type: 'USER-DEFINED',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'vector',
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
          },
        ],
      },
      {
        pattern: 'format_type',
        rows: [{ column_name: 'embedding', full_type: 'vector(1536)' }],
      },
      {
        pattern: 'pg_index',
        rows: [
          {
            index_name: 'idx_documents_embedding',
            columns: ['embedding'],
            is_unique: false,
            access_method: 'hnsw',
            predicate: null,
            reloptions: ['m=16', 'ef_construction=64'],
            opclasses: ['vector_cosine_ops'],
          },
        ],
      },
    ]);

    const snapshot = await introspectPostgres(queryFn);
    const idx = snapshot.tables.documents?.indexes[0];

    expect(idx).toBeDefined();
    expect(idx!.type).toBe('hnsw');
    expect(idx!.opclass).toBe('vector_cosine_ops');
    expect(idx!.m).toBe(16);
    expect(idx!.efConstruction).toBe(64);
  });

  it('introspects IVFFlat index with opclass and lists', async () => {
    const queryFn = createMockQueryFn([
      {
        pattern: 'information_schema.tables',
        rows: [{ table_name: 'documents' }],
      },
      {
        pattern: 'table_constraints tc',
        rows: [],
      },
      {
        pattern: 'information_schema.columns',
        rows: [
          {
            column_name: 'embedding',
            data_type: 'USER-DEFINED',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'vector',
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
          },
        ],
      },
      {
        pattern: 'format_type',
        rows: [{ column_name: 'embedding', full_type: 'vector(1536)' }],
      },
      {
        pattern: 'pg_index',
        rows: [
          {
            index_name: 'idx_documents_embedding',
            columns: ['embedding'],
            is_unique: false,
            access_method: 'ivfflat',
            predicate: null,
            reloptions: ['lists=100'],
            opclasses: ['vector_l2_ops'],
          },
        ],
      },
    ]);

    const snapshot = await introspectPostgres(queryFn);
    const idx = snapshot.tables.documents?.indexes[0];

    expect(idx).toBeDefined();
    expect(idx!.type).toBe('ivfflat');
    expect(idx!.opclass).toBe('vector_l2_ops');
    expect(idx!.lists).toBe(100);
  });

  it('btree index does not get default opclass stored', async () => {
    const queryFn = createMockQueryFn([
      {
        pattern: 'information_schema.tables',
        rows: [{ table_name: 'documents' }],
      },
      {
        pattern: 'table_constraints tc',
        rows: [],
      },
      {
        pattern: 'information_schema.columns',
        rows: [
          {
            column_name: 'title',
            data_type: 'text',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'text',
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
          },
        ],
      },
      {
        pattern: 'format_type',
        rows: [{ column_name: 'title', full_type: 'text' }],
      },
      {
        pattern: 'pg_index',
        rows: [
          {
            index_name: 'idx_documents_title',
            columns: ['title'],
            is_unique: false,
            access_method: 'btree',
            predicate: null,
            reloptions: null,
            opclasses: ['text_ops'],
          },
        ],
      },
    ]);

    const snapshot = await introspectPostgres(queryFn);
    const idx = snapshot.tables.documents?.indexes[0];

    expect(idx).toBeDefined();
    expect(idx!.opclass).toBeUndefined();
    expect(idx!.m).toBeUndefined();
  });

  it('index without reloptions has no m/efConstruction/lists', async () => {
    const queryFn = createMockQueryFn([
      {
        pattern: 'information_schema.tables',
        rows: [{ table_name: 'documents' }],
      },
      {
        pattern: 'table_constraints tc',
        rows: [],
      },
      {
        pattern: 'information_schema.columns',
        rows: [
          {
            column_name: 'embedding',
            data_type: 'USER-DEFINED',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'vector',
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
          },
        ],
      },
      {
        pattern: 'format_type',
        rows: [{ column_name: 'embedding', full_type: 'vector(1536)' }],
      },
      {
        pattern: 'pg_index',
        rows: [
          {
            index_name: 'idx_documents_embedding',
            columns: ['embedding'],
            is_unique: false,
            access_method: 'hnsw',
            predicate: null,
            reloptions: null,
            opclasses: ['vector_cosine_ops'],
          },
        ],
      },
    ]);

    const snapshot = await introspectPostgres(queryFn);
    const idx = snapshot.tables.documents?.indexes[0];

    expect(idx).toBeDefined();
    expect(idx!.type).toBe('hnsw');
    expect(idx!.opclass).toBe('vector_cosine_ops');
    expect(idx!.m).toBeUndefined();
    expect(idx!.efConstruction).toBeUndefined();
    expect(idx!.lists).toBeUndefined();
  });
});
