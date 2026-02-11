import { describe, expect, it } from 'vitest';
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
