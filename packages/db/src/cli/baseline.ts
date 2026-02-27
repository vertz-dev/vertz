import type { Result } from '@vertz/errors';
import type { Dialect } from '../dialect';
import type { MigrationError, MigrationFile, MigrationQueryFn } from '../migration';
import { computeChecksum, createMigrationRunner } from '../migration';

export interface BaselineOptions {
  queryFn: MigrationQueryFn;
  migrationFiles: MigrationFile[];
  dialect?: Dialect;
}

export interface BaselineResult {
  recorded: string[];
}

/**
 * Mark all existing migration files as applied without executing them.
 * Used when adopting vertz on a database that already has the schema.
 */
export async function baseline(
  options: BaselineOptions,
): Promise<Result<BaselineResult, MigrationError>> {
  const runner = createMigrationRunner({ dialect: options.dialect });

  const createResult = await runner.createHistoryTable(options.queryFn);
  if (!createResult.ok) {
    return createResult;
  }

  const appliedResult = await runner.getApplied(options.queryFn);
  if (!appliedResult.ok) {
    return appliedResult;
  }

  const appliedNames = new Set(appliedResult.data.map((a) => a.name));
  const recorded: string[] = [];

  for (const file of options.migrationFiles) {
    if (appliedNames.has(file.name)) {
      continue;
    }

    const checksum = await computeChecksum(file.sql);
    const dialect = options.dialect;
    const param1 = dialect ? dialect.param(1) : '$1';
    const param2 = dialect ? dialect.param(2) : '$2';
    await options.queryFn(
      `INSERT INTO "_vertz_migrations" ("name", "checksum") VALUES (${param1}, ${param2})`,
      [file.name, checksum],
    );
    recorded.push(file.name);
  }

  return {
    ok: true,
    data: { recorded },
  };
}
