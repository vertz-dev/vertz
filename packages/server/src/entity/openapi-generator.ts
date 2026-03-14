import type { ColumnBuilder, ColumnMetadata, RelationDef, TableDef } from '@vertz/db';
import type { EntityDefinition, ExposeConfig, RelationExposeConfig } from './types';

// ---------------------------------------------------------------------------
// JSON Schema types (subset of OpenAPI 3.1 JSON Schema)
// ---------------------------------------------------------------------------

export interface JSONSchemaObject {
  type?: string | string[];
  format?: string;
  enum?: readonly (string | number | boolean | null)[];
  items?: JSONSchemaObject;
  maxLength?: number;
  description?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Column → JSON Schema mapping
// ---------------------------------------------------------------------------

/**
 * Maps a single database column to its JSON Schema representation.
 */
export function columnToJsonSchema(
  column: ColumnBuilder<unknown, ColumnMetadata>,
): JSONSchemaObject {
  const meta = column._meta;
  const schema = sqlTypeToJsonSchema(meta);

  if (meta.nullable) {
    schema.type = [schema.type as string, 'null'];
  }

  return schema;
}

function sqlTypeToJsonSchema(meta: ColumnMetadata): JSONSchemaObject {
  // Check format override (e.g., email) before sqlType
  if (meta.format === 'email') {
    return { type: 'string', format: 'email' };
  }

  switch (meta.sqlType) {
    case 'uuid':
      return { type: 'string', format: 'uuid' };
    case 'text':
      return { type: 'string' };
    case 'varchar': {
      const schema: JSONSchemaObject = { type: 'string' };
      if (meta.length !== undefined) schema.maxLength = meta.length;
      return schema;
    }
    case 'boolean':
      return { type: 'boolean' };
    case 'integer':
    case 'serial':
      return { type: 'integer' };
    case 'bigint':
    case 'decimal':
      return { type: 'string' };
    case 'real':
      return { type: 'number' };
    case 'double precision':
      return { type: 'number', format: 'double' };
    case 'timestamp with time zone':
      return { type: 'string', format: 'date-time' };
    case 'date':
      return { type: 'string', format: 'date' };
    case 'time':
      return { type: 'string', format: 'time' };
    case 'jsonb':
      return {};
    case 'text[]':
      return { type: 'array', items: { type: 'string' } };
    case 'integer[]':
      return { type: 'array', items: { type: 'integer' } };
    case 'enum':
      return { type: 'string', enum: meta.enumValues };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Entity response schema
// ---------------------------------------------------------------------------

export interface EntitySchemaObject {
  type: 'object';
  required?: string[];
  properties?: Record<string, JSONSchemaObject>;
}

/**
 * Converts an entity name to PascalCase for schema naming.
 * Handles hyphenated names: 'task-items' → 'TaskItems'
 */
function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/**
 * Builds a response schema from table columns with an optional select filter.
 */
function buildColumnsSchema(
  columns: Record<string, ColumnBuilder<unknown, ColumnMetadata>>,
  selectFilter?: Record<string, unknown>,
): EntitySchemaObject {
  const properties: Record<string, JSONSchemaObject> = {};
  const required: string[] = [];

  for (const [name, col] of Object.entries(columns)) {
    const meta = col._meta;

    // Skip hidden columns
    if (meta._annotations.hidden) continue;

    // If select filter is defined, only include listed fields
    if (selectFilter && !(name in selectFilter)) continue;

    const isDescriptorGuarded = selectFilter && selectFilter[name] !== true;
    let schema = columnToJsonSchema(col);

    if (isDescriptorGuarded) {
      // Make the field nullable and add a description about the entitlement
      const baseType = schema.type;
      if (baseType) {
        const typeArray = Array.isArray(baseType) ? baseType : [baseType];
        if (!typeArray.includes('null')) {
          schema = { ...schema, type: [...typeArray, 'null'] };
        }
      }
      const descriptor = selectFilter![name] as { type?: string; entitlement?: string };
      const entitlementName = descriptor.entitlement ?? descriptor.type ?? 'access rule';
      schema.description = `Requires entitlement '${entitlementName}'. Returns null when the caller lacks the entitlement.`;
    }

    properties[name] = schema;

    if (!meta.nullable && !isDescriptorGuarded) {
      required.push(name);
    }
  }

  const result: EntitySchemaObject = { type: 'object', properties };
  if (required.length > 0) result.required = required;
  return result;
}

/**
 * Generates a JSON Schema for an entity's response shape.
 *
 * When `expose.select` is present, only listed fields appear.
 * Otherwise, all public (non-hidden) columns appear.
 * Descriptor-guarded fields (AccessRule values) become nullable with a description.
 *
 * If `relationSchemas` is provided, relation schemas are collected into it
 * with keys like `TasksAssigneeResponse`.
 */
export function entityResponseSchema(
  def: EntityDefinition,
  relationSchemas?: Record<string, EntitySchemaObject>,
): EntitySchemaObject {
  const table = def.model.table;
  const columns = table._columns as Record<string, ColumnBuilder<unknown, ColumnMetadata>>;
  const exposeSelect = def.expose?.select as Record<string, unknown> | undefined;

  const schema = buildColumnsSchema(columns, exposeSelect);

  // Process relation includes
  if (def.expose?.include && relationSchemas) {
    const relations = def.model.relations as Record<string, RelationDef>;
    const includeConfig = def.expose.include as Record<string, true | false | RelationExposeConfig>;
    const entityPrefix = toPascalCase(def.name);

    for (const [relationName, config] of Object.entries(includeConfig)) {
      if (config === false) continue;

      const relation = relations[relationName];
      if (!relation) continue;

      const targetTable = relation._target() as TableDef;
      const targetColumns = targetTable._columns as Record<
        string,
        ColumnBuilder<unknown, ColumnMetadata>
      >;
      const relationSchemaName = `${entityPrefix}${toPascalCase(relationName)}Response`;

      if (config === true) {
        // Shorthand: all public columns of target table
        relationSchemas[relationSchemaName] = buildColumnsSchema(targetColumns);
      } else {
        // Structured RelationExposeConfig: use its select
        const relSelect = config.select as Record<string, unknown> | undefined;
        relationSchemas[relationSchemaName] = buildColumnsSchema(targetColumns, relSelect);
      }
    }
  }

  return schema;
}

// ---------------------------------------------------------------------------
// Input schemas (create / update)
// ---------------------------------------------------------------------------

/**
 * Builds an input schema from table columns, excluding PK, readOnly, autoUpdate, and hidden columns.
 */
function buildInputColumnsSchema(
  columns: Record<string, ColumnBuilder<unknown, ColumnMetadata>>,
  allOptional: boolean,
): EntitySchemaObject {
  const properties: Record<string, JSONSchemaObject> = {};
  const required: string[] = [];

  for (const [name, col] of Object.entries(columns)) {
    const meta = col._meta;

    // Exclude PK, readOnly, autoUpdate, and hidden columns
    if (meta.primary) continue;
    if (meta.isReadOnly) continue;
    if (meta.isAutoUpdate) continue;
    if (meta._annotations.hidden) continue;

    properties[name] = columnToJsonSchema(col);

    if (!allOptional && !meta.nullable && !meta.hasDefault) {
      required.push(name);
    }
  }

  const result: EntitySchemaObject = { type: 'object', properties };
  if (required.length > 0) result.required = required;
  return result;
}

/**
 * Generates a JSON Schema for an entity's create input.
 * Excludes PK, readOnly, autoUpdate, and hidden columns.
 * Fields with defaults or nullable are optional.
 */
export function entityCreateInputSchema(def: EntityDefinition): EntitySchemaObject {
  const table = def.model.table;
  const columns = table._columns as Record<string, ColumnBuilder<unknown, ColumnMetadata>>;
  return buildInputColumnsSchema(columns, false);
}

/**
 * Generates a JSON Schema for an entity's update input (PATCH).
 * Same exclusions as create, but all fields are optional.
 */
export function entityUpdateInputSchema(def: EntityDefinition): EntitySchemaObject {
  const table = def.model.table;
  const columns = table._columns as Record<string, ColumnBuilder<unknown, ColumnMetadata>>;
  return buildInputColumnsSchema(columns, true);
}

// ---------------------------------------------------------------------------
// Full OpenAPI spec generation
// ---------------------------------------------------------------------------

export interface OpenAPISpecOptions {
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
}

interface OpenAPIOperation {
  operationId: string;
  tags: string[];
  summary: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required: boolean;
    content: { 'application/json': { schema: { $ref: string } } };
  };
  responses: Record<string, OpenAPIResponse>;
}

interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  schema: JSONSchemaObject;
  description?: string;
}

interface OpenAPIResponse {
  description: string;
  content?: { 'application/json': { schema: JSONSchemaObject | EntitySchemaObject } };
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}

interface OpenAPISpec {
  openapi: '3.1.0';
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  paths: Record<string, OpenAPIPathItem>;
  components?: { schemas?: Record<string, EntitySchemaObject> };
  tags?: { name: string }[];
}

const ERROR_RESPONSE_SCHEMA: EntitySchemaObject = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    details: {},
  },
};

