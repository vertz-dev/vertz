# Design Doc: Thread Model Generics Through Action Pipeline

**Issue:** [#1149](https://github.com/vertz-dev/vertz/issues/1149)
**Parent:** #1135 | **Sibling:** #1148
**Predecessor:** PR #1144 (threaded generics through DB adapter layer)

## Problem

`createActionHandler()` accepts unparameterized `EntityDefinition` and `EntityDbAdapter`, erasing model type information. Inside the handler:

- `row` is `Record<string, unknown> | null` instead of `TModel['table']['$response'] | null`
- `ctx` is `EntityContext` instead of `EntityContext<TModel>`
- After hooks receive `unknown` data — the `row` variable passed to them is untyped in the handler body, and the invocation site casts to `unknown` args (custom action after hooks are a separate concern)

This breaks the type chain established by PR #1144 at the DB adapter level.

## API Surface

### Before (current)

```ts
// action-pipeline.ts
export function createActionHandler(
  def: EntityDefinition,            // TModel erased
  actionName: string,
  actionDef: EntityActionDef,       // TResponse/TCtx erased
  db: EntityDbAdapter,              // TEntry erased
  hasId: boolean,
): (
  ctx: EntityContext,               // TModel erased
  id: string | null,
  rawInput: unknown,
) => Promise<Result<CrudResult, EntityError>> { ... }
```

### After (proposed)

```ts
// action-pipeline.ts
export function createActionHandler<TModel extends ModelDef = ModelDef>(
  def: EntityDefinition<TModel>,
  actionName: string,
  actionDef: EntityActionDef,       // stays loose — erased in EntityDefinition.actions
  db: EntityDbAdapter,             // stays unparameterized — see Implementation Note
  hasId: boolean,
): (
  ctx: EntityContext<TModel>,
  id: string | null,
  rawInput: unknown,
) => Promise<Result<CrudResult, EntityError>> { ... }
```

Inside the handler body:
```ts
// row is now typed
let row: TModel['table']['$response'] | null = null;
// db.get() returns Record<string, unknown> — cast to TModel response type
// Type safety comes from def: EntityDefinition<TModel> carrying the model
row = (await db.get(id as string)) as TModel['table']['$response'] | null;
```

**Implementation Note:** `db` stays unparameterized because `EntityDbAdapter<TEntry extends ModelEntry>` and `ModelDef` differ structurally (`ModelDef` has `schemas` and `_tenant` that `ModelEntry` lacks). Since `generateEntityRoutes` passes `EntityDbAdapter` (defaulting to `ModelEntry`), linking `db` to `TModel extends ModelDef` would cause a type error at the call site. The type safety for `row` comes from `def: EntityDefinition<TModel>` — the cast from `db.get()` is safe because the adapter always operates on the entity's table.

### route-generator.ts

No signature change needed. `generateEntityRoutes` receives `EntityDefinition` (unparameterized), so TypeScript infers `TModel = ModelDef` (the default). The types stay loose at the route level, which is correct — routes are registered at runtime with type-erased definitions.

## Manifesto Alignment

- **If it builds, it works** — Threading `TModel` ensures action handlers can't accidentally mis-type the row. The compiler catches mismatches.
- **One way to do things** — No new API. Just tightening existing generic threading.
- **Compile-time over runtime** — Zero runtime changes. Pure type refinement.

## Non-Goals

- **Not parameterizing `generateEntityRoutes`** — It receives erased definitions at runtime. Making it generic adds complexity without benefit.
- **Not threading `TInject` through actions** — The inject map is type-erased in `EntityDefinition.inject`. A future issue could preserve it, but it's not needed here.
- **Not fixing `EntityActionDef` type erasure in `EntityDefinition.actions`** — `EntityDefinition` stores actions as `Record<string, EntityActionDef>` (erased). Preserving action-level generics in the definition type is a larger redesign.
- **Not typing custom action after hooks at the invocation site** — `action-pipeline.ts` line 64 casts `def.after` to `Record<string, ((...args: unknown[]) => void) | undefined>` because `EntityAfterHooks` only has typed `create`/`update`/`delete` — not custom action names. This cast erases all type information for after hook arguments. Fixing this requires a broader `EntityDefinition.after` redesign.

## Unknowns

None identified.

**Note on `ModelDef`/`ModelEntry` compatibility:** `EntityDbAdapter<TEntry extends ModelEntry>` accepts `ModelDef` because `ModelDef` structurally satisfies `ModelEntry` — both have `table: TTable` and `relations: TRelations`, and `ModelDef`'s extra fields (`schemas`, `_tenant`) don't violate the constraint. A type test will guard against future interface drift.

## Type Flow Map

```
entity('name', { model: TModel })
  → EntityDefinition<TModel>
    → createActionHandler<TModel>(def, ..., db)
      → db.get(id) returns TModel['table']['$response'] | null
      → row: TModel['table']['$response'] | null  ← NEW
      → ctx: EntityContext<TModel>                 ← NEW
      → afterHook(result, ctx, row)                ← typed in handler body, erased at invocation (cast to unknown)
```

When called from `generateEntityRoutes` with erased `EntityDefinition`:
```
generateEntityRoutes(def: EntityDefinition, ..., db: EntityDbAdapter)
  → createActionHandler(def, ..., db)
    → TModel inferred as ModelDef (loose)
    → row: ModelDef['table']['$response'] | null = Record<string, unknown> | null
    → backward compatible
```

## E2E Acceptance Test

```ts
// action-pipeline.test-d.ts
import { d } from '@vertz/db';
import { createActionHandler } from '../action-pipeline';
import { entity } from '../entity';

const table = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  status: d.text(),
});
const model = d.model(table);

const def = entity('tasks', {
  model,
  access: { complete: () => true },
  actions: {
    complete: {
      body: { parse: (v: unknown) => ({ ok: true as const, data: v as { reason: string } }) },
      response: { parse: (v: unknown) => ({ ok: true as const, data: v as { done: boolean } }) },
      handler: async (_input, _ctx, row) => {
        // row should be typed — title is a string, not unknown
        if (row) row.title satisfies string;
        return { done: true };
      },
    },
  },
});

// When createActionHandler receives a typed definition and adapter:
declare const db: EntityDbAdapter<typeof model>;
const handler = createActionHandler(def, 'complete', def.actions.complete, db, true);

// The returned handler accepts EntityContext<typeof model>
declare const ctx: EntityContext<typeof model>;
const result = await handler(ctx, 'task-1', { reason: 'done' });
// result type is Result<CrudResult, EntityError> — unchanged

// NEGATIVE: unparameterized usage still works (backward compat)
declare const looseDef: EntityDefinition;
declare const looseDb: EntityDbAdapter;
declare const looseCtx: EntityContext;
const looseHandler = createActionHandler(looseDef, 'x', looseDef.actions.x!, looseDb, true);
await looseHandler(looseCtx, 'id', {});
```

---

## Implementation Plan

### Phase 1: Parameterize `createActionHandler` and add type tests

**Changes:**

1. **`packages/server/src/entity/action-pipeline.ts`**
   - Add `TModel extends ModelDef = ModelDef` generic parameter
   - `def: EntityDefinition<TModel>`
   - `db: EntityDbAdapter` (stays unparameterized; row cast for type safety)
   - Return function parameter: `ctx: EntityContext<TModel>`
   - `row` variable: `TModel['table']['$response'] | null`

2. **`packages/server/src/entity/__tests__/action-pipeline.test-d.ts`** (new)
   - Positive tests: `row` is typed, ctx is typed, backward compat with loose types
   - Negative tests: `@ts-expect-error` on mismatched model types

3. **Existing tests remain unchanged** — all runtime behavior is identical

**Acceptance Criteria:**

```typescript
describe('Feature: action pipeline model generics', () => {
  describe('Given createActionHandler called with EntityDefinition<TModel>', () => {
    describe('When TModel has specific column types', () => {
      it('Then returned handler accepts EntityContext<TModel>', () => {})
      it('Then row inside handler is typed as TModel["table"]["$response"] | null', () => {})
    })
  })

  describe('Given createActionHandler called with unparameterized EntityDefinition', () => {
    describe('When using default ModelDef', () => {
      it('Then types fall back to loose Record<string, unknown>', () => {})
    })
  })

  describe('Given a model type mismatch in the returned handler', () => {
    describe('When calling handler with EntityContext<ProjectsModel> on a tasks action handler', () => {
      it('Then TypeScript reports a type error', () => {})
    })
  })

  describe('Given ModelDef and ModelEntry structural compatibility', () => {
    describe('When using EntityDbAdapter<TModel> where TModel extends ModelDef', () => {
      it('Then ModelDef satisfies ModelEntry constraint (structural subtype)', () => {})
    })
  })
})
```
