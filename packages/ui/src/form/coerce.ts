import { SchemaType } from '@vertz/schema';
import { formDataToObject } from './form-data';

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

function readLeafFromFormData(formData: FormData, path: string): unknown {
  const value = formData.get(path);
  if (value === null) return undefined;
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

function walkObject(
  formData: FormData,
  schema: ObjectSchemaLike,
  parent: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    if (!isVertzSchema(fieldSchema)) continue;
    const path = joinPath(parent, key);
    const concrete = unwrapToConcrete(fieldSchema);
    if (isObjectLike(concrete)) {
      result[key] = walkObject(formData, concrete, path);
    } else if (isArrayLike(concrete)) {
      result[key] = walkArray(formData, concrete, path);
    } else {
      const raw = readLeafFromFormData(formData, path);
      const coerced = coerceLeaf(raw, fieldSchema);
      if (coerced !== undefined) {
        result[key] = coerced;
      }
    }
  }
  return result;
}

function walkArray(formData: FormData, schema: ArraySchemaLike, path: string): unknown {
  const elementSchema = unwrapToConcrete(schema.element);
  if (isObjectLike(elementSchema)) {
    const fallback = formDataToObject(formData, { nested: true });
    return readNestedPath(fallback, path) ?? [];
  }
  const values = formData.getAll(path);
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

export function coerceFormDataToSchema(
  formData: FormData,
  schema: unknown,
): Record<string, unknown> {
  if (!isVertzSchema(schema)) {
    return formDataToObject(formData, { nested: true });
  }
  const concrete = unwrapToConcrete(schema);
  if (!isObjectLike(concrete)) {
    return formDataToObject(formData, { nested: true });
  }
  return walkObject(formData, concrete, '');
}
