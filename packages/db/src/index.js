// ---------------------------------------------------------------------------
// @vertz/db -- Primary developer-facing API
//
// SQL builders          -> @vertz/db/sql
// Internal utilities    -> @vertz/db/internals
// Plugin system         -> @vertz/db/plugin
// ---------------------------------------------------------------------------
export { migrateDeploy, migrateDev, migrateStatus, push } from './cli/index';
export { computeTenantGraph, createDb } from './client';
// Schema builder
export { d } from './d';
export { diagnoseError, explainError, formatDiagnostic } from './diagnostic/index';
// Domain definitions for codegen
export { defineDomain, generateClient, generateTypes } from './domain';
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
export { createEnumRegistry } from './schema/enum-registry';
export { createRegistry } from './schema/registry';
//# sourceMappingURL=index.js.map
