import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { dbPullAction } from '../commands/db';
import type { IntrospectContext } from '../commands/load-db-context';

// ---------------------------------------------------------------------------
// Mock @vertz/db
// ---------------------------------------------------------------------------

const introspectPostgresMock = vi.fn();
const introspectSqliteMock = vi.fn();
const generateSchemaCodeMock = vi.fn();

vi.mock('@vertz/db', () => ({
  introspectPostgres: (...args: unknown[]) => introspectPostgresMock(...args),
  introspectSqlite: (...args: unknown[]) => introspectSqliteMock(...args),
  generateSchemaCode: (...args: unknown[]) => generateSchemaCodeMock(...args),
  defaultPostgresDialect: { name: 'postgres' },
  defaultSqliteDialect: { name: 'sqlite' },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockIntrospectContext(overrides?: Partial<IntrospectContext>): IntrospectContext {
  return {
    queryFn: vi.fn(),
    dialect: { name: 'postgres' } as IntrospectContext['dialect'],
    dialectName: 'postgres' as const,
    close: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dbPullAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('introspects the database and returns generated code', async () => {
    const mockSnapshot = { version: 1, tables: { users: {} }, enums: {} };
    introspectPostgresMock.mockResolvedValue(mockSnapshot);
    generateSchemaCodeMock.mockReturnValue([
      { path: 'schema.ts', content: "import { d } from '@vertz/db';\n" },
    ]);

    const ctx = createMockIntrospectContext();
    const result = await dbPullAction({
      ctx,
      output: undefined,
      dryRun: true,
      force: false,
      mode: 'single-file',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.files).toHaveLength(1);
      expect(result.data.files[0].path).toBe('schema.ts');
      expect(result.data.dryRun).toBe(true);
    }

    expect(introspectPostgresMock).toHaveBeenCalledWith(ctx.queryFn);
    expect(generateSchemaCodeMock).toHaveBeenCalledWith(mockSnapshot, {
      dialect: 'postgres',
      mode: 'single-file',
    });
  });

  it('uses introspectSqlite for sqlite dialect', async () => {
    const mockSnapshot = { version: 1, tables: {}, enums: {} };
    introspectSqliteMock.mockResolvedValue(mockSnapshot);
    generateSchemaCodeMock.mockReturnValue([
      { path: 'schema.ts', content: "import { d } from '@vertz/db';\n" },
    ]);

    const ctx = createMockIntrospectContext({
      dialectName: 'sqlite',
      dialect: { name: 'sqlite' } as IntrospectContext['dialect'],
    });

    const result = await dbPullAction({
      ctx,
      output: undefined,
      dryRun: true,
      force: false,
      mode: 'single-file',
    });

    expect(result.ok).toBe(true);
    expect(introspectSqliteMock).toHaveBeenCalledWith(ctx.queryFn);
  });

  it('returns error when introspection fails', async () => {
    introspectPostgresMock.mockRejectedValue(new Error('Connection refused'));

    const ctx = createMockIntrospectContext();
    const result = await dbPullAction({
      ctx,
      output: undefined,
      dryRun: false,
      force: false,
      mode: 'single-file',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Connection refused');
    }
  });
});
