import { afterEach, beforeEach, describe, expect, it, vi, mock } from '@vertz/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Mock external dependencies before importing the module under test.
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
import { loadIntrospectContext } from '../commands/load-db-context';

// ---------------------------------------------------------------------------
// Tests — use real temp files instead of spying on _importConfig
// (vtz runtime's ESM modules have read-only exports, so spyOn doesn't work)
// ---------------------------------------------------------------------------

describe('loadIntrospectContext', () => {
  const originalCwd = process.cwd;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = join(
      tmpdir(),
      `vertz-test-introspect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tempDir, { recursive: true });
    process.cwd = () => tempDir;
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('uses overrides directly when both url and dialect provided', async () => {
    // No config file needed — zero-config mode
    const ctx = await loadIntrospectContext({
      url: 'postgres://localhost:5432/test',
      dialect: 'postgres',
    });

    expect(ctx.dialectName).toBe('postgres');
    expect(ctx.dialect).toBeDefined();
    expect(typeof ctx.queryFn).toBe('function');
    expect(typeof ctx.close).toBe('function');

    await ctx.close();
  });

  it('uses dialect override from config when only dialect is provided', async () => {
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = {
  dialect: 'sqlite',
  url: 'postgres://localhost:5432/testdb',
  schema: './src/schema.ts',
};`,
    );

    // Override dialect to postgres (connection goes through mocked postgres driver)
    const ctx = await loadIntrospectContext({ dialect: 'postgres' });

    expect(ctx.dialectName).toBe('postgres');
    await ctx.close();
  });

  it('loads config when no overrides provided', async () => {
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = {
  dialect: 'postgres',
  url: 'postgres://localhost:5432/testdb',
  schema: './src/schema.ts',
};`,
    );

    const ctx = await loadIntrospectContext();

    expect(ctx.dialectName).toBe('postgres');
    expect(typeof ctx.queryFn).toBe('function');

    await ctx.close();
  });

  it('uses dialect from config when only url is overridden', async () => {
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = {
  dialect: 'postgres',
  url: 'postgres://localhost:5432/testdb',
  schema: './src/schema.ts',
};`,
    );

    const ctx = await loadIntrospectContext({ url: 'postgres://custom:5432/db' });

    expect(ctx.dialectName).toBe('postgres');

    await ctx.close();
  });

  it('throws when config file not found and no overrides', async () => {
    // No config file created — should throw
    await expect(loadIntrospectContext()).rejects.toThrow('Could not find vertz.config.ts');
  });

  it('throws when config has no dialect', async () => {
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { schema: './src/schema.ts' };`,
    );

    await expect(loadIntrospectContext()).rejects.toThrow('No `dialect` found');
  });
});
