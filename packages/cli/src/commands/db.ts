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
import { err, ok, type Result } from '@vertz/errors';

// ---------------------------------------------------------------------------
// Shared context — assembled by loadDbContext() in cli.ts
// ---------------------------------------------------------------------------

export interface DbCommandContext {
  queryFn: MigrationQueryFn;
  /** Snapshot derived from the current schema file exports. */
  currentSnapshot: SchemaSnapshot;
  /** Previous snapshot — loaded from disk, or empty if no saved snapshot exists. */
  previousSnapshot: SchemaSnapshot;
  /** Raw saved snapshot from disk (undefined when no _snapshot.json exists yet). */
  savedSnapshot?: SchemaSnapshot;
  migrationFiles: MigrationFile[];
  migrationsDir: string;
  existingFiles: string[];
  dialect: Dialect;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  /** Close the database connection. Must be called when done. */
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// vertz db push
// ---------------------------------------------------------------------------

export interface DbPushOptions {
  ctx: DbCommandContext;
}

export async function dbPushAction(options: DbPushOptions): Promise<Result<PushResult, Error>> {
  try {
    const data = await push({
      queryFn: options.ctx.queryFn,
      currentSnapshot: options.ctx.currentSnapshot,
      previousSnapshot: options.ctx.previousSnapshot,
    });
    return ok(data);
  } catch (error) {
    return err(new Error(error instanceof Error ? error.message : String(error)));
  }
}

// ---------------------------------------------------------------------------
// vertz db migrate
// ---------------------------------------------------------------------------

export interface DbMigrateOptions {
  ctx: DbCommandContext;
  name?: string;
  dryRun: boolean;
}

export async function dbMigrateAction(
  options: DbMigrateOptions,
): Promise<Result<MigrateDevResult, Error>> {
  try {
    const data = await migrateDev({
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
    return ok(data);
  } catch (error) {
    return err(new Error(error instanceof Error ? error.message : String(error)));
  }
}

// ---------------------------------------------------------------------------
// vertz db deploy
// ---------------------------------------------------------------------------

export interface DbDeployOptions {
  ctx: DbCommandContext;
  dryRun: boolean;
}

export async function dbDeployAction(
  options: DbDeployOptions,
): Promise<Result<MigrateDeployResult, Error>> {
  const result = await migrateDeploy({
    queryFn: options.ctx.queryFn,
    migrationFiles: options.ctx.migrationFiles,
    dryRun: options.dryRun,
  });
  if (!result.ok) {
    return err(new Error(result.error.message));
  }
  return ok(result.data);
}

// ---------------------------------------------------------------------------
// vertz db status
// ---------------------------------------------------------------------------

export interface DbStatusOptions {
  ctx: DbCommandContext;
}

export async function dbStatusAction(
  options: DbStatusOptions,
): Promise<Result<MigrateStatusResult, Error>> {
  const result = await migrateStatus({
    queryFn: options.ctx.queryFn,
    migrationFiles: options.ctx.migrationFiles,
    currentSnapshot: options.ctx.currentSnapshot,
    savedSnapshot: options.ctx.savedSnapshot,
    dialect: options.ctx.dialect,
  });
  if (!result.ok) {
    return err(new Error(result.error.message));
  }
  return ok(result.data);
}

// ---------------------------------------------------------------------------
// vertz db reset
// ---------------------------------------------------------------------------

export interface DbResetOptions {
  ctx: DbCommandContext;
}

export async function dbResetAction(options: DbResetOptions): Promise<Result<ResetResult, Error>> {
  const result = await reset({
    queryFn: options.ctx.queryFn,
    migrationFiles: options.ctx.migrationFiles,
    dialect: options.ctx.dialect,
  });
  if (!result.ok) {
    return err(new Error(result.error.message));
  }
  return ok(result.data);
}

// ---------------------------------------------------------------------------
// vertz db baseline
// ---------------------------------------------------------------------------

export interface DbBaselineOptions {
  ctx: DbCommandContext;
}

export async function dbBaselineAction(
  options: DbBaselineOptions,
): Promise<Result<BaselineResult, Error>> {
  const result = await baseline({
    queryFn: options.ctx.queryFn,
    migrationFiles: options.ctx.migrationFiles,
    dialect: options.ctx.dialect,
  });
  if (!result.ok) {
    return err(new Error(result.error.message));
  }
  return ok(result.data);
}
