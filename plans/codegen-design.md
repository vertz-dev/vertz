# @vertz/codegen Design Plan

## 1. Overview

`@vertz/codegen` is a standalone package that generates typed SDK clients and CLI clients from the Vertz compiler's `AppIR`. It ships with two built-in generators (TypeScript SDK and CLI) and an extensible plugin interface for future language targets (Python, Go).

The generated TypeScript SDK delegates all HTTP concerns (retries, streaming, auth) to `@vertz/fetch` — a shared, zero-dependency fetch client. The generated CLI delegates runtime behavior (parsing, interactive flows, OAuth) to `@vertz/cli-runtime`.

**Core principle**: Generators are pure functions. They receive an IR, return file contents. No filesystem I/O, no side effects. The orchestrator handles writing files and formatting.

---

## 2. Architecture

```
                ┌──────────────┐
                │  @vertz/compiler  │
                │  produces AppIR   │
                └──────┬───────┘
                       │
                       ▼
              ┌──────────────────┐
              │   IR Adapter      │
              │   AppIR → CodegenIR │
              └──────┬───────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐ ┌──────────┐ ┌─────────┐
   │ TS SDK  │ │ CLI      │ │ Future  │
   │Generator│ │Generator │ │(Py, Go) │
   └────┬────┘ └────┬─────┘ └────┬────┘
        │           │             │
        ▼           ▼             ▼
   GeneratedFile[]  GeneratedFile[]  GeneratedFile[]
        │           │             │
        └─────┬─────┘─────┬──────┘
              ▼            ▼
        ┌──────────┐  ┌──────────┐
        │ Biome    │  │ File     │
        │ Format   │  │ Writer   │
        └──────────┘  └──────────┘
```

### Runtime Package Dependencies

```
Generated SDK ──uses──▶ @vertz/fetch     (HTTP client, retries, streaming, auth)
Generated CLI ──uses──▶ @vertz/cli-runtime (parsing, interactive flows, OAuth)
```

### Why a Separate `CodegenIR`?

`AppIR` is a full application representation — dependency graphs, middleware chains, services, source locations, diagnostics. SDK generation only needs the **API surface**: modules, operations (routes), and schemas.

`CodegenIR` is a thin, flat projection of `AppIR` that:
- Strips internal details (DI graph, middleware internals, source locations)
- Flattens the module → router → route hierarchy into module → operation
- Resolves schema references into inline JSON Schema objects
- Is stable — changes to compiler internals don't break generators

---

## 3. Package Structure

```
packages/codegen/
  src/
    index.ts                     — public API: generate(), CodegenConfig
    types.ts                     — CodegenIR, Generator, GeneratedFile, Import
    ir-adapter.ts                — converts AppIR → CodegenIR
    json-schema-converter.ts     — JSON Schema → TypeScript type string
    generators/
      typescript/
        index.ts                 — TypeScriptSDKGenerator
        emit-client.ts           — generates sdk client module
        emit-types.ts            — generates type definitions
        emit-schemas.ts          — generates schema re-exports
        emit-index.ts            — generates barrel export
        emit-package-json.ts     — generates package.json for publishable SDK
        ts-type-utils.ts         — TS-specific naming, type conversion
      cli/
        index.ts                 — CLIGenerator
        emit-manifest.ts         — generates CLI command manifest
        emit-bin.ts              — generates CLI entry point
        emit-package-json.ts     — generates package.json for publishable CLI
    utils/
      imports.ts                 — Import type, mergeImports(), renderImports()
      naming.ts                  — toPascalCase, toCamelCase, toKebabCase
      formatting.ts              — post-process with Biome
    __tests__/
      ir-adapter.test.ts
      json-schema-converter.test.ts
      typescript/
        emit-client.test.ts
        emit-types.test.ts
        emit-schemas.test.ts
        emit-index.test.ts
        emit-package-json.test.ts
      cli/
        emit-manifest.test.ts
        emit-bin.test.ts
        emit-package-json.test.ts
      utils/
        imports.test.ts
        naming.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## 4. Core Types

### CodegenIR — The Generator's Input

```typescript
interface CodegenIR {
  basePath: string;
  version?: string;
  modules: CodegenModule[];
  schemas: CodegenSchema[];
  auth: CodegenAuth;
}

interface CodegenModule {
  name: string;                        // e.g., "users" or "billing.invoices"
  operations: CodegenOperation[];
}

interface CodegenOperation {
  operationId: string;                 // SDK method name, e.g., "listUsers"
  method: HttpMethod;                  // GET, POST, PUT, DELETE, PATCH
  path: string;                        // full path, e.g., "/api/v1/users/:id"
  description?: string;
  tags: string[];
  params?: JsonSchema;                 // path parameters
  query?: JsonSchema;                  // query string parameters
  body?: JsonSchema;                   // request body
  headers?: JsonSchema;                // request headers
  response?: JsonSchema;               // response body
  streaming?: StreamingConfig;         // streaming response configuration
  schemaRefs: OperationSchemaRefs;     // references to named schemas
  auth?: OperationAuth;               // auth requirements for this operation
}

/** Streaming configuration for an operation */
interface StreamingConfig {
  format: 'sse' | 'ndjson';           // streaming protocol
  eventSchema?: JsonSchema;           // schema for individual events/chunks
}

/** Auth requirements for a specific operation */
interface OperationAuth {
  required: boolean;
  schemes: string[];                   // references to auth scheme names
}

/** Tracks which named schemas an operation uses, for import generation */
interface OperationSchemaRefs {
  params?: string;                     // named schema name, if any
  query?: string;
  body?: string;
  headers?: string;
  response?: string;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

type JsonSchema = Record<string, unknown>;
```

### CodegenAuth — Application-Level Auth Configuration

Populated from the OpenAPI security schemes defined in the application. The SDK only offers auth methods that exist in the spec — no generic "set any header" auth.

```typescript
interface CodegenAuth {
  schemes: CodegenAuthScheme[];
}

type CodegenAuthScheme =
  | { type: 'bearer'; name: string; description?: string }
  | { type: 'basic'; name: string; description?: string }
  | { type: 'apiKey'; name: string; in: 'header' | 'query' | 'cookie'; paramName: string; description?: string }
  | { type: 'oauth2'; name: string; flows: OAuthFlows; description?: string };

interface OAuthFlows {
  authorizationCode?: { authorizationUrl: string; tokenUrl: string; scopes: Record<string, string> };
  clientCredentials?: { tokenUrl: string; scopes: Record<string, string> };
  deviceCode?: { deviceAuthorizationUrl: string; tokenUrl: string; scopes: Record<string, string> };
}
```

### CodegenSchema — Schema with Annotations

```typescript
interface CodegenSchema {
  name: string;                        // e.g., "CreateUserBody"
  jsonSchema: JsonSchema;
  annotations: SchemaAnnotations;
}

interface SchemaAnnotations {
  description?: string;
  deprecated?: boolean;
  brand?: string;                      // e.g., "UserId"
  namingParts: SchemaNamingParts;      // { operation: "create", entity: "User", part: "Body" }
}

interface SchemaNamingParts {
  operation?: string;
  entity?: string;
  part?: string;
}
```

### Generator Interface

```typescript
interface Generator {
  /** Unique identifier, e.g., "typescript", "cli" */
  readonly name: string;

