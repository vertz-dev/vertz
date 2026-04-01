# Phase 1: OpenAPI Parser + Resource Grouper

## Context

We're building `@vertz/openapi` — a standalone tool that generates typed TypeScript SDKs from OpenAPI 3.x specs. This is the first phase: parsing and validating OpenAPI specs, resolving `$ref`s, normalizing operation IDs, and grouping operations into resources.

**Design doc:** `plans/openapi-sdk-codegen.md`

This phase produces the internal data structures that Phase 2 (generators) consumes. No files are generated for the end user in this phase — only the parser and grouper logic.

---

## Tasks

### Task 1: Package scaffolding + internal types

**Files:** (4)
- `packages/openapi/package.json` (new)
- `packages/openapi/tsconfig.json` (new)
- `packages/openapi/src/index.ts` (new)
- `packages/openapi/src/parser/types.ts` (new)

**What to implement:**

1. Create the `@vertz/openapi` package with standard Vertz monorepo config (Bun workspace, strict TS).
2. Define the internal parsed types:

```typescript
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ParsedSpec {
  version: '3.0' | '3.1';
  info: { title: string; version: string };
  resources: ParsedResource[];
  schemas: ParsedSchema[];
}

export interface ParsedResource {
  name: string;           // e.g., 'Tasks'
  identifier: string;     // e.g., 'tasks' (valid TS identifier, camelCase)
  operations: ParsedOperation[];
}

export interface ParsedOperation {
  operationId: string;            // Original from spec
  methodName: string;             // Normalized: 'list', 'get', 'create', etc.
  method: HttpMethod;
  path: string;
  pathParams: ParsedParameter[];
  queryParams: ParsedParameter[];
  requestBody?: ParsedSchema;
  response?: ParsedSchema;
  responseStatus: number;         // 200, 201, 204, etc.
  tags: string[];
}

export interface ParsedParameter {
  name: string;
  required: boolean;
  schema: Record<string, unknown>; // JSON Schema
}

export interface ParsedSchema {
  name?: string;                          // From components/schemas (if named)
  jsonSchema: Record<string, unknown>;    // Fully resolved (no $refs)
}
```

3. Export types from `src/index.ts`.

**Acceptance criteria:**
- [ ] `packages/openapi/package.json` has correct name, dependencies, and workspace config
- [ ] `tsconfig.json` extends the monorepo base with strict mode
- [ ] Types compile with `bun run typecheck`
- [ ] Package is recognized by the monorepo workspace

---

### Task 2: `$ref` resolver

**Files:** (2)
- `packages/openapi/src/parser/ref-resolver.ts` (new)
- `packages/openapi/src/parser/__tests__/ref-resolver.test.ts` (new)

**What to implement:**

A function that resolves all `$ref` pointers in an OpenAPI document to their target schemas.

```typescript
export interface ResolveOptions {
  specVersion: '3.0' | '3.1';
}

/**
 * Resolve a $ref string like '#/components/schemas/Task' to its schema.
 * Returns the resolved JSON Schema object.
 */
export function resolveRef(
  ref: string,
  document: Record<string, unknown>,
  options: ResolveOptions,
): Record<string, unknown>;

/**
 * Fully resolve a schema, replacing all $ref pointers with their targets.
 * Handles circular refs by returning a sentinel: { $circular: 'SchemaName' }
 */
export function resolveSchema(
  schema: Record<string, unknown>,
  document: Record<string, unknown>,
  options: ResolveOptions,
  resolving?: Set<string>,
): Record<string, unknown>;
```

Key behaviors:
- Resolve internal `$ref`s (`#/components/schemas/Task`)
- Detect circular `$ref`s via a `resolving: Set<string>` guard — return `{ $circular: schemaName }` sentinel
- Handle deep `$ref` chains (ref → ref → actual schema)
- Throw clear error for external `$ref`s (`./models/user.yaml`)
- Handle `$ref` + sibling keywords: merge in 3.1, ignore siblings in 3.0
- Merge `allOf` arrays into a single flattened schema

**Acceptance criteria:**
- [ ] Resolves simple `$ref` to component schema
- [ ] Resolves nested `$ref` chains (A → B → C)
- [ ] Detects circular refs and returns `$circular` sentinel without infinite loop
- [ ] Throws for external `$ref`s with actionable error message
- [ ] Merges `allOf` schemas into unified properties
- [ ] In 3.0 mode: ignores sibling keywords next to `$ref`
- [ ] In 3.1 mode: merges sibling keywords with resolved `$ref`

---

### Task 3: OpenAPI parser + validator

**Files:** (2)
- `packages/openapi/src/parser/openapi-parser.ts` (new)
- `packages/openapi/src/parser/__tests__/openapi-parser.test.ts` (new)

**What to implement:**

```typescript
/**
 * Parse and validate an OpenAPI 3.x spec (as a plain object).
 * Returns parsed operations with resolved schemas.
 */
export function parseOpenAPI(
  spec: Record<string, unknown>,
): { operations: ParsedOperation[]; schemas: ParsedSchema[]; version: '3.0' | '3.1' };
```

Responsibilities:
1. **Validate** the spec has required fields (`openapi`, `info`, `paths`). Throw descriptive errors for missing fields.
2. **Detect version** from `openapi` field (`'3.0.x'` → `'3.0'`, `'3.1.x'` → `'3.1'`). Throw for unsupported versions.
3. **Iterate paths and methods** — for each path + HTTP method, produce a `ParsedOperation`.
4. **Extract path parameters** from `{param}` syntax in the path and from `parameters` array.
5. **Extract query parameters** from `parameters` array where `in: 'query'`.
6. **Extract request body** schema from `requestBody.content['application/json'].schema`. Resolve `$ref`s.
7. **Extract success response** — find the lowest 2xx status code, extract its `application/json` schema. Detect 204 (no body).
8. **Collect component schemas** — extract all named schemas from `components.schemas` with resolved `$ref`s.
9. **Handle `nullable`** — for 3.0 specs, convert `nullable: true` to `type: ['<type>', 'null']` for uniform downstream handling.

