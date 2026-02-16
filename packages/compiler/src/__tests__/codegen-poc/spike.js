const PRIMITIVE_MAP = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  null: 'null',
};
/**
 * Converts a JSON Schema object to a TypeScript type string.
 * Populates namedTypes map with extracted $defs when present.
 */
export function jsonSchemaToTS(schema, namedTypes, _resolving) {
  const resolving = _resolving ?? new Set();
  // Handle $defs — extract named types first
  if (schema.$defs && typeof schema.$defs === 'object') {
    const defs = schema.$defs;
    for (const [name, defSchema] of Object.entries(defs)) {
      if (namedTypes && !namedTypes.has(name)) {
        // Mark as resolving to handle circular refs
        resolving.add(name);
        const typeStr = jsonSchemaToTS(defSchema, namedTypes, resolving);
        resolving.delete(name);
        namedTypes.set(name, typeStr);
      }
    }
  }
  // Handle $ref
  if (typeof schema.$ref === 'string') {
    return refToName(schema.$ref);
  }
  // Handle const
  if (schema.const !== undefined) {
    return toLiteral(schema.const);
  }
  // Handle enum
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((v) => toLiteral(v)).join(' | ');
  }
  // Handle oneOf / anyOf (union)
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.map((s) => jsonSchemaToTS(s, namedTypes, resolving)).join(' | ');
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((s) => jsonSchemaToTS(s, namedTypes, resolving)).join(' | ');
  }
  // Handle allOf (intersection)
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.map((s) => jsonSchemaToTS(s, namedTypes, resolving)).join(' & ');
  }
  // Handle type arrays (nullable)
  if (Array.isArray(schema.type)) {
    const types = schema.type.map((t) => PRIMITIVE_MAP[t] ?? t);
    return types.join(' | ');
  }
  // Handle single type
  if (typeof schema.type === 'string') {
    const type = schema.type;
    // Arrays
    if (type === 'array') {
      // Tuples (prefixItems)
      if (Array.isArray(schema.prefixItems)) {
        const items = schema.prefixItems.map((s) => jsonSchemaToTS(s, namedTypes, resolving));
        return `[${items.join(', ')}]`;
      }
      // Regular arrays
      if (schema.items && typeof schema.items === 'object') {
        const itemType = jsonSchemaToTS(schema.items, namedTypes, resolving);
        // Wrap union types in parens for array notation
        return itemType.includes(' | ') ? `(${itemType})[]` : `${itemType}[]`;
      }
      return 'unknown[]';
    }
    // Objects
    if (type === 'object') {
      // Record type: additionalProperties as schema, no properties
      if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === 'object' &&
        !schema.properties
      ) {
        const valueType = jsonSchemaToTS(schema.additionalProperties, namedTypes, resolving);
        return `Record<string, ${valueType}>`;
      }
      // Regular object with properties
      if (schema.properties && typeof schema.properties === 'object') {
        const props = schema.properties;
        const required = new Set(Array.isArray(schema.required) ? schema.required : []);
        const parts = [];
        for (const [key, propSchema] of Object.entries(props)) {
          const propType = jsonSchemaToTS(propSchema, namedTypes, resolving);
          const optional = required.has(key) ? '' : '?';
          parts.push(`${key}${optional}: ${propType}`);
        }
        return `{ ${parts.join('; ')} }`;
      }
      // Empty object
      return 'Record<string, unknown>';
    }
    // Primitives
    return PRIMITIVE_MAP[type] ?? type;
  }
  return 'unknown';
}
function refToName(ref) {
  // Extract last segment from $ref path
  const segments = ref.split('/');
  return segments[segments.length - 1] ?? 'unknown';
}
function toLiteral(value) {
  if (typeof value === 'string') {
    return `'${value}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return 'unknown';
}
function collectSchemaRefs(route) {
  const refs = [];
  for (const ref of [route.body, route.query, route.params, route.headers, route.response]) {
    if (ref?.kind === 'named') {
      refs.push(ref.schemaName);
    }
  }
  return refs;
}
export function adaptIR(appIR) {
  // Track which modules use which schema names
  const schemaUsage = new Map();
  const modules = appIR.modules.map((mod) => {
    const operations = [];
    for (const router of mod.routers) {
      for (const route of router.routes) {
        const schemaRefs = collectSchemaRefs(route);
        // Track schema usage per module
        for (const ref of schemaRefs) {
          let moduleSet = schemaUsage.get(ref);
          if (!moduleSet) {
            moduleSet = new Set();
            schemaUsage.set(ref, moduleSet);
          }
          moduleSet.add(mod.name);
        }
        operations.push({
          operationId: route.operationId,
          method: route.method,
          fullPath: route.fullPath,
          schemaRefs,
          body: route.body,
          query: route.query,
          params: route.params,
          headers: route.headers,
          response: route.response,
        });
      }
    }
    return { name: mod.name, operations };
  });
  // Detect shared schemas (used by 2+ modules)
  const sharedSchemas = [];
  for (const [schemaName, moduleSet] of schemaUsage) {
    if (moduleSet.size > 1) {
      sharedSchemas.push(schemaName);
    }
  }
  // Detect schema name collisions (same name, different schemas from different source files)
  const schemasByName = new Map();
  for (const schema of appIR.schemas) {
    let entries = schemasByName.get(schema.name);
    if (!entries) {
      entries = [];
      schemasByName.set(schema.name, entries);
    }
    // Figure out which module this schema belongs to by source file heuristic
    const ownerModule = appIR.modules.find((m) =>
      m.routers.some((r) =>
        r.routes.some((route) => {
          const refs = [route.body, route.query, route.params, route.headers, route.response];
          return refs.some(
            (ref) =>
              ref?.kind === 'named' &&
              ref.schemaName === schema.name &&
              ref.sourceFile === schema.sourceFile,
          );
        }),
      ),
    );
    entries.push({
      sourceFile: schema.sourceFile,
      moduleName: ownerModule?.name ?? 'unknown',
    });
  }
  const collisions = [];
  for (const [name, entries] of schemasByName) {
    if (entries.length > 1) {
      const uniqueModules = [...new Set(entries.map((e) => e.moduleName))];
      if (uniqueModules.length > 1) {
        collisions.push({ name, modules: uniqueModules });
      }
    }
  }
  const allSchemaNames = [...new Set(appIR.schemas.map((s) => s.name))];
  return { modules, sharedSchemas, collisions, allSchemaNames };
}
// ── Unknown 3: File Generation ───────────────────────────────────
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/**
 * Generates a TypeScript types file for a single module.
 * Each schema becomes an exported type alias.
 */
export function emitTypesFile(_moduleName, schemas) {
  const lines = ['// Auto-generated — do not edit', ''];
  for (const [name, schema] of Object.entries(schemas)) {
    const tsType = jsonSchemaToTS(schema);
    lines.push(`export type ${name} = ${tsType};`);
    lines.push('');
  }
  return lines.join('\n');
}
/**
 * Generates a shared types file for schemas used by multiple modules.
 */
export function emitSharedTypesFile(schemas) {
  return emitTypesFile('shared', schemas);
}
/**
 * Generates a module file with a factory function.
 * The factory creates methods for each operation.
 */
export function emitModuleFile(moduleName, operations, _typeImports) {
  const pascalName = capitalize(moduleName);
  const lines = [
    '// Auto-generated — do not edit',
    '',
    'interface HttpClient {',
    '  request(method: string, path: string, options?: { body?: unknown; query?: Record<string, string> }): Promise<unknown>;',
    '}',
    '',
    `export function create${pascalName}Module(client: HttpClient) {`,
    '  return {',
  ];
  for (const op of operations) {
    lines.push(
      `    ${op.operationId}(options?: { body?: unknown; query?: Record<string, string> }) {`,
    );
    lines.push(`      return client.request('${op.method}', '${op.fullPath}', options);`);
    lines.push('    },');
  }
  lines.push('  };');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
/**
 * Generates the client file that imports and composes all modules.
 */
export function emitClientFile(moduleNames) {
  const lines = ['// Auto-generated — do not edit', ''];
  // Import each module's factory
  for (const name of moduleNames) {
    const pascalName = capitalize(name);
    lines.push(`import { create${pascalName}Module } from './modules/${name}';`);
  }
  lines.push('');
  lines.push('interface HttpClient {');
  lines.push(
    '  request(method: string, path: string, options?: { body?: unknown; query?: Record<string, string> }): Promise<unknown>;',
  );
  lines.push('}');
  lines.push('');
  lines.push('export function createClient(client: HttpClient) {');
  lines.push('  return {');
  for (const name of moduleNames) {
    const pascalName = capitalize(name);
    lines.push(`    ${name}: create${pascalName}Module(client),`);
  }
  lines.push('  };');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
//# sourceMappingURL=spike.js.map
