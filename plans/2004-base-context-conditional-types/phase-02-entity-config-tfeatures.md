# Phase 2: EntityConfig TFeatures

## Context

Issue #2004: BaseContext exposes auth/tenancy fields regardless of app configuration. Phase 1 established the foundation types (BaseContext<TFeatures>, mixin interfaces, InferFeatures). This phase adds the `TFeatures` parameter to `EntityConfig` so entity hook `ctx` parameters can be narrowed.

Design doc: `plans/2004-base-context-conditional-types.md` (Rev 3, Section 8 "EntityConfig — TFeatures narrows hook parameters")

## Tasks

### Task 1: Add TFeatures to EntityConfig

**Files:** (3)
- `packages/server/src/entity/types.ts` (modified)
- `packages/server/src/__tests__/entity-config-features.test-d.ts` (new)
- `packages/server/src/entity/entity.ts` (modified)

**What to implement:**

1. Add `TFeatures` generic parameter to `EntityConfig`:

```typescript
export interface EntityConfig<
  TModel extends ModelDef = ModelDef,
  TActions extends Record<string, EntityActionDef<any, any, any, any>> = {},
  TInject extends Record<string, EntityDefinition> = {},
  TFeatures extends ContextFeatures = FullFeatures,
> {
  // ...existing fields (model, inject, table, tenantScoped, access, expose)...
  readonly before?: {
    readonly create?: (
      data: TModel['table']['$create_input'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => TModel['table']['$create_input'] | Promise<TModel['table']['$create_input']>;
    readonly update?: (
      data: TModel['table']['$update_input'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => TModel['table']['$update_input'] | Promise<TModel['table']['$update_input']>;
  };
  readonly after?: {
    readonly create?: (
      result: TModel['table']['$response'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => void | Promise<void>;
    readonly update?: (
      prev: TModel['table']['$response'],
      next: TModel['table']['$response'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => void | Promise<void>;
    readonly delete?: (
      row: TModel['table']['$response'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => void | Promise<void>;
  };
  // actions, expose unchanged
}
```

2. Update `entity()` function in `entity.ts` to accept the new generic:

The `entity()` function signature adds `TFeatures` that flows through `EntityConfig`:

```typescript
export function entity<
  TModel extends ModelDef,
  TInject extends Record<string, EntityDefinition> = {},
  TActions extends Record<string, EntityActionDef<any, any, ...>> = {},
  TFeatures extends ContextFeatures = FullFeatures,
>(
  name: string,
  config: EntityConfig<TModel, TActions, TInject, TFeatures>,
): EntityDefinition<TModel, TActions> { ... }
```

The function body is unchanged — `TFeatures` only affects the type-level config validation.

3. Write type-level tests:

```typescript
// Test: entity() with default FullFeatures — all ctx fields available
entity('tasks', {
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      const _u: string | null = ctx.userId;    // OK
      const _t: string | null = ctx.tenantId;  // OK
      return data;
    },
  },
});

// Test: entity() with NoFeatures — no auth/tenant fields
// (This won't be used directly — typed() factory will handle this)
// But verify the type parameter works when explicit
entity<typeof tasksModel, {}, {}, NoFeatures>('tasks', {
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      // @ts-expect-error — userId not on NoFeatures context
      ctx.userId;
      // OK — entity operations always available
      ctx.entity;
      return data;
    },
  },
});
```

**Acceptance criteria:**
- [ ] `entity('name', config)` with default TFeatures compiles as before (all ctx fields)
- [ ] `entity<..., NoFeatures>('name', config)` narrows ctx to exclude auth/tenant fields
- [ ] `entity<..., { auth: true; tenant: false; multiLevelTenant: false }>` shows auth fields but not tenant
- [ ] `ctx.entity` and `ctx.entities` are always available regardless of TFeatures
- [ ] All existing entity tests pass without changes
- [ ] All existing entity definitions across the codebase compile unchanged
- [ ] Typecheck passes: `vtz run typecheck`

---

### Task 2: Verify existing entity definitions compile

**Files:** (1)
- `packages/server/src/__tests__/entity-config-features.test-d.ts` (modified — add more tests)

**What to implement:**

1. Add structural compatibility assertions:

```typescript
// EntityContext<TModel, TInject> is still assignable to
// BaseContext<FullFeatures> & { entity, entities }
const ec = {} as EntityContext<ModelDef>;
const bc: BaseContext<FullFeatures> = ec;  // must compile

// EntityDefinition output type is unchanged
const def = entity('tasks', { model: tasksModel });
type DefType = typeof def;  // EntityDefinition<typeof tasksModel, {}>
```

2. Run `vtz run typecheck` to verify no regressions across the monorepo.

**Acceptance criteria:**
- [ ] `EntityContext` is assignable to `BaseContext<FullFeatures> & { entity, entities }`
- [ ] All existing entity definitions in examples/ compile unchanged
- [ ] Full typecheck clean
