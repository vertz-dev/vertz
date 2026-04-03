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
    return (schema.enum as unknown[])
      .map((v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "\\'")}'`))
      .join(' | ');
  }

  // anyOf: [{type: 'string'}, {type: 'null'}] → string | null (OpenAPI 3.1 nullable)
  if (Array.isArray(schema.anyOf)) {
    const members = (schema.anyOf as Record<string, unknown>[]).map((s) =>
      jsonSchemaToTS(s, namedSchemas),
    );
    // Deduplicate (e.g. multiple resolve to 'unknown')
    return [...new Set(members)].join(' | ');
  }

  // oneOf → union of types
  if (Array.isArray(schema.oneOf)) {
    const members = (schema.oneOf as Record<string, unknown>[]).map((s) =>
      jsonSchemaToTS(s, namedSchemas),
    );
    return [...new Set(members)].join(' | ');
  }

  const type = schema.type;

  // 'null' literal type (used inside anyOf members)
  if (type === 'null') return 'null';

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

    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);

    const entries = Object.entries(properties).map(([key, propSchema]) => {
      const tsType = jsonSchemaToTS(propSchema, namedSchemas);
      const optional = required.has(key) ? '' : '?';
      const safeKey = isValidIdentifier(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
      return `${safeKey}${optional}: ${tsType}`;
    });

    return `{ ${entries.join('; ')} }`;
  }

  return 'unknown';
}

/**
 * Sanitize a name to be a valid TypeScript identifier (PascalCase for types).
 * Strips invalid chars, preserves casing of segments, prefixes with _ if starts with digit.
 */
export function sanitizeTypeName(name: string): string {
  if (isValidIdentifier(name)) return name;
  // Remove invalid chars, split on non-alphanumeric, capitalize each segment
  const cleaned = name.replace(/[^A-Za-z0-9_$]+/g, ' ').trim();
  if (!cleaned) return '_';
  const segments = cleaned.split(/\s+/).filter(Boolean);
  const result = segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return /^[0-9]/.test(result) ? `_${result}` : result;
}

/**
 * Generate a full TypeScript interface declaration from a named schema.
 */
export function generateInterface(
  name: string,
  schema: Record<string, unknown>,
  namedSchemas: Map<string, string>,
): string {
  const safeName = sanitizeTypeName(name);
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) {
    return `export interface ${safeName} {}\n`;
  }

  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);

  const lines = Object.entries(properties).map(([key, propSchema]) => {
    const tsType = jsonSchemaToTS(propSchema, namedSchemas);
    const optional = required.has(key) ? '' : '?';
    const safeKey = isValidIdentifier(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
    return `  ${safeKey}${optional}: ${tsType};`;
  });

  return `export interface ${safeName} {\n${lines.join('\n')}\n}\n`;
}

/**
 * Walk a JSON schema tree and collect all `$circular` reference names.
 */
export function collectCircularRefs(
  schema: Record<string, unknown>,
  refs: Set<string> = new Set(),
): Set<string> {
  if (typeof schema.$circular === 'string') {
    refs.add(schema.$circular);
    return refs;
  }

  if (Array.isArray(schema.anyOf)) {
    for (const member of schema.anyOf as Record<string, unknown>[]) {
      collectCircularRefs(member, refs);
    }
  }

  if (Array.isArray(schema.oneOf)) {
    for (const member of schema.oneOf as Record<string, unknown>[]) {
      collectCircularRefs(member, refs);
    }
  }

  if (schema.type === 'array' && schema.items && typeof schema.items === 'object') {
    collectCircularRefs(schema.items as Record<string, unknown>, refs);
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const propSchema of Object.values(schema.properties as Record<string, unknown>)) {
      if (propSchema && typeof propSchema === 'object') {
        collectCircularRefs(propSchema as Record<string, unknown>, refs);
      }
    }
  }

  return refs;
}

function mapPrimitive(type: string): string {
  if (type === 'string') return 'string';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'unknown';
}

const VALID_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

export function isValidIdentifier(name: string): boolean {
  return VALID_IDENTIFIER.test(name);
}

/**
 * Convert any string to PascalCase by splitting on non-alphanumeric characters.
 * Unlike sanitizeTypeName, this always splits and re-joins even valid identifiers.
 * e.g., "find_many_web_organizations__get" → "FindManyWebOrganizationsGet"
 */
export function toPascalCase(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!cleaned) return '_';
  const segments = cleaned.split(/\s+/).filter(Boolean);
  const result = segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return /^[0-9]/.test(result) ? `_${result}` : result;
}