/**
 * Generates a full OpenAPI 3.1 specification from entity definitions.
 */
export function generateOpenAPISpec(
  entities: EntityDefinition[],
  options: OpenAPISpecOptions,
): OpenAPISpec {
  const paths: Record<string, OpenAPIPathItem> = {};
  const schemas: Record<string, EntitySchemaObject> = {
    ErrorResponse: ERROR_RESPONSE_SCHEMA,
  };
  const tags: { name: string }[] = [];

  for (const def of entities) {
    const prefix = toPascalCase(def.name);
    const basePath = `/api/${def.name}`;
    const tag = def.name;
    tags.push({ name: tag });

    // Generate component schemas
    const relationSchemas: Record<string, EntitySchemaObject> = {};
    schemas[`${prefix}Response`] = entityResponseSchema(def, relationSchemas);
    Object.assign(schemas, relationSchemas);

    // Only generate input schemas if the operations exist
    if (def.access.create !== undefined) {
      schemas[`${prefix}CreateInput`] = entityCreateInputSchema(def);
    }
    if (def.access.update !== undefined) {
      schemas[`${prefix}UpdateInput`] = entityUpdateInputSchema(def);
    }

    // Build paths based on access config
    const collectionPath: OpenAPIPathItem = {};
    const itemPath: OpenAPIPathItem = {};

    // List (GET /api/{entity})
    if (def.access.list !== undefined && def.access.list !== false) {
      collectionPath.get = buildListOperation(def, prefix, tag);
    }

    // Create (POST /api/{entity})
    if (def.access.create !== undefined && def.access.create !== false) {
      collectionPath.post = buildCreateOperation(prefix, tag);
    }

    // Get (GET /api/{entity}/{id})
    if (def.access.get !== undefined && def.access.get !== false) {
      itemPath.get = buildGetOperation(prefix, tag);
    }

    // Update (PATCH /api/{entity}/{id})
    if (def.access.update !== undefined && def.access.update !== false) {
      itemPath.patch = buildUpdateOperation(prefix, tag);
    }

    // Delete (DELETE /api/{entity}/{id})
    if (def.access.delete === false) {
      itemPath.delete = buildDisabledOperation(prefix, 'delete', tag);
    } else if (def.access.delete !== undefined) {
      itemPath.delete = buildDeleteOperation(prefix, tag);
    }

    if (Object.keys(collectionPath).length > 0) {
      paths[basePath] = collectionPath;
    }
    if (Object.keys(itemPath).length > 0) {
      paths[`${basePath}/{id}`] = itemPath;
    }

    // Query endpoint (GET /api/{entity}/query) — same as list but uses q= param
    if (def.access.list !== undefined && def.access.list !== false) {
      paths[`${basePath}/query`] = {
        get: buildQueryOperation(prefix, tag),
      };
    }
  }

  const spec: OpenAPISpec = {
    openapi: '3.1.0',
    info: options.info,
    paths,
    components: { schemas },
    tags,
  };

  if (options.servers) {
    spec.servers = options.servers;
  }

  return spec;
}

