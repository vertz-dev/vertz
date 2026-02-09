import type { JsonSchema } from './types';

export interface ConversionContext {
  namedTypes: Map<string, string>;
  resolving: Set<string>;
}

export interface ConversionResult {
  type: string;
  extractedTypes: Map<string, string>;
}

const PRIMITIVE_MAP: Record<string, string> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  null: 'null',
};

export function jsonSchemaToTS(schema: JsonSchema, ctx?: ConversionContext): ConversionResult {
  const context: ConversionContext = ctx ?? {
    namedTypes: new Map(),
    resolving: new Set(),
  };

  const type = convert(schema, context);

  return { type, extractedTypes: context.namedTypes };
}

function convert(schema: JsonSchema, _ctx: ConversionContext): string {
  // Handle $defs — extract named types first
  if (schema.$defs && typeof schema.$defs === 'object') {
    const defs = schema.$defs as Record<string, JsonSchema>;
    for (const [name, defSchema] of Object.entries(defs)) {
      if (!_ctx.namedTypes.has(name)) {
        _ctx.resolving.add(name);
        const typeStr = convert(defSchema, _ctx);
        _ctx.resolving.delete(name);
        _ctx.namedTypes.set(name, typeStr);
      }
    }
  }

  // Handle $ref
  if (typeof schema.$ref === 'string') {
    if (!schema.$ref.startsWith('#')) {
      throw new Error(`External $ref is not supported: ${schema.$ref}`);
    }
    return refToName(schema.$ref);
  }

  // Handle const
  if (schema.const !== undefined) {
    return toLiteral(schema.const);
  }

  // Handle enum
  if (Array.isArray(schema.enum)) {
    return (schema.enum as unknown[]).map((v) => toLiteral(v)).join(' | ');
  }

  // Handle oneOf / anyOf (union)
  if (Array.isArray(schema.oneOf)) {
    return (schema.oneOf as JsonSchema[]).map((s) => convert(s, _ctx)).join(' | ');
  }
  if (Array.isArray(schema.anyOf)) {
    return (schema.anyOf as JsonSchema[]).map((s) => convert(s, _ctx)).join(' | ');
  }

  // Handle allOf (intersection)
  if (Array.isArray(schema.allOf)) {
    return (schema.allOf as JsonSchema[]).map((s) => convert(s, _ctx)).join(' & ');
  }

  // Handle type arrays (nullable)
  if (Array.isArray(schema.type)) {
    return (schema.type as string[]).map((t) => PRIMITIVE_MAP[t] ?? t).join(' | ');
  }

  if (typeof schema.type === 'string') {
    const type = schema.type;

    if (type === 'array') {
      if (Array.isArray(schema.prefixItems)) {
        const items = (schema.prefixItems as JsonSchema[]).map((s) => convert(s, _ctx));
        return `[${items.join(', ')}]`;
      }
      if (schema.items && typeof schema.items === 'object') {
        const itemType = convert(schema.items as JsonSchema, _ctx);
        return itemType.includes(' | ') ? `(${itemType})[]` : `${itemType}[]`;
      }
      return 'unknown[]';
    }

    if (type === 'object') {
      // Record type: additionalProperties as schema, no properties
      if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === 'object' &&
        !schema.properties
      ) {
        const valueType = convert(schema.additionalProperties as JsonSchema, _ctx);
        return `Record<string, ${valueType}>`;
      }

      if (schema.properties && typeof schema.properties === 'object') {
        const props = schema.properties as Record<string, JsonSchema>;
        const required = new Set(
          Array.isArray(schema.required) ? (schema.required as string[]) : [],
        );
        const parts: string[] = [];
        for (const [key, propSchema] of Object.entries(props)) {
          const propType = convert(propSchema, _ctx);
          const optional = required.has(key) ? '' : '?';
          parts.push(`${key}${optional}: ${propType}`);
        }
        return `{ ${parts.join('; ')} }`;
      }
      return 'Record<string, unknown>';
    }

    return PRIMITIVE_MAP[type] ?? 'unknown';
  }

  return 'unknown';
}

function refToName(ref: string): string {
  const segments = ref.split('/');
  return segments[segments.length - 1] ?? 'unknown';
}

function toLiteral(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return 'unknown';
}