  /** Produce output files from the codegen IR */
  generate(ir: CodegenIR, config: GeneratorConfig): GeneratedFile[];
}

interface GeneratedFile {
  /** Relative path from output directory, e.g., "sdk/client.ts" */
  path: string;
  /** File content as a string */
  content: string;
}

interface GeneratorConfig {
  /** Output directory relative to project root */
  outputDir: string;
  /** Generator-specific options */
  options: Record<string, unknown>;
}
```

### Import Management

```typescript
interface Import {
  from: string;                        // module specifier
  name: string;                        // imported name
  isType: boolean;                     // `import type` vs `import`
  alias?: string;                      // `import { X as Y }`
}

interface FileFragment {
  content: string;
  imports: Import[];
}
```

Each emit function returns a `FileFragment` — its content plus the imports it needs. The file assembler collects all fragments for a file, deduplicates imports with `mergeImports()`, and renders the final output.

---

## 5. IR Adapter

The adapter converts `AppIR` → `CodegenIR` by:

1. Extracting `basePath` and `version` from `AppDefinition`
2. Flattening `ModuleIR → RouterIR → RouteIR` into `CodegenModule → CodegenOperation`
3. Resolving `SchemaRef` (named or inline) into inline `JsonSchema` on each operation
4. Tracking which named schemas each operation references (for `schemaRefs`)
5. Collecting all named schemas into `CodegenSchema[]` with annotations from `SchemaIR.namingConvention`
6. Extracting auth schemes from security definitions into `CodegenAuth`
7. Extracting streaming configuration from route metadata into `StreamingConfig`
8. Sorting everything deterministically (modules by name, operations by path+method, schemas by name)

```typescript
// ir-adapter.ts
export function adaptIR(appIR: AppIR): CodegenIR {
  const schemaMap = buildSchemaMap(appIR.schemas);
  const modules = appIR.modules.map(mod => adaptModule(mod, schemaMap));
  const schemas = appIR.schemas
    .filter(s => s.isNamed && s.jsonSchema)
    .map(adaptSchema)
    .sort((a, b) => a.name.localeCompare(b.name));
  const auth = adaptAuth(appIR.app);

  return {
    basePath: appIR.app.basePath,
    version: appIR.app.version,
    modules: modules.sort((a, b) => a.name.localeCompare(b.name)),
    schemas,
    auth,
  };
}
```

---

## 6. JSON Schema → TypeScript Converter

A dedicated converter handles the `JsonSchema → string` conversion for TypeScript type generation. This is necessary because `AppIR` stores schemas as raw JSON Schema objects.

### Supported Conversions

| JSON Schema | TypeScript |
|---|---|
| `{ type: "string" }` | `string` |
| `{ type: "number" }` / `{ type: "integer" }` | `number` |
| `{ type: "boolean" }` | `boolean` |
| `{ type: "null" }` | `null` |
| `{ type: "array", items: T }` | `T[]` |
| `{ type: "object", properties: {...} }` | `{ prop: Type; ... }` |
| `{ enum: ["a", "b"] }` | `"a" \| "b"` |
| `{ const: "value" }` | `"value"` |
| `{ oneOf: [...] }` / `{ anyOf: [...] }` | `A \| B` |
| `{ allOf: [...] }` | `A & B` |
| `{ $ref: "#/$defs/Name" }` | `Name` (type reference) |
| `{ additionalProperties: T }` | `Record<string, T>` |

### Brands and Formats

| JSON Schema | TypeScript |
|---|---|
| `{ type: "string", format: "uuid" }` | `string` (with JSDoc `@format uuid`) |
| `{ type: "string", format: "email" }` | `string` (with JSDoc `@format email`) |
| schema with `brand` annotation | `string & { readonly __brand: "UserId" }` |

### Approach

```typescript
// json-schema-converter.ts
export function jsonSchemaToTypeString(
  schema: JsonSchema,
  namedSchemas: Map<string, string>,  // $ref target → TypeScript type name
): string
```

The converter is recursive and handles nested schemas. It does NOT handle `$defs` lifting — that's done during IR adaptation.

---

## 7. `@vertz/fetch` — Shared HTTP Client

A standalone, zero-dependency package that provides the HTTP layer for all generated SDKs. Generated code imports from `@vertz/fetch` instead of using raw `fetch` — this keeps generated output thin while providing production-grade HTTP capabilities.

Inspired by `@blimu/fetch`: auth strategies, retry logic, streaming, hooks.

### Package Structure

```
packages/fetch/
  src/
    index.ts              — public API
    client.ts             — FetchClient class
    types.ts              — config, auth, request/response types
    errors.ts             — typed error classes (BadRequest, Unauthorized, etc.)
    retry/
      index.ts            — retry logic with exponential/linear backoff
      types.ts            — RetryConfig
    streaming/
      index.ts            — SSE and NDJSON parsers
      parsers.ts          — stream format parsers
      types.ts            — StreamingFormat, StreamingConfig
    hooks/
      index.ts            — hook registry
      types.ts            — HooksConfig, lifecycle hook types
```

### Auth Strategies

Auth strategies are configured when creating the client. Each strategy type maps directly to an OpenAPI security scheme. Auth params accept functions for runtime resolution (e.g., fetching a fresh token before each request).

```typescript
type AuthStrategy =
  | { type: 'bearer'; token: string | (() => string | Promise<string>) }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apiKey'; key: string | (() => string | Promise<string>); location: 'header' | 'query' | 'cookie'; name: string }
  | { type: 'custom'; apply: (request: Request) => Request | Promise<Request> };

interface FetchClientConfig {
  baseURL?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: RetryConfig;
  hooks?: HooksConfig;
  authStrategies?: AuthStrategy[];
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
}
```

Key design decisions:
- **Token as function**: `token: () => getTokenFromStore()` enables dynamic auth without re-creating the client. The function is called before each request.
- **Spec-driven**: The generated SDK's `createClient()` only exposes auth options that exist in the OpenAPI spec. If the API has bearer auth, the config offers `token`. If it has API key auth, the config offers `apiKey`. No generic "set any header" escape hatch.
- **Multiple strategies**: An array of strategies allows combining auth methods (e.g., API key + bearer for different endpoints).

### Retry Logic

```typescript
interface RetryConfig {
  retries: number;                     // max retry attempts, default: 3
  strategy: 'exponential' | 'linear' | ((attempt: number, baseBackoff: number) => number);
  backoffMs: number;                   // base backoff, default: 100
  retryOn: number[];                   // status codes to retry, default: [429, 500, 502, 503, 504]
  retryOnError?: (error: Error) => boolean;
}
```

### Streaming — SSE and NDJSON

Streaming is a first-class concern, not a deferred feature. The client exposes a `requestStream()` method that returns an `AsyncGenerator`, enabling natural iteration over server-sent events or newline-delimited JSON.

```typescript
// FetchClient method
async *requestStream<T>(options: StreamingRequestOptions): AsyncGenerator<T> {
  // 1. Make request with appropriate Accept header
  // 2. Parse response body as SSE or NDJSON stream
  // 3. Yield typed events as they arrive
}

type StreamingFormat = 'sse' | 'ndjson';

interface StreamingRequestOptions extends RequestOptions {
  format: StreamingFormat;
}
```

**SSE parsing**: Handles `event`, `data`, `id`, and `retry` fields per the SSE spec. Only `data` events are yielded; connection management (retry, last-event-id) is handled internally.

**NDJSON parsing**: Splits on `\n`, parses each line as JSON, yields the result.

### Hooks

Lifecycle hooks for cross-cutting concerns (logging, metrics, auth refresh):

```typescript
interface HooksConfig {
  beforeRequest?: (request: Request) => void | Promise<void>;
  afterResponse?: (response: Response) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  beforeRetry?: (attempt: number, error: Error) => void | Promise<void>;
  onStreamStart?: () => void;
  onStreamChunk?: (chunk: unknown) => void;
  onStreamEnd?: () => void;
}
```

### Error Classes

Status-code-specific errors for type-safe catch handling:

```typescript
class FetchError extends Error {
  status: number;
  body?: unknown;
}

class BadRequestError extends FetchError { status = 400 }
class UnauthorizedError extends FetchError { status = 401 }
class ForbiddenError extends FetchError { status = 403 }
class NotFoundError extends FetchError { status = 404 }
// ... etc
```

---

## 8. TypeScript SDK Generator

### Generated Output Structure

All codegen output goes inside a `generated/` subfolder within the SDK package. Files outside `generated/` are **user-owned** — scaffolded once on first run, never overwritten.

```
my-sdk/                           — publishable package root (user-owned)
  package.json        — scaffolded once, never overwritten
  index.ts            — scaffolded once, never overwritten (user adds custom re-exports)
  src/                — user's custom utilities (optional, entirely user-owned)
    helpers.ts
    middleware.ts
  generated/          — codegen-owned, overwritten on generate
    client.ts         — createClient() that composes all modules
    modules/          — one file per module (incremental-friendly)
      users.ts        — users namespace methods
      billing.ts      — billing namespace methods
    types/            — one file per module
      users.ts        — types for users operations
      billing.ts      — types for billing operations
      shared.ts       — named schemas used across modules
      augment.ts      — type augmentation entry point (declare module)
    schemas.ts        — re-exports of @vertz/schema objects
    index.ts          — barrel export of all generated code
```

This per-module file layout enables **incremental regeneration** during `vertz dev` — changing a route only rewrites the affected module file and its types, not the entire SDK (see Section 17).

**Rules**:
1. `generated/` is codegen-owned — users must never edit files in there
2. Root `index.ts` is **scaffolded once** — if it already exists, codegen does not touch it
3. Root `package.json` is **scaffolded once** — same rule, never overwritten
4. The scaffolded `index.ts` re-exports everything from `generated/` by default, but users can add their own exports
5. Users add custom utilities anywhere outside `generated/` (e.g., `src/helpers.ts`) and re-export from root `index.ts`
6. `vertz generate` (CLI/CI) does a **full regeneration** — overwrites all files in `generated/`
7. `vertz dev` (watch mode) does **incremental regeneration** — only rewrites changed files (see Section 17)

**Scaffolded `index.ts`** (generated only if file doesn't exist):

```typescript
// This file is yours — add custom re-exports and utilities here.
// The generated/ folder is overwritten on every `vertz generate`.

export * from './generated';

// Add your custom exports below:
// export { myHelper } from './src/helpers';
```

**Non-publishable mode** (default): output goes to `.vertz/generated/` — no scaffolded files, the `generated/` folder is the entire output. This is for internal consumption (e.g., same-repo frontend importing types).

```
.vertz/
  generated/          — codegen-owned, gitignored
    client.ts
    modules/
      users.ts
      billing.ts
    types/
      users.ts
      billing.ts
      shared.ts
    schemas.ts
    index.ts
```

### client.ts — The SDK Client

The generated client imports `FetchClient` from `@vertz/fetch` instead of using raw `fetch`. This keeps the generated code thin — just typed method signatures and path building — while inheriting retries, streaming, auth, and error handling from the shared package.

```typescript
// Generated by @vertz/codegen — do not edit

import { FetchClient } from '@vertz/fetch';
import type { FetchClientConfig, AuthStrategy } from '@vertz/fetch';
import type {
  ListUsersQuery, ListUsersResponse,
  GetUserParams, GetUserResponse,
  CreateUserBody, CreateUserResponse,
  StreamEventsResponse,
} from './types';

export interface SDKConfig extends FetchClientConfig {
  /** Bearer token or function returning a token. Only available because the API defines bearer auth. */
  token?: string | (() => string | Promise<string>);
}

export interface SDKResult<T> {
  data: T;
  status: number;
  headers: Headers;
}

export function createClient(config: SDKConfig) {
  // Build auth strategies from spec-driven config
  const authStrategies: AuthStrategy[] = [...(config.authStrategies ?? [])];
  if (config.token) {
    authStrategies.push({ type: 'bearer', token: config.token });
  }

  const client = new FetchClient({
    ...config,
    authStrategies,
  });

  return {
    users: {
      list(input?: { query?: ListUsersQuery }): Promise<SDKResult<ListUsersResponse>> {
        return client.request('GET', '/api/v1/users', { query: input?.query });
      },
      get(input: { params: GetUserParams }): Promise<SDKResult<GetUserResponse>> {
        return client.request('GET', `/api/v1/users/${input.params.id}`);
      },
      create(input: { body: CreateUserBody }): Promise<SDKResult<CreateUserResponse>> {
        return client.request('POST', '/api/v1/users', { body: input.body });
      },
    },
    events: {
      /** Returns an async generator that yields events as they arrive via SSE. */
      async *stream(input?: { query?: StreamEventsQuery }): AsyncGenerator<StreamEventsResponse> {
        yield* client.requestStream<StreamEventsResponse>({
          method: 'GET',
          path: '/api/v1/events',
          query: input?.query,
          format: 'sse',
        });
      },
    },
  };
}
```

### Auth Configuration — Spec-Driven

The generated `SDKConfig` interface is tailored to the API's actual security schemes. If the OpenAPI spec defines bearer auth, the config gets a `token` field. If it defines API key auth, it gets an `apiKey` field. If it defines both, it gets both.

```typescript
// API with bearer auth only
export interface SDKConfig extends FetchClientConfig {
  token?: string | (() => string | Promise<string>);
}

// API with API key auth only
export interface SDKConfig extends FetchClientConfig {
  apiKey?: string | (() => string | Promise<string>);
}

// API with both bearer and API key
export interface SDKConfig extends FetchClientConfig {
  token?: string | (() => string | Promise<string>);
  apiKey?: string | (() => string | Promise<string>);
}

// API with no auth
export interface SDKConfig extends FetchClientConfig {}
```

**Function-based auth**: All auth fields accept functions (not just static values). This enables:
- Token refresh: `token: () => authStore.getAccessToken()`
- Environment-based keys: `apiKey: () => process.env.API_KEY!`
- Async resolution: `token: async () => await refreshTokenIfExpired()`

### Streaming Methods

Operations marked with `streaming` in the IR generate async generator methods instead of Promise-returning methods:

```typescript
// Non-streaming: returns Promise<SDKResult<T>>
list(input?: { query?: ListQuery }): Promise<SDKResult<ListResponse>>

// Streaming: returns AsyncGenerator<T>
async *stream(input?: { query?: StreamQuery }): AsyncGenerator<EventPayload>
```

The caller consumes streaming responses naturally with `for await`:

```typescript
const api = createClient({ baseUrl: 'http://localhost:3000', token: myToken });

for await (const event of api.events.stream()) {
  console.log(event.type, event.data);
}
```

### Design Decisions — SDK Shape

**Options-bag pattern** (not positional params):

```typescript
// YES — explicit, extensible, LLM-friendly
api.users.get({ params: { id: "abc" } })
api.users.create({ body: { name: "Alice" } })
api.users.list({ query: { page: 1 }, headers: { "x-tenant": "acme" } })

// NO — positional is ambiguous when operations have multiple input types
api.users.get("abc")
```

Rationale:
- Every operation has the same shape: `{ params?, query?, body?, headers? }`
- LLMs can generate correct calls by following the pattern
- Adding headers/query to an existing call doesn't change the API
- Aligns with Vertz's "one way to do things" philosophy

**`createClient()` function** (not class):

```typescript
const api = createClient({ baseUrl: 'http://localhost:3000' });
```

- Functions are simpler than classes
- Tree-shakeable — unused modules can be eliminated
- Aligns with Vertz's functional style (no decorators, no classes in user code)

### types.ts — Operation Types

```typescript
// Generated by @vertz/codegen — do not edit

/** Query parameters for listUsers */
export interface ListUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
}

