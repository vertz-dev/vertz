# Phase 2: Code Generators

## Context

We're building `@vertz/openapi` — a standalone tool that generates typed TypeScript SDKs from OpenAPI 3.x specs. Phase 1 built the parser (OpenAPI → internal types). This phase builds the generators that convert parsed data into TypeScript files.

**Design doc:** `plans/openapi-sdk-codegen.md`
**Depends on:** Phase 1 (parser types: `ParsedResource`, `ParsedOperation`, `ParsedSchema`)

The generators produce:
- `types/*.ts` — TypeScript interfaces from JSON Schema
- `resources/*.ts` — Typed SDK methods per resource
- `client.ts` — `HttpClient` interface + `createClient()` factory + `ApiError`
- `schemas/*.ts` — Zod schemas (opt-in, only when `schemas: true`)

---

## Tasks

### Task 1: JSON Schema → TypeScript converter

**Files:** (2)
- `packages/openapi/src/generators/json-schema-to-ts.ts` (new)
- `packages/openapi/src/generators/__tests__/json-schema-to-ts.test.ts` (new)

**What to implement:**

The core function that converts a JSON Schema object into a TypeScript type string.

```typescript
/**
 * Convert a JSON Schema to a TypeScript type expression string.
 * Returns the type as a string, e.g., 'string', 'Task', '{ id: string; name: string }'.
 */
export function jsonSchemaToTS(
  schema: Record<string, unknown>,
  namedSchemas: Map<string, string>,  // schema name → TS interface name
): string;

/**
 * Generate a full TypeScript interface declaration from a named schema.
 * Returns lines like: 'export interface Task { id: string; title: string; }'
 */
export function generateInterface(
  name: string,
  schema: Record<string, unknown>,
  namedSchemas: Map<string, string>,
): string;
```

**Type mapping (from design doc):**

| JSON Schema | TypeScript |
|-------------|-----------|
| `type: 'string'` | `string` |
| `type: 'number'` / `type: 'integer'` | `number` |
| `type: 'boolean'` | `boolean` |
| `type: 'array', items: T` | `T[]` |
| `type: 'object', properties: {...}` | Inline `{ ... }` or named interface |
| `enum: ['a', 'b']` | `'a' \| 'b'` |
| `$circular: 'Name'` sentinel | `Name` (forward reference) |
| `type: ['string', 'null']` (nullable) | `string \| null` |
| `allOf: [A, B]` (merged by resolver) | Merged properties |
| `additionalProperties: true` | `Record<string, unknown>` |
| No type / `{}` | `unknown` |

Handle `required` array to determine which properties are optional (`?`).

**Acceptance criteria:**
- [ ] Maps all primitive types correctly (string, number, boolean)
- [ ] Maps integer to number
- [ ] Maps arrays with typed items: `string[]`, `Task[]`
- [ ] Maps objects with properties to inline `{ key: type }` syntax
- [ ] Maps string enums to literal union types
- [ ] Uses named type reference for `$circular` sentinel
- [ ] Maps nullable types to `T | null`
- [ ] Handles `additionalProperties` → `Record<string, unknown>`
- [ ] Falls back to `unknown` for unrecognized schemas
- [ ] Marks non-required properties as optional with `?`
- [ ] `generateInterface()` produces a complete `export interface` declaration

---

### Task 2: Types generator

**Files:** (2)
- `packages/openapi/src/generators/types-generator.ts` (new)
- `packages/openapi/src/generators/__tests__/types-generator.test.ts` (new)

**What to implement:**

Generates `types/<resource>.ts` files with TypeScript interfaces for each resource's schemas.

```typescript
import type { GeneratedFile } from './types';
import type { ParsedResource, ParsedSchema } from '../parser/types';

/**
 * Generate types files for all resources + a barrel index.
 */
export function generateTypes(
  resources: ParsedResource[],
  schemas: ParsedSchema[],
): GeneratedFile[];
```

Each `types/<resource>.ts` file contains:
1. **Response interfaces** — from the response schemas of the resource's operations
2. **Input interfaces** — from the request body schemas (e.g., `CreateTaskInput`)
3. **Query interfaces** — from the query parameters (e.g., `ListTasksQuery`)

Also generates `types/index.ts` barrel re-export.

**Naming conventions:**
- Response type: Use the component schema name if it's a `$ref` (e.g., `Task`). Otherwise, derive from operationId: `GetTaskResponse`.
- Input type: Use the component schema name if available. Otherwise: `CreateTaskInput`, `UpdateTaskInput`.
- Query type: `ListTasksQuery`, `SearchUsersQuery` — derived from operationId + `Query`.

