import { afterEach, describe, expect, it, mock } from '@vertz/test';
import { defaultPostgresDialect, defaultSqliteDialect } from '../../dialect';
import type { DiffChange } from '../differ';
import { generateMigrationSql } from '../sql-generator';

describe('generateMigrationSql with PostgresDialect (regression)', () => {
  it('CREATE TABLE with PostgresDialect produces Postgres types', () => {
    const changes: DiffChange[] = [
      {
        type: 'table_added',
        table: 'users',
      },
    ];
    const ctx = {
      tables: {
        users: {
          _name: 'users',
          columns: {
            id: { type: 'UUID', nullable: false, primary: true, unique: false, default: undefined },
            name: {
              type: 'TEXT',
              nullable: false,
              primary: false,
              unique: false,
              default: undefined,
            },
            isActive: {
              type: 'BOOLEAN',
              nullable: true,
              primary: false,
              unique: false,
              default: undefined,
            },
            createdAt: {
              type: 'TIMESTAMPTZ',
              nullable: false,
              primary: false,
              unique: false,
              default: undefined,
            },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {},
    };

    const sql = generateMigrationSql(changes, ctx, defaultPostgresDialect);

    expect(sql).toContain('"id" UUID NOT NULL');
    expect(sql).toContain('"is_active" BOOLEAN');
    expect(sql).toContain('"created_at" TIMESTAMPTZ NOT NULL');
  });
});

describe('generateMigrationSql with SqliteDialect', () => {
  it('CREATE TABLE with SqliteDialect maps types correctly', () => {
    const changes: DiffChange[] = [
      {
        type: 'table_added',
        table: 'users',
      },
    ];
    const ctx = {
      tables: {
        users: {
          _name: 'users',
          columns: {
            id: { type: 'UUID', nullable: false, primary: true, unique: false, default: undefined },
            name: {
              type: 'TEXT',
              nullable: false,
              primary: false,
              unique: false,
              default: undefined,
            },
            isActive: {
              type: 'BOOLEAN',
              nullable: true,
              primary: false,
              unique: false,
              default: undefined,
            },
            createdAt: {
              type: 'TIMESTAMPTZ',
              nullable: false,
              primary: false,
              unique: false,
              default: undefined,
            },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {},
    };

    const sql = generateMigrationSql(changes, ctx, defaultSqliteDialect);

    // SQLite maps UUID -> TEXT, BOOLEAN -> INTEGER, TIMESTAMPTZ -> TEXT
    expect(sql).toContain('"id" TEXT NOT NULL');
    expect(sql).toContain('"is_active" INTEGER');
    expect(sql).toContain('"created_at" TEXT NOT NULL');
  });

  it('enum column on SQLite produces CHECK constraint', () => {
    const changes: DiffChange[] = [
      {
        type: 'table_added',
        table: 'posts',
      },
    ];
    const ctx = {
      tables: {
        posts: {
          _name: 'posts',
          columns: {
            id: { type: 'TEXT', nullable: false, primary: true, unique: false, default: undefined },
            // Column type matches the enum name so it's detected as an enum
            status: {
              type: 'post_status',
              nullable: false,
              primary: false,
              unique: false,
              default: undefined,
            },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {
        post_status: ['draft', 'published', 'archived'],
      },
    };

    const sql = generateMigrationSql(changes, ctx, defaultSqliteDialect);

    // SQLite should use CHECK constraint for enum values
    expect(sql).toContain("CHECK(\"status\" IN ('draft', 'published', 'archived'))");
  });

  afterEach(() => {
    mock.restore();
  });

  it('ignores index type for SQLite (no USING clause)', () => {
    const changes: DiffChange[] = [
      { type: 'index_added', table: 'posts', columns: ['title'], indexType: 'gin' },
    ];
    const sql = generateMigrationSql(changes, {}, defaultSqliteDialect);

    // SQLite doesn't support USING clause — should omit it
    expect(sql).toBe('CREATE INDEX "idx_posts_title" ON "posts" ("title");');
    expect(sql).not.toContain('USING');
  });

  it('emits console.warn for unsupported index type on SQLite', () => {
    const warnSpy = mock(() => {});
    console.warn = warnSpy;

    const changes: DiffChange[] = [{ type: 'table_added', table: 'posts' }];
    generateMigrationSql(
      changes,
      {
        tables: {
          posts: {
            columns: {
              id: { type: 'TEXT', nullable: false, primary: true, unique: false },
              title: { type: 'TEXT', nullable: false, primary: false, unique: false },
            },
            indexes: [{ columns: ['title'], type: 'gin' }],
            foreignKeys: [],
            _metadata: {},
          },
        },
      },
      defaultSqliteDialect,
    );

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('gin');
    expect(warnSpy.mock.calls[0][0]).toContain('sqlite');
  });

  it('supports partial indexes (WHERE) on SQLite', () => {
    const changes: DiffChange[] = [
      {
        type: 'index_added',
        table: 'posts',
        columns: ['email'],
        indexWhere: "status = 'active'",
      },
    ];
    const sql = generateMigrationSql(changes, {}, defaultSqliteDialect);

    expect(sql).toBe(
      'CREATE INDEX "idx_posts_email" ON "posts" ("email") WHERE status = \'active\';',
    );
  });

  it('supports UNIQUE indexes on SQLite', () => {
    const changes: DiffChange[] = [
      { type: 'index_added', table: 'users', columns: ['email'], indexUnique: true },
    ];
    const sql = generateMigrationSql(changes, {}, defaultSqliteDialect);

    expect(sql).toBe('CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email");');
  });

  it('table_added with typed index omits USING on SQLite', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'posts' }];
    const sql = generateMigrationSql(
      changes,
      {
        tables: {
          posts: {
            columns: {
              id: { type: 'TEXT', nullable: false, primary: true, unique: false },
              title: { type: 'TEXT', nullable: false, primary: false, unique: false },
            },
            indexes: [{ columns: ['title'], type: 'gin' }],
            foreignKeys: [],
            _metadata: {},
          },
        },
      },
      defaultSqliteDialect,
    );

    expect(sql).toContain('CREATE INDEX');
    expect(sql).not.toContain('USING');
  });

  it('CREATE INDEX is identical for both dialects', () => {
    const changes: DiffChange[] = [
      {
        type: 'index_added',
        table: 'users',
        columns: ['email'],
      },
    ];
    const ctx = {
      tables: {},
      enums: {},
    };

    const pgSql = generateMigrationSql(changes, ctx, defaultPostgresDialect);
    const sqliteSql = generateMigrationSql(changes, ctx, defaultSqliteDialect);

    expect(pgSql).toBe(sqliteSql);
    expect(pgSql).toContain('CREATE INDEX');
    expect(pgSql).toContain('"email"');
  });
});

describe('generateMigrationSql with PostgresDialect', () => {
  it('enum column on Postgres produces CREATE TYPE', () => {
    const changes: DiffChange[] = [
      {
        type: 'enum_added',
        enumName: 'postStatus',
      },
      {
        type: 'table_added',
        table: 'posts',
      },
    ];
    const ctx = {
      tables: {
        posts: {
          _name: 'posts',
          columns: {
            id: { type: 'TEXT', nullable: false, primary: true, unique: false, default: undefined },
            status: {
              type: 'post_status',
              nullable: false,
              primary: false,
              unique: false,
              default: undefined,
            },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {
        post_status: ['draft', 'published', 'archived'],
      },
    };

    const sql = generateMigrationSql(changes, ctx, defaultPostgresDialect);

    // Postgres should create enum type
    expect(sql).toContain('CREATE TYPE "post_status" AS ENUM');
    expect(sql).toContain("'draft', 'published', 'archived'");
  });
});

describe('generateMigrationSql vector column SQL', () => {
  it('vector column with dimensions produces vector(1536) on Postgres', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'documents' }];
    const sql = generateMigrationSql(
      changes,
      {
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
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
      },
      defaultPostgresDialect,
    );

    expect(sql).toContain('"embedding" vector(1536) NOT NULL');
  });

  it('vector column without dimensions produces vector on Postgres', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'documents' }];
    const sql = generateMigrationSql(
      changes,
      {
        tables: {
          documents: {
            columns: {
              id: { type: 'uuid', nullable: false, primary: true, unique: false },
              embedding: { type: 'vector', nullable: false, primary: false, unique: false },
            },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
      },
      defaultPostgresDialect,
    );

    expect(sql).toContain('"embedding" vector NOT NULL');
  });

  it('vector column on SQLite maps to TEXT', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'documents' }];
    const sql = generateMigrationSql(
      changes,
      {
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
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
      },
      defaultSqliteDialect,
    );

    expect(sql).toContain('"embedding" TEXT NOT NULL');
  });

  it('ALTER TABLE ADD COLUMN with vector(1536) on Postgres', () => {
    const changes: DiffChange[] = [
      { type: 'column_added', table: 'documents', column: 'embedding' },
    ];
    const sql = generateMigrationSql(
      changes,
      {
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
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
      },
      defaultPostgresDialect,
    );

    expect(sql).toContain('ADD COLUMN "embedding" vector(1536) NOT NULL');
  });
});

describe('generateMigrationSql vector index SQL', () => {
  it('HNSW index with opclass and WITH params in table_added', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'documents' }];
    const sql = generateMigrationSql(
      changes,
      {
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
      },
      defaultPostgresDialect,
    );

    expect(sql).toContain(
      'USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)',
    );
  });

  it('IVFFlat index with opclass and lists in table_added', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'documents' }];
    const sql = generateMigrationSql(
      changes,
      {
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
                type: 'ivfflat',
                opclass: 'vector_cosine_ops',
                lists: 100,
              },
            ],
            foreignKeys: [],
            _metadata: {},
          },
        },
      },
      defaultPostgresDialect,
    );

    expect(sql).toContain('USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)');
  });

  it('index with opclass but no WITH params', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'documents' }];
    const sql = generateMigrationSql(
      changes,
      {
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
            indexes: [{ columns: ['embedding'], type: 'hnsw', opclass: 'vector_cosine_ops' }],
            foreignKeys: [],
            _metadata: {},
          },
        },
      },
      defaultPostgresDialect,
    );

    expect(sql).toContain('USING hnsw ("embedding" vector_cosine_ops)');
    expect(sql).not.toContain('WITH');
  });

  it('HNSW index via index_added diff change', () => {
    const changes: DiffChange[] = [
      {
        type: 'index_added',
        table: 'documents',
        columns: ['embedding'],
        indexType: 'hnsw',
        indexOpclass: 'vector_cosine_ops',
        indexM: 16,
        indexEfConstruction: 64,
      },
    ];
    const sql = generateMigrationSql(changes, {}, defaultPostgresDialect);

    expect(sql).toContain(
      'USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)',
    );
  });

  it('IVFFlat index via index_added diff change', () => {
    const changes: DiffChange[] = [
      {
        type: 'index_added',
        table: 'documents',
        columns: ['embedding'],
        indexType: 'ivfflat',
        indexOpclass: 'vector_cosine_ops',
        indexLists: 100,
      },
    ];
    const sql = generateMigrationSql(changes, {}, defaultPostgresDialect);

    expect(sql).toContain('USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)');
  });
});

describe('generateMigrationSql backward compatibility', () => {
  it('works without dialect parameter (defaults to PostgresDialect)', () => {
    const changes: DiffChange[] = [
      {
        type: 'table_added',
        table: 'users',
      },
    ];
    const ctx = {
      tables: {
        users: {
          _name: 'users',
          columns: {
            id: { type: 'UUID', nullable: false, primary: true, unique: false, default: undefined },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {},
    };

    // Should work without the dialect parameter (defaults to PostgresDialect)
    const sql = generateMigrationSql(changes, ctx);

    expect(sql).toContain('"id" UUID NOT NULL');
  });
});