/** Response type for listUsers */
export interface ListUsersResponse {
  items: User[];
  total: number;
}

/** Path parameters for getUser */
export interface GetUserParams {
  id: string;
}

// ... etc
```

Types are generated from JSON Schema using the converter (Section 6). Named schemas produce shared types; inline schemas produce operation-specific types.

### schemas.ts — Schema Re-exports

```typescript
// Generated by @vertz/codegen — do not edit

export { createUserBodySchema } from '../../src/schemas/user';
export { updateUserBodySchema } from '../../src/schemas/user';
export { userResponseSchema } from '../../src/schemas/user';
```

This file re-exports the original `@vertz/schema` objects so consumers can use them for client-side validation. It's only generated for TypeScript SDK (non-TS SDKs generate standalone types).

**Note**: Schema re-exports require that the consumer's project has `@vertz/schema` as a dependency. The generated `index.ts` barrel does NOT re-export `schemas.ts` by default — it's an opt-in import for consumers who need runtime validation.

### index.ts — Barrel Export

```typescript
// Generated by @vertz/codegen — do not edit

export { createClient } from './client';
export type { SDKConfig, SDKResult } from './client';
export type * from './types';
```

### SDK as Publishable npm Package

When `typescript.publishable` is enabled in config, the generator produces a complete npm package that can be published (public or private):

```typescript
// Generated package.json
{
  "name": "@myapp/sdk",              // from config
  "version": "0.0.0",               // bumped by CI
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./types": {
      "import": "./dist/types/index.js",
      "types": "./dist/types/index.d.ts"
    }
  },
  "dependencies": {
    "@vertz/fetch": "workspace:*"
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  }
}
```

The `"./types"` sub-path export is important for type augmentation (see Section 9).

The generated output directory becomes a self-contained package:

```
sdk/
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    client.ts
    types.ts
    types/
      augment.ts
    schemas.ts
    index.ts
