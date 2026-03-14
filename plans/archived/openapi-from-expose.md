# Design Doc: OpenAPI Spec Generation from Entity Expose Config

> Issue: [#1246](https://github.com/vertz-dev/vertz/issues/1246) — feat(server): OpenAPI spec generation from entity expose config

## Goal

Generate an OpenAPI 3.1 spec from entity definitions at runtime, using the `expose` config as the source of truth for the query surface. External consumers should be able to discover entity endpoints, response schemas, query parameters, filterable/sortable fields, and relation includes without reading source code.

Today, the `expose` config already declares the full VertzQL query surface declaratively, and validation already enforces it at runtime. But there's no way for external consumers (Swagger UI, code generators, API clients) to discover this surface automatically.

### Relationship to the existing compiler-based OpenAPI generator

`packages/compiler/src/generators/openapi-generator.ts` generates OpenAPI specs from the compiler's Intermediate Representation (IR) — it operates on custom `RouteIR` objects produced during the compile step and covers **custom routes** (routers, middleware, manual endpoints).

This new generator operates on `EntityDefinition` objects at **runtime** and covers **entity CRUD + actions**. The two generators serve different layers:

| | Compiler OpenAPI Generator | Entity OpenAPI Generator (this) |
|--|--|--|
| Input | `RouteIR` from compiler analysis | `EntityDefinition[]` from `entity()` |
| Scope | Custom routes, middleware | Entity CRUD, actions, expose config |
| When | Build-time (codegen) | Runtime (server startup) |
| VertzQL awareness | None | Full (where/orderBy/select/include) |

They **coexist** — each covers its own scope. A future phase (out of scope) could merge both into a unified spec for apps that have both custom routes and entities. For now, entity OpenAPI generation is standalone.

## API Surface

### Options type

```ts
export interface OpenAPISpecOptions {
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  /** API path prefix. Defaults to '/api'. */
  apiPrefix?: string;
}
```

### Generating the spec (standalone)

```ts
import { generateOpenAPISpec } from '@vertz/server';

// Pass the same entity definitions you provide to createServer({ entities }).
// The entity() function returns EntityDefinition objects that generateOpenAPISpec inspects.
const spec = generateOpenAPISpec([tasksDef, usersDef], {
  info: {
    title: 'My App API',
    version: '1.0.0',
    description: 'REST API for My App',
  },
  servers: [{ url: 'http://localhost:3000' }],
  apiPrefix: '/api', // defaults to '/api'
});

// spec is an OpenAPI 3.1.0 document (plain object)
// Can be serialized to JSON and served at an endpoint
```

### Serving the spec from a running server

```ts
import { createServer, entity } from '@vertz/server';

const server = createServer({
  entities: [tasks, users, comments],
  openapi: {
    info: { title: 'My App API', version: '1.0.0' },
    path: '/docs/openapi.json', // defaults to '<apiPrefix>/openapi.json'
  },
});
```

When `openapi` is provided in the server config, a route is auto-registered at the configured `path`. The spec is generated once at startup and cached. In dev mode (`createBunDevServer`), the spec is regenerated on each request to reflect file changes.

### What the generated spec contains

Given this entity definition:

```ts
const tasks = entity('tasks', {
  model: tasksModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.entitlement('task:update'),
    delete: rules.entitlement('task:delete'),
  },
  expose: {
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      estimate: rules.entitlement('pm:view-estimates'),
    },
    allowWhere: { status: true, createdAt: true },
    allowOrderBy: { createdAt: true, title: true },
    include: {
      assignee: true, // shorthand — all public columns of target table
      comments: {
        select: { id: true, text: true, createdAt: true },
        allowWhere: { status: true },
        allowOrderBy: { createdAt: true },
        maxLimit: 20,
      },
    },
  },
});
```

The generated OpenAPI spec produces:

```yaml
paths:
  /api/tasks:
    get:
      operationId: tasks_list
      summary: List tasks
      tags: [tasks]
      parameters:
        - name: where[status]
          in: query
          schema:
            type: string
            enum: ['todo', 'in_progress', 'done']  # enum values from column type
          description: Filter by status
        - name: where[createdAt]
          in: query
          schema: { type: string, format: date-time }
          description: Filter by createdAt
        - name: orderBy
          in: query
          schema:
            type: string
            enum: ['createdAt:asc', 'createdAt:desc', 'title:asc', 'title:desc']
          description: Sort results. Format is field:direction.
        - name: limit
          in: query
          schema: { type: integer, minimum: 0, maximum: 1000 }
        - name: after
          in: query
          schema: { type: string }
          description: Cursor for pagination
        - name: q
          in: query
          schema: { type: string }
          description: >
            Base64url-encoded JSON query for field selection and relation includes.
            Use POST /api/tasks/query for complex queries instead.
            Decoded JSON structure: { "select": { "title": true }, "include": { "comments": true } }.
            See #/components/schemas/TasksQuery for the full decoded structure.
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: { $ref: '#/components/schemas/TasksResponse' }
                  cursor: { type: string, nullable: true }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
    post:
      operationId: tasks_create
      summary: Create a task
      tags: [tasks]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TasksCreateInput' }
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TasksResponse' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /api/tasks/{id}:
    get:
      operationId: tasks_get
      summary: Get a task by ID
      tags: [tasks]
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TasksResponse' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
    patch:
      operationId: tasks_update
      summary: Update a task
      tags: [tasks]
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TasksUpdateInput' }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TasksResponse' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
    delete:
      operationId: tasks_delete
      summary: Delete a task (disabled)
      tags: [tasks]
      responses:
        '405':
          description: Method Not Allowed — operation "delete" is disabled for tasks

  /api/tasks/query:
    post:
      operationId: tasks_query
      summary: Query tasks (structured query via POST body)
      tags: [tasks]
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TasksQuery' }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: { $ref: '#/components/schemas/TasksResponse' }
                  cursor: { type: string, nullable: true }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }

components:
  responses:
    BadRequest:
      description: Bad Request
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    Unauthorized:
      description: Unauthorized
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    NotFound:
      description: Not Found
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }

  schemas:
    ErrorResponse:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code: { type: string }
            message: { type: string }

    TasksResponse:
      type: object
      required: [id, title, status, createdAt]
      properties:
        id: { type: string, format: uuid }
        title: { type: string }
        status: { type: string, enum: ['todo', 'in_progress', 'done'] }
        createdAt: { type: string, format: date-time }
        estimate:
          type: ['integer', 'null']
          description: >
            Requires entitlement 'pm:view-estimates'. Returns null when
            the caller lacks the entitlement.
        assignee:
          $ref: '#/components/schemas/TasksAssigneeResponse'
        comments:
          type: array
          items: { $ref: '#/components/schemas/TasksCommentResponse' }

    TasksAssigneeResponse:
      type: object
      required: [id, name, email]
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
        email: { type: string, format: email }

    TasksCommentResponse:
      type: object
      required: [id, text, createdAt]
      properties:
        id: { type: string, format: uuid }
        text: { type: string }
        createdAt: { type: string, format: date-time }

    TasksQuery:
      type: object
      description: Structured query for field selection, filtering, sorting, and includes
      properties:
        select:
          type: object
          description: Fields to include in response
          properties:
            id: { type: boolean }
            title: { type: boolean }
            status: { type: boolean }
            createdAt: { type: boolean }
            estimate: { type: boolean }
        where:
          type: object
          properties:
            status: { type: string, enum: ['todo', 'in_progress', 'done'] }
            createdAt: {}
        orderBy:
          type: object
          properties:
            createdAt: { type: string, enum: [asc, desc] }
            title: { type: string, enum: [asc, desc] }
        limit: { type: integer, minimum: 0, maximum: 1000 }
        after: { type: string }
        include:
          type: object
          properties:
            assignee:
              oneOf:
                - { type: boolean, const: true }
                - { $ref: '#/components/schemas/TasksAssigneeQuery' }
            comments:
              oneOf:
                - { type: boolean, const: true }
                - { $ref: '#/components/schemas/TasksCommentQuery' }

    TasksAssigneeQuery:
      type: object
      description: Query options for the assignee relation
      properties:
        select:
          type: object
          description: Fields to include

    TasksCommentQuery:
      type: object
      description: Query options for the comments relation
      properties:
        select:
          type: object
          properties:
            id: { type: boolean }
            text: { type: boolean }
            createdAt: { type: boolean }
        where:
          type: object
          properties:
            createdAt: {}
        orderBy:
          type: object
          properties:
            createdAt: { type: string, enum: [asc, desc] }
        limit: { type: integer, minimum: 0, maximum: 20 }

    TasksCreateInput:
      type: object
      required: [title]
      properties:
        title: { type: string }
        description: { type: string, nullable: true }
        status: { type: string, enum: ['todo', 'in_progress', 'done'] }
        estimate: { type: integer, nullable: true }

    TasksUpdateInput:
      type: object
      properties:
        title: { type: string }
        description: { type: string, nullable: true }
        status: { type: string, enum: ['todo', 'in_progress', 'done'] }
        estimate: { type: integer, nullable: true }
```

### Schema naming convention

Schema names follow this pattern:

```
PascalCase(entityName) + PascalCase(relationName)? + Suffix
```

Suffixes: `Response`, `CreateInput`, `UpdateInput`, `Query`.

- Entity `'tasks'` → `TasksResponse`, `TasksCreateInput`, `TasksUpdateInput`, `TasksQuery`
- Entity `'tasks'`, relation `'comments'` → `TasksCommentResponse`, `TasksCommentQuery`
- Hyphenated names are PascalCased: `'task-items'` → `TaskItemsResponse`
- Nested relations: `'tasks'` → `'comments'` → `'author'` → `TasksCommentAuthorResponse`

### Entities without `expose`

Entities without `expose` still generate OpenAPI entries. All public (non-hidden) columns appear in the response schema. No filter/sort constraints are documented — any public field is accepted (matching runtime behavior).

### Disabled operations

Operations with `access: false` are included in the spec with a `405 Method Not Allowed` response (no request body, no query params). Operations with `access: undefined` (no access rule = deny by default) are **not included** — they don't have routes, so they shouldn't appear in the spec.

### Input schemas and `expose.select`

Create/update input schemas include **all writable, non-hidden columns** regardless of `expose.select`. The `select` config controls the **read surface** (what clients see in responses), not the **write surface** (what clients can send). A field can be writable but not exposed in reads — this is a deliberate separation of concerns. For example, `description` might not be in `expose.select` but is still a valid field for create/update.

### Custom actions

Custom actions are included with their `body` and `response` schemas. Schema extraction uses a runtime duck-type check: if the action's `body`/`response` object has a `toJSONSchema()` method (as `@vertz/schema` instances do), the method is called to produce the JSON Schema. Otherwise, the schema falls back to `{}` with a description: `"Schema not available for automated extraction."`.

At startup, when a fallback occurs, a warning is logged:
```
[vertz] Warning: Action "tasks.archive" body schema does not expose JSON schema — using "any" in OpenAPI spec.
```

```ts
actions: {
  archive: {
    method: 'POST',
    body: archiveSchema,    // @vertz/schema → toJSONSchema() works
    response: taskSchema,   // @vertz/schema → toJSONSchema() works
    handler: async (input, ctx, row) => { ... },
  },
},
```

Generates:

```yaml
/api/tasks/{id}/archive:
  post:
    operationId: tasks_archive
    summary: Archive action on tasks
    tags: [tasks]
    requestBody:
      content:
        application/json:
          schema: { ... } # from archiveSchema.toJSONSchema()
    responses:
      '200':
        content:
          application/json:
            schema: { ... } # from taskSchema.toJSONSchema()
```

### Relation `include: true` shorthand

When a relation is configured as `include: { assignee: true }` (shorthand), the generator resolves the relation's target table via `RelationDef._target()`, iterates its `_columns`, and exposes all public (non-hidden) columns. The response schema for the relation includes all those columns.

## Manifesto Alignment

- **If it builds, it works**: The spec is derived from the same `expose` config that controls runtime validation. If the expose config changes, the spec changes automatically. No manual spec maintenance, no drift.
- **One way to do things**: One `expose` config → one spec. No separate OpenAPI annotations, no decorator-based documentation. The entity definition IS the documentation.
- **AI agents are first-class users**: LLMs can fetch `GET /api/openapi.json` and understand the full API surface. Standard OpenAPI tooling (Swagger UI, code generators) works out of the box. Error response schemas are documented so agents can handle failures.
- **Production-ready by default**: OpenAPI generation is built-in, not a plugin. One config field (`openapi: { info: { ... } }`) enables it.
- **Explicit over implicit**: Descriptor-guarded fields are annotated in the spec with their nullability and a description explaining the entitlement requirement.

## Non-Goals

- **Authentication scheme documentation**: The OpenAPI spec won't document `securitySchemes` in this version. Access rules (authenticated, entitlements) are available in entity definitions, but mapping them to OpenAPI security schemes requires knowledge of the auth middleware (Bearer, API key, etc.) which is not part of entity config. Follow-up: a server-level `securitySchemes` config could be added later.
- **Custom route documentation**: Non-entity routes (custom routers, middleware endpoints) are covered by the existing compiler-based OpenAPI generator. This feature is scoped to entity CRUD + actions.
- **Swagger UI hosting**: We generate the JSON spec, not a UI. Users can point Swagger UI at the endpoint.
- **SDK generation from OpenAPI**: The typed SDK is already generated from entity definitions directly. OpenAPI is for external/non-TypeScript consumers.
- **Per-request spec variation**: The spec is static (generated once at startup). Descriptor-guarded fields are always present as `T | null` — the spec doesn't vary based on who's requesting it.
- **Operation-level descriptions**: Custom `summary`/`description` per operation is not supported in this version. Summaries are auto-generated from the entity name and operation type. Follow-up: an optional `description` field on entity config and action defs could be added later.
- **Merging with compiler-generated spec**: The entity OpenAPI spec and the compiler-generated custom route spec are not merged into a unified document. Follow-up: a merge utility could combine both.

## Unknowns

### 1. Column type → JSON Schema mapping

The `ColumnMetadata.sqlType` field maps to JSON Schema types. Complete mapping:

| `d.*` method | `sqlType` | JSON Schema | Notes |
|---|---|---|---|
| `uuid()` | `'uuid'` | `{ type: "string", format: "uuid" }` | |
| `text()` | `'text'` | `{ type: "string" }` | |
| `varchar(n)` | `'varchar'` | `{ type: "string", maxLength: n }` | `n` from `meta.length` |
| `email()` | `'text'` | `{ type: "string", format: "email" }` | `meta.format === 'email'` |
| `boolean()` | `'boolean'` | `{ type: "boolean" }` | |
| `integer()` | `'integer'` | `{ type: "integer" }` | |
| `bigint()` | `'bigint'` | `{ type: "string" }` | JSON can't represent BigInt; string encoding |
| `decimal(p,s)` | `'decimal'` | `{ type: "string" }` | Arbitrary precision; string encoding |
| `real()` | `'real'` | `{ type: "number" }` | |
| `doublePrecision()` | `'double precision'` | `{ type: "number", format: "double" }` | |
| `serial()` | `'serial'` | `{ type: "integer" }` | |
| `timestamp()` | `'timestamp with time zone'` | `{ type: "string", format: "date-time" }` | |
| `date()` | `'date'` | `{ type: "string", format: "date" }` | |
| `time()` | `'time'` | `{ type: "string", format: "time" }` | |
| `jsonb()` | `'jsonb'` | `{}` or extracted schema | Duck-type check for `toJSONSchema()` on validator |
| `textArray()` | `'text[]'` | `{ type: "array", items: { type: "string" } }` | |
| `integerArray()` | `'integer[]'` | `{ type: "array", items: { type: "integer" } }` | |
| `enum(name, vals)` | `'enum'` | `{ type: "string", enum: vals }` | `vals` from `meta.enumValues` |

Nullable columns: the JSON Schema `type` becomes an array including `"null"`, e.g., `{ type: ["string", "null"] }`.

**Resolution**: Map all known SQL types per the table above. Unknown `sqlType` values fall back to `{}`.

### 2. Action schema extraction

`EntityActionDef.body` and `EntityActionDef.response` are `SchemaLike<T>` — duck-typed parse objects with only a `parse()` method. `@vertz/schema` instances implement `toJSONSchema()`, but plain `{ parse }` objects do not.

**Resolution**: Runtime duck-type check at generation time:
```ts
function extractJsonSchema(schema: SchemaLike<unknown>): JSONSchemaObject {
  if ('toJSONSchema' in schema && typeof (schema as any).toJSONSchema === 'function') {
    return (schema as any).toJSONSchema();
  }
  return { description: 'Schema not available for automated extraction.' };
}
```
This avoids modifying `SchemaLike` in `@vertz/db` and leverages the existing `toJSONSchema()` on `@vertz/schema` instances. A startup warning is logged for each action where the fallback triggers.

## POC Results

N/A — no POCs needed. The mapping from `expose` config to OpenAPI is straightforward, and the column type → JSON Schema mapping uses well-known correspondences.

## Type Flow Map

```
EntityDefinition
  ├─ name: string
  │    └─ PascalCase → schema name prefix, tag name, path segment
  ├─ model.table._columns
  │    └─ each column's ColumnMetadata (sqlType, nullable, format, enumValues)
  │    └─ JSON Schema property type/format/enum
  │    NOTE: model.table.$response, $create_input, $update_input are phantom types
  │    (undefined at runtime). The implementation derives the same shapes by
  │    iterating _columns and applying metadata filtering (hidden, readOnly, PK).
  ├─ expose.select
  │    └─ Narrows response schema to listed fields only
  │    └─ AccessRule values → field type becomes T | null with description
  │    NOTE: expose.include uses RelationExposeConfig (record of { field: true | AccessRule }),
  │    not RelationConfigObject (which uses string arrays for allowWhere/allowOrderBy).
  │    The implementation only processes RelationExposeConfig shapes.
  ├─ expose.allowWhere
  │    └─ Query parameters: where[field]=value for each key
  │    └─ Enum columns get their values in the param schema
  ├─ expose.allowOrderBy
  │    └─ Query parameter: orderBy enum values
  ├─ expose.include
  │    └─ Nested response schemas via RelationDef._target() → TableDef._columns
  │    └─ true shorthand → all public columns of target table
  │    └─ RelationExposeConfig → narrowed by select/allowWhere/allowOrderBy
  ├─ access
  │    └─ Which operations exist (undefined = no route = not in spec)
  │    └─ false = 405 Method Not Allowed in spec
  └─ actions
       └─ Custom action routes
       └─ body/response schema via duck-type toJSONSchema() check

generateOpenAPISpec(definitions[], options) → OpenAPIDocument
  ├─ paths: computed from entity name + access rules + expose config
  ├─ components.schemas: computed from table columns + expose narrowing
  ├─ components.responses: standard error responses (400, 401, 404)
  └─ Served via configurable endpoint when openapi config is present
```

## E2E Acceptance Test

```ts
import { generateOpenAPISpec } from '@vertz/server';
import { entity } from '@vertz/server';
import { rules } from '@vertz/server/rules';
import { d, model } from '@vertz/db';

// --- Setup: define tables, model, entity ---

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  description: d.text().nullable(),
  status: d.enum('task_status', ['todo', 'in_progress', 'done']).default('todo'),
  estimate: d.integer().nullable(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
  passwordHash: d.text().is('hidden'),
});

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email(),
});

const commentsTable = d.table('comments', {
  id: d.uuid().primary(),
  text: d.text(),
  taskId: d.uuid(),
  authorId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
});

const tasksModel = model(tasksTable, {
  comments: d.ref.many(() => commentsTable, 'taskId'),
  assignee: d.ref.one(() => usersTable, 'assigneeId'),
});

const tasksDef = entity('tasks', {
  model: tasksModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.entitlement('task:update'),
    delete: false,
  },
  expose: {
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      estimate: rules.entitlement('pm:view-estimates'),
    },
    allowWhere: { status: true, createdAt: true },
    allowOrderBy: { createdAt: true, title: true },
    include: {
      assignee: true, // shorthand — all public columns of target table
      comments: {
        select: { id: true, text: true, createdAt: true },
        allowWhere: { createdAt: true },
        allowOrderBy: { createdAt: true },
        maxLimit: 20,
      },
    },
  },
});

// --- Generate spec ---
const spec = generateOpenAPISpec([tasksDef], {
  info: { title: 'Test API', version: '0.1.0' },
});

// --- Assertions ---

// Spec is valid OpenAPI 3.1
expect(spec.openapi).toBe('3.1.0');
expect(spec.info.title).toBe('Test API');

// Servers default to empty when not provided
expect(spec.servers).toBeUndefined();

// Paths generated for enabled operations only
expect(spec.paths['/api/tasks']).toBeDefined();          // list + create
expect(spec.paths['/api/tasks/{id}']).toBeDefined();     // get + update + delete(405)
expect(spec.paths['/api/tasks/query']).toBeDefined();    // POST query fallback
expect(spec.paths['/api/tasks']!.get).toBeDefined();     // list enabled
expect(spec.paths['/api/tasks']!.post).toBeDefined();    // create enabled
expect(spec.paths['/api/tasks/{id}']!.get).toBeDefined();   // get enabled
expect(spec.paths['/api/tasks/{id}']!.patch).toBeDefined(); // update enabled
expect(spec.paths['/api/tasks/{id}']!.delete).toBeDefined(); // delete = false → 405

// Delete is 405
expect(spec.paths['/api/tasks/{id}']!.delete!.responses['405']).toBeDefined();

// Error responses are included
expect(spec.components!.schemas!['ErrorResponse']).toBeDefined();

// Response schema reflects expose.select (not all columns)
const responseSchema = spec.components!.schemas!['TasksResponse'];
expect(Object.keys(responseSchema.properties!)).toEqual(
  expect.arrayContaining(['id', 'title', 'status', 'createdAt', 'estimate'])
);
// Hidden field not in response schema
expect(responseSchema.properties!['passwordHash']).toBeUndefined();
// Non-exposed field not in response schema (description not in expose.select)
expect(responseSchema.properties!['description']).toBeUndefined();
// updatedAt not in response schema (not listed in expose.select)
expect(responseSchema.properties!['updatedAt']).toBeUndefined();

// Descriptor-guarded field is nullable with description
expect(responseSchema.properties!['estimate'].type).toEqual(['integer', 'null']);
expect(responseSchema.properties!['estimate'].description).toContain('pm:view-estimates');

// Non-guarded fields are required
expect(responseSchema.required).toEqual(
  expect.arrayContaining(['id', 'title', 'status', 'createdAt'])
);
// Guarded field is NOT required (it can be null)
expect(responseSchema.required).not.toContain('estimate');

// Enum column gets enum values in schema
expect(responseSchema.properties!['status'].enum).toEqual(['todo', 'in_progress', 'done']);

// Query params for list
const listOp = spec.paths['/api/tasks']!.get!;
const paramNames = listOp.parameters!.map((p: { name: string }) => p.name);
expect(paramNames).toContain('where[status]');
expect(paramNames).toContain('where[createdAt]');
expect(paramNames).toContain('orderBy');
expect(paramNames).toContain('limit');
expect(paramNames).toContain('after');
expect(paramNames).toContain('q');
// Non-allowed where fields NOT in params
expect(paramNames).not.toContain('where[title]');
expect(paramNames).not.toContain('where[estimate]');

// where[status] param has enum values
const statusParam = listOp.parameters!.find((p: any) => p.name === 'where[status]');
expect(statusParam!.schema.enum).toEqual(['todo', 'in_progress', 'done']);

// Relation schemas in components

// Shorthand relation (assignee: true) — all public columns of target table
const assigneeSchema = spec.components!.schemas!['TasksAssigneeResponse'];
expect(assigneeSchema).toBeDefined();
expect(Object.keys(assigneeSchema.properties!)).toEqual(
  expect.arrayContaining(['id', 'name', 'email'])
);

// Structured relation (comments: { select: ... })
const commentSchema = spec.components!.schemas!['TasksCommentResponse'];
expect(commentSchema).toBeDefined();
expect(Object.keys(commentSchema.properties!)).toEqual(
  expect.arrayContaining(['id', 'text', 'createdAt'])
);

// Create input excludes readOnly, hidden, and PK — but includes ALL writable columns
const createSchema = spec.components!.schemas!['TasksCreateInput'];
expect(createSchema.properties!['id']).toBeUndefined();            // primary key
expect(createSchema.properties!['createdAt']).toBeUndefined();      // readOnly
expect(createSchema.properties!['updatedAt']).toBeUndefined();      // autoUpdate (readOnly)
expect(createSchema.properties!['passwordHash']).toBeUndefined();   // hidden
expect(createSchema.properties!['title']).toBeDefined();
expect(createSchema.properties!['description']).toBeDefined();      // writable even if not in expose.select
expect(createSchema.properties!['estimate']).toBeDefined();
expect(createSchema.required).toContain('title');                   // no default
expect(createSchema.required).not.toContain('status');              // has default
expect(createSchema.required).not.toContain('description');         // nullable

// @ts-expect-error — generateOpenAPISpec requires EntityDefinition[]
generateOpenAPISpec('not-an-array');

// @ts-expect-error — info.title is required
generateOpenAPISpec([], { info: { version: '1.0.0' } });
```

## Implementation Plan

### Phase 1: Column type → JSON Schema mapping + response schema generation

Build the core mapping from `ColumnMetadata` to JSON Schema types, and generate response schemas from entity definitions respecting `expose.select`.

**Deliverables:**
1. `columnToJsonSchema(column: ColumnBuilder)` — maps a single column to a JSON Schema property using the mapping table in Unknown #1
2. `entityResponseSchema(def: EntityDefinition)` — generates the response schema from `expose.select` (or all public columns if no expose)
3. Descriptor-guarded fields (`AccessRule` values in `select`) produce `type: [T, 'null']` with a description noting the entitlement requirement
4. Hidden and non-exposed fields excluded from schema
5. Enum columns preserve their enum values in the schema
6. Relation response schemas: structured `RelationExposeConfig` → narrowed schema; `true` shorthand → all public columns via `RelationDef._target()`

**Acceptance criteria:**
```ts
describe('Feature: Column to JSON Schema mapping', () => {
  describe('Given a column with sqlType "uuid"', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", format: "uuid" }', () => {});
    });
  });
  describe('Given a column with sqlType "integer"', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "integer" }', () => {});
    });
  });
  describe('Given a nullable column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns type as array including "null"', () => {});
    });
  });
  describe('Given an enum column with values ["draft", "published"]', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", enum: ["draft", "published"] }', () => {});
    });
  });
  describe('Given a column with format "email"', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", format: "email" }', () => {});
    });
  });
  describe('Given a timestamp column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", format: "date-time" }', () => {});
    });
  });
  describe('Given a bigint column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string" } (JSON cannot represent BigInt)', () => {});
    });
  });
  describe('Given a text array column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "array", items: { type: "string" } }', () => {});
    });
  });
  describe('Given a varchar(255) column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", maxLength: 255 }', () => {});
    });
  });
});

describe('Feature: Entity response schema generation', () => {
  describe('Given an entity with expose.select listing id, title, status', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then schema properties contain only id, title, status', () => {});
      it('Then hidden columns are excluded', () => {});
    });
  });
  describe('Given an entity without expose config', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then schema properties contain all public (non-hidden) columns', () => {});
    });
  });
  describe('Given a descriptor-guarded field (AccessRule in select)', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then the field type includes null', () => {});
      it('Then the field has a description mentioning the entitlement', () => {});
      it('Then the field is not in required array', () => {});
    });
  });
  describe('Given a relation with include: true shorthand', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then resolves target table and includes all public columns', () => {});
    });
  });
  describe('Given a relation with structured RelationExposeConfig', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then only includes fields listed in relation select', () => {});
    });
  });
});
```

### Phase 2: Input schemas + query parameter generation

Generate create/update input schemas and VertzQL query parameters from `expose` config.

**Deliverables:**
1. `entityCreateInputSchema(def: EntityDefinition)` — create input schema (excludes readOnly, hidden, PK; includes all other writable columns regardless of expose.select)
2. `entityUpdateInputSchema(def: EntityDefinition)` — update input schema (same exclusions, all optional)
3. `exposeToQueryParams(def: EntityDefinition)` — generates OpenAPI parameter objects for `where[field]`, `orderBy`, `limit`, `after`, `q`
4. Enum columns in `allowWhere` get their enum values in the `where[field]` param schema
5. Structured query schema for the `q=` param and POST `/query` body, including relation query sub-schemas

**Acceptance criteria:**
```ts
describe('Feature: Create input schema', () => {
  describe('Given an entity with PK, readOnly, hidden, and writable columns', () => {
    describe('When entityCreateInputSchema is called', () => {
      it('Then PK column is excluded', () => {});
      it('Then readOnly columns are excluded', () => {});
      it('Then hidden columns are excluded', () => {});
      it('Then columns with defaults are not required', () => {});
      it('Then columns without defaults are required', () => {});
      it('Then writable columns NOT in expose.select are still included', () => {});
    });
  });
});

describe('Feature: Query parameter generation', () => {
  describe('Given expose.allowWhere with { status: true, createdAt: true }', () => {
    describe('When exposeToQueryParams is called', () => {
      it('Then generates where[status] and where[createdAt] params', () => {});
      it('Then does not generate params for non-allowed fields', () => {});
    });
  });
  describe('Given an enum column in allowWhere', () => {
    describe('When exposeToQueryParams is called', () => {
      it('Then the where param schema includes enum values', () => {});
    });
  });
  describe('Given expose.allowOrderBy with { createdAt: true, title: true }', () => {
    describe('When exposeToQueryParams is called', () => {
      it('Then generates orderBy param with enum of field:direction combinations', () => {});
    });
  });
  describe('Given expose config with include relations', () => {
    describe('When the structured query schema is generated', () => {
      it('Then includes relation query schemas with their own select/where/orderBy', () => {});
      it('Then relation with maxLimit has limit.maximum set to maxLimit', () => {});
    });
  });
});
```

### Phase 3: Full spec assembly + `generateOpenAPISpec()` public API

Assemble paths, operations, and component schemas into a complete OpenAPI 3.1 document.

**Deliverables:**
1. `generateOpenAPISpec(definitions: EntityDefinition[], options: OpenAPISpecOptions): OpenAPIDocument`
2. Paths generated from entity name + access rules
3. Operations include parameters, request bodies, and response schemas
4. Component schemas referenced via `$ref`
5. Standard error responses (`ErrorResponse` schema, shared `400`/`401`/`404` responses)
6. Custom actions included with their body/response schemas (duck-type `toJSONSchema()` check, startup warning on fallback)
7. Disabled operations (`access: false`) → 405 response
8. Missing operations (`access: undefined`) → not in spec
9. OpenAPI types duplicated from compiler package with a TODO for future consolidation into shared types

**Acceptance criteria:**
```ts
describe('Feature: Full OpenAPI spec generation', () => {
  describe('Given multiple entity definitions', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then generates paths for all entities', () => {});
      it('Then spec.openapi is "3.1.0"', () => {});
      it('Then spec.info matches provided options', () => {});
      it('Then component schemas are defined for each entity response/input', () => {});
      it('Then ErrorResponse schema is included in components', () => {});
    });
  });
  describe('Given an entity with access.delete = false', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then DELETE path exists with only a 405 response', () => {});
    });
  });
  describe('Given an entity with access.create = undefined', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then POST path does not exist', () => {});
    });
  });
  describe('Given an entity with custom actions', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then action path is included with correct method and schemas', () => {});
    });
  });
  describe('Given an action with SchemaLike body without toJSONSchema', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then body schema falls back to {} with description', () => {});
    });
  });
  describe('Given an entity with relation includes', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then relation response schemas are in components.schemas', () => {});
      it('Then response schema references relation via $ref', () => {});
    });
  });
  describe('Given servers option is provided', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then spec.servers matches provided value', () => {});
    });
  });
  describe('Given servers option is not provided', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then spec.servers is undefined', () => {});
    });
  });
});
```

### Phase 4: Server integration + serving endpoint + docs + changeset

Wire the spec generation into `createServer()` so it auto-serves the OpenAPI spec endpoint.

**Deliverables:**
1. `ServerConfig.openapi` option to enable spec serving
2. Auto-registered route at configurable `path` (defaults to `<apiPrefix>/openapi.json`)
3. Spec generated once at startup, cached, served as JSON (in dev mode, regenerated per request)
4. Documentation in `packages/docs/` — new page covering the full OpenAPI generation feature
5. Changeset

**Acceptance criteria:**
```ts
describe('Feature: OpenAPI endpoint integration', () => {
  describe('Given a server with openapi config', () => {
    describe('When GET /api/openapi.json is requested', () => {
      it('Then returns 200 with Content-Type application/json', () => {});
      it('Then response body is a valid OpenAPI 3.1 document', () => {});
      it('Then spec contains paths for all registered entities', () => {});
    });
  });
  describe('Given a server with openapi.path = "/docs/spec.json"', () => {
    describe('When GET /docs/spec.json is requested', () => {
      it('Then returns 200 with the OpenAPI spec', () => {});
    });
  });
  describe('Given a server without openapi config', () => {
    describe('When GET /api/openapi.json is requested', () => {
      it('Then returns 404', () => {});
    });
  });
});
```

## Review Findings Addressed (Rev 2)

| # | Source | Finding | Resolution |
|---|--------|---------|------------|
| 1 | DX | Schema naming inconsistency (`TaskResponse` vs `TasksResponse`) | Standardized on `PascalCase(entityName) + Suffix`. Added explicit naming convention section. All examples use `Tasks*`. |
| 2 | DX | `q` parameter is opaque for external consumers | Improved description with decoded JSON example. Added note to use POST `/query` for complex queries. `q` remains in spec since it's part of the URL API surface. |
| 3 | DX | No error DX for action schema fallback | Added startup warning log and fallback description in schema. Documented in Custom Actions section. |
| 4 | DX | Missing `description`/`summary` customization | Added to Non-Goals with follow-up note. Auto-generated summaries sufficient for v0.1.x. |
| 5 | DX | `openapi` config missing `path` option | Added `path` option to API Surface with example. |
| 6 | DX | `generateOpenAPISpec` standalone usage underdefined | Added note: "Pass the same entity definitions you provide to `createServer({ entities })`." |
| 7 | DX | `access: false` vs `access: undefined` subtle | Documented clearly in "Disabled operations" section. |
| 8 | DX | `servers` option not in E2E test | Added `servers` assertion in E2E test. |
| 9 | DX | `OpenAPIOptions` type not shown | Added `OpenAPISpecOptions` type definition in API Surface. |
| 10 | DX | `TasksAssigneeQuery`/`TasksCommentQuery` undefined | Added both schema definitions in YAML example. |
| 11 | DX | `where[status]` should use enum values | Added enum values to `where` param schemas for enum columns. |
| 12 | Product | Overlap with compiler OpenAPI generator | Added "Relationship to existing compiler-based OpenAPI generator" section. |
| 13 | Product | Issue #1246 reference missing | Added issue reference in Goal section header. |
| 14 | Product | Action schema extraction undersolved | Committed to runtime duck-type check for `toJSONSchema()`. Concrete code in Unknown #2. |
| 15 | Product | Create/update inputs vs expose.select | Added "Input schemas and `expose.select`" section: inputs include ALL writable columns regardless of expose.select. |
| 16 | Product | `autoUpdate` ≠ hidden — misleading comment | Fixed comment: "not listed in expose.select" instead of "autoUpdate = hidden". |
| 17 | Product | No error response schemas | Added `ErrorResponse` component schema and `BadRequest`/`Unauthorized`/`NotFound` shared responses. |
| 18 | Product | Auth requirements not in spec | Added to Non-Goals with rationale and follow-up note. Requires knowledge of auth middleware beyond entity config. |
| 19 | Tech | `RelationExposeConfig` vs `RelationConfigObject` types | Added note in Type Flow Map: implementation only processes `RelationExposeConfig` shapes. |
| 20 | Tech | `autoUpdate` E2E comment wrong | Fixed to "not listed in expose.select". |
| 21 | Tech | Missing column types in mapping | Added complete column type mapping table with all 18 types. |
| 22 | Tech | Relation `include: true` shorthand unaddressed | Added "Relation `include: true` shorthand" section and acceptance test case. |
| 23 | Tech | Schema naming collisions | Added explicit schema naming convention with rules for relations, hyphens, and nesting. |
| 24 | Tech | `$response` etc. are phantom types | Added note in Type Flow Map clarifying these are type-level only. |
| 25 | Tech | Reuse types from compiler OpenAPI generator | Phase 3 deliverable: duplicate types with TODO for consolidation. |
| 26 | Tech | Dev-mode hot reloading | Phase 4: dev mode regenerates spec per request. |
