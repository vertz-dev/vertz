import type { MigrationQueryFn, SchemaSnapshot } from '../migration';
export interface PushOptions {
  queryFn: MigrationQueryFn;
  currentSnapshot: SchemaSnapshot;
  previousSnapshot: SchemaSnapshot;
}
export interface PushResult {
  sql: string;
  tablesAffected: string[];
}
/**
 * Push schema changes directly to the database without creating a migration file.
 */
export declare function push(options: PushOptions): Promise<PushResult>;
//# sourceMappingURL=push.d.ts.map