```

**CI workflow**: `vertz build` → generates SDK → `cd sdk && npm publish`. The version is managed externally (changesets, CI variables, etc.).

---

## 9. CLI Generator

The CLI generator produces a **command manifest** — a data structure describing all available commands, their arguments, and types. A `@vertz/cli-runtime` package consumes this manifest at runtime to produce a complete CLI.

### Generated Output

When `cli.publishable` is enabled, the generator produces a complete, publishable CLI package:

```
cli/
  package.json          — publishable npm package
  bin/
    cli.ts              — entry point (#!/usr/bin/env node)
  src/
    manifest.ts         — command definitions and types
    interactive.ts      — interactive parameter resolvers (if configured)
    index.ts            — barrel export
```

When `cli.publishable` is not enabled, output is minimal:

```
.vertz/generated/
  cli/
    manifest.ts         — command definitions and types
    index.ts            — barrel export
```

### manifest.ts

```typescript
// Generated by @vertz/codegen — do not edit

import type { CommandManifest } from '@vertz/cli-runtime';

export const commands: CommandManifest = {
  users: {
    list: {
      method: 'GET',
      path: '/api/v1/users',
      description: 'List all users',
      query: {
        page: { type: 'number', description: 'Page number', required: false },
        limit: { type: 'number', description: 'Items per page', required: false },
      },
    },
    get: {
      method: 'GET',
      path: '/api/v1/users/:id',
      description: 'Get a user by ID',
      params: {
        id: { type: 'string', description: 'User ID', required: true },
      },
    },
    create: {
      method: 'POST',
      path: '/api/v1/users',
      description: 'Create a new user',
      body: {
        name: { type: 'string', required: true },
        email: { type: 'string', required: true },
        role: { type: 'string', enum: ['admin', 'user'], required: false },
      },
    },
  },
};
```

### bin/cli.ts — Entry Point (publishable mode)

```typescript
#!/usr/bin/env node
// Generated by @vertz/codegen — do not edit

import { createCLI } from '@vertz/cli-runtime';
import { commands } from '../src/manifest';
import { resolvers } from '../src/interactive';

const cli = createCLI({
  name: 'myapp',
  version: '0.0.0',
  commands,
  resolvers,
});

cli.run(process.argv.slice(2));
```

### Generated package.json (publishable mode)

```json
{
  "name": "@myapp/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": {
    "myapp": "./dist/bin/cli.js"
  },
  "dependencies": {
    "@vertz/cli-runtime": "workspace:*",
    "@vertz/fetch": "workspace:*"
  },
  "scripts": {
    "build": "tsup"
  }
}
```

**SaaS use case**: A single Vertz app produces three publishable artifacts — the API server, the SDK (`@myapp/sdk`), and the CLI (`@myapp/cli`) — all generated from the same route definitions.

---

## 10. `@vertz/cli-runtime` — CLI Runtime Package

A separate, open-source package that combines a command manifest + common interactive flows to produce a complete CLI tool. This is a runtime dependency of generated CLIs, not a codegen dependency.

### Responsibilities

- **Argument parsing**: Maps CLI args/flags to operation parameters
- **Help text generation**: Produces `--help` output from manifest descriptions
- **Output formatting**: JSON, table, and human-readable output modes
- **Error formatting**: Maps HTTP errors to CLI-friendly messages
- **Auth flows**: Built-in OAuth device code flow, API key management
- **Interactive parameter resolution**: Prompts users for missing parameters

### Interactive Parameter Resolution

When a required parameter is missing from CLI args, the runtime can interactively resolve it. This is configured via **resolvers** — functions that fetch options and prompt the user.

Example: user runs `myapp users get` without providing `--workspace-id`. The CLI fetches available workspaces and prompts the user to select one.

```typescript
// @vertz/cli-runtime types
interface ParameterResolver {
  /** The parameter this resolver handles */
  param: string;
  /** Fetch available options for the user to choose from */
  fetchOptions: (context: ResolverContext) => Promise<SelectOption[]>;
  /** Display label for the prompt */
  prompt: string;
}

interface SelectOption {
  label: string;
  value: string;
  description?: string;
}

interface ResolverContext {
  client: FetchClient;                 // authenticated client for fetching options
  args: Record<string, unknown>;       // already-provided args
}
```

### Sidecar Configuration for Resolvers

Route authors can define interactive resolvers via a sidecar file next to their route definition:

```
src/
  routes/
    users/
      get.ts                — route handler
      get.cli.ts            — CLI-specific resolver config (sidecar)
```

```typescript
// get.cli.ts
import type { CLIRouteConfig } from '@vertz/cli-runtime';

export default {
  resolvers: {
    workspace_id: {
      prompt: 'Select a workspace',
      fetchOptions: async (ctx) => {
        const { data } = await ctx.client.request('GET', '/api/v1/workspaces');
        return data.items.map(w => ({ label: w.name, value: w.id }));
      },
    },
  },
} satisfies CLIRouteConfig;
```

The codegen pipeline detects these sidecar files and includes them in the generated `interactive.ts`.

### Auth Flows

The runtime provides built-in auth flows that the generated CLI can use:

- **OAuth Device Code Flow**: `myapp auth login` initiates device code flow, stores tokens
- **API Key**: `myapp auth set-key <key>` stores API key in config
- **Token refresh**: Automatic access token refresh using stored refresh token

Auth configuration is derived from the API's OpenAPI security schemes (via `CodegenAuth`).

---

## 11. Type Augmentation for Customer-Specific Types

For SaaS platforms where customers define custom resource types, the generated SDK supports type augmentation via TypeScript's `declare module` pattern.

### The Problem

A SaaS platform (e.g., an auth provider like Blimu) defines generic types:

```typescript
// In the base SDK
export type ResourceType = string;
export type PlanType = string;
```

But each customer has specific resources (`'organization' | 'workspace' | 'project'`) and plans (`'free' | 'pro' | 'enterprise'`). Without augmentation, the SDK is loosely typed — all resource params accept any string.

### The Pattern

Inspired by `@blimu/types`: base types live in a sub-path export (`@myapp/sdk/types`), and customers override them via `declare module`.

**Step 1 — Generated base types (in `types/augment.ts`)**:

```typescript
// Generated by @vertz/codegen — do not edit

/** Base types for augmentation. Override via `declare module '@myapp/sdk/types'`. */
export interface AugmentableTypes {
  ResourceType: string;
  PlanType: string;
  EntitlementType: string;
}

export type ResourceType = AugmentableTypes['ResourceType'];
export type PlanType = AugmentableTypes['PlanType'];
export type EntitlementType = AugmentableTypes['EntitlementType'];
```

**Step 2 — Customer augments in their project**:

```typescript
// In the customer's project: types/myapp.d.ts
declare module '@myapp/sdk/types' {
  interface AugmentableTypes {
    ResourceType: 'organization' | 'workspace' | 'project';
    PlanType: 'free' | 'pro' | 'enterprise';
    EntitlementType: 'seats' | 'storage' | 'api_calls';
  }
}
```

**Step 3 — SDK methods automatically narrow**:

```typescript
// Before augmentation:
api.resources.create({ body: { type: string } })        // any string

// After augmentation:
api.resources.create({ body: { type: 'organization' } }) // only valid types
```

### How the Codegen Knows

The `CodegenIR` includes an `augmentableTypes` list in schema annotations. When a schema property references an augmentable type (identified by convention or explicit annotation), the converter emits a reference to the augmentable type instead of inlining `string`.

### When to Generate

Type augmentation files are only generated when:
1. The `typescript.augmentableTypes` config is set, OR
2. The IR contains schemas annotated with augmentable type references

For most APIs, this is not needed. It's an advanced feature for SaaS platforms that serve multiple customers with different configurations.

---

## 12. Template System: Tagged Template Functions

### Why Not Handlebars/EJS/Eta?

| Criterion | Template Engine | Tagged Template Functions |
|---|---|---|
| Type safety | None — templates are strings | Full TypeScript types |
| IDE support | Limited — syntax highlighting only | Full IntelliSense, refactoring |
| Syntax highlighting | Requires custom plugin | Tagged functions enable editor extensions (e.g., `ts\`...\``) |
| Testing | Requires rendering + snapshot | Unit-test each function |
| Dependencies | External package | Zero |
| Learning curve | Template syntax + helpers | Just TypeScript |
| LLM readability | Template syntax is unfamiliar | Plain TypeScript functions |

