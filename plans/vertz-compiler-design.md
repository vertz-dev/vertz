# @vertz/compiler — Package Design Plan

## Overview

The Vertz compiler is the mandatory compilation step for all Vertz applications. It statically analyzes TypeScript source code using ts-morph, builds an Intermediate Representation (IR), validates conventions TypeScript alone can't check, and generates runtime artifacts the framework consumes at boot.

The compiler is **required** — `vertz dev` and `vertz build` always run it. The framework cannot start without compiler output.

All code is written from scratch in `packages/compiler/`. The legacy compiler (decorator-based, class-oriented) serves as reference for ts-morph patterns only.

See also: [Core API Design](./vertz-core-api-design.md), [Schema Design](./vertz-schema-design.md), [Testing Design](./vertz-testing-design.md), [Features](./vertz-features.md).

---

## What the Compiler Does

### Analysis (static, via ts-morph)

Parse the functional API patterns:
- `vertz.app()` + `.middlewares()` + `.register()` chains
- `vertz.middleware({ inject, headers, params, query, body, requires, provides, handler })`
- `vertz.moduleDef({ name, imports, options })`
- `moduleDef.service({ inject, methods })`
- `moduleDef.router({ prefix, inject })` + `.get()/.post()` chains
- `vertz.module(moduleDef, { services, routers, exports })`
- Schema files with `s.object()`, `s.email()`, etc.

### Validation (things TypeScript can't check)

- Schema naming conventions (`{operation}{Entity}{Part}`)
- Schema file placement (one per endpoint in `schemas/`)
- Response schema exists when handler returns a value
- Module exports are subset of services
- Services belong to their module definition
- Circular module dependencies
- Dead code detection (unused services, unreferenced schemas)

### Generation (5 outputs)

1. **OpenAPI 3.1 spec** — Full spec from routes + executed schemas
2. **Boot sequence** — Pre-computed module initialization order
3. **Route table** — Static route manifest (no runtime discovery)
4. **Schema registry** — Pre-collected named schemas + JSON Schema output
5. **App manifest** — Structured JSON describing the entire app for LLM/agent consumption

### What's NOT in the compiler

- **OTel instrumentation** — Runtime responsibility (`@vertz/core`). The compiler provides the metadata (operation IDs, route table, service names) the runtime uses to apply instrumentation.
- **MCP tool generation** — Deferred to a later phase.
- **Client SDK codegen** — Deferred. The IR is designed so codegen can consume it natively later.

### Non-blocking typecheck

`vertz dev` runs `tsc --noEmit` in a background process on every save. Type errors are reported to the console but don't block the server restart.

`vertz build` runs typecheck as a blocking step — errors fail the build.

---

## Build-Time Safety Guarantees

The compiler provides Rust-inspired build-time guarantees: **if `vertz build` succeeds, the framework plumbing is guaranteed correct.** Runtime errors can only come from business logic or external dependencies — never from framework wiring.

### Always-on guarantees (no opt-out)

These checks run on every compilation. If any fail, the build fails.

| Guarantee | What it prevents |
|-----------|-----------------|
| **DI wiring resolves** | Every `inject: { userService }` resolves to an actual exported service. No "service not found" at boot. |
| **Middleware chains satisfied** | If middleware B `requires: { user }`, there's a middleware A before it that `provides: { user }`. No "missing context" at runtime. |
| **Middleware ordering valid** | The `requires`/`provides` chain is topologically sound. No impossible ordering. |
| **Module graph acyclic** | No circular import deadlocks. |
| **Routes valid** | Path params match schema params (`:id` in path → `id` in params schema). No duplicate method+path. |
| **Schemas compile** | All schema files produce valid JSON Schema. No "invalid schema" at boot. |
| **Response schema exists** | If a handler returns data, there's a schema defining that shape. No undocumented responses. |
| **Module exports valid** | Only actual services can be exported. No "export not found." |
| **Module options valid** | `.register(module, options)` options match the module's options schema. No invalid config at boot. |
| **No ctx key collisions** | Middleware `provides` keys, injected service names, and reserved ctx properties (`params`, `body`, `query`, `headers`, `raw`, `state`, `options`, `env`) must all be unique. Two middlewares providing the same key, or a service name shadowing a middleware state key, is a build error. No silent overwrites at runtime. |

### Strict mode (opt-in via `defineConfig`)

Enabled per-project in `vertz.config.ts`. Strict mode elevates additional checks from warnings to errors:

