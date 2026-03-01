// ---------------------------------------------------------------------------
// @vertz/db -- Primary developer-facing API
//
// Dialect-specific adapters/drivers are in sub-paths:
//   @vertz/db/sqlite   — createSqliteAdapter, createSqliteDriver
//   @vertz/db/postgres  — createPostgresDriver
//   @vertz/db/d1        — createD1Adapter, createD1Driver
//
// SQL builders          -> @vertz/db/sql
// Internal utilities    -> @vertz/db/internals
// Plugin system         -> @vertz/db/plugin
// ---------------------------------------------------------------------------

export type {
  D1AdapterOptions,
  D1DatabaseBinding,
  D1PreparedStatement,
} from './adapters/d1-adapter';
export { createD1Adapter, createD1Driver } from './adapters/d1-adapter';
// Database bridge adapter (dialect-agnostic — used by @vertz/server)
export { createDatabaseBridgeAdapter } from './adapters/database-bridge-adapter';
// Dialect-specific types — re-exported so sub-path type resolution (via dist/index.d.ts)
// sees a single PhantomType symbol. Runtime functions live only in @vertz/db/sqlite.
export type {
  createSqliteAdapter,
  createSqliteDriver,
  SqliteAdapterOptions,
} from './adapters/sqlite-adapter';
// CLI / Migrations
export type {
  BaselineOptions,
  BaselineResult,
  CodeChange,
  DriftEntry,
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
  ResetOptions,
  ResetResult,
} from './cli/index';
export {
  baseline,
  detectSchemaDrift,
  migrateDeploy,
  migrateDev,
  migrateStatus,
  push,
  reset,
} from './cli/index';
// Client
export type {
  CreateDbOptions,
  DatabaseClient,
  DatabaseInternals,
  DbDriver,
  ModelDelegate,
  PoolConfig,
  QueryResult,
  TenantGraph,
} from './client';
export { computeTenantGraph, createDb } from './client';
export type { PostgresDriver } from './client/postgres-driver';
export { createPostgresDriver } from './client/postgres-driver';
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
// Migration types used by CLI consumers
export type { MigrationError } from './migration/index';
export type { MigrationFile, MigrationQueryFn } from './migration/runner';
export { parseMigrationName } from './migration/runner';
export type { SchemaSnapshot } from './migration/snapshot';
export { createSnapshot } from './migration/snapshot';
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
export { defineAnnotations } from './schema/define-annotations';
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