### Tagged Template Functions for Syntax Highlighting

Tagged template functions (not just template literals) can enable syntax highlighting via editor extensions. A `ts` tag function signals to the editor that the template content is TypeScript:

```typescript
// A tagged template function that enables TS syntax highlighting in editors
function ts(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw(strings, ...values);
}

// Usage — editors with a ts-tagged-template extension highlight the inner code
const code = ts`
  export interface ${name} {
    ${properties.join(';\n    ')};
  }
`;
```

This is purely an ergonomic improvement for codegen developers reading/writing emit functions. The tag function itself is identity — it just concatenates the template. The value comes from editor extensions that recognize the `ts` tag and apply TypeScript syntax highlighting to the template content.

### Pattern: Emit Functions

Each piece of generated code is produced by a pure function that returns a `FileFragment`:

```typescript
function emitOperationMethod(op: CodegenOperation): FileFragment {
  const imports: Import[] = [];
  const inputType = `${toPascalCase(op.operationId)}Input`;
  const resultType = `${toPascalCase(op.operationId)}Response`;

  imports.push({ from: './types', name: inputType, isType: true });
  imports.push({ from: './types', name: resultType, isType: true });

  const hasInput = op.params || op.query || op.body || op.headers;
  const inputParam = hasInput ? `input: ${inputType}` : '';
  const pathExpr = buildPathExpression(op.path);

  const content = ts`
${toCamelCase(op.operationId)}(${inputParam}): Promise<SDKResult<${resultType}>> {
  return client.request('${op.method}', ${pathExpr}${buildRequestOptions(op)});
},`;

  return { content, imports };
}
```

### File Assembly

```typescript
function assembleFile(header: string, fragments: FileFragment[]): string {
  const allImports = mergeImports(fragments.flatMap(f => f.imports));
  const importBlock = renderImports(allImports);
  const body = fragments.map(f => f.content).join('\n\n');

  return [header, importBlock, '', body, ''].join('\n');
}
```

### Import Deduplication

```typescript
function mergeImports(imports: Import[]): Import[] {
  // Group by `from` module
  // Within each group, deduplicate by name
  // Separate type imports from value imports
  // Sort groups alphabetically by `from`
  // Sort names within each group alphabetically
}

function renderImports(imports: Import[]): string {
  // Render `import type { A, B } from './types';`
  // Render `import { C, D } from './client';`
  // Separate type and value import groups
}
```

---

## 13. Shared Utilities vs. Per-Generator Code

### Shared (in `utils/`)

