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
  if (columnType === 'bytea') {
    return normalizeBytea(value);
  }
  return value;
}

/**
 * Normalize a driver-returned BLOB value to a plain `Uint8Array`.
 *
 * Different SQLite bindings return different concrete types:
 *   - `Buffer` (a `Uint8Array` subclass) — better-sqlite3 / node
 *   - `Uint8Array` — bun:sqlite / @vertz/sqlite
 *   - `ArrayBuffer` — Cloudflare D1
 *
 * Callers always see a plain `Uint8Array` regardless of backend.
 */
function normalizeBytea(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    // Strip Buffer (and other subclass) prototypes so consumers always see a
    // plain Uint8Array. `slice()` allocates a fresh Uint8Array view.
    if (Object.getPrototypeOf(value) === Uint8Array.prototype) {
      return value;
    }
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value).slice();
  }
  return value;
}
