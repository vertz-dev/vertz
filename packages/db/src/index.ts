// ---------------------------------------------------------------------------
// @vertz/db -- Primary developer-facing API
//
// One API for all backends: createDb() with dialect + path/d1/url.
//
// Sub-paths:
//   @vertz/db/postgres  — createPostgresDriver
//   @vertz/db/sql       — SQL builders
//   @vertz/db/internals — Internal utilities
//   @vertz/db/plugin    — Plugin system
// ---------------------------------------------------------------------------

// Database bridge adapter (dialect-agnostic — used by @vertz/server)
export { createDatabaseBridgeAdapter } from './adapters/database-bridge-adapter';
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
  D1Database,
  DatabaseClient,
  DatabaseInternals,
  DbDriver,
  ModelDelegate,
  PoolConfig,
  QueryResult,
  TenantGraph,
  TenantLevel,
  TransactionClient,
} from './client';
export { computeTenantGraph, createDb } from './client';
export type { createPostgresDriver, PostgresDriver } from './client/postgres-driver';
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
export type { CodegenOptions, GeneratedFile } from './migration/codegen';
export { generateSchemaCode } from './migration/codegen';
export type { MigrationError } from './migration/index';
export { introspectPostgres, introspectSqlite } from './migration/introspect';
export type { MigrationFile, MigrationQueryFn } from './migration/runner';
export { parseMigrationName } from './migration/runner';
export type { SchemaSnapshot } from './migration/snapshot';
export { createSnapshot } from './migration/snapshot';
export { validateIndexes } from './migration/validate-indexes';
// Schema types
export type {
  ColumnBuilder,
  ColumnMetadata,
  DecimalMeta,
  EnumMeta,
  FormatMeta,
  InferColumnType,
  JsonbValidator,
  NumericColumnBuilder,
  StringColumnBuilder,
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
export type {
  IndexDef,
  IndexOptions,
  IndexType,
  MarkAsPrimary,
  TableDef,
  TableOptionsWithPK,
} from './schema/table';
export type {
  AdapterIncludeEntry,
  AdapterIncludeSpec,
  DeleteOptions,
  EntityDbAdapter,
  GetOptions,
  ListOptions,
  UpdateOptions,
} from './types/adapter';
// Branded error types
export type {
  InvalidColumn,
  InvalidFilterType,
  InvalidRelation,
  MixedSelectError,
  StrictKeys,
  ValidateKeys,
} from './types/branded-errors';
