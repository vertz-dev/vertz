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
    const values = (schema.enum as unknown[]).map((v) => `'${v}'`).join(', ');
    return `z.enum([${values}])`;
  }

  const type = schema.type;

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
  if (typeof schema.pattern === 'string') result += `.regex(/${schema.pattern}/)`;
  if (schema.default !== undefined) result += `.default('${schema.default}')`;
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

function zodObject(
  schema: Record<string, unknown>,
  namedSchemas: Map<string, string>,
): string {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return 'z.object({})';

  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );

  const entries = Object.entries(properties).map(([key, propSchema]) => {
    let zod = jsonSchemaToZod(propSchema, namedSchemas);
    if (!required.has(key)) zod += '.optional()';
    return `  ${key}: ${zod}`;
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
