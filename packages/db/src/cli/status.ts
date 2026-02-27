import type { Result } from '@vertz/errors';
import type { Dialect } from '../dialect';
import type {
  ChangeType,
  MigrationError,
  MigrationFile,
  MigrationQueryFn,
  SchemaSnapshot,
} from '../migration';
import { computeDiff, createMigrationRunner } from '../migration';
import { introspectPostgres, introspectSqlite } from '../migration/introspect';

export interface MigrateStatusOptions {
  queryFn: MigrationQueryFn;
  migrationFiles: MigrationFile[];
  currentSnapshot?: SchemaSnapshot;
  savedSnapshot?: SchemaSnapshot;
  dialect?: Dialect;
}

export interface MigrationInfo {
  name: string;
  checksum: string;
  appliedAt: Date;
}

export interface CodeChange {
  description: string;
  type: ChangeType;
  table?: string;
  column?: string;
}

export interface DriftEntry {
  description: string;
  type:
    | 'extra_table'
    | 'missing_table'
    | 'extra_column'
    | 'missing_column'
    | 'column_type_mismatch';
  table: string;
  column?: string;
}

export interface MigrateStatusResult {
  applied: MigrationInfo[];
  pending: string[];
  codeChanges: CodeChange[];
  drift: DriftEntry[];
}

function diffChangeToCodeChange(change: {
  type: ChangeType;
  table?: string;
  column?: string;
}): CodeChange {
  switch (change.type) {
    case 'table_added':
      return {
        description: `Added table '${change.table}'`,
        type: change.type,
        table: change.table,
      };
    case 'table_removed':
      return {
        description: `Removed table '${change.table}'`,
        type: change.type,
        table: change.table,
      };
    case 'column_added':
      return {
        description: `Added column '${change.column}' to table '${change.table}'`,
        type: change.type,
        table: change.table,
        column: change.column,
      };
    case 'column_removed':
      return {
        description: `Removed column '${change.column}' from table '${change.table}'`,
        type: change.type,
        table: change.table,
        column: change.column,
      };
    case 'column_altered':
      return {
        description: `Altered column '${change.column}' in table '${change.table}'`,
        type: change.type,
        table: change.table,
        column: change.column,
      };
    case 'column_renamed':
      return {
        description: `Renamed column in table '${change.table}'`,
        type: change.type,
        table: change.table,
      };
    case 'index_added':
      return {
        description: `Added index on table '${change.table}'`,
        type: change.type,
        table: change.table,
      };
    case 'index_removed':
      return {
        description: `Removed index on table '${change.table}'`,
        type: change.type,
        table: change.table,
      };
    case 'enum_added':
      return {
        description: `Added enum type`,
        type: change.type,
      };
    case 'enum_removed':
      return {
        description: `Removed enum type`,
        type: change.type,
      };
    case 'enum_altered':
      return {
        description: `Altered enum type`,
        type: change.type,
      };
  }
}

export function detectSchemaDrift(expected: SchemaSnapshot, actual: SchemaSnapshot): DriftEntry[] {
  const drift: DriftEntry[] = [];

  // Tables in DB but not in schema
  for (const tableName of Object.keys(actual.tables)) {
    if (!(tableName in expected.tables)) {
      drift.push({
        description: `Table '${tableName}' exists in database but not in schema`,
        type: 'extra_table',
        table: tableName,
      });
    }
  }

  // Tables in schema but not in DB
  for (const tableName of Object.keys(expected.tables)) {
    if (!(tableName in actual.tables)) {
      drift.push({
        description: `Table '${tableName}' exists in schema but not in database`,
        type: 'missing_table',
        table: tableName,
      });
    }
  }

  // Column-level drift for tables that exist in both
  for (const tableName of Object.keys(expected.tables)) {
    if (!(tableName in actual.tables)) continue;
    const expectedTable = expected.tables[tableName];
    const actualTable = actual.tables[tableName];
    if (!expectedTable || !actualTable) continue;

    // Columns in DB but not in schema
    for (const colName of Object.keys(actualTable.columns)) {
      if (!(colName in expectedTable.columns)) {
        drift.push({
          description: `Column '${colName}' exists in database table '${tableName}' but not in schema`,
          type: 'extra_column',
          table: tableName,
          column: colName,
        });
      }
    }

    // Columns in schema but not in DB
    for (const colName of Object.keys(expectedTable.columns)) {
      if (!(colName in actualTable.columns)) {
        drift.push({
          description: `Column '${colName}' exists in schema table '${tableName}' but not in database`,
          type: 'missing_column',
          table: tableName,
          column: colName,
        });
      }
    }

    // Column type mismatches
    for (const colName of Object.keys(expectedTable.columns)) {
      if (!(colName in actualTable.columns)) continue;
      const expectedCol = expectedTable.columns[colName];
      const actualCol = actualTable.columns[colName];
      if (!expectedCol || !actualCol) continue;

      if (expectedCol.type !== actualCol.type) {
        drift.push({
          description: `Column '${colName}' in table '${tableName}' has type '${actualCol.type}' in database but '${expectedCol.type}' in schema`,
          type: 'column_type_mismatch',
          table: tableName,
          column: colName,
        });
      }
    }
  }

  return drift;
}

/**
 * Report the status of migrations: which are applied and which are pending.
 * Optionally detects code changes and database drift.
 */
export async function migrateStatus(
  options: MigrateStatusOptions,
): Promise<Result<MigrateStatusResult, MigrationError>> {
  const runner = createMigrationRunner();
  const createResult = await runner.createHistoryTable(options.queryFn);
  if (!createResult.ok) {
    return createResult;
  }

  const appliedResult = await runner.getApplied(options.queryFn);
  if (!appliedResult.ok) {
    return appliedResult;
  }

  const applied = appliedResult.data;
  const pending = runner.getPending(options.migrationFiles, applied);

  // Code changes detection
  let codeChanges: CodeChange[] = [];
  if (options.savedSnapshot && options.currentSnapshot) {
    const diff = computeDiff(options.savedSnapshot, options.currentSnapshot);
    codeChanges = diff.changes.map(diffChangeToCodeChange);
  }

  // Database drift detection
  let drift: DriftEntry[] = [];
  if (options.dialect) {
    const introspect = options.dialect.name === 'sqlite' ? introspectSqlite : introspectPostgres;
    const actualSchema = await introspect(options.queryFn);
    const expectedSchema = options.savedSnapshot ?? options.currentSnapshot;
    if (expectedSchema) {
      drift = detectSchemaDrift(expectedSchema, actualSchema);
    }
  }

  return {
    ok: true,
    data: {
      applied: applied.map((a) => ({
        name: a.name,
        checksum: a.checksum,
        appliedAt: a.appliedAt,
      })),
      pending: pending.map((p) => p.name),
      codeChanges,
      drift,
    },
  };
}
