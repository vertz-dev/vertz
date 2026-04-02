/**
 * Convert a JSON Schema object to a TypeScript type expression string.
 */
export function jsonSchemaToTS(
  schema: Record<string, unknown>,
  namedSchemas: Map<string, string>,
): string {
  // Circular reference sentinel
  if (typeof schema.$circular === 'string') {
    return schema.$circular;
  }

  // Enum → literal union
  if (Array.isArray(schema.enum)) {
    return (schema.enum as unknown[]).map((v) => `'${v}'`).join(' | ');
  }

  const type = schema.type;

  // Nullable type array: ['string', 'null']
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== 'null');
    const baseType = nonNull.length === 1 ? mapPrimitive(nonNull[0] as string) : 'unknown';
    return type.includes('null') ? `${baseType} | null` : baseType;
  }

  if (type === 'string') return 'string';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';

  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined;
    if (!items) return 'unknown[]';
    const itemType = jsonSchemaToTS(items, namedSchemas);
    // Wrap union types in parens for array suffix
    const needsParens = itemType.includes('|') && !itemType.includes('{');
    return needsParens ? `(${itemType})[]` : `${itemType}[]`;
  }

  if (type === 'object') {
    // additionalProperties: true → Record
    if (schema.additionalProperties === true && !schema.properties) {
      return 'Record<string, unknown>';
    }

    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return 'Record<string, unknown>';

    const required = new Set(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    );

    const entries = Object.entries(properties).map(([key, propSchema]) => {
      const tsType = jsonSchemaToTS(propSchema, namedSchemas);
      const optional = required.has(key) ? '' : '?';
      return `${key}${optional}: ${tsType}`;
    });

    return `{ ${entries.join('; ')} }`;
  }

  return 'unknown';
}

/**
 * Generate a full TypeScript interface declaration from a named schema.
 */
export function generateInterface(
  name: string,
  schema: Record<string, unknown>,
  namedSchemas: Map<string, string>,
): string {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) {
    return `export interface ${name} {}\n`;
  }

  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );

  const lines = Object.entries(properties).map(([key, propSchema]) => {
    const tsType = jsonSchemaToTS(propSchema, namedSchemas);
    const optional = required.has(key) ? '' : '?';
    return `  ${key}${optional}: ${tsType};`;
  });

  return `export interface ${name} {\n${lines.join('\n')}\n}\n`;
}

function mapPrimitive(type: string): string {
  if (type === 'string') return 'string';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'unknown';
}
