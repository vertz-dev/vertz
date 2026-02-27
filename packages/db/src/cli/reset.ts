import { createMigrationQueryError, err, type Result } from '@vertz/errors';
import type { Dialect } from '../dialect';
import { defaultPostgresDialect } from '../dialect';
import type { MigrationError, MigrationFile, MigrationQueryFn } from '../migration';
import { createMigrationRunner } from '../migration';

export interface ResetOptions {
  queryFn: MigrationQueryFn;
  migrationFiles: MigrationFile[];
  dialect?: Dialect;
}

export interface ResetResult {
  tablesDropped: string[];
  migrationsApplied: string[];
}

const HISTORY_TABLE = '_vertz_migrations';

function getUserTablesQuery(dialect: Dialect): string {
  if (dialect.name === 'sqlite') {
    return `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`;
  }
  return `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'`;
}

function buildDropTableSql(tableName: string, dialect: Dialect): string {
  if (dialect.name === 'postgres') {
    return `DROP TABLE IF EXISTS "${tableName}" CASCADE`;
  }
  return `DROP TABLE IF EXISTS "${tableName}"`;
}

/**
 * Drop all user tables and re-apply all migrations from scratch.
 * Development use only.
 */
export async function reset(options: ResetOptions): Promise<Result<ResetResult, MigrationError>> {
  const dialect = options.dialect ?? defaultPostgresDialect;
  const runner = createMigrationRunner({ dialect });

  // 1. Get list of all user tables
  let tableNames: string[];
  try {
    const tablesResult = await options.queryFn(getUserTablesQuery(dialect), []);
    tableNames = tablesResult.rows.map((row) => row.name as string);
  } catch (cause) {
    return err(createMigrationQueryError('Failed to list user tables', { cause }));
  }

  // 2. Drop each user table (including the history table)
  const tablesDropped: string[] = [];
  for (const tableName of tableNames) {
    try {
      await options.queryFn(buildDropTableSql(tableName, dialect), []);
      if (tableName !== HISTORY_TABLE) {
        tablesDropped.push(tableName);
      }
    } catch (cause) {
      return err(createMigrationQueryError(`Failed to drop table: ${tableName}`, { cause }));
    }
  }

  // 3. Also drop the history table explicitly in case it wasn't in the list
  try {
    await options.queryFn(buildDropTableSql(HISTORY_TABLE, dialect), []);
  } catch (cause) {
    return err(createMigrationQueryError('Failed to drop history table', { cause }));
  }

  // 4. Create history table fresh
  const createResult = await runner.createHistoryTable(options.queryFn);
  if (!createResult.ok) {
    return createResult;
  }

  // 5. Apply all migration files in order
  const sorted = [...options.migrationFiles].sort((a, b) => a.timestamp - b.timestamp);
  const migrationsApplied: string[] = [];

  for (const file of sorted) {
    const applyResult = await runner.apply(options.queryFn, file.sql, file.name);
    if (!applyResult.ok) {
      return applyResult;
    }
    migrationsApplied.push(file.name);
  }

  return {
    ok: true,
    data: { tablesDropped, migrationsApplied },
  };
}
