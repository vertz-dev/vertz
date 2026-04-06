import type { ColumnBuilder, ColumnMetadata, RelationDef, TableDef } from '@vertz/db';
import type {
  EntityActionDef,
  EntityDefinition,
  ExposeConfig,
  RelationExposeConfig,
} from './types';

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
  $ref?: string;
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
    const baseType = schema.type;
    if (baseType) {
      schema.type = [baseType as string, 'null'];
    } else {
      // Types without an explicit type (e.g., jsonb → {}) get oneOf with null
      return { oneOf: [schema, { type: 'null' }] };
    }
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
      const descriptor = selectFilter?.[name] as { type?: string; entitlement?: string };
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
 * with keys like `TasksAssigneeResponse`, and $ref properties are added
 * to the parent schema for each relation.
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
        relationSchemas[relationSchemaName] = buildColumnsSchema(targetColumns);
      } else {
        const relSelect = config.select as Record<string, unknown> | undefined;
        relationSchemas[relationSchemaName] = buildColumnsSchema(targetColumns, relSelect);
      }

      // Add $ref to parent schema properties
      if (schema.properties) {
        const isMany = relation._type === 'many';
        if (isMany) {
          schema.properties[relationName] = {
            type: 'array',
            items: { $ref: `#/components/schemas/${relationSchemaName}` },
          };
        } else {
          schema.properties[relationName] = {
            $ref: `#/components/schemas/${relationSchemaName}`,
          };
        }
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

/** Minimal shape for service definitions consumed by the OpenAPI generator. */
export interface ServiceDefForOpenAPI {
  readonly kind: 'service';
  readonly name: string;
  readonly access: Partial<Record<string, unknown>>;
  readonly actions: Record<
    string,
    {
      readonly method?: string;
      readonly path?: string;
      readonly body?: unknown;
      readonly response?: unknown;
      readonly handler: (...args: unknown[]) => unknown;
    }
  >;
}

export interface OpenAPISpecOptions {
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  /** API path prefix. Defaults to '/api'. */
  apiPrefix?: string;
  /** Service definitions to include in the spec. */
  services?: ServiceDefForOpenAPI[];
}

interface OpenAPIOperation {
  operationId: string;
  tags: string[];
  summary: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required: boolean;
    content: { 'application/json': { schema: JSONSchemaObject } };
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
  $ref?: string;
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
  components?: {
    schemas?: Record<string, EntitySchemaObject>;
    responses?: Record<string, OpenAPIResponse>;
  };
  tags?: { name: string }[];
}

const ERROR_RESPONSE_SCHEMA: EntitySchemaObject = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    } as unknown as JSONSchemaObject,
  },
};

const STANDARD_RESPONSES: Record<string, OpenAPIResponse> = {
  BadRequest: {
    description: 'Bad Request',
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
    },
  },
  Unauthorized: {
    description: 'Unauthorized',
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
    },
  },
  NotFound: {
    description: 'Not Found',
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
    },
  },
};

function errorRefs(...codes: string[]): Record<string, OpenAPIResponse> {
  const result: Record<string, OpenAPIResponse> = {};
  for (const code of codes) {
    const refName = code === '400' ? 'BadRequest' : code === '401' ? 'Unauthorized' : 'NotFound';
    result[code] = { $ref: `#/components/responses/${refName}` } as unknown as OpenAPIResponse;
  }
  return result;
}

/**
 * Extracts JSON Schema from a SchemaLike object using duck-type check.
 */
function extractJsonSchema(
  schema: unknown,
  entityName: string,
  actionName: string,
  field: 'body' | 'response',
): JSONSchemaObject {
  if (
    schema &&
    typeof schema === 'object' &&
    'toJSONSchema' in schema &&
    typeof (schema as Record<string, unknown>).toJSONSchema === 'function'
  ) {
    return (schema as { toJSONSchema(): JSONSchemaObject }).toJSONSchema();
  }
  console.warn(
    `[vertz] Warning: Action "${entityName}.${actionName}" ${field} schema does not expose JSON schema — using "any" in OpenAPI spec.`,
  );
  return { description: 'Schema not available for automated extraction.' };
}