- **`imports.ts`**: `Import` type, `mergeImports()`, `renderImports()` — works for any TypeScript-family output
- **`naming.ts`**: `toPascalCase()`, `toCamelCase()`, `toKebabCase()`, `toSnakeCase()` — language-agnostic string transforms
- **`formatting.ts`**: `formatWithBiome()` — post-processes generated TypeScript

### Per-Generator

- **Type conversion**: `jsonSchemaToTypeString()` is TypeScript-specific. A Go generator would have `jsonSchemaToGoType()`. Accept the duplication — type conversion is inherently language-specific.
- **Emit functions**: Each generator has its own emit functions. No shared "emit" abstraction.
- **Path building**: `buildPathExpression()` is TypeScript-specific (template literal interpolation). Go would use `fmt.Sprintf`.

### IR-Level Traversal (Shared)

```typescript
// Useful for any generator
function operationsByModule(ir: CodegenIR): Map<string, CodegenOperation[]>
function allOperations(ir: CodegenIR): CodegenOperation[]
function namedSchemas(ir: CodegenIR): CodegenSchema[]
function operationInputSchemas(op: CodegenOperation): JsonSchema[]
function streamingOperations(ir: CodegenIR): CodegenOperation[]
```

---

## 14. Configuration

### Codegen Config (in `vertz.config.ts`)

```typescript
interface VertzConfig {
  // ... existing config
  codegen?: CodegenConfig;
}

interface CodegenConfig {
  /** Generators to run. Default: ['typescript'] */
  generators: GeneratorName[];

  /** Output directory. Default: '.vertz/generated' */
  outputDir?: string;

  /** TypeScript SDK options */
  typescript?: {
    /** Generate schema re-exports. Default: true */
    schemas?: boolean;
    /** SDK client function name. Default: 'createClient' */
    clientName?: string;
    /** Generate as publishable npm package. Default: false */
    publishable?: {
      /** Package name, e.g., '@myapp/sdk' */
      name: string;
      /** Output directory for the package. e.g., 'packages/sdk' */
      outputDir: string;
      /** Package version. Default: '0.0.0' */
      version?: string;
    };
    /** Augmentable types for customer-specific type narrowing */
    augmentableTypes?: string[];
  };

  /** CLI options */
  cli?: {
    /** Include in generation. Default: false */
    enabled?: boolean;
    /** Generate as publishable npm package. Default: false */
    publishable?: {
      /** Package name, e.g., '@myapp/cli' */
      name: string;
      /** Output directory for the package. e.g., 'packages/cli' */
      outputDir: string;
      /** CLI binary name, e.g., 'myapp' */
      binName: string;
      /** Package version. Default: '0.0.0' */
      version?: string;
    };
  };
}

type GeneratorName = 'typescript' | 'cli';
```

---

## 15. Output Location

Two modes based on configuration:

### Non-publishable (default)

Output goes to `.vertz/generated/` — the entire folder is codegen-owned and gitignored:

```
.vertz/
  generated/          ← fully overwritten, gitignored
    client.ts
    types.ts
    schemas.ts
    index.ts
```

Rationale:
- Avoids merge conflicts on generated code
- Keeps the repo clean
- IDE picks up types via `tsconfig.json` paths
- CI runs `vertz build` before consuming generated types

### Publishable

Output goes to a user-configured directory (e.g., `packages/sdk/`). Codegen only writes inside the `generated/` subfolder — everything outside is user-owned:

```
packages/sdk/         ← user-owned root
  package.json        ← scaffolded once, never overwritten
  index.ts            ← scaffolded once, never overwritten
  src/                ← user's custom code (untouched by codegen)
  generated/          ← codegen-owned, fully overwritten
    client.ts
    types.ts
    schemas.ts
    index.ts
```

The `generated/` subfolder should have its own `.gitignore` with just a comment header (`# Generated by @vertz/codegen — do not edit`) but the files are **committed** since this is a publishable package. Alternatively, users can gitignore `generated/` and regenerate in CI before publishing — both workflows are supported.

**Scaffold behavior**: On first `vertz generate`, if the target directory doesn't have `package.json` or `index.ts`, codegen creates starter versions. On subsequent runs, it only overwrites files inside `generated/`. This ensures user customizations (custom utilities, extra re-exports in `index.ts`, updated `package.json` fields) are never lost.

---

## 16. Formatting Pipeline

All generated TypeScript files are post-processed with Biome (already in the project):

```typescript
async function formatGeneratedFiles(files: GeneratedFile[], projectRoot: string): Promise<GeneratedFile[]> {
  // Write files to temp location
  // Run: bunx biome format --write <tempDir>
  // Read back formatted content
  // Return updated GeneratedFile[]
}
```

This decouples generators from formatting concerns. Emit functions can focus on correctness, not whitespace.

---

## 17. Incremental Regeneration (`vertz dev`)

### Two Modes

| Mode | Trigger | Behavior |
|---|---|---|
| **Full** | `vertz generate` (CLI/CI) | Regenerate all files in `generated/` |
| **Incremental** | `vertz dev` (watch mode) | Only regenerate files affected by the change |

### Why Per-Module Files Matter

The generated output is split into **one file per module** (see Section 8):

```
generated/
  client.ts              ← imports all module namespaces
  modules/
    users.ts             ← methods for users module
    billing.ts           ← methods for billing module
  types/
    users.ts             ← types for users operations
    billing.ts           ← types for billing operations
    shared.ts            ← named schemas used across modules
```

This layout makes incremental regeneration possible. Each module is self-contained — its methods live in `modules/{name}.ts` and its types live in `types/{name}.ts`.

### What Triggers What

| Change | Files Regenerated |
|---|---|
| **Edit a route** (change query params, body schema, response) | `modules/{module}.ts` + `types/{module}.ts` |
| **Add a route** to an existing router | `modules/{module}.ts` + `types/{module}.ts` |
| **Remove a route** from an existing router | `modules/{module}.ts` + `types/{module}.ts` |
| **Add a new router** (new module) | `modules/{module}.ts` + `types/{module}.ts` + `client.ts` + `index.ts` |
| **Remove a router** (delete module) | Delete `modules/{module}.ts` + `types/{module}.ts` + rewrite `client.ts` + `index.ts` |
| **Edit a named schema** | `types/shared.ts` (the schema definition) — module files just import the type |
| **Change auth/middleware** | `client.ts` (auth config types) |

The key insight: **adding or editing routes within an existing module never touches `client.ts`**. The client file only changes when modules are added or removed, because it imports module namespaces.

### How It Works

1. The compiler's watch mode detects a source file change and produces a new `AppIR`
2. The codegen compares the new `CodegenIR` against the previous one (kept in memory during dev)
3. It computes a **changeset**: which modules changed, which schemas changed, whether the module list changed
4. Only affected files are regenerated, formatted, and written to disk

```typescript
interface CodegenChangeset {
  /** Modules whose operations changed (route add/edit/remove) */
  changedModules: string[];
  /** Modules that were added (need new files + client.ts update) */
  addedModules: string[];
  /** Modules that were removed (delete files + client.ts update) */
  removedModules: string[];
  /** Whether shared schemas changed */
  sharedSchemasChanged: boolean;
  /** Whether auth/global config changed */
  globalConfigChanged: boolean;
}

function computeChangeset(prev: CodegenIR, next: CodegenIR): CodegenChangeset
```

