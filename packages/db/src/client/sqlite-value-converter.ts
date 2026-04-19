import { JsonbParseError } from '../errors';

/**
 * Converts JavaScript values to SQLite-compatible values.
 * SQLite doesn't have native boolean or date types, so we need to convert them.
 */
export function toSqliteValue(value: unknown): unknown {
  if (value === true) {
    return 1;
  }
  if (value === false) {
    return 0;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isPlainJsonPayload(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function isPlainJsonPayload(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Converts SQLite values back to JavaScript types.
 * Requires column type information to know how to convert.
 */
export function fromSqliteValue(value: unknown, columnType: string): unknown {
  if (columnType === 'boolean') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (
    (columnType === 'timestamp' || columnType === 'timestamp with time zone') &&
    typeof value === 'string'
  ) {
    return new Date(value);
  }
  if ((columnType === 'jsonb' || columnType === 'json') && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (cause) {
      throw new JsonbParseError({ columnType, cause });
    }
  }
  return value;
}