| Check | What it adds |
|-------|-------------|
| **Error exhaustiveness** | Service methods declare throwable error types. Route handlers must handle all declared errors from services they call. |
| **Environment completeness** | All declared env vars must have defaults or be marked as required. No missing env vars at startup. |
| **Dead code as errors** | Unused services and unreferenced schemas are errors, not warnings. No dead weight. |

```typescript
// vertz.config.ts
import { defineConfig } from '@vertz/compiler';

export default defineConfig({
  strict: true,
  // ...
});
```

The safety model is progressive: default mode catches framework plumbing bugs. Strict mode pushes closer to "if it compiles, it works."

---

## Pipeline

```
Source files → ts-morph AST analysis → IR → Validators → Generators → Output files
```

The IR (Intermediate Representation) is the stable contract between analyzers and generators. Future tools (codegen, UI lib, MCP) consume this same IR.

### Schema execution

For OpenAPI and schema registry output, the compiler **imports and executes** schema files at compile time, calling `.toJSONSchema()` on each schema. This avoids duplicating JSON Schema logic and uses the schema package as the single source of truth.

---

## Intermediate Representation

```typescript
// ir/types.ts

export interface AppIR {
  app: AppDefinition;
  env?: EnvIR;
  modules: ModuleIR[];
  middleware: MiddlewareIR[];
  schemas: SchemaIR[];
  dependencyGraph: DependencyGraphIR;
  diagnostics: Diagnostic[];
}

export interface EnvIR {
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  loadFiles: string[];             // ['.env', '.env.local', '.env.${NODE_ENV}']
  schema?: SchemaRef;              // the env validation schema
  variables: EnvVariableIR[];
}

export interface EnvVariableIR {
  name: string;
  type: string;
  hasDefault: boolean;
  required: boolean;
}

export interface AppDefinition {
  basePath: string;
  version?: string;
  globalMiddleware: MiddlewareRef[];
  moduleRegistrations: ModuleRegistration[];
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
}

export interface ModuleRegistration {
  moduleName: string;
  options?: Record<string, unknown>;
}

export interface ModuleIR {
  name: string;
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  imports: ImportRef[];
  options?: SchemaRef;
  services: ServiceIR[];
  routers: RouterIR[];
  exports: string[];
}

export interface ImportRef {
  localName: string;
  sourceModule?: string;
  sourceExport?: string;
  isEnvImport: boolean;
}

export interface ServiceIR {
  name: string;
  moduleName: string;
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  inject: InjectRef[];
  methods: ServiceMethodIR[];
}

export interface InjectRef {
  localName: string;
  resolvedToken: string;
}

export interface ServiceMethodIR {
  name: string;
  parameters: { name: string; type: string }[];
  returnType: string;
}

export interface RouterIR {
  name: string;
  moduleName: string;
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  prefix: string;
  inject: InjectRef[];
  routes: RouteIR[];
}

export interface RouteIR {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  path: string;
  fullPath: string;             // prefix + path
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  operationId: string;          // auto: moduleName_handlerName

  params?: SchemaRef;
  query?: SchemaRef;
  body?: SchemaRef;
  headers?: SchemaRef;
  response?: SchemaRef;
  middleware: MiddlewareRef[];

  description?: string;
  tags: string[];
}

export interface MiddlewareIR {
  name: string;
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  inject: InjectRef[];
  headers?: SchemaRef;
  params?: SchemaRef;
  query?: SchemaRef;
  body?: SchemaRef;
  requires?: SchemaRef;
  provides?: SchemaRef;
}

export interface MiddlewareRef {
  name: string;
  sourceFile: string;
}

export interface SchemaIR {
  name: string;                  // export name (createUserBody)
  id?: string;                   // from .id() — for components/schemas
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  namingConvention: {
    operation?: string;          // create, read, update, list, delete
    entity?: string;             // User, Todo
    part?: string;               // Body, Response, Query
  };
  jsonSchema?: Record<string, unknown>;
  isNamed: boolean;
}

export interface SchemaRef {
  schemaName: string;
  sourceFile: string;
  inline: boolean;
  jsonSchema?: Record<string, unknown>;
}

export interface DependencyGraphIR {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  initializationOrder: string[];   // topologically sorted module names
  circularDependencies: string[][];
}

export interface DependencyNode {
  id: string;
  kind: 'module' | 'service' | 'router' | 'middleware';
  name: string;
  moduleName?: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: 'imports' | 'inject' | 'uses-middleware' | 'exports';
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;                  // VERTZ001, VERTZ002, etc.
  message: string;
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  suggestion?: string;           // fix suggestion for LLMs
  sourceContext?: {              // for code frame rendering
    lines: { number: number; text: string }[];
    highlightStart: number;     // column offset for underline
    highlightLength: number;
  };
}
```

