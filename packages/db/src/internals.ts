// ---------------------------------------------------------------------------
// @vertz/db/internals -- Internal utilities for cross-package use only
//
// These are NOT part of the public API and may change without notice.
// Other @vertz packages may import from here; application code should not.
// ---------------------------------------------------------------------------

// Aggregate
export type { AggregateArgs, CountArgs, GroupByArgs } from './query/aggregate';
// Query executor
export type { ExecutorResult, QueryFn } from './query/executor';
export { executeQuery } from './query/executor';
// Query helpers
export {
  getColumnNames,
  getColumnsWithoutAnnotations,
  getDefaultColumns,
  getPrimaryKeyColumns,
  getTimestampColumns,
  resolveSelectColumns,
} from './query/helpers';
// Row mapping (snake_case -> camelCase)
export { mapRow, mapRows } from './query/row-mapper';
