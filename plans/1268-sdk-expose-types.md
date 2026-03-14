# SDK Types Reflect Entity Expose Config (#1268)

## Problem

The entity `expose.select` config defines which fields are visible through the API. The runtime enforces this, and the OpenAPI spec generator (#1266) respects it. But the **SDK codegen** does not — generated types include ALL table fields regardless of exposure.

This breaks end-to-end type safety: a developer can access `task.internalNotes` in their component without a TypeScript error, even though the API will never return that field.

```
expose.select: { id, title, status }
  → Runtime enforcement: only returns { id, title, status }       ✅
  → OpenAPI spec schemas: only lists { id, title, status }        ✅ (PR #1266)
  → SDK generated types: includes ALL fields from table            ❌
```

## API Surface

### Default behavior (no expose defined)

When no `expose` config is present, the API returns all non-hidden fields. SDK types already reflect this correctly — no change needed.

```typescript
// Entity without expose — SDK types include all response fields
entity('notes', {
  model: noteModel,
  access: { list: rules.authenticated(), get: rules.authenticated() },
});

// Generated type includes all non-hidden fields from model ✅
interface NotesResponse {
  id: string;
  title: string;
  body: string;
  internalNotes: string;
  createdAt: string;
}
```

### Exposed fields filter response type

When `expose.select` is defined, the generated response type only includes those fields.

```typescript
entity('tasks', {
  model: taskModel,
  access: { list: rules.authenticated(), get: rules.authenticated() },
  expose: {
    select: { id: true, title: true, status: true, createdAt: true },
    include: {
      assignee: { select: { id: true, name: true } },
    },
  },
});

// Generated SDK response type — only exposed fields
interface TasksResponse {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  assignee?: { id: string; name: string };
}

// NOT: internalNotes, deletedAt, etc.
```

### Descriptor-guarded fields produce `T | null`

Fields with access rule descriptors (not plain `true`) generate nullable types. The field key is always present in the response — the runtime sets its value to `null` when the caller lacks the required entitlement (see `expose-evaluator.ts` → `nulledFields`).

```typescript
expose: {
  select: {
    id: true,
    name: true,
    salary: rules.entitlement('hr:view-compensation'),
  },
}

// Generated type:
interface EmployeesResponse {
  id: string;
  name: string;
  salary: number | null;  // null when entitlement not granted
}
```

This applies to any non-`true` descriptor: `rules.entitlement()`, `rules.role()`, `rules.all(...)`, `rules.any(...)`, `rules.authenticated()`, `rules.fva()`. If the value in `expose.select` is not the literal `true`, the field is conditionally visible.

### Explicit select narrows the return type

When the developer explicitly selects fields in a query, TypeScript narrows the return type. The `select` parameter uses `Record<K, true>` format, consistent with the existing VertzQL wire format and all other `select` surfaces in the codebase.

```typescript
// Full type by default
const tasks = await sdk.tasks.list();
tasks[0].title;   // ✅ string
tasks[0].status;  // ✅ string

// Narrowed type with explicit select
const tasks = await sdk.tasks.list({ select: { title: true, status: true } });
tasks[0].title;     // ✅ string
tasks[0].createdAt; // ❌ TypeScript error — not selected
```

**Generated SDK code (concrete example):**

```typescript
// Generated entities/tasks.ts
import type { TasksResponse } from '../types/tasks';

// ...
list: Object.assign(
  <K extends keyof TasksResponse = keyof TasksResponse>(
    query?: { select?: Record<K, true> } & Record<string, unknown>,
  ) => {
    const resolvedQuery = resolveVertzQL(query);
    return createDescriptor(
      'GET', '/tasks',
      () => client.get<ListResponse<Pick<TasksResponse, K>>>('/tasks', { query: resolvedQuery }),
      resolvedQuery,
      { entityType: 'tasks', kind: 'list' as const },
    );
  },
  { url: '/tasks', method: 'GET' as const },
),
```

When called without arguments, `K` defaults to `keyof TasksResponse`, so `Pick<TasksResponse, keyof TasksResponse>` resolves to `TasksResponse` — no explicit type parameters needed.

## Manifesto Alignment

### "If it builds, it works" (Principle 1)

This is the core alignment. Today, `task.internalNotes` compiles but fails at runtime — the API never returns it. After this change, the compiler catches the mismatch. The type system becomes the source of truth for what the API exposes.

### "One way to do things" (Principle 2)

The expose config is the single source of truth. It drives runtime enforcement, OpenAPI spec, AND SDK types. No divergence between what the API returns and what TypeScript allows. The `select` parameter in SDK queries uses `Record<K, true>` — the same shape as VertzQL, entity expose config, and the existing `get()` options.

### "AI agents are first-class users" (Principle 3)

An LLM generating a component against `TasksResponse` will only see fields the API actually returns. No more hallucinating access to `task.internalNotes` and getting `undefined` at runtime.

### Tradeoffs accepted

- Expose config extraction adds complexity to the compiler — justified because it closes a type-safety gap that affects every consumer.
- The compiler performs static analysis on expose config, which means dynamic expose configs (built at runtime) won't be analyzable — this is fine because expose configs are declarative by design.
- Phase 3 changes the generated SDK `list()` and `get()` method signatures to include generics. This is a breaking change to generated output, acceptable under pre-v1 policy.

## Non-Goals

- **Compiler auto-selection optimization** — The compiler analyzing which fields a component accesses and compiling a VertzQL query is a separate feature. This issue only ensures SDK types match the exposed surface.
- **OpenAPI spec generation** — Already done in #1266. Not touched here.
- **Runtime enforcement changes** — Already works correctly. Not touched here.
- **Relation nested include types** — Deep nested `include.include` (relations of relations) is out of scope. Only first-level relation includes are handled.
- **`allowWhere` / `allowOrderBy` extraction** — These `expose` sub-configs affect query parameter validation, not response types. They can be extracted in a follow-up for typed query parameters.
- **Per-operation expose filtering** — Different exposed fields for `list` vs. `get` vs. other operations. The expose config applies uniformly to all response types, matching the current runtime behavior.

## Unknowns

None identified. The patterns for extracting entity config from AST are well-established in the entity-analyzer, and the codegen pipeline has clear extension points.

## Limitations

### Static analysis only

The expose config must be an object literal for static analysis. Spread operators, computed property names, or variable references within `expose.select` / `expose.include` cannot be statically analyzed. The compiler emits an `ENTITY_EXPOSE_NON_LITERAL` diagnostic when these patterns are detected, alerting the developer.

### Cross-entity relation resolution

Relation types in `expose.include` require the target entity to be in the same compile scope. If entity A includes entity B but B is defined in a different package not analyzed together, the relation property is omitted from the generated type with a diagnostic.

## Type Flow Map

```
EntityDefinition.expose.select
  ↓ (entity-analyzer.ts — AST extraction)
EntityIR.expose: EntityExposeIR
  ↓ (ir-adapter.ts — maps to codegen types, pre-filters responseFields)
CodegenEntityModule.responseFields  ← filtered to only exposed, non-hidden fields
CodegenEntityModule.exposeSelect    ← field names + conditional flags
CodegenEntityModule.exposeInclude   ← relation names, entity, type, field types
  ↓ (entity-types-generator.ts — uses pre-filtered responseFields + conditional flags)
Generated interface TasksResponse { /* only exposed fields, conditional → T | null */ }
  ↓ (entity-sdk-generator.ts — generates generic signatures)
sdk.tasks.list() → ListResponse<TasksResponse>
sdk.tasks.list({ select: { title: true } }) → ListResponse<Pick<TasksResponse, 'title'>>
```

### Field filtering strategy

The IR adapter (`ir-adapter.ts`) is responsible for filtering `responseFields` to only include exposed, non-hidden fields. When `exposeSelect` is present:

1. Start with full `responseFields` from the model schema
2. Intersect with `exposeSelect` field names (only keep fields that are both in the model AND in expose.select)
3. Exclude any fields in `hiddenFields`
4. Mark fields as `conditional` based on `exposeSelect` (non-`true` values → `conditional: true`)

The types generator receives pre-filtered `responseFields` and the `conditional` flags, keeping the generator simple. When `exposeSelect` is absent (no expose config), `responseFields` is unchanged (all non-hidden fields).

### New IR types

```typescript
// compiler/src/ir/types.ts
interface EntityExposeIR {
  select: EntityExposeFieldIR[];
  include?: EntityExposeRelationIR[];
}

interface EntityExposeFieldIR {
  name: string;
  conditional: boolean;  // true = access rule descriptor (not plain `true`), field → T | null
}

interface EntityExposeRelationIR {
  name: string;
  entity?: string;  // target entity name (from relation resolution)
  type?: 'one' | 'many';  // relation cardinality
  select?: EntityExposeFieldIR[];  // undefined = all fields of target entity
}

// codegen/src/types.ts
interface CodegenExposeField {
  name: string;
  conditional: boolean;
}

interface CodegenExposeRelation {
  name: string;
  entity: string;        // target entity name (required for cross-entity lookup)
  type: 'one' | 'many';  // relation cardinality
  select?: CodegenExposeField[];  // undefined = all fields of target
  resolvedFields?: CodegenResolvedField[];  // pre-resolved from target entity's responseFields
}

// Added to CodegenEntityModule:
exposeSelect?: CodegenExposeField[];
exposeInclude?: CodegenExposeRelation[];
```

### Relation type resolution

When `exposeInclude` specifies `assignee: { select: { id: true, name: true } }`, the IR adapter resolves the relation's field types by looking up the target entity's `responseFields` in the same `AppIR.entities` array:

1. `EntityExposeRelationIR.entity` provides the target entity name (e.g., `'users'`)
2. The IR adapter finds the target entity in `AppIR.entities`
3. If `select` is specified, it filters the target's `responseFields` to only matching fields
4. If `select` is `undefined` (`include: { assignee: true }`), all target `responseFields` are included
5. The resolved fields are stored as `CodegenExposeRelation.resolvedFields`
6. If the target entity is not found (out of compile scope), the relation is omitted with a warning

The types generator then uses `resolvedFields` directly — no cross-entity lookup needed at generation time.

### Diagnostics

| Code | Severity | When |
|------|----------|------|
| `ENTITY_EXPOSE_NON_LITERAL` | warning | `expose.select` or `expose.include` contains spread operators, computed properties, or non-literal expressions that can't be statically analyzed |
| `ENTITY_EXPOSE_EMPTY_SELECT` | warning | `expose: { select: {} }` has zero exposed fields — likely a developer error |
| `ENTITY_EXPOSE_RELATION_UNRESOLVED` | warning | `expose.include` references a relation whose target entity is not in the compile scope |

## E2E Acceptance Test

```typescript
describe('Feature: SDK types reflect entity expose.select', () => {
  describe('Given an entity with expose.select filtering fields', () => {
    describe('When the SDK types are generated', () => {
      it('Then the response type only includes exposed fields', () => {
        // TasksResponse has id, title, status, createdAt
        // TasksResponse does NOT have internalNotes, deletedAt
      });
    });
  });

  describe('Given an entity with expose.include for relations', () => {
    describe('When the SDK types are generated', () => {
      it('Then the response type includes relation fields with correct shape', () => {
        // TasksResponse.assignee is { id: string; name: string } | undefined
      });
    });
  });

  describe('Given an entity with descriptor-guarded fields', () => {
    describe('When the SDK types are generated', () => {
      it('Then conditional fields are T | null in the response type', () => {
        // EmployeesResponse.salary is number | null
      });
    });
  });

  describe('Given an entity with compound descriptors (rules.all, rules.any)', () => {
    describe('When the SDK types are generated', () => {
      it('Then compound-guarded fields are also T | null', () => {
        // rules.all(rules.entitlement('x'), rules.role('admin')) → T | null
      });
    });
  });

  describe('Given an entity without expose config', () => {
    describe('When the SDK types are generated', () => {
      it('Then the response type includes all non-hidden fields (default behavior)', () => {
        // NotesResponse has all fields from the model
      });
    });
  });

  // Type-level tests (.test-d.ts)
  describe('Type flow verification', () => {
    it('accessing unexposed field is a TypeScript error', () => {
      // @ts-expect-error — internalNotes not in TasksResponse
      // task.internalNotes
    });

    it('descriptor-guarded field is T | null', () => {
      // employee.salary satisfies number | null
      // @ts-expect-error — salary is not just number
      // employee.salary satisfies number
    });

    it('explicit select narrows return type', () => {
      // sdk.tasks.list({ select: { title: true, status: true } })
      // @ts-expect-error — createdAt not in select
      // narrowedTask.createdAt
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Expose extraction in compiler + IR plumbing

**Goal:** Extract expose config from entity definitions into EntityIR, pipe through the IR adapter into CodegenEntityModule with pre-filtered responseFields.

**Changes:**
1. `packages/compiler/src/ir/types.ts` — Add `EntityExposeIR`, `EntityExposeFieldIR`, `EntityExposeRelationIR` to `EntityIR`
2. `packages/compiler/src/analyzers/entity-analyzer.ts` — Add `extractExpose()` method that reads `expose.select` and `expose.include` from the config object literal. Emit `ENTITY_EXPOSE_NON_LITERAL` diagnostic for spread/computed. Classify values as `conditional: true` when `getBooleanValue(value) !== true`.
3. `packages/codegen/src/types.ts` — Add `CodegenExposeField`, `CodegenExposeRelation`, and `exposeSelect`/`exposeInclude` to `CodegenEntityModule`
4. `packages/codegen/src/ir-adapter.ts` — Map `EntityIR.expose` → `CodegenEntityModule.exposeSelect`/`exposeInclude`. When `exposeSelect` is present, filter `responseFields` to only include exposed, non-hidden fields. Resolve relation field types by looking up target entity's `responseFields`.

**Acceptance criteria:**
```typescript
describe('Entity analyzer: expose extraction', () => {
  describe('Given an entity() call with expose.select containing true values', () => {
    describe('When the EntityAnalyzer runs', () => {
      it('Then EntityIR.expose.select contains { name, conditional: false } for each field', () => {});
    });
  });

  describe('Given an entity() call with expose.select containing a descriptor (rules.entitlement)', () => {
    describe('When the EntityAnalyzer runs', () => {
      it('Then the field has conditional: true', () => {});
    });
  });

  describe('Given expose.select with a compound descriptor (rules.all(...))', () => {
    describe('When the EntityAnalyzer runs', () => {
      it('Then the field has conditional: true', () => {});
    });
  });

  describe('Given expose.select with spread operator', () => {
    describe('When the EntityAnalyzer runs', () => {
      it('Then ENTITY_EXPOSE_NON_LITERAL diagnostic is emitted', () => {});
    });
  });

  describe('Given expose: { select: {} } (empty)', () => {
    describe('When the EntityAnalyzer runs', () => {
      it('Then ENTITY_EXPOSE_EMPTY_SELECT diagnostic is emitted', () => {});
    });
  });

  describe('Given expose.include with relation config', () => {
    describe('When the EntityAnalyzer runs', () => {
      it('Then EntityIR.expose.include contains the relation with its select fields', () => {});
    });
  });

  describe('Given an entity without expose config', () => {
    describe('When the EntityAnalyzer runs', () => {
      it('Then EntityIR.expose is undefined', () => {});
    });
  });
});

describe('IR adapter: expose piping', () => {
  describe('Given EntityIR with expose.select', () => {
    describe('When adaptIR maps to CodegenEntityModule', () => {
      it('Then exposeSelect contains the field names and conditional flags', () => {});
      it('Then responseFields is filtered to only exposed, non-hidden fields', () => {});
    });
  });

  describe('Given EntityIR with expose.include referencing a resolved entity', () => {
    describe('When adaptIR maps to CodegenEntityModule', () => {
      it('Then exposeInclude contains resolvedFields from the target entity', () => {});
    });
  });

  describe('Given EntityIR without expose config', () => {
    describe('When adaptIR maps to CodegenEntityModule', () => {
      it('Then exposeSelect is undefined and responseFields is unchanged', () => {});
    });
  });
});
```

### Phase 2: Response type filtering in entity-types-generator

**Goal:** Generate response types that reflect expose config. Conditional fields become `T | null`. Relations from `expose.include` are added as nested types.

**Changes:**
1. `packages/codegen/src/generators/entity-types-generator.ts` — When `exposeSelect` is present, use pre-filtered `responseFields`. For conditional fields, emit `type | null` instead of `type`.
2. `packages/codegen/src/generators/entity-types-generator.ts` — When `exposeInclude` is present, generate inline relation interfaces and add them as properties to the response type. One-relations are optional (`?`), many-relations are arrays.

**Acceptance criteria:**
```typescript
describe('Entity types generator: expose filtering', () => {
  describe('Given a CodegenEntityModule with exposeSelect', () => {
    describe('When entity types are generated', () => {
      it('Then the response interface only contains exposed fields', () => {
        // responseFields already pre-filtered by IR adapter
      });
      it('Then conditional fields have T | null type', () => {
        // salary: number | null
      });
    });
  });

  describe('Given a CodegenEntityModule with exposeInclude (one-relation)', () => {
    describe('When entity types are generated', () => {
      it('Then the response interface includes an optional relation property', () => {
        // assignee?: { id: string; name: string }
      });
    });
  });

  describe('Given a CodegenEntityModule with exposeInclude (many-relation)', () => {
    describe('When entity types are generated', () => {
      it('Then the response interface includes an array relation property', () => {
        // comments: Array<{ id: string; text: string }>
      });
    });
  });

  describe('Given a CodegenEntityModule without exposeSelect', () => {
    describe('When entity types are generated', () => {
      it('Then all responseFields are included (default behavior preserved)', () => {});
    });
  });
});
```

### Phase 3: SDK select narrowing

**Goal:** SDK `list()` and `get()` methods accept typed `select` (as `Record<K, true>`) and narrow the return type via `Pick<ResponseType, K>`. This is a breaking change to the generated SDK method signatures (acceptable under pre-v1 policy).

**Changes:**
1. `packages/codegen/src/generators/entity-types-generator.ts` — Export a string literal union type of exposed field names (`type TasksFields = 'id' | 'title' | 'status' | 'createdAt'`) for use in select constraints.
2. `packages/codegen/src/generators/entity-sdk-generator.ts` — Generate generic signatures for `list()` and `get()`:
   - `list<K extends TasksFields = TasksFields>(query?: { select?: Record<K, true> } & Record<string, unknown>)`
   - Return type: `ListResponse<Pick<TasksResponse, K>>`
   - Default generic parameter ensures calling without arguments returns full type.

**Concrete generated code example:**

```typescript
// Generated types/tasks.ts
export type TasksFields = 'id' | 'title' | 'status' | 'createdAt';

export interface TasksResponse {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

// Generated entities/tasks.ts
list: Object.assign(
  <K extends TasksFields = TasksFields>(
    query?: { select?: Record<K, true> } & Record<string, unknown>,
  ) => {
    const resolvedQuery = resolveVertzQL(query);
    return createDescriptor(
      'GET', '/tasks',
      () => client.get<ListResponse<Pick<TasksResponse, K>>>('/tasks', { query: resolvedQuery }),
      resolvedQuery,
      { entityType: 'tasks', kind: 'list' as const },
    );
  },
  { url: '/tasks', method: 'GET' as const },
),
```

**Acceptance criteria:**
```typescript
describe('SDK select narrowing', () => {
  describe('Given generated SDK with typed select', () => {
    describe('When list() is called without arguments', () => {
      it('Then the return type is the full response type (K defaults to all fields)', () => {
        // No explicit type parameter needed
      });
    });

    describe('When list() is called with select: { title: true, status: true }', () => {
      it('Then the return type is Pick<TasksResponse, "title" | "status">', () => {});
    });

    describe('When list() is called with select containing an unexposed field', () => {
      it('Then TypeScript reports an error', () => {
        // @ts-expect-error — internalNotes not in TasksFields
        // sdk.tasks.list({ select: { internalNotes: true } })
      });
    });

    describe('When get() is called with select', () => {
      it('Then the return type is Pick<TasksResponse, K>', () => {});
    });
  });

  describe('Given an entity without expose config', () => {
    describe('When SDK is generated', () => {
      it('Then TasksFields includes all response field names', () => {});
      it('Then select narrowing still works against all fields', () => {});
    });
  });

  describe('Generated types file', () => {
    it('Then exports a TasksFields string literal union type', () => {
      // type TasksFields = 'id' | 'title' | 'status' | 'createdAt'
    });
  });
});
```