---

## Analyzers

### The core challenge: parsing functional call chains

The legacy compiler parsed decorators (`@Controller`, `@Get`). The new Vertz uses function calls:

```typescript
const userRouter = userModuleDef.router({ prefix: '/users', inject: { userService } });
userRouter.get('/:id', {
  params: s.object({ id: s.uuid() }),
  response: readUserResponse,
  middlewares: [authMiddleware],
  handler: async (ctx) => ctx.userService.findById(ctx.params.id),
});
```

Each analyzer needs to:
1. Find variable declarations matching specific call patterns (`vertz.middleware()`, `moduleDef.router()`, etc.)
2. Follow chained method calls on returned variables (`.get()`, `.post()` on a router)
3. Extract object literal arguments from those calls
4. Resolve cross-file references (imported schemas, middleware, services)

### Shared AST helpers (`utils/ast-helpers.ts`)

```typescript
// Find calls like vertz.middleware({...}) or vertz.moduleDef({...})
findCallExpressions(file, objectName, methodName): CallExpression[]

// Find calls like myRouter.get({...}) on a specific variable
findMethodCallsOnVariable(file, variableName, methodName): CallExpression[]

// Extract object literal from call argument
extractObjectLiteral(callExpr, argIndex): ObjectLiteralExpression | null

// Get property value from object literal
getPropertyValue(obj, key): Expression | null

// Resolve identifier to its declaration across imports
resolveIdentifier(identifier, project): { declaration, sourceFile } | null

// Extract string/array/object values from expressions
getStringValue(expr): string | null
getArrayElements(expr): Expression[]
```

### Individual analyzers

| Analyzer | Parses | Produces |
|----------|--------|----------|
| `AppAnalyzer` | `vertz.app()`, `.middlewares()`, `.register()` chains | `AppDefinition` |
| `EnvAnalyzer` | `vertz.env()`, schema, `.env` file references | `EnvIR` |
| `ModuleAnalyzer` | `vertz.moduleDef()`, `vertz.module()` | `ModuleIR[]` |
| `ServiceAnalyzer` | `moduleDef.service()` | `ServiceIR[]` (nested in modules) |
| `RouteAnalyzer` | `moduleDef.router()`, `.get()/.post()` chains | `RouterIR[]` (nested in modules) |
| `MiddlewareAnalyzer` | `vertz.middleware()` — extracts `inject`, `headers`, `params`, `query`, `body`, `requires`, `provides` | `MiddlewareIR[]` |
| `SchemaAnalyzer` | Schema files, naming conventions, `.toJSONSchema()` execution | `SchemaIR[]` |
| `DependencyGraphAnalyzer` | All of the above | `DependencyGraphIR` |

All analyzers extend `BaseAnalyzer` which provides access to the ts-morph `Project` and a shared `Diagnostic[]` collector.

---

## Validators

Validators run after analysis, checking cross-cutting concerns:

| Validator | Checks |
|-----------|--------|
| `NamingValidator` | Schema naming follows `{operation}{Entity}{Part}` |
| `PlacementValidator` | Schema files in `schemas/` folder, one per endpoint |
| `ModuleValidator` | Exports subset of services, services belong to module, circular deps |
| `CompletenessValidator` | Response schema exists when handler returns, dead code detection |

---

## Generators

### 1. OpenAPI Generator → `openapi.json`

Full OpenAPI 3.1 spec:
- Paths from `RouteIR[]` with operations, parameters, request/response schemas
- Named schemas (`.id()`) → `components/schemas`
- `$ref` resolution from schema-level `$defs` to document-level `components/schemas`
- Middleware `headers` schemas contribute to route parameters
- `discriminatedUnion` → `oneOf` + `discriminator`

### 2. Boot Generator → `boot.ts`

Pre-computed initialization sequence:

```typescript
// Generated example:
import { coreModule } from '../src/modules/core/core.module';
import { userModule } from '../src/modules/user/user.module';

export const bootSequence = {
  initializationOrder: ['core', 'user'],
  modules: {
    core: { module: coreModule },
    user: { module: userModule, options: { requireEmailVerification: true } },
  },
  globalMiddleware: [requestIdMiddleware, errorHandlerMiddleware],
};
```

Uses `DependencyGraphIR.initializationOrder` (topological sort). The framework reads this instead of resolving the graph at runtime.

### 3. Route Table Generator → `routes.ts`

