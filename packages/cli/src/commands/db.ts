import type {
  BaselineResult,
  Dialect,
  MigrateDeployResult,
  MigrateDevResult,
  MigrateStatusResult,
  MigrationFile,
  MigrationQueryFn,
  PushResult,
  ResetResult,
  SchemaSnapshot,
} from '@vertz/db';
import { baseline, migrateDeploy, migrateDev, migrateStatus, push, reset } from '@vertz/db';

// ---------------------------------------------------------------------------
// Shared context — assembled by loadDbContext() in cli.ts
// ---------------------------------------------------------------------------

export interface DbCommandContext {
  queryFn: MigrationQueryFn;
  currentSnapshot: SchemaSnapshot;
  previousSnapshot: SchemaSnapshot;
  savedSnapshot?: SchemaSnapshot;
  migrationFiles: MigrationFile[];
  migrationsDir: string;
  existingFiles: string[];
  dialect: Dialect;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// vertz db push
// ---------------------------------------------------------------------------

export interface DbPushOptions {
  ctx: DbCommandContext;
}

export async function dbPushAction(options: DbPushOptions): Promise<PushResult> {
  return push({
    queryFn: options.ctx.queryFn,
    currentSnapshot: options.ctx.currentSnapshot,
    previousSnapshot: options.ctx.previousSnapshot,
  });
}

// ---------------------------------------------------------------------------
// vertz db migrate
// ---------------------------------------------------------------------------

export interface DbMigrateOptions {
  ctx: DbCommandContext;
  name?: string;
  dryRun: boolean;
}

export async function dbMigrateAction(options: DbMigrateOptions): Promise<MigrateDevResult> {
  return migrateDev({
    queryFn: options.ctx.queryFn,
    currentSnapshot: options.ctx.currentSnapshot,
    previousSnapshot: options.ctx.previousSnapshot,
    migrationName: options.name,
    existingFiles: options.ctx.existingFiles,
    migrationsDir: options.ctx.migrationsDir,
    writeFile: options.ctx.writeFile,
    readFile: options.ctx.readFile,
    dryRun: options.dryRun,
  });
}

// ---------------------------------------------------------------------------
// vertz db deploy
// ---------------------------------------------------------------------------

export interface DbDeployOptions {
  ctx: DbCommandContext;
  dryRun: boolean;
}

export async function dbDeployAction(options: DbDeployOptions): Promise<MigrateDeployResult> {
  const result = await migrateDeploy({
    queryFn: options.ctx.queryFn,
    migrationFiles: options.ctx.migrationFiles,
    dryRun: options.dryRun,
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// vertz db status
// ---------------------------------------------------------------------------

export interface DbStatusOptions {
  ctx: DbCommandContext;
}

export async function dbStatusAction(options: DbStatusOptions): Promise<MigrateStatusResult> {
  const result = await migrateStatus({
    queryFn: options.ctx.queryFn,
    migrationFiles: options.ctx.migrationFiles,
    currentSnapshot: options.ctx.currentSnapshot,
    savedSnapshot: options.ctx.savedSnapshot,
    dialect: options.ctx.dialect,
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// vertz db reset
// ---------------------------------------------------------------------------

export interface DbResetOptions {
  ctx: DbCommandContext;
}

export async function dbResetAction(options: DbResetOptions): Promise<ResetResult> {
  const result = await reset({
    queryFn: options.ctx.queryFn,
    migrationFiles: options.ctx.migrationFiles,
    dialect: options.ctx.dialect,
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// vertz db baseline
// ---------------------------------------------------------------------------

export interface DbBaselineOptions {
  ctx: DbCommandContext;
}

export async function dbBaselineAction(options: DbBaselineOptions): Promise<BaselineResult> {
  const result = await baseline({
    queryFn: options.ctx.queryFn,
    migrationFiles: options.ctx.migrationFiles,
    dialect: options.ctx.dialect,
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}
