import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import type { DbCommandContext } from '../commands/db';
import {
  dbBaselineAction,
  dbDeployAction,
  dbMigrateAction,
  dbPushAction,
  dbResetAction,
  dbStatusAction,
} from '../commands/db';

// ---------------------------------------------------------------------------
// Mock @vertz/db
// ---------------------------------------------------------------------------

const pushMock = vi.fn();
const migrateDevMock = vi.fn();
const migrateDeployMock = vi.fn();
const migrateStatusMock = vi.fn();
const resetMock = vi.fn();
const baselineMock = vi.fn();

vi.mock('@vertz/db', () => ({
  push: (...args: unknown[]) => pushMock(...args),
  migrateDev: (...args: unknown[]) => migrateDevMock(...args),
  migrateDeploy: (...args: unknown[]) => migrateDeployMock(...args),
  migrateStatus: (...args: unknown[]) => migrateStatusMock(...args),
  reset: (...args: unknown[]) => resetMock(...args),
  baseline: (...args: unknown[]) => baselineMock(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(overrides?: Partial<DbCommandContext>): DbCommandContext {
  return {
    queryFn: vi.fn(),
    currentSnapshot: { version: 1, tables: {}, enums: {} },
    previousSnapshot: { version: 1, tables: {}, enums: {} },
    migrationFiles: [],
    migrationsDir: '/tmp/migrations',
    existingFiles: [],
    writeFile: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('db command actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dbPushAction', () => {
    it('calls push with queryFn and snapshots', async () => {
      const ctx = createMockContext();
      pushMock.mockResolvedValue({ sql: 'CREATE TABLE ...', tablesAffected: ['users'] });

      const result = await dbPushAction({ ctx });

      expect(pushMock).toHaveBeenCalledWith({
        queryFn: ctx.queryFn,
        currentSnapshot: ctx.currentSnapshot,
        previousSnapshot: ctx.previousSnapshot,
      });
      expect(result.tablesAffected).toEqual(['users']);
    });
  });

  describe('dbMigrateAction', () => {
    it('calls migrateDev with name and dryRun', async () => {
      const ctx = createMockContext();
      migrateDevMock.mockResolvedValue({
        migrationFile: '0001_add-users-table.sql',
        sql: 'CREATE TABLE users (...)',
        dryRun: true,
        snapshot: ctx.currentSnapshot,
      });

      const result = await dbMigrateAction({ ctx, name: 'add-users', dryRun: true });

      expect(migrateDevMock).toHaveBeenCalledWith({
        queryFn: ctx.queryFn,
        currentSnapshot: ctx.currentSnapshot,
        previousSnapshot: ctx.previousSnapshot,
        migrationName: 'add-users',
        existingFiles: ctx.existingFiles,
        migrationsDir: ctx.migrationsDir,
        writeFile: ctx.writeFile,
        readFile: undefined,
        dryRun: true,
      });
      expect(result.migrationFile).toBe('0001_add-users-table.sql');
      expect(result.dryRun).toBe(true);
    });

    it('passes dryRun=false when not in dry-run mode', async () => {
      const ctx = createMockContext();
      migrateDevMock.mockResolvedValue({
        migrationFile: '0001_add-users-table.sql',
        sql: 'CREATE TABLE users (...)',
        appliedAt: new Date(),
        dryRun: false,
        snapshot: ctx.currentSnapshot,
      });

      await dbMigrateAction({ ctx, dryRun: false });

      expect(migrateDevMock).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
    });
  });

  describe('dbDeployAction', () => {
    it('calls migrateDeploy and returns unwrapped result', async () => {
      const ctx = createMockContext();
      migrateDeployMock.mockResolvedValue({
        ok: true,
        data: {
          applied: ['0001_init.sql'],
          alreadyApplied: [],
          dryRun: false,
        },
      });

      const result = await dbDeployAction({ ctx, dryRun: false });

      expect(migrateDeployMock).toHaveBeenCalledWith({
        queryFn: ctx.queryFn,
        migrationFiles: ctx.migrationFiles,
        dryRun: false,
      });
      expect(result.applied).toEqual(['0001_init.sql']);
    });

    it('passes dryRun flag to migrateDeploy', async () => {
      const ctx = createMockContext();
      migrateDeployMock.mockResolvedValue({
        ok: true,
        data: { applied: [], alreadyApplied: [], dryRun: true },
      });

      await dbDeployAction({ ctx, dryRun: true });

      expect(migrateDeployMock).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    });

    it('throws when migrateDeploy returns an error', async () => {
      const ctx = createMockContext();
      migrateDeployMock.mockResolvedValue({
        ok: false,
        error: { message: 'connection failed' },
      });

      await expect(dbDeployAction({ ctx, dryRun: false })).rejects.toThrow('connection failed');
    });
  });

  describe('dbStatusAction', () => {
    it('calls migrateStatus with context fields', async () => {
      const ctx = createMockContext({
        savedSnapshot: { version: 1, tables: {}, enums: {} },
      });
      migrateStatusMock.mockResolvedValue({
        ok: true,
        data: {
          applied: [],
          pending: ['0002_add-posts.sql'],
          codeChanges: [],
          drift: [],
        },
      });

      const result = await dbStatusAction({ ctx });

      expect(migrateStatusMock).toHaveBeenCalledWith({
        queryFn: ctx.queryFn,
        migrationFiles: ctx.migrationFiles,
        currentSnapshot: ctx.currentSnapshot,
        savedSnapshot: ctx.savedSnapshot,
        dialect: undefined,
      });
      expect(result.pending).toEqual(['0002_add-posts.sql']);
    });

    it('throws when migrateStatus returns an error', async () => {
      const ctx = createMockContext();
      migrateStatusMock.mockResolvedValue({
        ok: false,
        error: { message: 'cannot read history' },
      });

      await expect(dbStatusAction({ ctx })).rejects.toThrow('cannot read history');
    });
  });

  describe('dbResetAction', () => {
    it('calls reset with context fields', async () => {
      const ctx = createMockContext();
      resetMock.mockResolvedValue({
        ok: true,
        data: { tablesDropped: ['users', 'posts'], migrationsApplied: ['0001_init.sql'] },
      });

      const result = await dbResetAction({ ctx });

      expect(resetMock).toHaveBeenCalledWith({
        queryFn: ctx.queryFn,
        migrationFiles: ctx.migrationFiles,
        dialect: undefined,
      });
      expect(result.tablesDropped).toEqual(['users', 'posts']);
      expect(result.migrationsApplied).toEqual(['0001_init.sql']);
    });

    it('throws when reset returns an error', async () => {
      const ctx = createMockContext();
      resetMock.mockResolvedValue({
        ok: false,
        error: { message: 'drop failed' },
      });

      await expect(dbResetAction({ ctx })).rejects.toThrow('drop failed');
    });
  });

  describe('dbBaselineAction', () => {
    it('calls baseline with context fields', async () => {
      const ctx = createMockContext();
      baselineMock.mockResolvedValue({
        ok: true,
        data: { recorded: ['0001_init.sql', '0002_add-posts.sql'] },
      });

      const result = await dbBaselineAction({ ctx });

      expect(baselineMock).toHaveBeenCalledWith({
        queryFn: ctx.queryFn,
        migrationFiles: ctx.migrationFiles,
        dialect: undefined,
      });
      expect(result.recorded).toEqual(['0001_init.sql', '0002_add-posts.sql']);
    });

    it('throws when baseline returns an error', async () => {
      const ctx = createMockContext();
      baselineMock.mockResolvedValue({
        ok: false,
        error: { message: 'baseline failed' },
      });

      await expect(dbBaselineAction({ ctx })).rejects.toThrow('baseline failed');
    });
  });
});
