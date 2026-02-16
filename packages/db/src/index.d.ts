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
export type {
  CreateDbOptions,
  DatabaseInstance,
  PoolConfig,
  QueryResult,
  TenantGraph,
} from './client';
export { computeTenantGraph, createDb } from './client';
export { d } from './d';
export type { DiagnosticResult } from './diagnostic/index';
export { diagnoseError, explainError, formatDiagnostic } from './diagnostic/index';
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
export type { RegisteredEnum } from './schema/enum-registry';
export { createEnumRegistry } from './schema/enum-registry';
export type { RelationDef } from './schema/relation';
export type { IndexDef, TableDef } from './schema/table';
export type {
  InvalidColumn,
  InvalidFilterType,
  InvalidRelation,
  MixedSelectError,
  StrictKeys,
  ValidateKeys,
} from './types/branded-errors';
export { defineDomain, generateTypes, generateClient } from './domain';
export type { DomainDefinition, DomainField, DomainRelation } from './domain';
//# sourceMappingURL=index.d.ts.map
