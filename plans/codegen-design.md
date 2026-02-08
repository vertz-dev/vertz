# @vertz/codegen Design Plan

## 1. Overview

`@vertz/codegen` is a standalone package that generates typed SDK clients and CLI clients from the Vertz compiler's `AppIR`. It ships with two built-in generators (TypeScript SDK and CLI) and an extensible plugin interface for future language targets (Python, Go).

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
        ts-type-utils.ts         — TS-specific naming, type conversion
      cli/
        index.ts                 — CLIGenerator
        emit-manifest.ts         — generates CLI command manifest
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
      cli/
        emit-manifest.test.ts
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
  schemaRefs: OperationSchemaRefs;     // references to named schemas
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
6. Sorting everything deterministically (modules by name, operations by path+method, schemas by name)

```typescript
// ir-adapter.ts
export function adaptIR(appIR: AppIR): CodegenIR {
  const schemaMap = buildSchemaMap(appIR.schemas);
  const modules = appIR.modules.map(mod => adaptModule(mod, schemaMap));
  const schemas = appIR.schemas
    .filter(s => s.isNamed && s.jsonSchema)
    .map(adaptSchema)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    basePath: appIR.app.basePath,
    version: appIR.app.version,
    modules: modules.sort((a, b) => a.name.localeCompare(b.name)),
    schemas,
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

## 7. TypeScript SDK Generator

### Generated Output Structure

```
.vertz/generated/
  sdk/
    client.ts           — typed SDK client class
    types.ts            — all operation input/output types
    schemas.ts          — re-exports of @vertz/schema objects
    index.ts            — barrel export
```

### client.ts — The SDK Client

```typescript
// Generated by @vertz/codegen — do not edit

import type { ListUsersQuery, ListUsersResponse, GetUserParams, GetUserResponse, CreateUserBody, CreateUserResponse } from './types';

export interface SDKConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface SDKResult<T> {
  data: T;
  status: number;
  headers: Headers;
}