### `client.ts` Structure for Incremental Friendliness

The client file imports each module namespace from its own file:

```typescript
// generated/client.ts
import { FetchClient } from '@vertz/fetch';
import { createUsersModule } from './modules/users';
import { createBillingModule } from './modules/billing';

export function createClient(config: SDKConfig) {
  const client = new FetchClient({ ...config, authStrategies });

  return {
    users: createUsersModule(client),
    billing: createBillingModule(client),
  };
}
```

```typescript
// generated/modules/users.ts
import type { FetchClient } from '@vertz/fetch';
import type { ListUsersInput, ListUsersResponse, ... } from '../types/users';

export function createUsersModule(client: FetchClient) {
  return {
    list(input?: ListUsersInput) { ... },
    get(input: GetUserInput) { ... },
    create(input: CreateUserInput) { ... },
  };
}
```

Adding a route to `users` only changes `modules/users.ts` and `types/users.ts`. The `client.ts` doesn't change because it already imports `createUsersModule`.

### Performance

During `vertz dev`, incremental regeneration should be **< 50ms** for single-route changes:
- IR diff: ~1ms (shallow object comparison)
- Emit 1 module file: ~1ms (string concatenation)
- Emit 1 types file: ~1ms
- Format 2 files with Biome: ~30ms
- Write 2 files: ~5ms

Full regeneration (`vertz generate`) remains the same — regenerate everything, no diffing.

---

## 18. Testing Strategy

### Unit Tests (per emit function)

Each emit function is tested in isolation with a fixture `CodegenOperation` or `CodegenSchema`:

```typescript
test('emitOperationMethod generates GET with query params', () => {
  const op: CodegenOperation = {
    operationId: 'listUsers',
    method: 'GET',
    path: '/api/v1/users',
    query: { type: 'object', properties: { page: { type: 'number' } } },
    // ...
  };

  const result = emitOperationMethod(op);

  expect(result.content).toContain('listUsers(input: ListUsersInput)');
  expect(result.content).toContain("client.request('GET', '/api/v1/users'");
  expect(result.imports).toContainEqual({
    from: './types', name: 'ListUsersInput', isType: true,
  });
});

test('emitOperationMethod generates streaming method for SSE operations', () => {
  const op: CodegenOperation = {
    operationId: 'streamEvents',
    method: 'GET',
    path: '/api/v1/events',
    streaming: { format: 'sse' },
    // ...
  };

  const result = emitOperationMethod(op);

  expect(result.content).toContain('async *streamEvents');
  expect(result.content).toContain("client.requestStream");
  expect(result.content).toContain("format: 'sse'");
});
```

### IR Adapter Tests

```typescript
test('adaptIR flattens module → router → route into module → operation', () => {
  const appIR = createFixtureAppIR();
  const codegenIR = adaptIR(appIR);

  expect(codegenIR.modules).toHaveLength(1);
  expect(codegenIR.modules[0].operations).toHaveLength(3);
});

test('adaptIR extracts auth schemes from security definitions', () => {
  const appIR = createFixtureAppIR({ security: [{ type: 'bearer' }] });
  const codegenIR = adaptIR(appIR);

  expect(codegenIR.auth.schemes).toHaveLength(1);
  expect(codegenIR.auth.schemes[0].type).toBe('bearer');
});
```

### JSON Schema Converter Tests

```typescript
test('converts object schema to interface-like string', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
    required: ['name'],
  };

  expect(jsonSchemaToTypeString(schema, new Map())).toBe(
    '{ name: string; age?: number }'
  );
});
```

### Snapshot Tests (full generator output)

```typescript
test('TypeScript SDK generator produces expected output', () => {
  const ir = createFixtureCodegenIR();
  const generator = new TypeScriptSDKGenerator();
  const files = generator.generate(ir, defaultConfig);

  for (const file of files) {
    expect(file.content).toMatchSnapshot(file.path);
  }
});
```

### Compile Tests

```typescript
test('generated TypeScript compiles without errors', async () => {
  const ir = createFixtureCodegenIR();
  const generator = new TypeScriptSDKGenerator();
  const files = generator.generate(ir, defaultConfig);

  // Write to temp dir, run tsc --noEmit
  const result = await compileGeneratedFiles(files);
  expect(result.exitCode).toBe(0);
}, 30_000);
```

---

## 19. Implementation Phases

### Phase 1: `@vertz/fetch` — Shared HTTP Client (~55 tests)

**The foundation that generated SDKs build on. Must exist before SDK codegen.**

1. Create `packages/fetch` with package.json, tsconfig, vitest config
2. Define types: `FetchClientConfig`, `AuthStrategy`, `RetryConfig`, `StreamingFormat`
3. Implement `FetchClient.request()` — basic fetch wrapper with error handling
4. Implement auth strategy application (bearer, basic, apiKey, custom)
5. Implement retry logic (exponential, linear, custom function)
6. Implement `FetchClient.requestStream()` — SSE parser + async generator
7. Implement NDJSON stream parser
8. Implement typed error classes (`BadRequestError`, `UnauthorizedError`, etc.)
9. Implement hooks registry (beforeRequest, afterResponse, onError, etc.)

### Phase 2: Foundation — CodegenIR + IR Adapter (~50 tests)

**Package setup + CodegenIR + IR adapter**

1. Create `packages/codegen` with package.json, tsconfig, vitest config
2. Define `CodegenIR` types in `types.ts` (including `CodegenAuth`, `StreamingConfig`)
3. Implement `adaptIR()` in `ir-adapter.ts`
   - Flatten module → router → route hierarchy
   - Resolve schema references
   - Collect named schemas
   - Extract auth schemes
   - Extract streaming configuration
   - Deterministic sorting
4. Implement `naming.ts` utilities
   - `toPascalCase`, `toCamelCase`, `toKebabCase`, `toSnakeCase`
5. Implement `imports.ts` utilities
   - `mergeImports()`, `renderImports()`

### Phase 3: JSON Schema Converter (~40 tests)

**JSON Schema → TypeScript type string**

1. Primitives: string, number, boolean, null
2. Objects with properties and required fields
3. Arrays with items
4. Enums and const values
5. Union types (oneOf, anyOf)
6. Intersection types (allOf)
7. $ref resolution to named type references
8. Record/additionalProperties
9. Optional properties
10. Nested schemas (recursive)

### Phase 4: TypeScript SDK Generator — Types (~35 tests)

**Generate per-module type files (`types/{module}.ts`) + shared types (`types/shared.ts`)**

1. `emitInterfaceFromSchema()` — named schema → TypeScript interface
2. `emitOperationInputType()` — operation input shape (`{ params?: ..., query?: ..., body?: ... }`)
3. `emitOperationResponseType()` — response type (or `void` if none)
4. `emitStreamingEventType()` — event type for streaming operations
5. `emitModuleTypesFile()` — assemble types for a single module (`types/users.ts`)
6. `emitSharedTypesFile()` — assemble named schemas used across modules (`types/shared.ts`)
7. Handle name collisions (two schemas with same name from different modules)