**Acceptance criteria:**
- [ ] Parses a minimal valid 3.1 spec and returns operations
- [ ] Parses a minimal valid 3.0 spec and returns operations
- [ ] Extracts path parameters from path template and parameters array
- [ ] Extracts typed query parameters
- [ ] Extracts request body schema (resolved)
- [ ] Extracts success response schema (lowest 2xx)
- [ ] Detects 204 No Content (responseStatus: 204, no response schema)
- [ ] Collects named component schemas
- [ ] Converts 3.0 `nullable: true` to uniform format
- [ ] Throws for missing `openapi` field
- [ ] Throws for missing `info` field
- [ ] Throws for missing `paths` field
- [ ] Throws for unsupported version (e.g., `2.0`)

---

### Task 4: Operation ID normalizer

**Files:** (2)
- `packages/openapi/src/parser/operation-id-normalizer.ts` (new)
- `packages/openapi/src/parser/__tests__/operation-id-normalizer.test.ts` (new)

**What to implement:**

```typescript
export interface NormalizerConfig {
  overrides?: Record<string, string>;
  transform?: (cleaned: string, original: string) => string;
}

/**
 * Normalize an operation ID to a clean method name.
 * Steps: auto-clean → CRUD detection → transform → overrides
 */
export function normalizeOperationId(
  operationId: string,
  method: HttpMethod,
  path: string,
  config?: NormalizerConfig,
): string;
```

**Auto-clean rules:**
- Strip framework controller prefixes: `TasksController_findAll` → `findAll`
- Strip redundant path-derived segments: `list_tasks_tasks__get` → `listTasks`
- Strip HTTP method suffixes: `listTasksGet` → `listTasks`
- Normalize separators (`_`, `-`, `.`) to camelCase
- Handle snake_case: `get_task_by_id` → `getTaskById`

**CRUD detection** (based on HTTP method + path shape):
- `GET /resources` (no path param) → `list`
- `GET /resources/{id}` (has path param) → `get`
- `POST /resources` (no path param) → `create`
- `PATCH /resources/{id}` or `PUT /resources/{id}` → `update`
- `DELETE /resources/{id}` → `delete`

Non-CRUD operations (e.g., `POST /tasks/{id}/archive`) keep their normalized operationId.

**Precedence:** overrides > transform > CRUD detection > auto-clean

**Acceptance criteria:**
- [ ] FastAPI: `list_tasks_tasks__get` → `list` (CRUD detected)
- [ ] NestJS: `TasksController_findAll` → `list` (CRUD detected)
- [ ] Django: `tasks_list` → `list` (CRUD detected)
- [ ] Rails: `get-task-by-id` → `get` (CRUD detected for GET /tasks/{id})
- [ ] Non-CRUD: `POST /tasks/{id}/archive` with operationId `archive_task` → `archive`
- [ ] Transform function is applied after auto-clean
- [ ] Static overrides take precedence over everything
- [ ] Falls back to auto-cleaned operationId when no CRUD pattern matches

---

### Task 5: Resource grouper + identifier sanitizer

**Files:** (3)
- `packages/openapi/src/adapter/resource-grouper.ts` (new)
- `packages/openapi/src/adapter/identifier.ts` (new)
- `packages/openapi/src/adapter/__tests__/resource-grouper.test.ts` (new)

**What to implement:**

```typescript
export type GroupByStrategy = 'tag' | 'path' | 'none';

/**
 * Group parsed operations into resources.
 */
export function groupOperations(
  operations: ParsedOperation[],
  strategy: GroupByStrategy,
): ParsedResource[];

/**
 * Sanitize a string to a valid TypeScript identifier (camelCase).
 */
export function sanitizeIdentifier(name: string): string;
```

**Tag-based grouping (`groupBy: 'tag'`):**
- Group by first tag on each operation
- Operations with no tags → `_ungrouped` resource
- Multiple tags → uses first tag only
- Tag name becomes resource name (sanitized to valid TS identifier)

**Path-based grouping (`groupBy: 'path'`):**
- Group by first meaningful path segment
- Strip common prefixes: `/api/`, version segments (`/v1/`, `/v2/`)
- `/tasks` and `/tasks/{id}` → `tasks` resource
- `/tasks/{id}/comments` → `comments` resource (or `taskComments`?)

**No grouping (`groupBy: 'none'`):**
- Every operation is its own resource (flat namespace)

**Identifier sanitization:**
- `Task Management` → `taskManagement`
- `v2/tasks` → `v2Tasks`
- `admin.users` → `adminUsers`
- `TASKS` → `tasks`
- `123invalid` → `_123invalid` (prefix with _ if starts with number)

**Acceptance criteria:**
- [ ] Groups operations by first tag
- [ ] Puts untagged operations in `_ungrouped`
- [ ] Handles operations with multiple tags (uses first)
- [ ] Path-based: groups `/tasks` and `/tasks/{id}` together
- [ ] Path-based: strips `/api/` prefix
- [ ] Path-based: strips version segments
- [ ] `none`: each operation is its own resource
- [ ] Sanitizes `Task Management` → `taskManagement`
- [ ] Sanitizes `v2/tasks` → `v2Tasks`
- [ ] Sanitizes names starting with numbers (prefixes `_`)
- [ ] Resource name and identifier are both set correctly
