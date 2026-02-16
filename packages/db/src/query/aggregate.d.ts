/**
 * Aggregation queries — DB-012.
 *
 * Implements count, aggregate, and groupBy methods.
 * Generates parameterized SQL for aggregation functions.
 */
import type { ColumnRecord, TableDef } from '../schema/table';
import type { QueryFn } from './executor';
export interface CountArgs {
  readonly where?: Record<string, unknown>;
}
/**
 * Count rows matching an optional filter.
 */
export declare function count(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: CountArgs,
): Promise<number>;
export interface AggregateArgs {
  readonly where?: Record<string, unknown>;
  readonly _avg?: Record<string, true>;
  readonly _sum?: Record<string, true>;
  readonly _min?: Record<string, true>;
  readonly _max?: Record<string, true>;
  readonly _count?: true | Record<string, true>;
}
/**
 * Run aggregation functions on a table.
 */
export declare function aggregate(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: AggregateArgs,
): Promise<Record<string, unknown>>;
export interface GroupByArgs {
  readonly by: readonly string[];
  readonly where?: Record<string, unknown>;
  readonly _count?: true | Record<string, true>;
  readonly _avg?: Record<string, true>;
  readonly _sum?: Record<string, true>;
  readonly _min?: Record<string, true>;
  readonly _max?: Record<string, true>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly limit?: number;
  readonly offset?: number;
}
/**
 * Group rows by columns and apply aggregation functions.
 */
export declare function groupBy(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: GroupByArgs,
): Promise<Record<string, unknown>[]>;
//# sourceMappingURL=aggregate.d.ts.map
