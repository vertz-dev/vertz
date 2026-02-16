import {
  CheckConstraintError,
  ConnectionError,
  DbError,
  ForeignKeyError,
  NotNullError,
  UniqueConstraintError,
} from './db-error';

// ---------------------------------------------------------------------------
// Detail / message extractors
// ---------------------------------------------------------------------------
/** Extract column name and value from PG detail string: `Key (column)=(value) ...` */
function extractKeyDetail(detail) {
  if (!detail) return null;
  const match = detail.match(/^Key \(([^)]+)\)=\(([^)]*)\)/);
  if (!match) return null;
  return { column: match[1], value: match[2] };
}
/** Extract column name from PG not-null error message: `null value in column "col"` */
function extractNotNullColumn(message) {
  const match = message.match(/null value in column "([^"]+)"/);
  return match ? match[1] : null;
}
/** Extract constraint name from PG check constraint message */
function extractCheckConstraint(message) {
  const match = message.match(/violates check constraint "([^"]+)"/);
  return match ? match[1] : null;
}
// ---------------------------------------------------------------------------
// Connection error code class (08xxx)
// ---------------------------------------------------------------------------
function isConnectionErrorCode(code) {
  return code.startsWith('08');
}
// ---------------------------------------------------------------------------
// Generic DbError for unrecognized codes
// ---------------------------------------------------------------------------
class UnknownDbError extends DbError {
  code;
  table;
  query;
  constructor(code, message, table, query) {
    super(message);
    this.code = code;
    this.table = table;
    this.query = query;
  }
}
// ---------------------------------------------------------------------------
// parsePgError — main entry point
// ---------------------------------------------------------------------------
/**
 * Maps a raw PostgreSQL error object to a typed DbError subclass.
 *
 * Extracts structured metadata (column, constraint, value) from the
 * PG error's `detail` and `message` fields.
 */
export function parsePgError(pgError, query) {
  const { code, message, table, column, constraint, detail } = pgError;
  switch (code) {
    case '23505': {
      const keyDetail = extractKeyDetail(detail);
      return new UniqueConstraintError({
        table: table ?? 'unknown',
        column: column ?? keyDetail?.column ?? 'unknown',
        value: keyDetail?.value,
        query,
      });
    }
    case '23503': {
      return new ForeignKeyError({
        table: table ?? 'unknown',
        constraint: constraint ?? 'unknown',
        detail,
        query,
      });
    }
    case '23502': {
      const extractedColumn = extractNotNullColumn(message);
      return new NotNullError({
        table: table ?? 'unknown',
        column: column ?? extractedColumn ?? 'unknown',
        query,
      });
    }
    case '23514': {
      const extractedConstraint = extractCheckConstraint(message);
      return new CheckConstraintError({
        table: table ?? 'unknown',
        constraint: constraint ?? extractedConstraint ?? 'unknown',
        query,
      });
    }
    default: {
      if (isConnectionErrorCode(code)) {
        return new ConnectionError(message);
      }
      return new UnknownDbError(code, message, table, query);
    }
  }
}
//# sourceMappingURL=pg-parser.js.map
