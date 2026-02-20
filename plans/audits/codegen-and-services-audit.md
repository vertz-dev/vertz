# Codegen & Services Audit

## What Exists

### Codegen Package (`packages/codegen`)
| File | Description |
|------|-------------|
| `src/generate.ts` | Main orchestrator: `generate(appIR, config) → GenerateResult` |
| `src/config.ts` | Config types: `defineCodegenConfig()`, `resolveCodegenConfig()` |
| `src/ir-adapter.ts` | Adapts AppIR → CodegenIR |
| `src/pipeline.ts` | Codegen pipeline orchestration |
| `src/incremental.ts` | Incremental file writing with hashing |
| `src/generators/typescript/emit-client.ts` | Generates SDK client (`createClient`) |
| `src/generators/typescript/emit-sdk.ts` | Generates SDK package files |
| `src/generators/typescript/emit-routes.ts` | Generates route map types |
| `src/generators/typescript/emit-types.ts` | Generates TypeScript interfaces from schemas |

### Core Package (`packages/core/src/module`)
| File | Description |
|------|-------------|
| `module.ts` | `createModule(definition, {services, routers, exports})` |
| `module-def.ts` | `createModuleDef({name})` |
| `service.ts` | `createServiceDef(moduleName, config)` |
| `router-def.ts` | Router definition with methods chaining |

### Server Package (`packages/server/src/domain`)
| File | Description |
|------|-------------|
| `domain.ts` | **STUB** - `domain(name?, options?) → DomainDefinition` |
| `types.ts` | Domain types: `DomainDefinition`, `DomainOptions`, `AccessRules`, `DomainType` |

### Compiler Package (`packages/compiler`)
Analyzes source code and produces **AppIR** (Intermediate Representation):
- Schema analyzer → schema IR
- Route analyzer → route IR  
- Service analyzer → service IR
- Module analyzer → module IR

---

## Current APIs

### Codegen
```typescript
// Config
defineCodegenConfig({
  generators: ['typescript', 'cli'],
  outputDir: '.vertz/generated',
  typescript: {
    schemas: true,
    clientName: 'createClient',
    publishable: { name: '@myapp/sdk', outputDir: './sdk', version: '1.0.0' }
  }
})

// Generation
generate(appIR: AppIR, config: ResolvedCodegenConfig): Promise<GenerateResult>
```

### Core Module System
```typescript
// Module definition
const moduleDef = createModuleDef({ name: 'tasks' });

// Service
const taskService = moduleDef.service({
  methods: () => createTaskMethods()
});

// Router
const taskRouter = moduleDef
  .router({ prefix: '/tasks', inject: { taskService } })
  .get('/', { query, handler: async (ctx) => ctx.taskService.list(...) })
  .post('/', { body, handler: async (ctx) => ctx.taskService.create(...) });

// Module
export const taskModule = createModule(moduleDef, {
  services: [taskService],
  routers: [taskRouter],
  exports: [taskService]
});

// App
vertz.app({ basePath: '/api' })
  .register(taskModule)
  .listen(PORT);
```

### Domain (STUB)
```typescript
domain<TEntry>('tasks', {
  type: 'persisted',
  table: tasksTable,
  access: {
    read: (row, ctx) => ctx.user?.role === 'admin',
    create: (data, ctx) => !!ctx.user,
    // ...
  },
  handlers: { ... },
  actions: { ... }
})
```

---

## Code Examples

### Service Pattern (from `examples/task-api`)
```typescript
export function createTaskMethods() {
  return {
    async list(input: ListTasksInput = {}) {
      const where: TaskFilter = {};
      if (input.status) where.status = input.status;
      const result = await db.listAndCount('tasks', { where, limit, offset });
      return { data: result.data.map(serializeTask), total };
    },
    async getById(id: string) { /* ... */ },
    async create(input: CreateTaskInput) { /* ... */ },
    async update(id: string, input: UpdateTaskInput) { /* ... */ },
    async remove(id: string) { /* ... */ },
  };
}
```

### Module Wiring (from `examples/task-api`)
```typescript
const taskModule = vertz.module(taskDef, {
  services: [taskService],
  routers: [taskRouter],
  exports: [taskService],
});
```

---

## Design Docs

- **`plans/vertz-features.md`**: Mentions "Client SDK generation from OpenAPI" as a future feature
- **`plans/vertz-schema-design.md`**: "Named schemas become `$ref` entries in JSON Schema... enabling named types for type-augmentation and client SDK generation"
- No dedicated "codegen design" doc found

---

## Gap Analysis

### What's Built ✓
1. **Module → Service → Router** pattern in `@vertz/core`
2. **Codegen package** generates TypeScript SDK from AppIR
3. **Compiler** produces AppIR from source analysis
4. **DB package** provides schema/ORM
5. **Schema package** provides request/response validation

### What's Missing ✗

| Gap | Description |
|-----|-------------|
| **Domain → Codegen** | No integration between `@vertz/server` domain() and codegen — domain is a STUB, no IR emission |
| **OpenAPI → SDK** | Codegen generates from AppIR (internal IR), not from OpenAPI spec — reverse of typical flow |
| **DB → Domain** | No automatic domain generation from DB schema |
| **Schema → Types** | Schema package validated at runtime; codegen emits types but they're not integrated with schema validation |
| **SDK → UI** | No UI codegen (React Query hooks, etc.) — only TypeScript client |
| **Incremental** | Codegen has incremental mode but not used in dev workflow |

### E2E Flow Status

```
Schema (runtime validation)
    ↓
DB (schema + ORM)
    ↓
Service (business logic) ←── Current: Fully working
    ↓
Module/Router (HTTP layer) ←── Current: Fully working
    ↓
Compiler (AppIR) ←── Current: Working
    ↓
Codegen (SDK) ←── Current: Working but:
    │  • Not connected to domain()
    │  • No OpenAPI input
    │  • Only TypeScript client (no React hooks)
    ↓
UI ←── Gap: No codegen for UI layer
```

---

## Summary

The **module/service/router** pattern is fully functional in `@vertz/core`. The **codegen package** works for generating TypeScript SDKs from the compiler's AppIR. However, the **domain()** function in `@vertz/server` is still a **STUB**, and there's **no integration** between domain definitions and codegen. The E2E flow from schema → DB → service → domain → codegen → UI is **incomplete** — codegen generates SDKs but they're not connected to domain logic, and there's no UI layer codegen.