**Acceptance criteria:**
- [ ] Generates `types/<resource>.ts` with correct interfaces
- [ ] Generates `types/index.ts` barrel export
- [ ] Response interfaces use component schema names when available
- [ ] Input interfaces use component schema names when available
- [ ] Query parameter interfaces are generated from spec parameters
- [ ] Optional query params are marked with `?`
- [ ] Handles resources with no request body (no input interface)
- [ ] Handles resources with no query params (no query interface)
- [ ] Handles nullable fields correctly
- [ ] Handles array fields correctly (e.g., `tags: string[]`)

---

### Task 3: Resource SDK generator

**Files:** (2)
- `packages/openapi/src/generators/resource-generator.ts` (new)
- `packages/openapi/src/generators/__tests__/resource-generator.test.ts` (new)

**What to implement:**

Generates `resources/<resource>.ts` files with typed SDK methods.

```typescript
import type { GeneratedFile } from './types';
import type { ParsedResource } from '../parser/types';

/**
 * Generate resource SDK files for all resources + a barrel index.
 */
export function generateResources(resources: ParsedResource[]): GeneratedFile[];
```

Each `resources/<resource>.ts` file contains a factory function:

```typescript
export function createTasksResource(client: HttpClient) {
  return {
    list: (query?: ListTasksQuery): Promise<Task[]> =>
      client.get('/tasks', { query }),
    get: (taskId: string): Promise<Task> =>
      client.get(`/tasks/${encodeURIComponent(taskId)}`),
    create: (body: CreateTaskInput): Promise<Task> =>
      client.post('/tasks', body),
    // ...
  };
}
```

Key behaviors:
- Path parameters use `encodeURIComponent()`
- Query parameters use typed interface (from types generator)
- 204 responses return `Promise<void>`
- Method names come from the normalized operationId (Phase 1, Task 4)
- Imports types from `../types/<resource>`
- Imports `HttpClient` from `../client`

**Acceptance criteria:**
- [ ] Generates `resources/<resource>.ts` with factory function
- [ ] Generates `resources/index.ts` barrel export
- [ ] Path params use `encodeURIComponent()`
- [ ] Methods use typed query interface, not `Record<string, unknown>`
- [ ] 204 responses have `Promise<void>` return type
- [ ] POST/PUT/PATCH methods accept `body` parameter with typed input
- [ ] GET methods without path params (list) accept optional query
- [ ] GET methods with path params (get) accept ID + optional query
- [ ] DELETE methods accept ID parameter
- [ ] Non-CRUD methods (custom actions) use correct HTTP method and path
- [ ] Imports are correct (types from `../types/`, HttpClient from `../client`)

---

### Task 4: Client generator + ApiError

**Files:** (2)
- `packages/openapi/src/generators/client-generator.ts` (new)
- `packages/openapi/src/generators/__tests__/client-generator.test.ts` (new)

**What to implement:**

Generates `client.ts` with the `HttpClient` interface, `createClient()` factory, and `ApiError` class.

```typescript
import type { GeneratedFile } from './types';
import type { ParsedResource } from '../parser/types';

/**
 * Generate the main client.ts file.
 */
export function generateClient(
  resources: ParsedResource[],
  config: { baseURL?: string },
): GeneratedFile;
```

The generated `client.ts` must:
1. Define `HttpClient` interface (get, post, put, patch, delete)
2. Define `ClientOptions` interface (baseURL, headers, fetch)
3. Implement `createClient()` that creates an `HttpClient` and composes all resources
4. Define `ApiError` class with `status`, `data` (parsed JSON), `name` override, static `from()` factory
5. Use string concatenation for URLs (NOT `new URL()`)
6. Handle 204 No Content without calling `res.json()`
7. Serialize query params with `URLSearchParams`
8. Import and compose all resource factories

See design doc for the full generated `client.ts` example.

