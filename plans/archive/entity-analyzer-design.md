# Entity Analyzer — Design Doc v2

**Author:** Mika (VP Engineering)
**Date:** 2026-02-20
**Status:** Draft (v2 — addresses review feedback)
**Related:** [EDA Design](entity-driven-architecture.md), [Entity Store Design](entity-store-design.md), [Cross-Component Tracing Spec](cross-component-tracing-spec.md)
**Reviews:** [Compiler Expert](reviews/entity-analyzer-review-compiler-expert.md), [DX Skeptic](reviews/entity-analyzer-review-dx-skeptic.md), [Devil's Advocate](reviews/entity-analyzer-review-devils-advocate.md)

---

## 1. Problem

The EDA runtime is shipped — `entity()` defines entities with CRUD, access rules, hooks, actions, and relations at runtime. But the **compiler doesn't know entities exist.** Without compiler awareness:

- Codegen can't generate typed SDKs from entity definitions
- The field-access analyzer can't trace entity data through components
- OpenAPI generation misses entity-generated routes
- The "wow moment" demo (schema → entity → CRUD → SDK → UI → SSR) is broken at the compiler step

The EntityAnalyzer closes this gap: it teaches the compiler to understand `entity()` calls and emit structured IR that feeds into codegen and SDK generation.

## 2. Goals

1. **Static extraction** — Parse `entity(name, config)` calls from source files using ts-morph
2. **IR emission** — Produce `EntityIR` nodes as a first-class concept in `AppIR`
3. **Schema resolution** — Extract `$response`, `$create_input`, `$update_input` types from model references for fully typed SDK generation
4. **Codegen bridge** — Extend `ir-adapter.ts` with entity-aware processing to generate typed SDK methods (`.list()`, `.get()`, `.create()`, `.update()`, `.delete()`, plus custom actions)
5. **Route inference** — Generate `RouteIR` entries for auto-CRUD routes so OpenAPI and route-table generators work automatically
6. **Diagnostics** — Report clear errors for malformed entity definitions, with debug output

## 3. Non-Goals

- Runtime behavior changes (entity runtime is stable)
- Auth/access rule analysis (access rules are opaque functions — the compiler records their presence, not their logic)
- Hook analysis (before/after hooks are opaque functions)
- Relation graph resolution (v0.2 — requires cross-file type resolution)
- `domain()` grouping (v0.2 — entities land in a synthetic `"entities"` module for now)

## 3.1 Architectural Context

**Decision: [Entity-First Architecture](decisions/2026-02-20-entity-first-architecture.md)** — Entities are THE way to build APIs. Modules/routers/services are deprecated and will be removed once entities are proven end-to-end. The EntityAnalyzer is the **primary** compiler path, not a secondary addition.

**Compiler portability:** The current ts-morph implementation is temporary. The compiler will eventually move to Zig or Bun's native toolchain. Design implications:
- IR types (`EntityIR`, `AppIR`, `CodegenIR`) are the contract — the analyzer is swappable
- Keep detection logic simple enough for a native parser to replicate
- Test against IR output, not ts-morph internals
- Schema resolution fallback (`resolved: false`) must be graceful for incremental native support

## 4. Design

### 4.1 EntityAnalyzer Class

Follows the established analyzer pattern:

```typescript
// packages/compiler/src/analyzers/entity-analyzer.ts

export interface EntityAnalyzerResult {
  entities: EntityIR[];
}

export class EntityAnalyzer extends BaseAnalyzer<EntityAnalyzerResult> {
  async analyze(): Promise<EntityAnalyzerResult> {
    const entities: EntityIR[] = [];
    const seenNames = new Map<string, SourceLocation>();

    for (const file of this.project.getSourceFiles()) {
      if (!this.isEntityFile(file)) continue;
      for (const callExpr of this.findEntityCalls(file)) {
        const entity = this.extractEntity(file, callExpr);
        if (!entity) continue;

        // Duplicate detection
        const existing = seenNames.get(entity.name);
        if (existing) {
          this.addDiagnostic({
            code: 'ENTITY_DUPLICATE_NAME',
            severity: 'error',
            message: `Duplicate entity name "${entity.name}" — first defined at ${existing.sourceFile}:${existing.sourceLine}`,
            ...getSourceLocation(callExpr),
          });
          continue;
        }
        seenNames.set(entity.name, entity);
        entities.push(entity);
      }
    }
    return { entities };
  }
}
```

### 4.2 Import Detection (addresses Compiler Expert §1.1)

A file is an "entity file" if it imports from `@vertz/server` in any form:

```typescript
private isEntityFile(file: SourceFile): boolean {
  return file.getImportDeclarations().some(decl => {
    const specifier = decl.getModuleSpecifierValue();
    return specifier === '@vertz/server';
  });
}
```

**Call detection uses symbol resolution** (not text matching) via the existing `isFromImport()` utility. This handles:

| Import Pattern | Detected? |
|---|---|
| `import { entity } from '@vertz/server'` | ✅ |
| `import { entity as e } from '@vertz/server'` | ✅ |
| `import * as server from '@vertz/server'` | ✅ |

```typescript
private findEntityCalls(file: SourceFile): CallExpression[] {
  return file.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => {
      const expr = call.getExpression();

      // Direct call: entity(...) or aliasedName(...)
      if (expr.isKind(SyntaxKind.Identifier)) {
        return isFromImport(expr, '@vertz/server', 'entity');
      }

      // Namespace call: server.entity(...)
      if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const propName = expr.getName();
        const obj = expr.getExpression();
        return propName === 'entity'
          && obj.isKind(SyntaxKind.Identifier)
          && isNamespaceImportFrom(obj, '@vertz/server');
      }

      return false;
    });
}
```

**Known limitation:** Re-exports through barrel files (e.g., `export { entity } from '@vertz/server'` in an intermediate file, then importing from that barrel) are NOT detected in v0.1. The analyzer emits a diagnostic if it finds `entity`-like call expressions that don't resolve to `@vertz/server`:

```
ENTITY_UNRESOLVED_IMPORT: Found entity() call at {file}:{line} but could not resolve import to @vertz/server. If using a barrel file re-export, import directly from @vertz/server.
```

### 4.3 EntityIR (addresses Compiler Expert §2, Devil's Advocate §1.1)

**Entities are first-class in the IR**, not shoehorned into ModuleIR. The IR carries full entity semantics through the pipeline.

New IR types in `packages/compiler/src/ir/types.ts`:

```typescript
// ── Entity ─────────────────────────────────────────────────────────

export interface EntityIR extends SourceLocation {
  name: string;
  modelRef: EntityModelRef;
  access: EntityAccessIR;
  hooks: EntityHooksIR;
  actions: EntityActionIR[];
  relations: EntityRelationIR[];
}

export interface EntityModelRef {
  /** Variable name of the model (e.g., 'usersModel') */
  variableName: string;
  /** Import source if resolvable (e.g., './models') */
  importSource?: string;
  /** Table name extracted from model if statically determinable */
  tableName?: string;
  /** Schema refs extracted from model type */
  schemaRefs: EntityModelSchemaRefs;
}

export interface EntityModelSchemaRefs {
  /** Schema for entity responses (GET, list items) */
  response?: SchemaRef;
  /** Schema for create input (POST body) */
  createInput?: SchemaRef;
  /** Schema for update input (PATCH body) */
  updateInput?: SchemaRef;
  /** Whether schema resolution succeeded */
  resolved: boolean;
}

export interface EntityAccessIR {
  /** Which CRUD operations have explicit access rules */
  list: EntityAccessRuleKind;
  get: EntityAccessRuleKind;
  create: EntityAccessRuleKind;
  update: EntityAccessRuleKind;
  delete: EntityAccessRuleKind;
  /** Custom action access rules */
  custom: Record<string, EntityAccessRuleKind>;
}

/** 'none' = no rule defined (default open), 'false' = explicitly disabled, 'function' = custom rule */
export type EntityAccessRuleKind = 'none' | 'false' | 'function';

export interface EntityHooksIR {
  before: ('create' | 'update')[];
  after: ('create' | 'update' | 'delete')[];
}

export interface EntityActionIR extends SourceLocation {
  name: string;
  inputSchemaRef: SchemaRef;
  outputSchemaRef: SchemaRef;
}

export interface EntityRelationIR {
  name: string;
  /** true = include all fields, string[] = specific fields */
  selection: 'all' | string[];
}
```

### 4.4 AppIR Extension

```typescript
export interface AppIR {
  app: AppDefinition;
  env?: EnvIR;
  modules: ModuleIR[];
  middleware: MiddlewareIR[];
  schemas: SchemaIR[];
  entities: EntityIR[];        // ← NEW (first-class)
  dependencyGraph: DependencyGraphIR;
  diagnostics: Diagnostic[];
}
```

### 4.5 Schema Resolution from Model Types (addresses all three reviews)

This is critical for typed SDK generation. The analyzer resolves model variable types to extract schema information:

```typescript
private resolveModelSchemas(
  file: SourceFile,
  modelExpr: Expression,
): EntityModelSchemaRefs {
  try {
    // Get the type of the model expression
    const modelType = modelExpr.getType();

    // Look for table property which contains $response, $create_input, $update_input
    const tableProp = modelType.getProperty('table');
    if (!tableProp) return { resolved: false };

    const tableType = tableProp.getTypeAtLocation(modelExpr);

    const responseType = tableType.getProperty('$response');
    const createInputType = tableType.getProperty('$create_input');
    const updateInputType = tableType.getProperty('$update_input');

    return {
      response: responseType
        ? this.typeToSchemaRef(responseType, file)
        : undefined,
      createInput: createInputType
        ? this.typeToSchemaRef(createInputType, file)
        : undefined,
      updateInput: updateInputType
        ? this.typeToSchemaRef(updateInputType, file)
        : undefined,
      resolved: true,
    };
  } catch {
    return { resolved: false };
  }
}
```

When resolution fails (dynamic expressions, unresolvable types), the analyzer:
1. Sets `schemaRefs.resolved = false`
2. Emits diagnostic: `ENTITY_MODEL_UNRESOLVABLE: Could not resolve model types for entity "{name}". SDK methods will use 'unknown' types. Ensure the model variable has explicit types.`
3. Codegen generates `unknown` types — functional but untyped

**Handled model patterns:**

| Pattern | Resolvable? |
|---|---|
| `model: usersModel` (simple variable) | ✅ Yes |
| `model: createModel(...)` (factory call with return type) | ✅ Yes (via return type) |
| `model: condition ? a : b` | ❌ No — diagnostic emitted |
| `model: getModel()` (untyped return) | ❌ No — diagnostic emitted |

### 4.6 Extraction Logic

The analyzer extracts data from the second argument (config object literal) of `entity()`:

**Entity name** — first argument, must be a string literal:
```typescript
const nameArg = call.getArguments()[0];
const name = getStringValue(nameArg);
if (name === null) {
  this.addDiagnostic({ code: 'ENTITY_NON_LITERAL_NAME', severity: 'error', ... });
  return null;
}
if (!ENTITY_NAME_PATTERN.test(name)) {
  this.addDiagnostic({ code: 'ENTITY_INVALID_NAME', severity: 'error', ... });
  return null;
}
```

**Config must be an object literal** for static analysis:
```typescript
const configArg = call.getArguments()[1];
if (!configArg?.isKind(SyntaxKind.ObjectLiteralExpression)) {
  this.addDiagnostic({ code: 'ENTITY_CONFIG_NOT_OBJECT', severity: 'warning', ... });
  return null;
}
```

**Access rules** — detect rule kind per operation:
```typescript
// { access: { list: true, create: (ctx) => ..., delete: false } }
// true/omitted → 'none' (allowed, no special rule)
// false → 'false' (explicitly disabled)
// function → 'function' (custom rule)
```

Access rule parsing also handles custom action keys. Unknown operation names emit `ENTITY_UNKNOWN_ACCESS_OP`.

**Hooks** — presence detection only (functions are opaque):
```typescript
// { before: { create: fn } } → hooks.before = ['create']
// { after: { delete: fn } }  → hooks.after = ['delete']
```

**Custom actions** — extract name + schema refs from `actions` property:
```typescript
// { actions: { archive: { input: archiveInput, output: archiveOutput, handler: fn } } }
```

Action names are validated: must not collide with CRUD operation names (`list`, `get`, `create`, `update`, `delete`). Collision emits `ENTITY_ACTION_NAME_COLLISION`.

**Relations** — extract name + field selection:
```typescript
// { relations: { owner: true } }       → [{ name: 'owner', selection: 'all' }]
// { relations: { owner: { id: true } } } → [{ name: 'owner', selection: ['id'] }]
// { relations: { owner: false } }      → excluded from IR
```

### 4.7 Route Inference

A separate transform in `packages/compiler/src/ir/entity-route-injector.ts` generates `RouteIR` entries from EntityIR. These are injected into a synthetic module (`name: "__entities"`, prefixed with `__` to avoid collision with user modules).

| Entity Operation | HTTP Method | Path | OperationId |
|-----------------|-------------|------|-------------|
| list | GET | `/{entity-name}` | `list{EntityName}` |
| get | GET | `/{entity-name}/:id` | `get{EntityName}` |
| create | POST | `/{entity-name}` | `create{EntityName}` |
| update | PATCH | `/{entity-name}/:id` | `update{EntityName}` |
| delete | DELETE | `/{entity-name}/:id` | `delete{EntityName}` |
| {action} | POST | `/{entity-name}/:id/{action}` | `{action}{EntityName}` |

**Route filtering rules:**
- CRUD routes are **skipped** when `access[operation] === 'false'`
- Custom action routes are **skipped** when `access.custom[actionName] === 'false'`
- An entity with ALL operations disabled emits: `ENTITY_NO_ROUTES: Entity "{name}" has no accessible operations. All CRUD and action routes are disabled.`

**Route schemas** come from `modelRef.schemaRefs`:
- GET list response: `SchemaRef` → array of `$response`
- GET single response: `SchemaRef` → `$response`
- POST body: `SchemaRef` → `$create_input`
- PATCH body: `SchemaRef` → `$update_input`
- DELETE response: `SchemaRef` → `$response`
- Custom action: `inputSchemaRef` / `outputSchemaRef` from `EntityActionIR`

When `schemaRefs.resolved === false`, route schemas are omitted and codegen falls back to `unknown`.

**Collision detection** (addresses Devil's Advocate §5.3):
- OperationId collision between entity routes and module routes → `ENTITY_ROUTE_COLLISION: Entity-generated operationId "{id}" collides with existing route at {location}`
- Custom action name collision with CRUD names → caught in extraction (§4.6)

### 4.8 Codegen Integration (addresses Devil's Advocate §1.1)

`ir-adapter.ts` is updated to handle entities as a **first-class concept**:

```typescript
export function adaptIR(appIR: AppIR): CodegenIR {
  // ... existing module/schema processing ...

  // NEW: Process entities into entity-specific codegen modules
  const entityModules: CodegenEntityModule[] = (appIR.entities ?? []).map(entity => ({
    entityName: entity.name,
    operations: buildEntityOperations(entity),
    schemaRefs: entity.modelRef.schemaRefs,
    actions: entity.actions.map(a => ({
      name: a.name,
      inputSchema: resolveSchemaRef(a.inputSchemaRef),
      outputSchema: resolveSchemaRef(a.outputSchemaRef),
    })),
  }));

  return {
    basePath: appIR.app.basePath,
    version: appIR.app.version,
    modules: sortedModules,
    schemas: allSchemas,
    entities: entityModules,  // ← NEW
    auth: { schemes: [] },
  };
}
```

**CodegenIR extension:**

```typescript
export interface CodegenIR {
  basePath: string;
  version?: string;
  modules: CodegenModule[];
  schemas: CodegenSchema[];
  entities: CodegenEntityModule[];  // ← NEW
  auth: { schemes: [] };
}

export interface CodegenEntityModule {
  entityName: string;
  operations: CodegenEntityOperation[];
  schemaRefs: EntityModelSchemaRefs;
  actions: CodegenEntityAction[];
}

export interface CodegenEntityOperation {
  kind: 'list' | 'get' | 'create' | 'update' | 'delete';
  method: HttpMethod;
  path: string;
  operationId: string;
  inputSchema?: string;   // resolved schema name
  outputSchema?: string;  // resolved schema name
}

export interface CodegenEntityAction {
  name: string;
  inputSchema?: string;
  outputSchema?: string;
}
```

**SDK generators** produce entity-specific output:

```typescript
// Generated: sdk/entities/tasks.ts
export const tasks = {
  list: (params?: ListTasksParams) => client.get<TaskResponse[]>('/tasks', { params }),
  get: (id: string) => client.get<TaskResponse>(`/tasks/${id}`),
  create: (body: CreateTaskInput) => client.post<TaskResponse>('/tasks', body),
  update: (id: string, body: UpdateTaskInput) => client.patch<TaskResponse>(`/tasks/${id}`, body),
  delete: (id: string) => client.delete<TaskResponse>(`/tasks/${id}`),
  archive: (id: string, body: ArchiveInput) => client.post<ArchiveOutput>(`/tasks/${id}/archive`, body),
};
```

### 4.9 Compiler Integration

In `compiler.ts`:

```typescript
export interface CompilerDependencies {
  analyzers: {
    // ... existing ...
    entity: Analyzer<EntityAnalyzerResult>;  // ← NEW
  };
  // ...
}
```

In `analyze()`:
```typescript
async analyze(): Promise<AppIR> {
  const ir = createEmptyAppIR();
  // ... existing analyzers ...
  const entityResult = await analyzers.entity.analyze();
  ir.entities = entityResult.entities;

  // Inject entity routes into synthetic module for OpenAPI/route-table generators
  injectEntityRoutes(ir);

  // Validate no operationId collisions between entity and module routes
  detectRouteCollisions(ir);

  return enrichSchemasWithModuleNames(ir);
}
```

### 4.10 Debug Output (addresses DX Skeptic §3)

When `VERTZ_DEBUG=entities` or `--debug entities`:

```
[entity-analyzer] Scanning 42 source files...
[entity-analyzer] Detected entity: "tasks" at src/entities/tasks.ts:15
[entity-analyzer]   model: tasksModel (resolved: ✅)
[entity-analyzer]   access: list ✓, get ✓, create ✓, update ✓, delete ✗
[entity-analyzer]   hooks: before[create], after[create, delete]
[entity-analyzer]   actions: archive
[entity-analyzer] Detected entity: "users" at src/entities/users.ts:8
[entity-analyzer]   model: usersModel (resolved: ✅)
[entity-analyzer]   access: list ✓, get ✓, create ✓, update ✓, delete ✓
[entity-analyzer] Routes generated: 9 (listTasks, getTasks, createTasks, updateTasks, archiveTasks, listUsers, getUsers, createUsers, updateUsers, deleteUsers)
[entity-analyzer] Routes skipped: 1 (deleteTasks — access.delete === false)
```

### 4.11 Diagnostics

| Code | Severity | Message |
|------|----------|---------|
| `ENTITY_INVALID_NAME` | error | Entity name must match `/^[a-z][a-z0-9-]*$/`. Got: "{name}" |
| `ENTITY_MISSING_MODEL` | error | entity() requires a model property in the config object |
| `ENTITY_NON_LITERAL_NAME` | error | entity() name must be a string literal (dynamic names cannot be analyzed statically) |
| `ENTITY_DUPLICATE_NAME` | error | Duplicate entity name "{name}" — first defined at {location} |
| `ENTITY_CONFIG_NOT_OBJECT` | warning | entity() config must be an object literal for static analysis. This entity will be ignored by the compiler. |
| `ENTITY_UNKNOWN_ACCESS_OP` | warning | Unknown access operation "{op}" — expected list, get, create, update, delete, or a custom action name |
| `ENTITY_MODEL_UNRESOLVABLE` | warning | Could not resolve model types for entity "{name}". SDK methods will use 'unknown' types. |
| `ENTITY_UNRESOLVED_IMPORT` | warning | Found entity() call but could not resolve import to @vertz/server. If using a barrel file re-export, import directly from @vertz/server. |
| `ENTITY_NO_ROUTES` | warning | Entity "{name}" has no accessible operations. All CRUD and action routes are disabled. |
| `ENTITY_ROUTE_COLLISION` | error | Entity-generated operationId "{id}" collides with existing route at {location} |
| `ENTITY_ACTION_NAME_COLLISION` | error | Custom action name "{name}" collides with built-in CRUD operation |
| `ENTITY_ACTION_MISSING_SCHEMA` | warning | Custom action "{name}" on entity "{entity}" is missing input or output schema |

## 5. File Structure

```
packages/compiler/src/
  analyzers/
    entity-analyzer.ts           # EntityAnalyzer class
    entity-analyzer.test.ts      # Unit tests
  ir/
    types.ts                     # EntityIR types (modified)
    builder.ts                   # createEmptyAppIR updated (modified)
    entity-route-injector.ts     # Route generation from EntityIR
    entity-route-injector.test.ts

packages/codegen/src/
  ir-adapter.ts                  # Entity-aware adaptation (modified)
  types.ts                       # CodegenEntityModule types (modified)
  generators/
    entity-sdk-generator.ts      # Entity SDK output
    entity-sdk-generator.test.ts
```

## 6. Test Plan

### 6.1 Entity Detection & Extraction

- Detects `entity()` call imported from `@vertz/server` (named import)
- Detects aliased import (`import { entity as e }`)
- Detects namespace import (`server.entity()`)
- Ignores `entity()` from other imports
- Extracts entity name from string literal
- Extracts model variable reference
- Resolves model type to `$response`, `$create_input`, `$update_input` schemas
- Emits `ENTITY_MODEL_UNRESOLVABLE` when model type can't be resolved
- Extracts access rules (none/false/function per operation)
- Extracts custom action access rules
- Extracts before/after hook presence
- Extracts custom actions with schema refs
- Extracts relations with field selections (`true` → 'all', object → field list)
- Reports `ENTITY_NON_LITERAL_NAME` for dynamic names
- Reports `ENTITY_MISSING_MODEL` for missing model
- Reports `ENTITY_INVALID_NAME` for invalid name pattern
- Reports `ENTITY_DUPLICATE_NAME` for duplicate entity names
- Reports `ENTITY_CONFIG_NOT_OBJECT` when config is not object literal
- Reports `ENTITY_ACTION_NAME_COLLISION` when action name collides with CRUD
- Reports `ENTITY_UNRESOLVED_IMPORT` for barrel file re-exports
- Handles multiple entities in same file
- Handles entities across multiple files

### 6.2 Route Injection

- Generates 5 CRUD routes per entity (list/get/create/update/delete)
- Skips CRUD routes where `access[op] === 'false'`
- Skips custom action routes where `access.custom[action] === 'false'`
- Generates action routes (POST `/:id/{action}`)
- Sets correct operationId (camelCase: `listUsers`, `getUsers`, etc.)
- Sets correct HTTP methods and paths
- Includes schema refs on routes when model is resolved
- Omits schema refs when model is unresolved
- Detects operationId collisions with module routes
- Emits `ENTITY_NO_ROUTES` for entities with all operations disabled
- Routes land in synthetic `__entities` module
- Includes source location from entity definition

### 6.3 Codegen Integration

- `ir-adapter.ts` produces `CodegenEntityModule[]` from `EntityIR[]`
- Entity SDK generator produces typed client methods
- SDK methods use resolved schema types when available
- SDK methods fall back to `unknown` when schemas unresolved
- Custom actions appear in SDK
- Entity routes appear in OpenAPI output
- Existing module-based codegen continues working (no regressions)

### 6.4 Debug Output

- `VERTZ_DEBUG=entities` logs detected entities
- Logs route generation and skip reasons
- Logs model resolution success/failure

## 7. Migration / Compatibility

This is purely additive:
- `AppIR.entities` defaults to `[]` in `createEmptyAppIR()`
- `CodegenIR.entities` defaults to `[]`
- Entity-generated routes flow through synthetic `__entities` module for existing generators
- No existing APIs change
- No breaking changes to codegen consumers

## 8. Review Decisions Log

| # | Review Concern | Decision |
|---|---|---|
| 1 | Import detection too naive (text matching) | **Fixed v2:** Use `isFromImport()` for symbol resolution. Handle aliased and namespace imports. Barrel re-exports emit diagnostic. |
| 2 | Schema extraction deferred to v0.2 | **Fixed v2:** Resolve model types in v0.1. Extract `$response/$create_input/$update_input` via ts-morph type resolution. Fallback to `unknown` with diagnostic. |
| 3 | Synthetic ModuleIR is semantically confusing | **Fixed v2:** Entities are first-class in IR (`AppIR.entities`) and codegen (`CodegenIR.entities`). Synthetic `__entities` module only used for OpenAPI/route-table generators that need RouteIR. |
| 4 | ir-adapter.ts doesn't process entities | **Fixed v2:** Added explicit entity handling in ir-adapter.ts with `CodegenEntityModule` type. Entity SDK generator is separate from module SDK. |
| 5 | Custom action routes not filtered by access | **Fixed v2:** Custom action routes skipped when `access.custom[name] === 'false'`. |
| 6 | No collision detection | **Fixed v2:** `detectRouteCollisions()` checks entity vs module operationIds. Action names validated against CRUD names. |
| 7 | No debugging story | **Fixed v2:** `VERTZ_DEBUG=entities` mode with detailed logging of detection, resolution, and route generation. |
| 8 | No warning for dead entities | **Fixed v2:** `ENTITY_NO_ROUTES` diagnostic when all operations disabled. |
| 9 | EntityRelationIR missing targetEntity | **Deferred v0.2:** Requires cross-file type resolution to determine target entity. For now, relations carry name + field selection only. |
| 10 | Import path versioning fragility (@vertz/server) | **Accepted risk:** If entity() moves packages, the import check updates trivially. No mitigation needed for v0.1. |

## 9. Effort Estimate

| Task | Estimate |
|------|----------|
| EntityIR types + AppIR extension | 0.5 day |
| EntityAnalyzer (detection + extraction + schema resolution) | 1.5 days |
| Route injection + collision detection | 0.5 day |
| Codegen: ir-adapter entity handling + entity SDK generator | 1 day |
| Compiler wiring + debug output | 0.5 day |
| Tests (analyzer + route injection + codegen + integration) | 1 day |
| **Total** | **~5 days** |

With agents executing in parallel after spec approval, implementation can ship in 1-2 days.