function buildListOperation(def: EntityDefinition, prefix: string, tag: string): OpenAPIOperation {
  const parameters: OpenAPIParameter[] = [];
  const table = def.model.table;
  const columns = table._columns as Record<string, ColumnBuilder<unknown, ColumnMetadata>>;
  const expose = def.expose as ExposeConfig | undefined;

  // Where params from allowWhere
  if (expose?.allowWhere) {
    const allowWhere = expose.allowWhere as Record<string, unknown>;
    for (const field of Object.keys(allowWhere)) {
      const col = columns[field];
      if (!col) continue;
      const schema = columnToJsonSchema(col);
      parameters.push({
        name: `where[${field}]`,
        in: 'query',
        required: false,
        schema,
      });
    }
  }

  // OrderBy param
  if (expose?.allowOrderBy) {
    const allowedFields = Object.keys(expose.allowOrderBy as Record<string, unknown>);
    parameters.push({
      name: 'orderBy',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: allowedFields.flatMap((f) => [`${f}:asc`, `${f}:desc`]),
      },
      description: 'Sort order. Format: field:direction',
    });
  }

  // Standard pagination and query params
  parameters.push(
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
    { name: 'after', in: 'query', required: false, schema: { type: 'string' } },
    {
      name: 'q',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Base64-encoded VertzQL query',
    },
  );

  return {
    operationId: `list${prefix}`,
    tags: [tag],
    summary: `List ${def.name}`,
    parameters,
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: { $ref: `#/components/schemas/${prefix}Response` },
                },
                cursor: { type: 'string' },
              },
            } as EntitySchemaObject,
          },
        },
      },
    },
  };
}

