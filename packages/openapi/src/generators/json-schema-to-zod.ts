import { isValidIdentifier } from './json-schema-to-ts';

/**
 * Convert a JSON Schema object to a Zod expression string.
 */
export function jsonSchemaToZod(
  schema: Record<string, unknown>,
  namedSchemas: Map<string, string>,
): string {
  // Circular reference → z.lazy()
  if (typeof schema.$circular === 'string') {
    const ref = namedSchemas.get(schema.$circular) ?? schema.$circular;
    return `z.lazy(() => ${ref})`;
  }

  // Enum
  if (Array.isArray(schema.enum)) {
    const values = schema.enum as unknown[];
    const allStrings = values.every((v) => typeof v === 'string');
    if (allStrings) {
      const items = values.map((v) => `'${String(v).replace(/'/g, "\\'")}'`).join(', ');
      return `z.enum([${items}])`;
    }
    // Non-string enums: use z.union of z.literal
    const literals = values
      .map((v) =>
        typeof v === 'string'
          ? `z.literal('${String(v).replace(/'/g, "\\'")}')`
          : `z.literal(${String(v)})`,
      )
      .join(', ');
    return `z.union([${literals}])`;
  }

  // anyOf: [{type: 'string'}, {type: 'null'}] → z.string().nullable() (OpenAPI 3.1)
  if (Array.isArray(schema.anyOf)) {
    const members = schema.anyOf as Record<string, unknown>[];
    const nullMember = members.find((m) => m.type === 'null');
    const nonNull = members.filter((m) => m.type !== 'null');
    const isNullable = nullMember !== undefined;

    if (nonNull.length === 1) {
      const base = jsonSchemaToZod(nonNull[0]!, namedSchemas);
      return isNullable ? `${base}.nullable()` : base;
    }

    const union = `z.union([${nonNull.map((m) => jsonSchemaToZod(m, namedSchemas)).join(', ')}])`;
    return isNullable ? `${union}.nullable()` : union;
  }

  // oneOf → z.union()
  if (Array.isArray(schema.oneOf)) {
    const members = (schema.oneOf as Record<string, unknown>[]).map((m) =>
      jsonSchemaToZod(m, namedSchemas),
    );
    return `z.union([${members.join(', ')}])`;
  }

  const type = schema.type;

  // 'null' literal type (used inside anyOf members)
  if (type === 'null') return 'z.null()';

  // Nullable: ['string', 'null']
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== 'null');
    const isNullable = type.includes('null');
    const base = nonNull.length === 1 ? zodPrimitive(nonNull[0] as string, schema) : 'z.unknown()';
    return isNullable ? `${base}.nullable()` : base;
  }

  if (type === 'string') return zodString(schema);
  if (type === 'number') return zodNumber(schema);
  if (type === 'integer') return zodInteger(schema);
  if (type === 'boolean') return zodBoolean(schema);

  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined;
    const itemZod = items ? jsonSchemaToZod(items, namedSchemas) : 'z.unknown()';
    return `z.array(${itemZod})`;
  }

  if (type === 'object') {
    return zodObject(schema, namedSchemas);
  }

  return 'z.unknown()';
}

function zodString(schema: Record<string, unknown>): string {
  let result = 'z.string()';
  const format = schema.format as string | undefined;
  if (format === 'email') result += '.email()';
  else if (format === 'uuid') result += '.uuid()';
  else if (format === 'date-time') result += '.datetime()';
  else if (format === 'uri') result += '.url()';

  if (typeof schema.minLength === 'number') result += `.min(${schema.minLength})`;
  if (typeof schema.maxLength === 'number') result += `.max(${schema.maxLength})`;
  if (typeof schema.pattern === 'string') {
    const escaped = schema.pattern.replace(/\//g, '\\/');
    result += `.regex(/${escaped}/)`;
  }
  if (schema.default !== undefined) {
    result += `.default('${String(schema.default).replace(/'/g, "\\'")}')`;
  }
  return result;
}

function zodNumber(schema: Record<string, unknown>): string {
  let result = 'z.number()';
  if (typeof schema.minimum === 'number') result += `.min(${schema.minimum})`;
  if (typeof schema.maximum === 'number') result += `.max(${schema.maximum})`;
  if (schema.default !== undefined) result += `.default(${schema.default})`;
  return result;
}

function zodInteger(schema: Record<string, unknown>): string {
  let result = 'z.number().int()';
  if (typeof schema.minimum === 'number') result += `.min(${schema.minimum})`;
  if (typeof schema.maximum === 'number') result += `.max(${schema.maximum})`;
  if (schema.default !== undefined) result += `.default(${schema.default})`;
  return result;
}

function zodBoolean(schema: Record<string, unknown>): string {
  let result = 'z.boolean()';
  if (schema.default !== undefined) result += `.default(${schema.default})`;
  return result;
}

function zodObject(schema: Record<string, unknown>, namedSchemas: Map<string, string>): string {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return 'z.object({})';

  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);

  const entries = Object.entries(properties).map(([key, propSchema]) => {
    let zod = jsonSchemaToZod(propSchema, namedSchemas);
    if (!required.has(key)) zod += '.optional()';
    const safeKey = isValidIdentifier(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
    return `  ${safeKey}: ${zod}`;
  });

  return `z.object({\n${entries.join(',\n')},\n})`;
}

function zodPrimitive(type: string, schema: Record<string, unknown>): string {
  if (type === 'string') return zodString(schema);
  if (type === 'number') return zodNumber(schema);
  if (type === 'integer') return zodInteger(schema);
  if (type === 'boolean') return zodBoolean(schema);
  return 'z.unknown()';
}
