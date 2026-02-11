// ---------------------------------------------------------------------------
// @vertz/db -- Primary developer-facing API
//
// SQL builders          -> @vertz/db/sql
// Internal utilities    -> @vertz/db/internals
// Plugin system         -> @vertz/db/plugin
// ---------------------------------------------------------------------------

// CLI / Migrations
export type {
  MigrateDeployOptions,
  MigrateDeployResult,
  MigrateDevOptions,
  MigrateDevResult,
  MigrateStatusOptions,
  MigrateStatusResult,
  MigrationInfo,
  PushOptions,
  PushResult,
  RenameSuggestion,
} from './cli/index';
export { migrateDeploy, migrateDev, migrateStatus, push } from './cli/index';
// Client
export type {
  CreateDbOptions,
  DatabaseInstance,
  PoolConfig,
  QueryResult,
  TenantGraph,
} from './client';
export { computeTenantGraph, createDb } from './client';
// Schema builder
export { d } from './d';
// Diagnostic
export type { DiagnosticResult } from './diagnostic/index';
export { diagnoseError, explainError, formatDiagnostic } from './diagnostic/index';
// Errors
export type {
  CheckConstraintErrorOptions,
  DbErrorCodeName,
  DbErrorCodeValue,
  DbErrorJson,
  ForeignKeyErrorOptions,
  HttpErrorResponse,
  NotNullErrorOptions,
  PgErrorInput,
  UniqueConstraintErrorOptions,
} from './errors';
export {
  CheckConstraintError,
  ConnectionError,
  ConnectionPoolExhaustedError,
  DbError,
  DbErrorCode,
  dbErrorToHttpError,
  ForeignKeyError,
  NotFoundError,
  NotNullError,
  PgCodeToName,
  parsePgError,
  resolveErrorCode,
  UniqueConstraintError,
} from './errors';
// Schema types
export type {
  ColumnBuilder,
  ColumnMetadata,
  InferColumnType,
  JsonbValidator,
  TenantMeta,
} from './schema/column';
export type { FilterType, OrderByType } from './schema/filter';
export type {
  Database,
  FindOptions,
  FindResult,
  IncludeOption,
  IncludeResolve,
  InsertInput,
  SelectNarrow,
  SelectOption,
  TableEntry,
  UpdateInput,
} from './schema/inference';
export { createRegistry } from './schema/registry';
export type { RelationDef } from './schema/relation';
export type { IndexDef, TableDef } from './schema/table';

// Branded error types
export type {
  InvalidColumn,
  InvalidFilterType,
  InvalidRelation,
  MixedSelectError,
  StrictKeys,
  ValidateKeys,
} from './types/branded-errors';
