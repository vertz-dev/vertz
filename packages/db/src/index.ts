// ---------------------------------------------------------------------------
// @vertz/db -- Primary developer-facing API
//
// SQL builders          -> @vertz/db/sql
// Internal utilities    -> @vertz/db/internals
// Plugin system         -> @vertz/db/plugin
// ---------------------------------------------------------------------------

export type { CreateDbProviderOptions, DbDialect, SqliteAdapterConfig } from './adapters';
// Database adapters (SQLite & D1)
export {
  createD1Adapter,
  createD1Driver,
  createDatabaseBridgeAdapter,
  createDbProvider,
  createSqliteAdapter,
  createSqliteDriver,
} from './adapters';
export type {
  D1AdapterOptions,
  D1DatabaseBinding,
  D1PreparedStatement,
} from './adapters/d1-adapter';
export type { SqliteAdapterOptions } from './adapters/sqlite-adapter';
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
  DbDriver,
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
// Dialect
export type {
  ColumnTypeMeta,
  Dialect,
} from './dialect';
export {
  defaultPostgresDialect,
  defaultSqliteDialect,
  PostgresDialect,
  SqliteDialect,
} from './dialect';
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
export { generateId } from './id';
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
  ModelEntry,
  SelectNarrow,
  SelectOption,
  UpdateInput,
} from './schema/inference';
export type { ModelDef } from './schema/model';
export type { ModelSchemas, SchemaLike } from './schema/model-schemas';
export { createRegistry } from './schema/registry';
export type { RelationDef } from './schema/relation';
export type { IndexDef, TableDef } from './schema/table';
export type { EntityDbAdapter, ListOptions } from './types/adapter';
// Branded error types
export type {
  InvalidColumn,
  InvalidFilterType,
  InvalidRelation,
  MixedSelectError,
  StrictKeys,
  ValidateKeys,
} from './types/branded-errors';