export function createClient(config: SDKConfig) {
  const f = config.fetch ?? fetch;

  async function request<T>(method: string, path: string, options?: {
    body?: unknown;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<SDKResult<T>> {
    // ... fetch implementation
  }

  return {
    users: {
      list(input?: { query?: ListUsersQuery }): Promise<SDKResult<ListUsersResponse>> {
        return request('GET', '/api/v1/users', { query: input?.query as Record<string, unknown> });
      },
      get(input: { params: GetUserParams }): Promise<SDKResult<GetUserResponse>> {
        return request('GET', `/api/v1/users/${input.params.id}`);
      },
      create(input: { body: CreateUserBody }): Promise<SDKResult<CreateUserResponse>> {
        return request('POST', '/api/v1/users', { body: input.body });
      },
    },
  };
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

---

## 8. CLI Generator

The CLI generator produces a **command manifest** — a data structure describing all available commands, their arguments, and types. A generic CLI runtime (from `@vertz/cli`) consumes this manifest at runtime.

### Why Manifest, Not Full CLI?

- Avoids duplicating CLI framework code in generated output
- The runtime handles parsing, help text, error formatting
- Generated code stays small and focused on data
- Updates to CLI behavior don't require regeneration

### Generated Output

```
.vertz/generated/
  cli/
    manifest.ts         — command definitions and types
    index.ts            — barrel export
```

### manifest.ts

```typescript
// Generated by @vertz/codegen — do not edit

import type { CommandManifest } from '@vertz/cli';

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

---

## 9. Template System: Tagged Template Literals

### Why Not Handlebars/EJS/Eta?

| Criterion | Template Engine | Tagged Literals |
|---|---|---|
| Type safety | None — templates are strings | Full TypeScript types |
| IDE support | Limited — syntax highlighting only | Full IntelliSense, refactoring |
| Testing | Requires rendering + snapshot | Unit-test each function |
| Dependencies | External package | Zero |
| Learning curve | Template syntax + helpers | Just TypeScript |
| LLM readability | Template syntax is unfamiliar | Plain TypeScript functions |

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

  const content = [
    `${toCamelCase(op.operationId)}(${inputParam}): Promise<SDKResult<${resultType}>> {`,
    `  return request('${op.method}', ${pathExpr}${buildRequestOptions(op)});`,
    `},`,
  ].join('\n');

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

## 10. Shared Utilities vs. Per-Generator Code

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
```

---

## 11. Configuration

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
  };

  /** CLI manifest options */
  cli?: {
    /** Include in generation. Default: false */
    enabled?: boolean;
  };
}

type GeneratorName = 'typescript' | 'cli';
```

---

## 12. Output Location

Generated files go to `.vertz/generated/` (the existing `outputDir` from `ResolvedConfig.compiler.outputDir`).

**Gitignored by default**. The `.vertz/` directory is regenerated on every `vertz build` / `vertz generate` / `vertz dev`. Rationale:
- Avoids merge conflicts on generated code
- Keeps the repo clean
- IDE picks up types from the generated directory via `tsconfig.json` paths
- CI runs `vertz build` before consuming generated types

The generated directory should include a `.gitignore` with `*` and a `.gitkeep` so the directory structure exists in the repo but contents are ignored.

---

## 13. Formatting Pipeline

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

## 14. Testing Strategy

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
  expect(result.content).toContain("request('GET', '/api/v1/users'");
  expect(result.imports).toContainEqual({
    from: './types', name: 'ListUsersInput', isType: true,
  });
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

## 15. Implementation Phases

### Phase 1: Foundation (~50 tests)

**Package setup + CodegenIR + IR adapter**

1. Create `packages/codegen` with package.json, tsconfig, vitest config
2. Define `CodegenIR` types in `types.ts`
3. Implement `adaptIR()` in `ir-adapter.ts`
   - Flatten module → router → route hierarchy
   - Resolve schema references
   - Collect named schemas
   - Deterministic sorting
4. Implement `naming.ts` utilities
   - `toPascalCase`, `toCamelCase`, `toKebabCase`, `toSnakeCase`
5. Implement `imports.ts` utilities
   - `mergeImports()`, `renderImports()`

### Phase 2: JSON Schema Converter (~40 tests)

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

### Phase 3: TypeScript SDK Generator — Types (~35 tests)

**Generate `types.ts`**

1. `emitInterfaceFromSchema()` — named schema → TypeScript interface
2. `emitOperationInputType()` — operation input shape (`{ params?: ..., query?: ..., body?: ... }`)
3. `emitOperationResponseType()` — response type (or `void` if none)
4. `emitTypesFile()` — assemble all types for all operations
5. Handle name collisions (two schemas with same name from different modules)

### Phase 4: TypeScript SDK Generator — Client (~40 tests)

**Generate `client.ts`**

1. `emitSDKConfig()` — config interface and defaults
2. `emitRequestFunction()` — internal fetch wrapper
3. `emitOperationMethod()` — single operation method
4. `emitModuleNamespace()` — group operations by module
5. `emitClientFunction()` — `createClient()` with all modules
6. Path parameter interpolation (`:id` → template literal `${input.params.id}`)
7. Query string serialization
8. Body serialization
9. Header forwarding

### Phase 5: TypeScript SDK Generator — Schemas + Index (~15 tests)

**Generate `schemas.ts` and `index.ts`**

1. `emitSchemaReExports()` — re-export `@vertz/schema` objects
2. `emitIndexFile()` — barrel export of client + types
3. Wire up the full `TypeScriptSDKGenerator.generate()` method

### Phase 6: CLI Generator (~25 tests)

**Generate CLI command manifest**

1. `emitCommandDefinition()` — single command from operation
2. `emitModuleCommands()` — grouped commands from module
3. `emitManifestFile()` — full manifest with all commands
4. Handle param/query/body type flattening to CLI arg types

### Phase 7: Formatting + Orchestration (~20 tests)

**Post-processing and file writing**

1. `formatWithBiome()` — Biome post-processing
2. `generate()` — top-level orchestrator
   - Accept `AppIR` + `CodegenConfig`
   - Run IR adapter
   - Run configured generators
   - Format output
   - Write files
3. Integration test: full pipeline from fixture `AppIR` → files on disk

### Phase 8: Config + CLI Integration (~15 tests)

**Wire into `vertz.config.ts` and `vertz generate` command**

1. Add `codegen` section to `VertzConfig`
2. Wire `vertz generate` CLI command to codegen pipeline
3. Wire `vertz build` to optionally run codegen
4. Add `vertz dev` watch mode integration (regenerate on change)

---

## 16. Estimated Scope

| Phase | Tests | Description |
|---|---|---|
| 1. Foundation | ~50 | IR adapter, naming, imports |
| 2. JSON Schema Converter | ~40 | Schema → TypeScript types |
| 3. SDK Types | ~35 | types.ts generation |
| 4. SDK Client | ~40 | client.ts generation |
| 5. SDK Schemas + Index | ~15 | schemas.ts, index.ts |
| 6. CLI Generator | ~25 | Command manifest |
| 7. Formatting + Orchestration | ~20 | Biome, file writing |
| 8. Config + CLI Integration | ~15 | vertz.config.ts, CLI wiring |
| **Total** | **~240** | |

---

## 17. Dependencies

### Runtime Dependencies

- `@vertz/compiler` — for `AppIR` types (peer dependency)

### Dev Dependencies

- `vitest` — testing
- `@biomejs/biome` — formatting (already in workspace)

### Explicitly NOT Adding

- No template engine (Handlebars, EJS, Eta)
- No AST library (ts-morph, TypeScript compiler API)
- No JSON Schema library (custom converter is simpler for our subset)

---

## 18. Future Extensibility

### Adding a New Language (e.g., Python SDK)

1. Create `generators/python/` directory
2. Implement `PythonSDKGenerator` with `Generator` interface
3. Write `jsonSchemaToGoType()` or `jsonSchemaToPythonType()` converter
4. Add `'python'` to `GeneratorName` union
5. No changes needed to IR adapter, config loading, or orchestration

### Adding New Generator Features

- **Authentication**: Add `auth?: AuthConfig` to `CodegenIR` (populated from middleware `requires/provides`)
- **Pagination**: Add `pagination?: PaginationConfig` to `CodegenOperation`
- **Streaming**: Add `streaming?: boolean` to `CodegenOperation`

Each addition only requires changes to the IR adapter and the relevant generator emit functions. The architecture is additive.

---

## 19. Open Questions (Deferred to Implementation)

1. **SDK distribution**: Should the generated SDK be publishable as its own npm package? (Requires additional package.json generation)
2. **Watch mode granularity**: Should `vertz dev` regenerate only changed modules, or always regenerate everything?
3. **Error types**: Should the SDK generate error types for each operation, or use a generic `SDKError`?
4. **Middleware-provided context**: Should operations that require auth middleware reflect this in the SDK types?
