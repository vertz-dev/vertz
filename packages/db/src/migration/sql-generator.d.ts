import type { DiffChange } from './differ';
import type { TableSnapshot } from './snapshot';
/**
 * Context needed by the SQL generator to produce full DDL.
 */
export interface SqlGeneratorContext {
  tables?: Record<string, TableSnapshot>;
  enums?: Record<string, string[]>;
}
/**
 * Generate migration SQL from a set of diff changes.
 */
export declare function generateMigrationSql(
  changes: DiffChange[],
  ctx?: SqlGeneratorContext,
): string;
/**
 * Generate rollback SQL from a set of diff changes.
 * Reverses the operation of each change.
 */
export declare function generateRollbackSql(
  changes: DiffChange[],
  ctx?: SqlGeneratorContext,
): string;
//# sourceMappingURL=sql-generator.d.ts.map