Static route manifest:

```typescript
// Generated example:
export const routeTable = [
  {
    method: 'GET',
    path: '/api/v1/users/:id',
    operationId: 'user_getUserById',
    moduleName: 'user',
    routerName: 'userRouter',
    middleware: ['authMiddleware'],
    schemas: {
      params: 'readUserParams',
      response: 'readUserResponse',
    },
  },
];
```

### 4. Schema Registry Generator → `schemas.ts`

Pre-collected schemas with their JSON Schema output:

```typescript
// Generated example:
import { createUserBody } from '../src/modules/user/schemas/create-user.schema';
import { readUserResponse } from '../src/modules/user/schemas/read-user.schema';

export const schemaRegistry = { createUserBody, readUserResponse };
export const jsonSchemas = {
  createUserBody: { /* pre-computed JSON Schema */ },
  readUserResponse: { /* pre-computed JSON Schema */ },
};
```

### 5. Manifest Generator → `manifest.json`

Structured JSON for LLM/agent consumption:

```json
{
  "app": { "basePath": "/api", "version": "v1" },

  "modules": [
    {
      "name": "user",
      "services": ["userService", "authService"],
      "routers": ["userRouter"],
      "exports": ["userService", "authService"],
      "imports": [{ "from": "core", "items": ["dbService"] }]
    }
  ],

  "routes": [
    {
      "method": "GET",
      "path": "/api/v1/users/:id",
      "operationId": "user_getUserById",
      "module": "user",
      "middleware": ["authMiddleware"],
      "params": { "id": { "type": "string", "format": "uuid" } },
      "response": { "$ref": "#/schemas/readUserResponse" }
    }
  ],

  "schemas": {
    "createUserBody": { "type": "object", "properties": { "..." } },
    "readUserResponse": { "type": "object", "properties": { "..." } }
  },

  "middleware": [
    {
      "name": "authMiddleware",
      "provides": { "user": { "type": "object" } },
      "requires": { "requestId": { "type": "string" } }
    }
  ],

  "dependencyGraph": {
    "initializationOrder": ["core", "user"],
    "edges": [{ "from": "user", "to": "core", "type": "imports" }]
  },

  "diagnostics": { "errors": 0, "warnings": 1, "items": [] }
}
```

The manifest enables:
- LLMs reading one file to understand the entire API
- Admin UIs showing API topology
- CI/CD pipelines validating API contracts
- Future tooling (codegen, UI lib) consuming structured app data

---

## Compiler Orchestration

```typescript
export class Compiler {
  async compile(): Promise<CompileResult> {
    // Phase 1: Analyze (ts-morph AST)
    const env = await envAnalyzer.analyze();
    const schemas = await schemaAnalyzer.analyze();
    const middleware = await middlewareAnalyzer.analyze();
    const modules = await moduleAnalyzer.analyze();  // includes services, routers
    const appDef = await appAnalyzer.analyze();
    const depGraph = await depGraphAnalyzer.analyze(modules, middleware);

    // Phase 2: Build IR
    const ir: AppIR = { app: appDef, env, modules, middleware, schemas, dependencyGraph: depGraph, diagnostics };

    // Phase 3: Validate
    await namingValidator.validate(ir);
    await placementValidator.validate(ir);
    await moduleValidator.validate(ir);
    await completenessValidator.validate(ir);

    // Phase 4: Check for blocking errors
    if (hasErrors(ir) && !config.forceGenerate) {
      return { success: false, ir };
    }

    // Phase 5: Generate (all in parallel)
    await Promise.all([
      openAPIGenerator.generate(ir, outputDir),
      bootGenerator.generate(ir, outputDir),
      routeTableGenerator.generate(ir, outputDir),
      schemaRegistryGenerator.generate(ir, outputDir),
      manifestGenerator.generate(ir, outputDir),
    ]);

    return { success: true, ir };
  }
}
```

### Error handling

Diagnostic-based, not fail-fast:
- **Errors** block code generation (unless `forceGenerate`)
- **Warnings** are reported but don't block
- **Info** messages are suggestions
- Every diagnostic has a `suggestion` field for LLM consumption
- Diagnostic codes (`VERTZ001`, `VERTZ002`, etc.) are stable and documented

### Incremental compilation (`vertz dev`)

