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
// Dialect
export type {
  ColumnTypeMeta,
  Dialect,
  IdStrategy,
} from './dialect';
export {
  defaultPostgresDialect,
  PostgresDialect,
} from './dialect';
// Schema builder
export { d } from './d';
// Diagnostic
export type { DiagnosticResult } from './diagnostic/index';
export { diagnoseError, explainError, formatDiagnostic } from './diagnostic/index';
export type {
  DomainDefinition,
  DomainField,
  DomainRelation,
} from './domain';
// Domain definitions for codegen
export { defineDomain, generateClient, generateTypes } from './domain';
// Errors - includes both original error classes and new Result error types
export type {
  CheckConstraintErrorOptions,
  DbConnectionError,
  DbConstraintError,
  DbErrorBase,
  DbErrorCodeName,
  DbErrorCodeValue,
  DbErrorJson,
  DbNotFoundError,
  DbQueryError,
  ForeignKeyErrorOptions,
  HttpErrorResponse,
  NotNullErrorOptions,
  PgErrorInput,
  ReadError,
  UniqueConstraintErrorOptions,
  WriteError,
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
  toReadError,
  toWriteError,
  UniqueConstraintError,
} from './errors';
// Schema types
export type {
  ColumnBuilder,
  ColumnMetadata,
  DecimalMeta,
  EnumMeta,
  FormatMeta,
  InferColumnType,
  JsonbValidator,
  TenantMeta,
  VarcharMeta,
} from './schema/column';
export type { RegisteredEnum } from './schema/enum-registry';
export { createEnumRegistry } from './schema/enum-registry';
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
export type { ModelDef } from './schema/model';
export type { ModelSchemas, SchemaLike } from './schema/model-schemas';
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
