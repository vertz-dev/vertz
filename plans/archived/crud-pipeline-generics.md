# Design Doc: Thread Model Generics Through CrudHandlers

**Issue:** [#1148](https://github.com/vertz-dev/vertz/issues/1148)
**Parent:** #1135 | **Sibling:** #1149 (merged as PR #1165)
**Predecessor:** PR #1144 (threaded generics through DB adapter layer)

## Problem

`createCrudHandlers` and `CrudHandlers` erase model type information. All data parameters use `Record<string, unknown>` and all return types use `Record<string, unknown>`, despite `EntityDefinition<TModel>` carrying the model type.

## API Surface

### Before (current)

```ts
export interface CrudHandlers {
  list(ctx: EntityContext, options?: ListOptions): Promise<Result<CrudResult<ListResult>, EntityError>>;
  get(ctx: EntityContext, id: string, options?: GetOptions): Promise<Result<CrudResult<Record<string, unknown>>, EntityError>>;
  create(ctx: EntityContext, data: Record<string, unknown>): Promise<Result<CrudResult<Record<string, unknown>>, EntityError>>;
  update(ctx: EntityContext, id: string, data: Record<string, unknown>): Promise<Result<CrudResult<Record<string, unknown>>, EntityError>>;
  delete(ctx: EntityContext, id: string): Promise<Result<CrudResult<null>, EntityError>>;
}

export function createCrudHandlers(def: EntityDefinition, db: EntityDbAdapter, options?): CrudHandlers;
```

### After (proposed)

```ts
export interface CrudHandlers<TModel extends ModelDef = ModelDef> {
  list(ctx: EntityContext<TModel>, options?: ListOptions): Promise<Result<CrudResult<ListResult<TModel['table']['$response']>>, EntityError>>;
  get(ctx: EntityContext<TModel>, id: string, options?: GetOptions): Promise<Result<CrudResult<TModel['table']['$response']>, EntityError>>;
  create(ctx: EntityContext<TModel>, data: Record<string, unknown>): Promise<Result<CrudResult<TModel['table']['$response']>, EntityError>>;
  update(ctx: EntityContext<TModel>, id: string, data: Record<string, unknown>): Promise<Result<CrudResult<TModel['table']['$response']>, EntityError>>;
  delete(ctx: EntityContext<TModel>, id: string): Promise<Result<CrudResult<null>, EntityError>>;
}

export function createCrudHandlers<TModel extends ModelDef = ModelDef>(
  def: EntityDefinition<TModel>,
  db: EntityDbAdapter,           // stays unparameterized (same rationale as #1149)
  options?: CrudPipelineOptions,
): CrudHandlers<TModel>;
```

**Design decisions:**
- `data` params in `create`/`update` stay `Record<string, unknown>` — they receive raw HTTP body data, validated at runtime by `stripReadOnlyFields` and before hooks. Typing them as `$create_input`/`$update_input` would force casts at every call site in `route-generator.ts`.
- `db` stays unparameterized — same `ModelDef`/`ModelEntry` structural mismatch as #1149.
- Return types use `$response` — this is the real value, typing what comes out of CRUD operations.
- `ListResult<T>` already has a generic parameter, just needs to be threaded.

### route-generator.ts

No signature change needed. `generateEntityRoutes` receives `EntityDefinition` (unparameterized), so `TModel = ModelDef` and all types fall back to loose defaults.

## Manifesto Alignment

Same as #1149: compile-time type refinement, zero runtime changes, one way to do things.

## Non-Goals

- **Not typing `create`/`update` data params** — HTTP body is `Record<string, unknown>` at the boundary.
- **Not parameterizing `db`** — same `ModelDef`/`ModelEntry` issue as #1149.
- **Not fixing before/after hook type erasure** — `EntityDefinition` stores hooks as erased `EntityBeforeHooks`/`EntityAfterHooks`.

## Unknowns

None. Same pattern as #1149 (proven to work in PR #1165).

## Type Flow Map

```
entity('name', { model: TModel })
  → EntityDefinition<TModel>
    → createCrudHandlers<TModel>(def, db)
      → CrudHandlers<TModel>
        → get() returns CrudResult<TModel['table']['$response']>
        → create() returns CrudResult<TModel['table']['$response']>
        → update() returns CrudResult<TModel['table']['$response']>
        → list() returns CrudResult<ListResult<TModel['table']['$response']>>
        → delete() returns CrudResult<null> (unchanged)
```

## E2E Acceptance Test

```ts
describe('Feature: CRUD pipeline model generics', () => {
  describe('Given createCrudHandlers called with EntityDefinition<TModel>', () => {
    describe('When TModel has specific column types', () => {
      it('Then get() return type uses $response', () => {})
      it('Then create() return type uses $response', () => {})
      it('Then update() return type uses $response', () => {})
      it('Then list() return type uses ListResult<$response>', () => {})
      it('Then ctx parameters use EntityContext<TModel>', () => {})
    })
  })

  describe('Given createCrudHandlers with unparameterized EntityDefinition', () => {
    describe('When using default ModelDef', () => {
      it('Then types fall back to loose defaults', () => {})
    })
  })

  describe('Given a model mismatch in CrudHandlers', () => {
    describe('When calling get() with EntityContext<ProjectsModel> on tasks CrudHandlers', () => {
      it('Then TypeScript reports a type error', () => {})
    })
  })
})
```

## Implementation Plan

### Phase 1: Parameterize `CrudHandlers` and `createCrudHandlers`

**Changes:**

1. **`packages/server/src/entity/crud-pipeline.ts`**
   - Add `TModel` generic to `CrudHandlers` interface
   - Add `TModel` generic to `createCrudHandlers` function
   - Thread `$response` through return types
   - Thread `EntityContext<TModel>` through ctx params
   - Cast `db` returns to `TModel['table']['$response']`

2. **`packages/server/src/entity/__tests__/crud-pipeline.test-d.ts`** (new)
   - Positive and negative type tests

3. **Existing tests remain unchanged** — zero runtime changes