For watch mode, track file hashes and only re-analyze changed files + their dependents. Re-analysis granularity is per-module:
- Schema file changed → re-analyze schema, re-run schema registry, OpenAPI, manifest generators
- Router file changed → re-analyze routes for that module, re-run route table, OpenAPI, boot, manifest
- Module file changed → re-analyze module, cascade to dependents
- Full recompile if app entry point changes
- `.env` file changed → full app reboot (kill process → re-run). Since `vertz.env()` executes eagerly at import time, the new process picks up changed values automatically. No incremental compilation needed.
- `vertz.config.ts` changed → full app reboot. Config affects compilation settings (strict mode, output paths, validation rules), so a clean restart with fresh compilation is required.

**Important:** Only analyzers are incremental — they produce partial IR updates that get merged into the full IR. Validators and generators always run on the complete merged IR, because cross-cutting checks (dead code, middleware chains, duplicate routes) need global visibility.

---

## Runtime: Bun-First, Node as Fallback

Vertz uses **Bun** as the primary runtime for development and execution. Node.js is supported as a secondary fallback.

| Concern | Bun | Node (fallback) |
|---------|-----|-----------------|
| TypeScript execution | Native (no transpiler) | Via `tsx` |
| `vertz dev` | `bun run` | `tsx` |
| `vertz build` | `bun run` | `tsx` |
| File watching | Bun's native watcher | `chokidar` or `fs.watch` |
| Test runner | Vitest (both runtimes) | Vitest (both runtimes) |

The compiler itself (ts-morph) is runtime-agnostic — it works on both Bun and Node since it uses the TypeScript compiler API. The CLI detects the available runtime and uses Bun when present.

---

## CLI Rendering: Ink

The CLI uses **Ink** (React for terminals) for all output. This gives us rich, interactive terminal experiences:

### Code frames with syntax highlighting

When the compiler finds an error, it shows the exact source location with **full TypeScript syntax highlighting** in the terminal. Code frames use a syntax highlighter (Shiki or Prism) to colorize the source code, making it easy to read at a glance — similar to how VS Code or a browser renders code, but in the terminal.

```
  VERTZ003  Missing response schema

  ╭─ src/modules/user/routers/user.router.ts:14:1
  │
  12 │ userRouter.get('/:id', {        ← syntax highlighted (keywords, strings, identifiers)
  13 │   params: readUserParams,
  14 │   handler: async (ctx) => {
     │   ^^^^^^^ handler returns a value but no response schema is defined
  15 │     return ctx.userService.findById(ctx.params.id);
  16 │   },
  17 │ });
  │
  ╰─ hint: Add a `response` property with the expected return shape
```

Each diagnostic renders as:
- **Error code** and **message** as the header
- **Source file path** with line and column
- **Code frame** with syntax-highlighted TypeScript from the original source
- **Underline** marking the exact span of the problem
- **Suggestion** as an actionable hint (also consumed by LLMs)

The syntax highlighting applies to all code displayed in the terminal — diagnostics, compilation errors, and any source context shown during `vertz dev`.

### Compilation progress

Live dashboard during `vertz dev` and `vertz build`:

```
  Compiling...
  ✓ Schemas     (12 files)
  ✓ Middleware   (3 files)
  ⠋ Modules     (analyzing user module...)
  ○ Validation
  ○ Generation
```

### Diagnostic summary

After compilation, a summary of all diagnostics:

```
  ✓ Compiled successfully in 240ms

  2 warnings:
    VERTZ012  Unused service `legacyAuthService` in module `auth`
    VERTZ015  Schema `listTodoQuery` has no consumers
```

---

## CLI Integration

### `vertz dev`

```
vertz dev [--port 3000]
```

1. Run initial full compilation
2. Start app with `bun run` (fallback: `tsx`)
3. Watch `src/` for changes
4. On change: incremental compilation (per-module) → restart app process
5. Non-blocking `tsc --noEmit --watch` in background — report type errors to console, don't block server
6. Render diagnostics with Ink code frames

### `vertz build`

```
vertz build [--output .vertz/generated]
```

1. Full compilation
2. Blocking `tsc --noEmit` — type errors fail the build
3. Run strict mode checks (if enabled)
4. Render diagnostic summary with Ink
5. Exit 0 on success, 1 on error

### Configuration (`vertz.config.ts`)

```typescript
import { defineConfig } from '@vertz/compiler';

export default defineConfig({
  strict: false,                    // opt-in strict mode
  compiler: {
    sourceDir: 'src',
    outputDir: '.vertz/generated',
    schemas: {
      enforceNaming: true,
      enforcePlacement: true,
    },
    openapi: {
      output: '.vertz/generated/openapi.json',
      info: { title: 'My API', version: '1.0.0' },
    },
    validation: {
      requireResponseSchema: true,
      detectDeadCode: true,
    },
  },
});
```