### Phase 5: TypeScript SDK Generator — Client (~45 tests)

**Generate per-module files (`modules/{module}.ts`) + client entry (`client.ts`)**

1. `emitSDKConfig()` — config interface extending `FetchClientConfig`, with spec-driven auth fields
2. `emitAuthStrategyBuilder()` — maps config auth fields to `AuthStrategy[]`
3. `emitOperationMethod()` — single operation method (using `client.request()`)
4. `emitStreamingMethod()` — async generator method (using `client.requestStream()`)
5. `emitModuleFile()` — `createXxxModule(client)` function with all operations for one module
6. `emitClientFile()` — `createClient()` that imports and composes all module factories
7. Path parameter interpolation (`:id` → template literal `${input.params.id}`)
8. Query string serialization
9. Body serialization
10. Header forwarding

### Phase 6: TypeScript SDK Generator — Schemas, Index, Package (~25 tests)

**Generate `schemas.ts`, `generated/index.ts`, scaffold root files**

1. `emitSchemaReExports()` — re-export `@vertz/schema` objects
2. `emitGeneratedIndex()` — barrel export of all generated code (`generated/index.ts`)
3. `emitAugmentableTypes()` — type augmentation entry point
4. `scaffoldPackageJson()` — generate `package.json` only if it doesn't exist (scaffold-once)
5. `scaffoldRootIndex()` — generate root `index.ts` only if it doesn't exist (re-exports `./generated` + placeholder for user exports)
6. Wire up the full `TypeScriptSDKGenerator.generate()` method
7. Test scaffold-once behavior: verify existing root files are not overwritten

### Phase 7: CLI Generator (~30 tests)

**Generate CLI command manifest + publishable CLI**

1. `emitCommandDefinition()` — single command from operation
2. `emitModuleCommands()` — grouped commands from module
3. `emitManifestFile()` — full manifest (`generated/manifest.ts`)
4. Handle param/query/body type flattening to CLI arg types
5. `emitBinEntryPoint()` — CLI entry point (`generated/bin.ts`)
6. `scaffoldPackageJson()` — scaffold-once for publishable CLI
7. `scaffoldRootIndex()` — scaffold-once root entry point

### Phase 8: Formatting + Orchestration (~20 tests)

**Post-processing and file writing**

1. `formatWithBiome()` — Biome post-processing
2. `generate()` — top-level orchestrator
   - Accept `AppIR` + `CodegenConfig`
   - Run IR adapter
   - Run configured generators
   - Format output
   - Write files
3. Integration test: full pipeline from fixture `AppIR` → files on disk

### Phase 9: Config + CLI Integration (~15 tests)

**Wire into `vertz.config.ts` and `vertz generate` command**

1. Add `codegen` section to `VertzConfig`
2. Wire `vertz generate` CLI command to codegen pipeline
3. Wire `vertz build` to optionally run codegen
4. Add `vertz dev` watch mode integration (regenerate on change)

### Phase 10: Incremental Regeneration (~25 tests)

**Watch mode support for `vertz dev`**

1. `computeChangeset()` — diff two `CodegenIR` instances to find what changed
2. Module-level change detection (added/removed/modified modules)
3. Schema-level change detection (shared schemas changed)
4. Selective file regeneration — only rewrite affected `modules/*.ts` and `types/*.ts`
5. `client.ts` rewrite only when module list changes (added/removed modules)
6. Integration with compiler watch mode (receive incremental `AppIR` updates)
7. Test: editing a route only regenerates that module's files

### Phase 11: `@vertz/cli-runtime` (~40 tests)

**Runtime package for generated CLIs**

1. Create `packages/cli-runtime` with package.json, tsconfig, vitest config
2. Argument parsing from manifest
3. Help text generation
4. Output formatting (JSON, table, human-readable)
5. Interactive parameter resolution (prompt, select)
6. OAuth device code flow
7. API key management (local config storage)
8. Token refresh flow

---

## 20. Estimated Scope

| Phase | Tests | Description |
|---|---|---|
| 1. `@vertz/fetch` | ~55 | Shared HTTP client, auth, retry, streaming |
| 2. Foundation | ~50 | IR adapter, naming, imports |
| 3. JSON Schema Converter | ~40 | Schema → TypeScript types |
| 4. SDK Types | ~35 | Per-module type files generation |
| 5. SDK Client | ~45 | Per-module client files + client.ts composer |
| 6. SDK Schemas + Index + Package | ~25 | schemas.ts, index.ts, scaffold-once, package.json |
| 7. CLI Generator | ~30 | Command manifest, publishable CLI |
| 8. Formatting + Orchestration | ~20 | Biome, file writing |
| 9. Config + CLI Integration | ~15 | vertz.config.ts, CLI wiring |
| 10. Incremental Regeneration | ~25 | IR diffing, selective file rewrite for watch mode |
| 11. `@vertz/cli-runtime` | ~40 | CLI runtime, interactive flows, OAuth |
| **Total** | **~380** | |

---

## 21. Dependencies

### New Packages

| Package | Purpose | Dependencies |
|---|---|---|
| `@vertz/fetch` | Shared HTTP client for SDKs | Zero (uses native `fetch`) |
| `@vertz/cli-runtime` | Runtime for generated CLIs | `@vertz/fetch` |

### `@vertz/codegen` Dependencies

#### Runtime Dependencies

- `@vertz/compiler` — for `AppIR` types (peer dependency)

#### Dev Dependencies

- `vitest` — testing
- `@biomejs/biome` — formatting (already in workspace)

### Explicitly NOT Adding

- No template engine (Handlebars, EJS, Eta)
- No AST library (ts-morph, TypeScript compiler API)
- No JSON Schema library (custom converter is simpler for our subset)

---

## 22. Future Extensibility

### Adding a New Language (e.g., Python SDK)

1. Create `generators/python/` directory
2. Implement `PythonSDKGenerator` with `Generator` interface
3. Write `jsonSchemaToGoType()` or `jsonSchemaToPythonType()` converter
4. Add `'python'` to `GeneratorName` union
5. No changes needed to IR adapter, config loading, or orchestration

### Adding New Generator Features

- **Pagination**: Add `pagination?: PaginationConfig` to `CodegenOperation`. `@vertz/fetch` handles cursor/offset pagination; codegen emits paginated methods.
- **Webhooks**: Add webhook event types to `CodegenIR`. Generate webhook handler types.
- **File uploads**: Add `multipart?: boolean` to `CodegenOperation`. `@vertz/fetch` handles multipart encoding.

Each addition only requires changes to the IR adapter and the relevant generator emit functions. The architecture is additive.

---

## 23. Open Questions (Deferred to Implementation)

1. **Watch mode granularity**: Should `vertz dev` regenerate only changed modules, or always regenerate everything?
2. **Error types**: Should the SDK generate error types for each operation, or use a generic `SDKError`?
3. **Middleware-provided context**: Should operations that require auth middleware reflect this in the SDK types?
4. **Sidecar file format**: Should CLI resolver sidecar files use `.cli.ts` extension or a different convention?
5. **Type augmentation codegen**: Should `blimu codegen`-style type generation be a built-in feature of `@vertz/codegen`, or a separate tool?