**Acceptance criteria:**
- [ ] Generated `HttpClient` interface has all 5 HTTP methods
- [ ] `createClient()` composes all resource factories
- [ ] Uses string concatenation for URL building (works with relative baseURL like `/api`)
- [ ] Handles 204 No Content (returns `undefined as T`, doesn't call `res.json()`)
- [ ] `ApiError` has `name = 'ApiError'`, `status`, parsed `data`, static `from()`
- [ ] Exports `Client` type as `ReturnType<typeof createClient>`
- [ ] Default `baseURL` is `''` (empty string)
- [ ] Supports custom `fetch` function via options

---

### Task 5: Zod schema generator (opt-in)

**Files:** (3)
- `packages/openapi/src/generators/json-schema-to-zod.ts` (new)
- `packages/openapi/src/generators/schema-generator.ts` (new)
- `packages/openapi/src/generators/__tests__/schema-generator.test.ts` (new)

**What to implement:**

Generates `schemas/<resource>.ts` with Zod schemas. Only runs when `schemas: true`.

```typescript
/**
 * Convert a JSON Schema to a Zod expression string.
 * Returns something like: 'z.object({ id: z.string().uuid(), ... })'
 */
export function jsonSchemaToZod(
  schema: Record<string, unknown>,
  namedSchemas: Map<string, string>,  // schema name → Zod variable name
): string;

/**
 * Generate schema files for all resources + barrel index.
 */
export function generateSchemas(
  resources: ParsedResource[],
  schemas: ParsedSchema[],
): GeneratedFile[];
```

**Zod mapping (from design doc):**

| JSON Schema | Zod |
|-------------|-----|
| `type: 'string'` | `z.string()` |
| `format: 'email'` | `z.string().email()` |
| `format: 'uuid'` | `z.string().uuid()` |
| `format: 'date-time'` | `z.string().datetime()` |
| `format: 'uri'` | `z.string().url()` |
| `minLength: N` | `.min(N)` |
| `maxLength: N` | `.max(N)` |
| `pattern: R` | `.regex(/R/)` |
| `type: 'number'` | `z.number()` |
| `minimum: N` | `.min(N)` |
| `maximum: N` | `.max(N)` |
| `type: 'integer'` | `z.number().int()` |
| `type: 'boolean'` | `z.boolean()` |
| `type: 'array'` | `z.array(T)` |
| `enum: [...]` | `z.enum([...])` |
| nullable | `.nullable()` |
| `default: V` | `.default(V)` |
| `$circular` sentinel | `z.lazy(() => schemaRef)` |
| optional property | `.optional()` |

**Acceptance criteria:**
- [ ] Generates `schemas/<resource>.ts` with Zod schemas
- [ ] Generates `schemas/index.ts` barrel export
- [ ] Maps all basic types correctly
- [ ] Maps string formats: email → `.email()`, uuid → `.uuid()`, datetime → `.datetime()`
- [ ] Maps string constraints: minLength → `.min()`, maxLength → `.max()`, pattern → `.regex()`
- [ ] Maps numeric constraints: minimum → `.min()`, maximum → `.max()`
- [ ] Maps integer to `z.number().int()`
- [ ] Maps enums to `z.enum([...])`
- [ ] Maps nullable to `.nullable()`
- [ ] Maps default values to `.default()`
- [ ] Uses `z.lazy()` for circular `$ref`s
- [ ] Marks optional properties with `.optional()`
- [ ] Imports `z` from `'zod'`

---

### Task 6: Generator orchestrator + GeneratedFile type + README

**Files:** (3)
- `packages/openapi/src/generators/types.ts` (new)
- `packages/openapi/src/generators/index.ts` (new)
- `packages/openapi/src/generators/__tests__/integration.test.ts` (new)

**What to implement:**

The orchestrator that calls all generators and produces the full set of generated files.

```typescript
// types.ts
export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateOptions {
  schemas?: boolean;   // default: false
  baseURL?: string;    // default: ''
}

// index.ts
import type { ParsedSpec } from '../parser/types';
import type { GeneratedFile, GenerateOptions } from './types';

/**
 * Generate all SDK files from a parsed spec.
 */
export function generateAll(
  spec: ParsedSpec,
  options?: GenerateOptions,
): GeneratedFile[];
```

Also generates `README.md` with:
- Usage example: `import { createClient } from './generated/client'`
- Available resources and methods
- Commit guidance: "We recommend committing generated code to source control."
- Regeneration command

**Integration test:** Given a complete OpenAPI spec fixture, verify that `generateAll()` produces all expected files, the output compiles with strict TypeScript, and the output has zero `@vertz/*` imports.

**Acceptance criteria:**
- [ ] `generateAll()` calls all generators and returns combined files
- [ ] When `schemas: false` (default), no `schemas/` files are generated
- [ ] When `schemas: true`, `schemas/` files are included
- [ ] Generates README.md with usage, resources, and commit guidance
- [ ] Integration: full pipeline from OpenAPI spec → generated files
- [ ] Integration: generated TypeScript compiles with `--strict`
- [ ] Integration: no `@vertz/*` imports in generated code