/**
 * Generates a full OpenAPI 3.1 specification from entity definitions.
 */
export function generateOpenAPISpec(
  entities: EntityDefinition[],
  options: OpenAPISpecOptions,
): OpenAPISpec {
  const apiPrefix = options.apiPrefix ?? '/api';
  const paths: Record<string, OpenAPIPathItem> = {};
  const schemas: Record<string, EntitySchemaObject> = {
    ErrorResponse: ERROR_RESPONSE_SCHEMA,
  };
  const tags: { name: string }[] = [];

  for (const def of entities) {
    // Skip composite-PK entities — OpenAPI generation hardcodes single {id} path param.
    const table = def.model.table;
    const compositePkLength =
      (table as { _primaryKey?: readonly string[] })._primaryKey?.length ?? 0;
    if (compositePkLength > 1) {
      console.warn(
        `[vertz] Entity "${def.name}" has composite PK — OpenAPI spec generation skipped. ` +
          `Composite-PK OpenAPI support is a follow-up feature.`,
      );
      continue;
    }

    const prefix = toPascalCase(def.name);
    const basePath = `${apiPrefix}/${def.name}`;
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
      itemPath.delete = buildDisabledOperation(def.name, 'delete', tag);
    } else if (def.access.delete !== undefined) {
      itemPath.delete = buildDeleteOperation(def.name, tag);
    }

    if (Object.keys(collectionPath).length > 0) {
      paths[basePath] = collectionPath;
    }
    if (Object.keys(itemPath).length > 0) {
      paths[`${basePath}/{id}`] = itemPath;
    }

    // Query endpoint (POST /api/{entity}/query) — structured query via POST body
    if (def.access.list !== undefined && def.access.list !== false) {
      paths[`${basePath}/query`] = {
        post: buildQueryOperation(def.name, prefix, tag),
      };
    }

    // Custom actions
    if (def.actions) {
      for (const [actionName, actionDef] of Object.entries(def.actions)) {
        const method = (actionDef.method ?? 'POST').toUpperCase();
        const fullPath = actionDef.path
          ? `${basePath}/${actionDef.path.replace(/^\/+/, '')}`
          : `${basePath}/{id}/${actionName}`;

        const operation = buildActionOperation(def.name, actionName, actionDef, tag);
        const pathItem: OpenAPIPathItem = {};
        if (method === 'POST') {
          pathItem.post = operation;
        } else if (method === 'PATCH') {
          pathItem.patch = operation;
        } else if (method === 'GET') {
          pathItem.get = operation;
        } else if (method === 'DELETE') {
          pathItem.delete = operation;
        }

        paths[fullPath] = pathItem;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Service routes
  // -------------------------------------------------------------------------

  if (options.services) {
    for (const svcDef of options.services) {
      const tag = svcDef.name;
      tags.push({ name: tag });

      for (const [actionName, actionDef] of Object.entries(svcDef.actions)) {
        const accessRule = svcDef.access[actionName];

        // No access rule → deny by default → skip
        if (accessRule === undefined) continue;

        const method = (actionDef.method ?? 'POST').toUpperCase();
        const routePath = actionDef.path
          ? `${apiPrefix}/${actionDef.path.replace(/^\/+/, '')}`
          : `${apiPrefix}/${svcDef.name}/${actionName}`;

        if (accessRule === false) {
          // Explicitly disabled → 405
          const pathItem: OpenAPIPathItem = {};
          const disabledOp = buildServiceDisabledOperation(svcDef.name, actionName, tag);
          assignMethodToPathItem(pathItem, method, disabledOp);
          paths[routePath] = pathItem;
          continue;
        }

        // Active service action
        const operation = buildServiceActionOperation(svcDef.name, actionName, actionDef, tag);
        const pathItem: OpenAPIPathItem = {};
        assignMethodToPathItem(pathItem, method, operation);
        paths[routePath] = pathItem;
      }
    }
  }

  const spec: OpenAPISpec = {
    openapi: '3.1.0',
    info: options.info,
    paths,
    components: {
      schemas,
      responses: STANDARD_RESPONSES,
    },
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
    operationId: `${def.name}_list`,
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
      ...errorRefs('400', '401'),
    },
  };
}

function buildCreateOperation(prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `${tag}_create`,
    tags: [tag],
    summary: `Create a ${tag}`,
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
            schema: { $ref: `#/components/schemas/${prefix}Response` },
          },
        },
      },
      ...errorRefs('400', '401'),
    },
  };
}