`defineConfig` is a typed identity function that provides full autocomplete and type checking for the configuration object:

```typescript
// @vertz/compiler
export function defineConfig(config: VertzConfig): VertzConfig {
  return config;
}
```

---

## Package Structure

```
packages/compiler/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                           # Public API exports
│   ├── compiler.ts                        # Pipeline orchestrator
│   ├── config.ts                          # CompilerConfig types and defaults
│   ├── errors.ts                          # Diagnostic codes and helpers
│   ├── ir/
│   │   ├── types.ts                       # Complete IR type definitions
│   │   └── builder.ts                     # IR builder/merge utilities
│   ├── analyzers/
│   │   ├── index.ts
│   │   ├── base-analyzer.ts               # Shared ts-morph utilities
│   │   ├── __tests__/
│   │   │   ├── app-analyzer.test.ts
│   │   │   ├── env-analyzer.test.ts
│   │   │   ├── module-analyzer.test.ts
│   │   │   ├── service-analyzer.test.ts
│   │   │   ├── route-analyzer.test.ts
│   │   │   ├── middleware-analyzer.test.ts
│   │   │   ├── schema-analyzer.test.ts
│   │   │   └── dependency-graph-analyzer.test.ts
│   │   ├── app-analyzer.ts                # vertz.app() + .register() chains
│   │   ├── env-analyzer.ts                # vertz.env() schema and variable analysis
│   │   ├── module-analyzer.ts             # vertz.moduleDef(), vertz.module()
│   │   ├── service-analyzer.ts            # moduleDef.service()
│   │   ├── route-analyzer.ts              # moduleDef.router() + .get/.post chains
│   │   ├── middleware-analyzer.ts          # vertz.middleware()
│   │   ├── schema-analyzer.ts             # Schema discovery, naming, execution
│   │   └── dependency-graph-analyzer.ts   # Graph construction, topological sort, cycle detection
│   ├── validators/
│   │   ├── index.ts
│   │   ├── __tests__/
│   │   │   ├── naming-validator.test.ts
│   │   │   ├── placement-validator.test.ts
│   │   │   ├── module-validator.test.ts
│   │   │   └── completeness-validator.test.ts
│   │   ├── naming-validator.ts            # {operation}{Entity}{Part} conventions
│   │   ├── placement-validator.ts         # schemas/ folder, one per endpoint
│   │   ├── module-validator.ts            # exports, imports, circular deps
│   │   └── completeness-validator.ts      # response schemas, dead code
│   ├── generators/
│   │   ├── index.ts
│   │   ├── __tests__/
│   │   │   ├── openapi-generator.test.ts
│   │   │   ├── boot-generator.test.ts
│   │   │   ├── route-table-generator.test.ts
│   │   │   ├── schema-registry-generator.test.ts
│   │   │   └── manifest-generator.test.ts
│   │   ├── base-generator.ts              # File writing, import path resolution
│   │   ├── openapi-generator.ts
│   │   ├── boot-generator.ts
│   │   ├── route-table-generator.ts
│   │   ├── schema-registry-generator.ts
│   │   └── manifest-generator.ts
│   └── utils/
│       ├── __tests__/
│       │   ├── ast-helpers.test.ts
│       │   └── import-resolver.test.ts
│       ├── ast-helpers.ts                 # ts-morph helpers for call chain parsing
│       ├── import-resolver.ts             # Cross-file import resolution
│       ├── path-utils.ts                  # Relative path calculation
│       └── schema-executor.ts             # Runtime schema import + .toJSONSchema()
```

