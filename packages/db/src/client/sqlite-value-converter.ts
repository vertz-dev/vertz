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
  return value;
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
  if (columnType === 'timestamp' && typeof value === 'string') {
    return new Date(value);
  }
  return value;
}