function buildGetOperation(prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `${tag}_get`,
    tags: [tag],
    summary: `Get a ${tag} by ID`,
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${prefix}Response` },
          },
        },
      },
      ...errorRefs('401', '404'),
    },
  };
}

function buildUpdateOperation(prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `${tag}_update`,
    tags: [tag],
    summary: `Update a ${tag}`,
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
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
            schema: { $ref: `#/components/schemas/${prefix}Response` },
          },
        },
      },
      ...errorRefs('400', '401', '404'),
    },
  };
}

function buildDeleteOperation(entityName: string, tag: string): OpenAPIOperation {
  return {
    operationId: `${entityName}_delete`,
    tags: [tag],
    summary: `Delete a ${entityName}`,
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      '204': { description: 'No Content' },
      ...errorRefs('401', '404'),
    },
  };
}

function buildDisabledOperation(
  entityName: string,
  operation: string,
  tag: string,
): OpenAPIOperation {
  return {
    operationId: `${entityName}_${operation}`,
    tags: [tag],
    summary: `${operation} is disabled for ${entityName}`,
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      '405': {
        description: `Method Not Allowed — operation "${operation}" is disabled for ${entityName}`,
      },
    },
  };
}

function buildQueryOperation(entityName: string, prefix: string, tag: string): OpenAPIOperation {
  return {
    operationId: `${entityName}_query`,
    tags: [tag],
    summary: `Query ${entityName} (structured query via POST body)`,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${prefix}Query` },
        },
      },
    },
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
      ...errorRefs('400', '401'),
    },
  };
}

function buildActionOperation(
  entityName: string,
  actionName: string,
  actionDef: EntityActionDef,
  tag: string,
): OpenAPIOperation {
  const operation: OpenAPIOperation = {
    operationId: `${entityName}_${actionName}`,
    tags: [tag],
    summary: `${actionName} action on ${entityName}`,
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: extractJsonSchema(actionDef.response, entityName, actionName, 'response'),
          },
        },
      },
      ...errorRefs('400', '401', '404'),
    },
  };

  if (actionDef.body) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: extractJsonSchema(actionDef.body, entityName, actionName, 'body'),
        },
      },
    };
  }

  return operation;
}

// ---------------------------------------------------------------------------
// Service action helpers
// ---------------------------------------------------------------------------

function assignMethodToPathItem(
  pathItem: OpenAPIPathItem,
  method: string,
  operation: OpenAPIOperation,
): void {
  const key = method.toLowerCase() as keyof OpenAPIPathItem;
  if (key === 'get' || key === 'post' || key === 'patch' || key === 'delete') {
    pathItem[key] = operation;
  }
}

function buildServiceDisabledOperation(
  serviceName: string,
  actionName: string,
  tag: string,
): OpenAPIOperation {
  return {
    operationId: `${serviceName}_${actionName}`,
    tags: [tag],
    summary: `${actionName} is disabled for ${serviceName}`,
    responses: {
      '405': {
        description: `Method Not Allowed — action "${actionName}" is disabled for ${serviceName}`,
      },
    },
  };
}

function buildServiceActionOperation(
  serviceName: string,
  actionName: string,
  actionDef: ServiceDefForOpenAPI['actions'][string],
  tag: string,
): OpenAPIOperation {
  const operation: OpenAPIOperation = {
    operationId: `${serviceName}_${actionName}`,
    tags: [tag],
    summary: `${actionName} on ${serviceName}`,
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: actionDef.response
              ? extractJsonSchema(actionDef.response, serviceName, actionName, 'response')
              : { description: 'No response schema defined.' },
          },
        },
      },
      ...errorRefs('400', '401'),
    },
  };

  if (actionDef.body) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: extractJsonSchema(actionDef.body, serviceName, actionName, 'body'),
        },
      },
    };
  }

  return operation;
}