function buildCreateOperation(prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `create${prefix}`,
    tags: [tag],
    summary: `Create a ${prefix}`,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${prefix}CreateInput` },
        },
      },
    },
    responses: {
      '201': {
        description: 'Created',
        content: {
          'application/json': {
            schema: {
              $ref: `#/components/schemas/${prefix}Response`,
            },
          },
        },
      },
    },
  };
}

function buildGetOperation(prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `get${prefix}`,
    tags: [tag],
    summary: `Get a ${prefix} by ID`,
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              $ref: `#/components/schemas/${prefix}Response`,
            },
          },
        },
      },
    },
  };
}

function buildUpdateOperation(prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `update${prefix}`,
    tags: [tag],
    summary: `Update a ${prefix}`,
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${prefix}UpdateInput` },
        },
      },
    },
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              $ref: `#/components/schemas/${prefix}Response`,
            },
          },
        },
      },
    },
  };
}

function buildDeleteOperation(prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `delete${prefix}`,
    tags: [tag],
    summary: `Delete a ${prefix}`,
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '204': { description: 'No Content' },
    },
  };
}

function buildDisabledOperation(prefix: string, operation: string, tag: string): OpenAPIOperation {
  return {
    operationId: `${operation}${prefix}`,
    tags: [tag],
    summary: `${operation} is disabled for ${prefix}`,
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '405': { description: 'Method Not Allowed' },
    },
  };
}

function buildQueryOperation(prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `query${prefix}`,
    tags: [tag],
    summary: `Query ${prefix} with VertzQL`,
    parameters: [
      {
        name: 'q',
        in: 'query',
        required: true,
        schema: { type: 'string' },
        description: 'Base64-encoded VertzQL query',
      },
    ],
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: { $ref: `#/components/schemas/${prefix}Response` },
                },
                cursor: { type: 'string' },
              },
            } as EntitySchemaObject,
          },
        },
      },
    },
  };
}