Ink rendering components live in `@vertz/cli`, not in the compiler package. The compiler produces `Diagnostic[]` with `sourceContext` — the CLI renders them. This keeps the compiler as a pure library consumable by any tool without pulling in React/Ink.
```

---

## Implementation Phases (TDD)

### Phase 1: IR Types and Compiler Skeleton

Define all IR types. Create pipeline skeleton with stub analyzers/generators.

**Files:** `src/ir/types.ts`, `src/compiler.ts`, `src/config.ts`, `src/errors.ts`, `src/analyzers/base-analyzer.ts`, `src/generators/base-generator.ts`

**Tests:** `src/ir/__tests__/types.test.ts`, `src/__tests__/compiler.test.ts`

### Phase 2: AST Helpers

Build the shared ts-morph utilities for parsing functional call chains.

**Files:** `src/utils/ast-helpers.ts`, `src/utils/import-resolver.ts`

**Tests:** `src/utils/__tests__/ast-helpers.test.ts` — test each helper on in-memory ts-morph source files

### Phase 3: Schema Analyzer

Discover schemas, validate naming, execute `.toJSONSchema()`.

**Files:** `src/analyzers/schema-analyzer.ts`, `src/utils/schema-executor.ts`

**Tests:** `src/analyzers/__tests__/schema-analyzer.test.ts`

### Phase 4: Env, Module, and Service Analyzers

Parse `vertz.env()`, `vertz.moduleDef()`, `vertz.module()`, `moduleDef.service()`.

**Files:** `src/analyzers/env-analyzer.ts`, `src/analyzers/module-analyzer.ts`, `src/analyzers/service-analyzer.ts`

**Tests:** `src/analyzers/__tests__/env-analyzer.test.ts`, `src/analyzers/__tests__/module-analyzer.test.ts`, `src/analyzers/__tests__/service-analyzer.test.ts`

### Phase 5: Middleware Analyzer

Parse `vertz.middleware()`, extract `inject`, `headers`, `params`, `query`, `body`, `requires`, `provides`.

**Files:** `src/analyzers/middleware-analyzer.ts`

**Tests:** `src/analyzers/__tests__/middleware-analyzer.test.ts`

### Phase 6: Route Analyzer

Parse `moduleDef.router()` and `.get()/.post()` chains.

**Files:** `src/analyzers/route-analyzer.ts`

**Tests:** `src/analyzers/__tests__/route-analyzer.test.ts`

### Phase 7: App Analyzer and Dependency Graph

Parse `vertz.app()`, build dependency graph with topological sort and cycle detection.

**Files:** `src/analyzers/app-analyzer.ts`, `src/analyzers/dependency-graph-analyzer.ts`

**Tests:** `src/analyzers/__tests__/app-analyzer.test.ts`, `src/analyzers/__tests__/dependency-graph-analyzer.test.ts`

### Phase 8: Validators

Naming conventions, file placement, module rules, completeness checks.

**Files:** `src/validators/*.ts`

**Tests:** `src/validators/__tests__/naming-validator.test.ts`, etc.

### Phase 9: OpenAPI Generator

Full OpenAPI 3.1 spec from IR.

**Files:** `src/generators/openapi-generator.ts`

**Tests:** `src/generators/__tests__/openapi-generator.test.ts`, snapshot tests

### Phase 10: Boot Sequence and Route Table Generators

Pre-computed boot script and static route manifest.

**Files:** `src/generators/boot-generator.ts`, `src/generators/route-table-generator.ts`

**Tests:** `src/generators/__tests__/boot-generator.test.ts`, `src/generators/__tests__/route-table-generator.test.ts`

### Phase 11: Schema Registry and Manifest Generators

Pre-collected schemas and app manifest JSON.

**Files:** `src/generators/schema-registry-generator.ts`, `src/generators/manifest-generator.ts`

**Tests:** `src/generators/__tests__/schema-registry-generator.test.ts`, `src/generators/__tests__/manifest-generator.test.ts`

### Phase 12: CLI Integration and Incremental Compilation

Wire into `vertz dev` (watch + recompile) and `vertz build` (one-shot). Non-blocking typecheck. Ink rendering components in `@vertz/cli`.

**Files:** CLI commands (in `@vertz/cli` package), `src/compiler.ts` incremental mode

**Tests:** `src/__tests__/compiler.integration.test.ts`

---

## Testing Strategy

### Unit tests

Each analyzer and generator has its own test file. Tests use ts-morph's `useInMemoryFileSystem: true` for synthetic source files:

```typescript
describe('RouteAnalyzer', () => {
  it('should parse a router with one GET route', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('src/user-router.ts', `
      const userRouter = userModuleDef.router({ prefix: '/users', inject: { userService } });
      userRouter.get('/:id', {
        params: s.object({ id: s.uuid() }),
        handler: async (ctx) => ctx.userService.findById(ctx.params.id),
      });
    `);

    const routers = await analyzer.analyze();
    expect(routers[0].prefix).toBe('/users');
    expect(routers[0].routes[0].method).toBe('GET');
    expect(routers[0].routes[0].path).toBe('/:id');
  });
});
```

### Integration tests

Full pipeline on realistic project structures:

```typescript
it('should compile a complete todo app', async () => {
  // Set up temp directory with full app structure
  // Run compiler
  // Assert all 5 output files generated
  // Assert OpenAPI spec has correct routes
  // Assert manifest has correct structure
  // Assert no error diagnostics
});
```

### Snapshot tests

For generators, use vitest snapshots to catch regressions in generated code.

### Test fixtures

`__fixtures__/` directory with example projects:
- Minimal app (one module, one route)
- Multi-module app with imports
- Middleware chains with requires/provides
- Convention violations (for validator tests)
- Circular dependency examples

---

## Paving the Road

The IR is designed as a stable contract for future tools:

- **Client SDK codegen** — Consumes `AppIR.routes` + `AppIR.schemas` to generate typed fetch functions
- **UI lib** — Consumes `AppIR` to generate admin dashboards, forms from schemas
- **MCP tools** — Future analyzer + generator that extends the IR with MCP metadata
- **OTel auto-instrumentation** — Runtime (`@vertz/core`) reads route table + manifest for operation IDs, service names

None of these are implemented now, but the IR supports all of them without breaking changes.

---

## Verification

After implementation:

1. `bun test` — all unit and integration tests pass
2. `bun run build` — package builds with no TypeScript errors
3. Compiler produces all 5 output files for a sample app
4. OpenAPI spec validates against OpenAPI 3.1 schema
5. Manifest JSON is complete and accurate
6. Incremental compilation works correctly in watch mode
7. Diagnostics render with syntax-highlighted code frames
8. Build-time safety guarantees catch all framework wiring errors

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Build-time safety guarantees | Rust-inspired: if it builds, framework plumbing is correct. No DI/middleware/routing runtime errors. |
| Strict mode opt-in | Progressive safety — default catches plumbing bugs, strict adds error exhaustiveness and dead code. |
| `defineConfig()` helper | Type-safe config with full autocomplete, following Vite/Vitest convention. |
| Bun-first runtime | Native TypeScript execution, faster startup, modern tooling. Node as fallback for compatibility. |
| Ink for CLI rendering | Rich terminal UI with React patterns. Syntax-highlighted code frames, live progress, beautiful diagnostics. |
| Syntax-highlighted code frames | Shiki/Prism for TypeScript colorization in terminal. Errors are easy to read at a glance. |
| Per-module incremental compilation | Right granularity for watch mode — not too coarse (whole project), not too fine (individual expressions). |
| Diagnostic-based errors | Collect all errors before failing. Every diagnostic has a suggestion field for LLM consumption. |
| IR as stable contract | Future tools (codegen, UI lib, MCP) consume the same IR without breaking changes. |

---

## Open Items

- [ ] **Exact diagnostic codes** — Define the full VERTZ001-VERTZnnn code table
- [ ] **`vertz.config.ts` loading** — How does the compiler discover and load the config file?
- [ ] **Schema executor sandboxing** — Executing user schemas at compile time could have side effects. Should we sandbox the execution?
- [ ] **Manifest schema** — Publish a JSON Schema for the manifest format at `https://vertz.dev/manifest.schema.json`?
- [ ] **Error exhaustiveness analysis** — How to infer throwable error types from service methods for strict mode
- [ ] **Ink syntax highlighting library** — Evaluate `ink-syntax-highlight` or custom Prism/Shiki integration for terminal code frames
- [ ] **Sourcemaps for generated files** — Additive, generator-level change. IR already carries `sourceFile`/`sourceLine`/`sourceColumn`. Use `magic-string` or similar to emit `.map` files alongside generated output.
- [ ] **SSE and WebSocket support** — API design TBD (route methods vs separate construct). IR needs to represent real-time endpoints. Impacts route analyzer, OpenAPI generator (async API?), route table, manifest.

## Resolved Items

- [x] **Incremental compilation granularity** — Per-module re-analysis
- [x] **Config type safety** — `defineConfig()` typed helper function
- [x] **Runtime** — Bun-first, Node as fallback
- [x] **CLI renderer** — Ink (React for terminals)
- [x] **Build-time safety model** — Always-on framework plumbing guarantees + opt-in strict mode
- [x] **OTel placement** — Runtime responsibility (`@vertz/core`), not compiler
- [x] **Source location consistency** — All IR types include `sourceFile`, `sourceLine`, `sourceColumn`
- [x] **Middleware body schema** — `MiddlewareIR` includes `body`, `params`, `query` in addition to `headers`
- [x] **Env analysis** — `EnvAnalyzer` and `EnvIR` capture env schema for strict mode and manifest
- [x] **Rendering separation** — Ink components live in `@vertz/cli`, compiler produces `Diagnostic[]` only
- [x] **Test location convention** — `__tests__/` subfolder inside each source directory
- [x] **Module options validation** — Added to always-on safety guarantees
