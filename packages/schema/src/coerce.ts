import { SchemaType } from './core/types';

interface SchemaLike {
  _schemaType(): SchemaType;
}

interface ObjectSchemaLike extends SchemaLike {
  shape: Record<string, SchemaLike>;
}

interface ArraySchemaLike extends SchemaLike {
  element: SchemaLike;
}

interface UnwrappableSchema extends SchemaLike {
  unwrap(): SchemaLike;
}

/**
 * Source of form-encoded entries.
 *
 * `FormData` (from `multipart/form-data` or `new FormData(form)`) and
 * `URLSearchParams` (from `application/x-www-form-urlencoded` bodies) both
 * expose the same subset of the iteration API.
 */
export type FormLikeSource = FormData | URLSearchParams;

const FALSE_BOOLEAN_STRINGS = new Set(['', 'false', 'off', '0']);
const TRUE_BOOLEAN_STRINGS = new Set(['on', 'true', '1']);

export function isVertzSchema(value: unknown): value is SchemaLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { _schemaType?: unknown })._schemaType === 'function'
  );
}

function hasUnwrap(schema: SchemaLike): schema is UnwrappableSchema {
  return typeof (schema as { unwrap?: unknown }).unwrap === 'function';
}

function unwrapToConcrete(schema: SchemaLike): SchemaLike {
  let current = schema;
  while (hasUnwrap(current)) {
    const inner = current.unwrap();
    if (inner === current) break;
    current = inner;
  }
  return current;
}

function coerceBoolean(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (FALSE_BOOLEAN_STRINGS.has(value)) return false;
    if (TRUE_BOOLEAN_STRINGS.has(value)) return true;
    return Boolean(value);
  }
  return Boolean(value);
}

function coerceNumber(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
    return value;
  }
  return value;
}

function coerceBigInt(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return BigInt(value);
    } catch {
      return value;
    }
  }
  return value;
}

function coerceDate(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
    return value;
  }
  return value;
}

/**
 * Coerce a single scalar value to the type described by `leafSchema`.
 *
 * Used for one field at a time — no recursion into object/array shapes.
 * Returns the value unchanged if the schema is not a Vertz schema or the
 * type has no coercion rule.
 */
export function coerceLeaf(value: unknown, leafSchema: unknown): unknown {
  if (!isVertzSchema(leafSchema)) return value;
  const concrete = unwrapToConcrete(leafSchema);
  switch (concrete._schemaType()) {
    case SchemaType.Boolean:
      return coerceBoolean(value);
    case SchemaType.Number:
      return coerceNumber(value);
    case SchemaType.BigInt:
      return coerceBigInt(value);
    case SchemaType.Date:
      return coerceDate(value);
    default:
      return value;
  }
}

function readLeafFromFormLike(source: FormLikeSource, path: string): unknown {
  const value = source.get(path);
  if (typeof value !== 'string') return undefined;
  return value;
}

function joinPath(parent: string, key: string): string {
  return parent === '' ? key : `${parent}.${key}`;
}

function isObjectLike(schema: SchemaLike): schema is ObjectSchemaLike {
  return (
    schema._schemaType() === SchemaType.Object &&
    typeof (schema as { shape?: unknown }).shape === 'object' &&
    (schema as { shape?: unknown }).shape !== null
  );
}

function isArrayLike(schema: SchemaLike): schema is ArraySchemaLike {
  if (schema._schemaType() !== SchemaType.Array) return false;
  const element = (schema as { element?: unknown }).element;
  return isVertzSchema(element);
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    if (DANGEROUS_KEYS.has(segment)) return;
    const nextSegment = segments[i + 1]!;
    const isNextArray = /^\d+$/.test(nextSegment);
    if (!(segment in current)) {
      current[segment] = isNextArray ? [] : {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  const lastSegment = segments[segments.length - 1]!;
  if (DANGEROUS_KEYS.has(lastSegment)) return;
  current[lastSegment] = value;
}

function formLikeToNestedObject(source: FormLikeSource): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of source.entries()) {
    if (typeof value !== 'string') continue;
    if (key.includes('.')) {
      setNestedValue(result, key, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function overlaySchemaCoerced(
  target: Record<string, unknown>,
  source: FormLikeSource,
  schema: ObjectSchemaLike,
  parent: string,
): void {
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    if (!isVertzSchema(fieldSchema)) continue;
    if (DANGEROUS_KEYS.has(key)) continue;
    const path = joinPath(parent, key);
    const concrete = unwrapToConcrete(fieldSchema);
    if (isObjectLike(concrete)) {
      const existing = target[key];
      const nested: Record<string, unknown> =
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing) &&
        existing !== undefined
          ? (existing as Record<string, unknown>)
          : {};
      overlaySchemaCoerced(nested, source, concrete, path);
      target[key] = nested;
    } else if (isArrayLike(concrete)) {
      target[key] = walkArray(source, concrete, path);
    } else {
      const raw = readLeafFromFormLike(source, path);
      const coerced = coerceLeaf(raw, fieldSchema);
      if (coerced !== undefined) {
        target[key] = coerced;
      } else {
        // Known schema key with empty/missing value: drop so `.default()` /
        // `.optional()` on the schema can apply cleanly at parse time.
        delete target[key];
      }
    }
  }
}

function walkArray(source: FormLikeSource, schema: ArraySchemaLike, path: string): unknown {
  const elementSchema = unwrapToConcrete(schema.element);
  if (isObjectLike(elementSchema)) {
    const fallback = formLikeToNestedObject(source);
    return readNestedPath(fallback, path) ?? [];
  }
  const values = source.getAll(path);
  return values.map((v) => coerceLeaf(typeof v === 'string' ? v : undefined, elementSchema));
}

function readNestedPath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Coerce a FormData or URLSearchParams body to match a Vertz object schema.
 *
 * For each field in the schema shape:
 * - `Boolean` fields are coerced from "on"/"true"/"1" → true, "" → false, etc.
 * - `Number` / `BigInt` / `Date` fields are coerced from their string form.
 * - Nested `Object` fields are walked via dot paths (e.g. `address.street`).
 * - `Array` of scalars is collected via `getAll(path)`.
 * - `Array` of objects falls back to dot-indexed nested parsing.
 *
 * Unknown keys (not in the schema shape) are preserved as raw string values.
 * This keeps behavior symmetric with JSON bodies: a `.strict()` schema rejects
 * them with the same validation error path, instead of silently dropping them
 * only on the form path.
 *
 * Returns a plain object suitable for passing to `schema.parse()`.
 * If the schema is not a Vertz object schema, returns a best-effort nested
 * object by dot-path.
 */
export function coerceFormDataToSchema(
  source: FormLikeSource,
  schema: unknown,
): Record<string, unknown> {
  if (!isVertzSchema(schema)) {
    return formLikeToNestedObject(source);
  }
  const concrete = unwrapToConcrete(schema);
  if (!isObjectLike(concrete)) {
    return formLikeToNestedObject(source);
  }
  // Start from all form keys as raw nested values so unknown keys survive to
  // `schema.parse()` (symmetric with JSON; lets `.strict()` reject extras).
  // Then overlay schema-coerced values on known paths.
  const result = formLikeToNestedObject(source);
  overlaySchemaCoerced(result, source, concrete, '');
  return result;
}
