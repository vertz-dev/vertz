import { describe, expect, it } from 'bun:test';
import { generateSchemaCode } from '../codegen';
import type { SchemaSnapshot } from '../snapshot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(
  tables: SchemaSnapshot['tables'] = {},
  enums: SchemaSnapshot['enums'] = {},
): SchemaSnapshot {
  return { version: 1, tables, enums };
}

// ---------------------------------------------------------------------------
// Basic code generation
// ---------------------------------------------------------------------------

describe('generateSchemaCode', () => {
  it('returns an empty file with only the import for an empty snapshot', () => {
    const snapshot = makeSnapshot();
    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("import { d } from '@vertz/db';");
    expect(file.content).not.toContain('d.table');
  });

  it('generates d.table() for a simple table', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          name: { type: 'text', nullable: false, primary: false, unique: false, udtName: 'text' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("export const usersTable = d.table('users',");
    expect(file.content).toContain('id: d.uuid().primary()');
    expect(file.content).toContain('name: d.text()');
  });

  it('generates .unique() for unique columns', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          email: { type: 'text', nullable: false, primary: false, unique: true, udtName: 'text' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('email: d.text().unique()');
  });

  it('generates .nullable() for nullable columns', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          bio: { type: 'text', nullable: true, primary: false, unique: false, udtName: 'text' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('bio: d.text().nullable()');
  });

  it('generates .default("now") for timestamp now() defaults', () => {
    const snapshot = makeSnapshot({
      events: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          createdAt: {
            type: 'timestamp with time zone',
            nullable: false,
            primary: false,
            unique: false,
            default: 'now()',
            udtName: 'timestamptz',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("createdAt: d.timestamp().default('now')");
  });

  it('generates .default(true/false) for boolean defaults', () => {
    const snapshot = makeSnapshot({
      flags: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          active: {
            type: 'boolean',
            nullable: false,
            primary: false,
            unique: false,
            default: 'true',
            udtName: 'bool',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('active: d.boolean().default(true)');
  });

  it('generates d.serial() for integer columns with nextval default', () => {
    const snapshot = makeSnapshot({
      counters: {
        columns: {
          id: {
            type: 'integer',
            nullable: false,
            primary: true,
            unique: false,
            default: "nextval('counters_id_seq'::regclass)",
            udtName: 'int4',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('id: d.serial().primary()');
  });

  it('generates d.bigint() with comment for bigint columns with nextval default', () => {
    const snapshot = makeSnapshot({
      large: {
        columns: {
          id: {
            type: 'bigint',
            nullable: false,
            primary: true,
            unique: false,
            default: "nextval('large_id_seq'::regclass)",
            udtName: 'int8',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('d.bigint()');
    expect(file.content).toContain('// Source: bigserial');
  });
});

// ---------------------------------------------------------------------------
// Type mapping — Postgres specific
// ---------------------------------------------------------------------------

describe('generateSchemaCode — Postgres type mapping', () => {
  it('generates d.varchar(N) for varchar columns with length', () => {
    const snapshot = makeSnapshot({
      profiles: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          name: {
            type: 'character varying',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'varchar',
            length: 100,
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('name: d.varchar(100)');
  });

  it('generates d.text() for varchar without length', () => {
    const snapshot = makeSnapshot({
      notes: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          body: {
            type: 'character varying',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'varchar',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('body: d.text()');
  });

  it('generates d.decimal(P, S) for numeric columns with precision/scale', () => {
    const snapshot = makeSnapshot({
      products: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          price: {
            type: 'numeric',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'numeric',
            precision: 10,
            scale: 2,
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('price: d.decimal(10, 2)');
  });

  it('generates d.enum(name, values) for USER-DEFINED columns using udtName', () => {
    const snapshot = makeSnapshot(
      {
        tasks: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
            status: {
              type: 'USER-DEFINED',
              nullable: false,
              primary: false,
              unique: false,
              udtName: 'task_status',
              default: "'pending'::task_status",
            },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      { task_status: ['pending', 'active', 'done'] },
    );

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("status: d.enum('task_status', ['pending', 'active', 'done'])");
  });

  it('generates d.textArray() and d.integerArray() for array columns', () => {
    const snapshot = makeSnapshot({
      tags: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          labels: {
            type: 'ARRAY',
            nullable: false,
            primary: false,
            unique: false,
            udtName: '_text',
          },
          scores: {
            type: 'ARRAY',
            nullable: true,
            primary: false,
            unique: false,
            udtName: '_int4',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('labels: d.textArray()');
    expect(file.content).toContain('scores: d.integerArray().nullable()');
  });

  it('generates d.doublePrecision() for double precision type', () => {
    const snapshot = makeSnapshot({
      measurements: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          value: {
            type: 'double precision',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'float8',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('value: d.doublePrecision()');
  });

  it('falls back to d.text() with TODO comment for unmapped types', () => {
    const snapshot = makeSnapshot({
      search: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          vector: {
            type: 'tsvector',
            nullable: true,
            primary: false,
            unique: false,
            udtName: 'tsvector',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('d.text()');
    expect(file.content).toContain('// TODO: unmapped type "tsvector"');
  });

  it('adds source comment for lossy json → jsonb mapping', () => {
    const snapshot = makeSnapshot({
      logs: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          data: { type: 'json', nullable: false, primary: false, unique: false, udtName: 'json' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('d.jsonb()');
    expect(file.content).toContain('// Source: json');
  });

  it('adds source comment for timestamp without time zone', () => {
    const snapshot = makeSnapshot({
      logs: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          loggedAt: {
            type: 'timestamp without time zone',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'timestamp',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('d.timestamp()');
    expect(file.content).toContain('// Source: timestamp without time zone');
  });

  it('maps citext to d.text() without fallback comment', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          email: {
            type: 'citext',
            nullable: false,
            primary: false,
            unique: true,
            udtName: 'citext',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('email: d.text().unique()');
    expect(file.content).not.toContain('// TODO');
  });

  it('maps bytea to d.text() with binary TODO comment', () => {
    const snapshot = makeSnapshot({
      files: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          data: {
            type: 'bytea',
            nullable: true,
            primary: false,
            unique: false,
            udtName: 'bytea',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('d.text().nullable()');
    expect(file.content).toContain('// TODO: binary type');
  });

  it('escapes single quotes in enum values', () => {
    const snapshot = makeSnapshot(
      {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
            label: {
              type: 'USER-DEFINED',
              nullable: false,
              primary: false,
              unique: false,
              udtName: 'item_label',
            },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      { item_label: ["it's", 'normal', "won't"] },
    );

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("'it\\'s'");
    expect(file.content).toContain("'won\\'t'");
  });

  it('adds source comment for lossy smallint → integer mapping', () => {
    const snapshot = makeSnapshot({
      flags: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          priority: {
            type: 'smallint',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'int2',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('d.integer()');
    expect(file.content).toContain('// Source: smallint');
  });
});

// ---------------------------------------------------------------------------
// SQLite type mapping
// ---------------------------------------------------------------------------

describe('generateSchemaCode — SQLite type mapping', () => {
  it('maps integer, text, real, blob for SQLite', () => {
    const snapshot = makeSnapshot({
      items: {
        columns: {
          id: { type: 'integer', nullable: false, primary: true, unique: false },
          name: { type: 'text', nullable: false, primary: false, unique: false },
          score: { type: 'float', nullable: true, primary: false, unique: false },
          data: { type: 'blob', nullable: true, primary: false, unique: false },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'sqlite', mode: 'single-file' });
    expect(file.content).toContain('id: d.integer().primary()');
    expect(file.content).toContain('name: d.text()');
    expect(file.content).toContain('score: d.real().nullable()');
    expect(file.content).toContain('// TODO: binary type');
  });
});

// ---------------------------------------------------------------------------
// Column name casing
// ---------------------------------------------------------------------------

describe('generateSchemaCode — column name casing', () => {
  it('converts snake_case column names to camelCase keys', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          first_name: {
            type: 'text',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'text',
          },
          created_at: {
            type: 'timestamp with time zone',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'timestamptz',
            default: 'now()',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('firstName: d.text()');
    expect(file.content).toContain("createdAt: d.timestamp().default('now')");
    expect(file.content).not.toContain('first_name:');
    expect(file.content).not.toContain('created_at:');
  });
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

describe('generateSchemaCode — indexes', () => {
  it('generates indexes with name preserved', () => {
    const snapshot = makeSnapshot({
      posts: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          title: { type: 'text', nullable: false, primary: false, unique: false, udtName: 'text' },
        },
        indexes: [{ columns: ['title'], name: 'idx_posts_title', unique: false }],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("d.index('title', { name: 'idx_posts_title' })");
  });

  it('camelCases snake_case column names in indexes', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          created_at: {
            type: 'timestamp with time zone',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'timestamptz',
            default: 'now()',
          },
        },
        indexes: [{ columns: ['created_at'], name: 'idx_users_created_at' }],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("d.index('createdAt', { name: 'idx_users_created_at' })");
    expect(file.content).not.toContain("d.index('created_at'");
  });

  it('generates unique indexes', () => {
    const snapshot = makeSnapshot({
      posts: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          slug: { type: 'text', nullable: false, primary: false, unique: false, udtName: 'text' },
        },
        indexes: [{ columns: ['slug'], name: 'idx_posts_slug', unique: true }],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("d.index('slug', { name: 'idx_posts_slug', unique: true })");
  });

  it('generates multi-column indexes with camelCased columns', () => {
    const snapshot = makeSnapshot({
      events: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          event_type: {
            type: 'text',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'text',
          },
          event_date: {
            type: 'date',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'date',
          },
        },
        indexes: [{ columns: ['event_type', 'event_date'], name: 'idx_events_type_date' }],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain(
      "d.index(['eventType', 'eventDate'], { name: 'idx_events_type_date' })",
    );
  });
});

// ---------------------------------------------------------------------------
// Foreign keys / relations
// ---------------------------------------------------------------------------

describe('generateSchemaCode — relations', () => {
  it('generates d.model() with d.ref.one() for FK relations', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
      posts: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          author_id: {
            type: 'uuid',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
        },
        indexes: [],
        foreignKeys: [{ column: 'author_id', targetTable: 'users', targetColumn: 'id' }],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain('export const postsModel = d.model(postsTable,');
    expect(file.content).toContain("author: d.ref.one(() => usersTable, 'authorId')");
  });

  it('generates d.table() only for tables without FKs', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("export const usersTable = d.table('users',");
    expect(file.content).not.toContain('usersModel');
  });

  it('strips Id suffix for relation names', () => {
    const snapshot = makeSnapshot({
      orgs: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
      teams: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          org_id: {
            type: 'uuid',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
        },
        indexes: [],
        foreignKeys: [{ column: 'org_id', targetTable: 'orgs', targetColumn: 'id' }],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("org: d.ref.one(() => orgsTable, 'orgId')");
  });

  it('handles collision with two FKs to the same table', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
      messages: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          sender_id: {
            type: 'uuid',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
          receiver_id: {
            type: 'uuid',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
        },
        indexes: [],
        foreignKeys: [
          { column: 'sender_id', targetTable: 'users', targetColumn: 'id' },
          { column: 'receiver_id', targetTable: 'users', targetColumn: 'id' },
        ],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("sender: d.ref.one(() => usersTable, 'senderId')");
    expect(file.content).toContain("receiver: d.ref.one(() => usersTable, 'receiverId')");
  });

  it('handles self-referential FKs', () => {
    const snapshot = makeSnapshot({
      employees: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          manager_id: {
            type: 'uuid',
            nullable: true,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
        },
        indexes: [],
        foreignKeys: [{ column: 'manager_id', targetTable: 'employees', targetColumn: 'id' }],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("manager: d.ref.one(() => employeesTable, 'managerId')");
  });
});

// ---------------------------------------------------------------------------
// Table ordering (topological sort)
// ---------------------------------------------------------------------------

describe('generateSchemaCode — table ordering', () => {
  it('orders FK targets before referencing tables', () => {
    const snapshot = makeSnapshot({
      posts: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          author_id: {
            type: 'uuid',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
        },
        indexes: [],
        foreignKeys: [{ column: 'author_id', targetTable: 'users', targetColumn: 'id' }],
        _metadata: {},
      },
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    const usersIdx = file.content.indexOf('usersTable');
    const postsIdx = file.content.indexOf('postsTable');
    expect(usersIdx).toBeLessThan(postsIdx);
  });

  it('handles circular FKs by breaking the cycle', () => {
    const snapshot = makeSnapshot({
      table_a: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          b_id: {
            type: 'uuid',
            nullable: true,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
        },
        indexes: [],
        foreignKeys: [{ column: 'b_id', targetTable: 'table_b', targetColumn: 'id' }],
        _metadata: {},
      },
      table_b: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          a_id: {
            type: 'uuid',
            nullable: true,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
        },
        indexes: [],
        foreignKeys: [{ column: 'a_id', targetTable: 'table_a', targetColumn: 'id' }],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    // Both tables must be present — no crash
    expect(file.content).toContain('tableATable');
    expect(file.content).toContain('tableBTable');
    expect(file.content).toContain('// Note: circular FK');
  });
});

// ---------------------------------------------------------------------------
// Composite primary keys
// ---------------------------------------------------------------------------

describe('generateSchemaCode — composite primary keys', () => {
  it('generates primaryKey option for tables with multiple PK columns', () => {
    const snapshot = makeSnapshot({
      post_tags: {
        columns: {
          post_id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          tag_id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          created_at: {
            type: 'timestamp with time zone',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'timestamptz',
            default: 'now()',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("primaryKey: ['postId', 'tagId']");
    expect(file.content).not.toContain('.primary()');
  });
});

// ---------------------------------------------------------------------------
// Per-table mode
// ---------------------------------------------------------------------------

describe('generateSchemaCode — per-table mode', () => {
  it('generates one file per table plus barrel index.ts', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
      posts: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          author_id: {
            type: 'uuid',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'uuid',
          },
        },
        indexes: [],
        foreignKeys: [{ column: 'author_id', targetTable: 'users', targetColumn: 'id' }],
        _metadata: {},
      },
    });

    const files = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'per-table' });
    expect(files).toHaveLength(3); // users.ts, posts.ts, index.ts

    const userFile = files.find((f) => f.path === 'users.ts');
    expect(userFile?.content).toContain("import { d } from '@vertz/db';");
    expect(userFile?.content).toContain("export const usersTable = d.table('users',");

    const postFile = files.find((f) => f.path === 'posts.ts');
    expect(postFile?.content).toContain("import { usersTable } from './users';");
    expect(postFile?.content).toContain('export const postsModel = d.model(postsTable,');

    const indexFile = files.find((f) => f.path === 'index.ts');
    expect(indexFile?.content).toContain("export { usersTable } from './users';");
    expect(indexFile?.content).toContain("export { postsTable, postsModel } from './posts';");
  });
});

// ---------------------------------------------------------------------------
// Does NOT generate app-level annotations
// ---------------------------------------------------------------------------

describe('generateSchemaCode — index WHERE clause escaping', () => {
  it('escapes single quotes in WHERE clause', () => {
    const snapshot = makeSnapshot({
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          status: { type: 'text', nullable: false, primary: false, unique: false, udtName: 'text' },
        },
        indexes: [
          {
            columns: ['status'],
            name: 'idx_active',
            where: "status = 'active'",
          },
        ],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).toContain("where: 'status = \\'active\\''");
  });
});

describe('generateSchemaCode — no app-level annotations', () => {
  it('does NOT generate .readOnly(), .autoUpdate(), .hidden(), or .tenant()', () => {
    const snapshot = makeSnapshot({
      items: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false, udtName: 'uuid' },
          created_at: {
            type: 'timestamp with time zone',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'timestamptz',
            default: 'now()',
          },
          updated_at: {
            type: 'timestamp with time zone',
            nullable: false,
            primary: false,
            unique: false,
            udtName: 'timestamptz',
            default: 'now()',
          },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    });

    const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
    expect(file.content).not.toContain('.readOnly()');
    expect(file.content).not.toContain('.autoUpdate()');
    expect(file.content).not.toContain('.hidden()');
    expect(file.content).not.toContain('.tenant()');
    expect(file.content).not.toContain('.shared()');
  });
});
