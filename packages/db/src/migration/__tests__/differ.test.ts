import { describe, expect, it, spyOn } from 'bun:test';
import { computeDiff } from '../differ';
import type { SchemaSnapshot } from '../snapshot';

function emptySnapshot(): SchemaSnapshot {
  return { version: 1, tables: {}, enums: {} };
}

describe('computeDiff', () => {
  it('detects a new table as table_added', () => {
    const before = emptySnapshot();
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            name: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([{ type: 'table_added', table: 'users' }]);
  });

  it('detects a removed table as table_removed', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after = emptySnapshot();

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([{ type: 'table_removed', table: 'users' }]);
  });

  it('detects column_added within an existing table', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: true },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([{ type: 'column_added', table: 'users', column: 'email' }]);
  });

  it('detects column_removed within an existing table', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: true },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([{ type: 'column_removed', table: 'users', column: 'email' }]);
  });

  it('detects column_altered when type changes', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            age: { type: 'integer', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            age: { type: 'bigint', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      {
        type: 'column_altered',
        table: 'users',
        column: 'age',
        oldType: 'integer',
        newType: 'bigint',
      },
    ]);
  });

  it('detects column_altered when nullable changes', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            bio: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            bio: { type: 'text', nullable: true, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      {
        type: 'column_altered',
        table: 'users',
        column: 'bio',
        oldNullable: false,
        newNullable: true,
      },
    ]);
  });

  it('detects column_altered when default changes', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            status: {
              type: 'text',
              nullable: false,
              primary: false,
              unique: false,
              default: "'active'",
            },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            status: {
              type: 'text',
              nullable: false,
              primary: false,
              unique: false,
              default: "'pending'",
            },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      {
        type: 'column_altered',
        table: 'items',
        column: 'status',
        oldDefault: "'active'",
        newDefault: "'pending'",
      },
    ]);
  });

  it('detects column_altered when default is added', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            status: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            status: {
              type: 'text',
              nullable: false,
              primary: false,
              unique: false,
              default: "'active'",
            },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      {
        type: 'column_altered',
        table: 'items',
        column: 'status',
        oldDefault: undefined,
        newDefault: "'active'",
      },
    ]);
  });

  it('detects column_altered when default is removed', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            status: {
              type: 'text',
              nullable: false,
              primary: false,
              unique: false,
              default: "'active'",
            },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            status: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      {
        type: 'column_altered',
        table: 'items',
        column: 'status',
        oldDefault: "'active'",
        newDefault: undefined,
      },
    ]);
  });

  it('detects enum_added', () => {
    const before = emptySnapshot();
    const after: SchemaSnapshot = {
      version: 1,
      tables: {},
      enums: { user_role: ['admin', 'editor', 'viewer'] },
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([{ type: 'enum_added', enumName: 'user_role' }]);
  });

  it('detects enum_removed', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {},
      enums: { user_role: ['admin', 'editor', 'viewer'] },
    };
    const after = emptySnapshot();

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([{ type: 'enum_removed', enumName: 'user_role' }]);
  });

  it('detects enum_altered with added values', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {},
      enums: { user_role: ['admin', 'editor'] },
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {},
      enums: { user_role: ['admin', 'editor', 'viewer'] },
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      { type: 'enum_altered', enumName: 'user_role', addedValues: ['viewer'], removedValues: [] },
    ]);
  });

  it('detects index_added', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['email'] }],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([{ type: 'index_added', table: 'users', columns: ['email'] }]);
  });

  it('detects index_removed', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['email'] }],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([{ type: 'index_removed', table: 'users', columns: ['email'] }]);
  });

  it('carries index type and where in index_added change', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        posts: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            title: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        posts: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            title: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['title'], type: 'gin', where: "status = 'active'" }],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      {
        type: 'index_added',
        table: 'posts',
        columns: ['title'],
        indexType: 'gin',
        indexWhere: "status = 'active'",
      },
    ]);
  });

  it('carries custom index name in index_added change', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['email'], name: 'idx_custom_email' }],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      { type: 'index_added', table: 'users', columns: ['email'], indexName: 'idx_custom_email' },
    ]);
  });

  it('carries custom index name in index_removed change', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['email'], name: 'idx_custom_email' }],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    expect(result.changes).toEqual([
      { type: 'index_removed', table: 'users', columns: ['email'], indexName: 'idx_custom_email' },
    ]);
  });

  it('detects index change when type is added to existing index', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        posts: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            title: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['title'] }],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        posts: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            title: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['title'], type: 'gin' }],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    // Should detect as remove old + add new
    expect(result.changes).toHaveLength(2);
    const added = result.changes.find((c) => c.type === 'index_added');
    const removed = result.changes.find((c) => c.type === 'index_removed');
    expect(added).toBeDefined();
    expect(removed).toBeDefined();
    expect(added?.indexType).toBe('gin');
  });

  it('detects column rename with confidence scoring', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            name: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            fullName: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);

    // Should detect the rename instead of add+remove
    const rename = result.changes.find((c) => c.type === 'column_renamed');
    expect(rename).toBeDefined();
    expect(rename?.oldColumn).toBe('name');
    expect(rename?.newColumn).toBe('fullName');
    expect(rename?.table).toBe('users');
    expect(rename?.confidence).toBeGreaterThan(0);
  });
});

describe('composite primary key changes', () => {
  it('warns when primary key flag changes on a column', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: false, unique: false },
            name: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            name: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const warnSpy = spyOn(console, 'warn');
    computeDiff(before, after);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Primary key change detected'));
    warnSpy.mockRestore();
  });

  it('does NOT warn when primary flag stays the same', () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        items: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const warnSpy = spyOn(console, 'warn');
    computeDiff(before, after);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('detects addition of table with composite PK', () => {
    const before = emptySnapshot();
    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        tenant_members: {
          columns: {
            tenantId: { type: 'uuid', nullable: false, primary: true, unique: false },
            userId: { type: 'uuid', nullable: false, primary: true, unique: false },
            role: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = computeDiff(before, after);
    expect(result.changes).toEqual([{ type: 'table_added', table: 'tenant_members' }]);
  });
});
