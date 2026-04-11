import { afterEach, beforeEach, describe, expect, it, vi, mock, spyOn } from '@vertz/test';

// ---------------------------------------------------------------------------
// Mock external dependencies before importing the module under test.
//
// NOTE: We do NOT vi.mock('jiti') because Bun test runs all files in one
// process and vi.mock() is global — it would break every other test file
// that uses jiti (loader, load-db-context).
// Instead, we spy on the exported _importConfig helper.
// ---------------------------------------------------------------------------

const mockQueryFn = mock();
const mockClose = mock().mockResolvedValue(undefined);

// Mock the postgres driver so createConnection doesn't need a real DB
vi.mock('postgres', () => ({
  default: () => ({
    unsafe: mockQueryFn,
    end: mockClose,
  }),
}));

// Now import the module under test
import * as loadDbContextModule from '../commands/load-db-context';

const { loadIntrospectContext } = loadDbContextModule;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadIntrospectContext', () => {
  let importConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    importConfigSpy = spyOn(loadDbContextModule, '_importConfig').mockResolvedValue({
      db: {
        dialect: 'postgres',
        url: 'postgres://localhost:5432/testdb',
        schema: './src/schema.ts',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses overrides directly when both url and dialect provided', async () => {
    const ctx = await loadIntrospectContext({
      url: 'postgres://localhost:5432/test',
      dialect: 'postgres',
    });

    expect(ctx.dialectName).toBe('postgres');
    expect(ctx.dialect).toBeDefined();
    expect(typeof ctx.queryFn).toBe('function');
    expect(typeof ctx.close).toBe('function');
    // Should NOT load config when both overrides provided
    expect(importConfigSpy).not.toHaveBeenCalled();

    await ctx.close();
  });

  it('uses dialect override from config when only dialect is provided', async () => {
    importConfigSpy.mockResolvedValue({
      db: {
        dialect: 'sqlite',
        url: 'postgres://localhost:5432/testdb',
        schema: './src/schema.ts',
      },
    });

    // Override dialect to postgres (connection goes through mocked postgres driver)
    const ctx = await loadIntrospectContext({ dialect: 'postgres' });

    expect(ctx.dialectName).toBe('postgres');
    await ctx.close();
  });

  it('loads config when no overrides provided', async () => {
    const ctx = await loadIntrospectContext();

    expect(ctx.dialectName).toBe('postgres');
    expect(importConfigSpy).toHaveBeenCalled();
    expect(typeof ctx.queryFn).toBe('function');

    await ctx.close();
  });

  it('uses dialect from config when only url is overridden', async () => {
    const ctx = await loadIntrospectContext({ url: 'postgres://custom:5432/db' });

    expect(ctx.dialectName).toBe('postgres');
    expect(importConfigSpy).toHaveBeenCalled();

    await ctx.close();
  });

  it('throws when config file not found and no overrides', async () => {
    // Simulate config import failure + file not found
    importConfigSpy.mockRejectedValue(new Error('Module not found'));
    // Also need to mock fs.access to throw (file not found)
    spyOn(await import('node:fs/promises'), 'access').mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    await expect(loadIntrospectContext()).rejects.toThrow('Could not find vertz.config.ts');
  });

  it('throws when config has no dialect', async () => {
    importConfigSpy.mockResolvedValue({
      db: { schema: './src/schema.ts' },
    });

    await expect(loadIntrospectContext()).rejects.toThrow('No `dialect` found');
  });
});
