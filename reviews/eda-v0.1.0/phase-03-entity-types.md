# Phase 3 Review: `entity()` Definition and Types

**Reviewer:** Claude Opus 4.6
**Date:** 2026-02-20
**Scope:** entity types, entity() factory, barrel exports, runtime tests, type-level tests, server re-exports, core EntityDefinition forward-declaration, app-builder entity processing

---

## Type Safety Findings

### T-1: `EntityDefinition` drops the `TActions` generic -- access keys are untyped after `entity()` returns

**Severity:** MEDIUM

`EntityConfig` has a second generic `TActions` that constrains `access` keys to `'list' | 'get' | 'create' | 'update' | 'delete' | Extract<keyof TActions, string>`. But `EntityDefinition<TModel>` only carries `TModel` -- it drops `TActions` entirely. The `access` field on the definition becomes `Partial<Record<string, AccessRule>>`, which means downstream consumers (e.g., route generation, middleware) have no compile-time knowledge of which access keys are valid.

**Location:** `packages/server/src/entity/types.ts:96-107`

**Impact:** Any code consuming an `EntityDefinition` can access `def.access.anythingGoes` without a type error. The strict key constraint only exists at definition time, not at consumption time.

**Suggested fix:** Add `TActions` as a second generic parameter to `EntityDefinition`:
```ts
export interface EntityDefinition<
  TModel extends ModelDef = ModelDef,
  TActions extends Record<string, EntityActionDef> = {},
> {
  // ...
  readonly access: Partial<
    Record<
      'list' | 'get' | 'create' | 'update' | 'delete' | Extract<keyof TActions, string>,
      AccessRule
    >
  >;
  readonly actions: TActions;
}
```
If carrying two generics everywhere is undesirable, this is an acceptable tradeoff documented as intentional widening -- but it should be explicitly acknowledged in a comment.

---

### T-2: `EntityRelationsConfig` field narrowing accepts any string keys, not the relation target's columns

**Severity:** MEDIUM

When using `relations: { posts: { id: true, title: true } }`, the `Record<string, true>` type permits any arbitrary key. For example, `{ nonExistentColumn: true }` would compile without error even though `nonExistentColumn` is not a column on the `posts` table. The type does not thread the relation's target `TableDef` columns into the narrowing record.

**Location:** `packages/server/src/entity/types.ts:64`

```ts
[K in keyof TRelations]?: true | false | Record<string, true>;
//                                       ^^^^^^^^^^^^^^^^^^ unconstrained keys
```

**Suggested fix:** Thread the relation target's column names:
```ts
export type EntityRelationsConfig<
  TRelations extends Record<string, RelationDef> = Record<string, RelationDef>,
> = {
  [K in keyof TRelations]?: true | false | (
    TRelations[K] extends RelationDef<infer TTarget>
      ? Partial<Record<keyof TTarget['_columns'], true>>
      : Record<string, true>
  );
};
```
This would constrain field narrowing to actual column names on the relation's target table.

---

### T-3: `AccessRule` excludes `true` -- but there is no type test verifying this

**Severity:** LOW

`AccessRule = false | ((ctx, row) => boolean | Promise<boolean>)` deliberately excludes `true`. This is a correct design choice (force explicit functions for "allow" to avoid confusion about when `true` means "always allow"). However, there is no `@ts-expect-error` type test verifying that `access: { list: true }` is rejected. If someone accidentally widens `AccessRule` to include `true`, no test would catch it.

**Location:** `packages/server/src/entity/__tests__/entity.test-d.ts` (missing test)

**Suggested fix:** Add a negative type test:
```ts
it('rejects true as an access rule value', () => {
  entity('users', {
    model: usersModel,
    access: {
      // @ts-expect-error -- true is not a valid AccessRule, use a function
      list: true,
    },
  });
});
```

---

### T-4: `EntityContext.role()` accepts `string[]` -- no branded/enum type for role names

**Severity:** LOW

`role(...roles: string[])` accepts any string. In a real system, roles often come from an enum or union type. Currently there is no way to constrain the role names at the type level. This is acceptable for Phase 3 (the context is a placeholder for Phase 4 runtime), but should be noted for future hardening.

**Location:** `packages/server/src/entity/types.ts:11`

**Suggested fix:** Consider a generic parameter on `EntityContext` in a future phase:
```ts
export interface EntityContext<TRoles extends string = string> {
  role(...roles: TRoles[]): boolean;
}
```

---

### T-5: Forward-declared `EntityDefinition` in `@vertz/core` uses `Record<string, unknown>` for `access` -- inconsistent with server's `Partial<Record<string, AccessRule>>`

**Severity:** LOW

The forward-declared `EntityDefinition` in `packages/core/src/types/app.ts` uses `Record<string, unknown>` for `access`, `before`, `after`, etc. This is intentionally loose (it's a forward declaration), but it means there is NO compile-time guarantee that the entities passed to `AppConfig.entities` actually conform to the server's stricter types. A consumer could pass a hand-crafted object with `access: { list: 42 }` and `@vertz/core` would accept it.

**Location:** `packages/core/src/types/app.ts:11-19`

**Suggested fix:** If cross-package type coupling is undesirable, this is acceptable. But add a JSDoc comment on the forward declaration explicitly noting this is intentionally loose and that the authoritative type is in `@vertz/server`. Alternatively, consider importing the type from `@vertz/server` or extracting it to a shared types package.

---

## Bug and Edge Case Findings

### BUG-1: `Object.freeze` is shallow -- nested objects (`access`, `before`, `after`, `actions`, `relations`) are mutable at runtime

**Severity:** HIGH

`entity()` calls `Object.freeze()` on the top-level returned object. However, `Object.freeze` is shallow. All nested objects are still mutable:

```ts
const def = entity('users', { model: usersModel, access: { list: () => true } });
Object.isFrozen(def);           // true
Object.isFrozen(def.access);    // false  <-- BUG
def.access.list = false;        // succeeds silently at runtime
```

The codebase already has a `deepFreeze` utility in `@vertz/core` (`packages/core/src/immutability/freeze.ts`) and it is re-exported from `@vertz/server`. The test only asserts `Object.isFrozen(def)` (the top level), which passes despite nested mutability.

**Location:** `packages/server/src/entity/entity.ts:9`

**Suggested fix:** Use `deepFreeze` instead of `Object.freeze`:
```ts
import { deepFreeze } from '@vertz/core';
// ...
return deepFreeze({ name, model, ... });
```
Also add a test asserting nested immutability:
```ts
it('Then nested objects are also frozen', () => {
  const def = entity('users', {
    model: usersModel,
    access: { list: () => true },
  });
  expect(Object.isFrozen(def.access)).toBe(true);
});
```

---

### BUG-2: No validation on entity `name` -- empty string, special characters, and path-breaking values are accepted

**Severity:** HIGH

`entity()` accepts any string as the name with no validation. The name is used directly in URL path construction in `app-builder.ts` (line 87-88). Problematic inputs:

- `entity('', { model })` -- generates paths like `/api/` and `/api//:id` (double slash, empty segment)
- `entity('users/admin', { model })` -- generates `/api/users/admin` which looks like a sub-resource, not an entity
- `entity('../secret', { model })` -- path traversal in the URL
- `entity('users?q=1', { model })` -- query string injection in the route path

**Location:** `packages/server/src/entity/entity.ts:8` (no validation), `packages/core/src/app/app-builder.ts:87-88` (unsafe interpolation)

**Suggested fix:** Add runtime validation in `entity()`:
```ts
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  throw new Error(
    `entity() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`
  );
}
```

---

### BUG-3: No duplicate entity name detection in `app-builder.ts`

**Severity:** MEDIUM

If two entities with the same name are passed to `AppConfig.entities`, the app-builder will register duplicate routes (e.g., two `GET /api/users` handlers). There is no detection or error. This could cause unpredictable routing behavior at runtime.

**Location:** `packages/core/src/app/app-builder.ts:80-103`

**Suggested fix:** Add a `Set` to track registered entity names and throw on duplicates:
```ts
const entityNames = new Set<string>();
for (const entity of config.entities) {
  if (entityNames.has(entity.name)) {
    throw new Error(`Duplicate entity name: "${entity.name}"`);
  }
  entityNames.add(entity.name);
  // ...
}
```

---

### BUG-4: `apiPrefix` with no leading slash produces malformed paths

**Severity:** MEDIUM

If a user passes `apiPrefix: 'api'` (no leading slash), the generated entity path becomes `api/users` -- a relative path with no leading slash. The code handles the trailing slash (`rawPrefix.endsWith('/')`) but not the leading slash.

**Location:** `packages/core/src/app/app-builder.ts:82-88`

**Suggested fix:** Normalize the prefix to always have a leading slash:
```ts
let rawPrefix = config.apiPrefix === undefined ? '/api/' : config.apiPrefix;
if (rawPrefix !== '' && !rawPrefix.startsWith('/')) {
  rawPrefix = `/${rawPrefix}`;
}
```

---

### BUG-5: Entity routes are registered as route metadata only -- no actual request handlers are wired

**Severity:** LOW (by design, but worth flagging)

The app-builder pushes `{ method, path }` objects into `registeredRoutes` but does not wire any actual request handlers for entity CRUD operations. A `GET /api/users` request will not be handled. This is presumably deferred to a later phase, but there is no runtime error or warning when entities are configured -- the routes just silently do nothing.

**Location:** `packages/core/src/app/app-builder.ts:90-101`

**Suggested fix:** Either:
1. Add a TODO comment in the code clarifying this is route registration only (Phase 3), with handlers coming in a later phase.
2. Or throw `new Error('Entity route handlers not yet implemented')` if someone actually sends a request to these routes, so they don't get silent 404s.

---

### BUG-6: `after.update` hook receives `prev` and `next` -- but there's no test or type verification for the two-argument signature

**Severity:** LOW

`EntityAfterHooks.update` is typed as `(prev: TResponse, next: TResponse, ctx: EntityContext) => void | Promise<void>` -- it takes both the previous and next state. However, neither the runtime tests nor the type tests exercise this signature. If the runtime implementation (in a future phase) passes only one argument, the type mismatch will be invisible.

**Location:** `packages/server/src/entity/types.ts:43`

**Suggested fix:** Add a type test:
```ts
it('after.update receives prev and next $response typed results', () => {
  entity('users', {
    model: usersModel,
    after: {
      update: (prev, next, _ctx) => {
        prev.email satisfies string;
        next.email satisfies string;
      },
    },
  });
});
```

---

## DX and Design Findings

### DX-1: `entity()` gives no error message when required fields are missing -- TypeScript errors are the only feedback

**Severity:** MEDIUM

If a developer calls `entity('users', {})` (missing `model`), they get a TypeScript error but no runtime error. In strict TypeScript projects this is fine, but the manifesto targets LLM-first development where an AI might generate JavaScript (not TypeScript) and skip the model. The runtime would silently produce `{ model: undefined }`.

**Location:** `packages/server/src/entity/entity.ts:8`

**Suggested fix:** Add a runtime guard:
```ts
if (!config.model) {
  throw new Error('entity() requires a model in the config. Got: ' + JSON.stringify(config));
}
```

---

### DX-2: `EntityContext.tenant()` returns `boolean` with no arguments -- unclear semantics

**Severity:** LOW

`tenant(): boolean` suggests "is this request in a tenant context?" but the name is ambiguous. Does it mean "is multi-tenancy enabled?" or "does this request have a tenant ID?" or "is the current user a tenant admin?" A developer (or LLM) seeing this for the first time would have to guess.

**Location:** `packages/server/src/entity/types.ts:10`

**Suggested fix:** Either:
- Rename to `isTenantScoped()` or `hasTenant()` for clarity
- Add JSDoc: `/** Returns true if the current request is scoped to a tenant */`

---

### DX-3: `EntityActionDef.handler` receives `row` as third parameter -- confusing for collection-level actions

**Severity:** MEDIUM

`EntityActionDef.handler` is typed as `(input, ctx, row) => Promise<TOutput>`. The `row` parameter implies actions always operate on a specific entity instance (the route is `/:id/actionName`). This makes it impossible to define collection-level custom actions (e.g., `POST /api/users/bulk-import` with no `:id`).

**Location:** `packages/server/src/entity/types.ts:54`, `packages/core/src/app/app-builder.ts:99`

The app-builder confirms this: all custom action routes are `POST /:id/actionName`. There is no way to register a collection-level action.

**Suggested fix:** Consider supporting both instance-level and collection-level actions:
```ts
export interface EntityActionDef<TInput = unknown, TOutput = unknown, TResponse = unknown> {
  readonly input: SchemaLike<TInput>;
  readonly output: SchemaLike<TOutput>;
  readonly scope?: 'instance' | 'collection'; // default: 'instance'
  readonly handler: TScope extends 'collection'
    ? (input: TInput, ctx: EntityContext) => Promise<TOutput>
    : (input: TInput, ctx: EntityContext, row: TResponse) => Promise<TOutput>;
}
```
If collection-level actions are intentionally out of scope, add a comment noting this design decision.

---

### DX-4: No JSDoc on `entity()` or `EntityConfig` -- LLMs and IDE users get no inline guidance

**Severity:** LOW

The `entity()` function and `EntityConfig` interface have no JSDoc comments. An AI agent or a developer using IDE hover-over will see the type signature but no description of what the function does, what each config field means, or what the returned `EntityDefinition` is for.

**Location:** `packages/server/src/entity/entity.ts:4-8`, `packages/server/src/entity/types.ts:71-90`

**Suggested fix:** Add JSDoc:
```ts
/**
 * Defines an entity with auto-CRUD capabilities.
 *
 * @param name - URL-safe entity name used in route paths (e.g., 'users' -> /api/users)
 * @param config - Entity configuration including model, access rules, hooks, and actions
 * @returns A frozen EntityDefinition ready for use in AppConfig.entities
 */
export function entity<...>(name: string, config: EntityConfig<...>): EntityDefinition<...> {
```

---

### DX-5: `access` rule callback receives `row: Record<string, unknown>` -- loses the model's response type

**Severity:** MEDIUM

The `AccessRule` type uses `row: Record<string, unknown>` in its callback signature. This means inside an access rule function, `row.email` has type `unknown`, not `string`. The developer must cast or use type guards. The before/after hooks correctly thread the model's `$response` / `$create_input` / `$update_input` types, but access rules do not.

**Location:** `packages/server/src/entity/types.ts:20`

**Impact:** In the type test at `entity.test-d.ts:51`, `row.id === ctx.userId` compiles only because `Record<string, unknown>` allows any key access -- but `row.id` is `unknown`, not `string`, so the `===` comparison with `string | null` is a loose comparison between incompatible types that TypeScript happens to allow.

**Suggested fix:** Make `AccessRule` generic over the response type:
```ts
export type AccessRule<TResponse = Record<string, unknown>> =
  | false
  | ((ctx: EntityContext, row: TResponse) => boolean | Promise<boolean>);
```
Then in `EntityConfig`:
```ts
readonly access?: Partial<
  Record<
    'list' | 'get' | 'create' | 'update' | 'delete' | Extract<keyof TActions, string>,
    AccessRule<TModel['table']['$response']>
  >
>;
```

---

### DX-6: Test file duplicates fixture definitions across runtime and type tests

**Severity:** LOW

The `usersTable`, `postsTable`, and `usersModel` fixtures are defined identically in both `entity.test.ts` and `entity.test-d.ts`. If the schema API changes, both files need updating. This is a minor maintenance cost.

**Location:** `packages/server/src/entity/__tests__/entity.test.ts:9-28`, `packages/server/src/entity/__tests__/entity.test-d.ts:9-27`

**Suggested fix:** Extract shared fixtures to a `__tests__/fixtures.ts` file and import from both test files.

---

## Summary

| ID    | Severity | Category   | Summary                                                        |
|-------|----------|------------|----------------------------------------------------------------|
| T-1   | MEDIUM   | Type Safety | `EntityDefinition` drops `TActions` generic                   |
| T-2   | MEDIUM   | Type Safety | Relation field narrowing accepts arbitrary keys               |
| T-3   | LOW      | Type Safety | Missing negative test for `access: { list: true }`            |
| T-4   | LOW      | Type Safety | `role()` accepts any string, no branded type                  |
| T-5   | LOW      | Type Safety | Core forward-declared EntityDefinition is too loose           |
| BUG-1 | HIGH     | Bug         | Shallow freeze -- nested objects are mutable                  |
| BUG-2 | HIGH     | Bug         | No name validation -- empty/malicious strings break routes    |
| BUG-3 | MEDIUM   | Bug         | No duplicate entity name detection                            |
| BUG-4 | MEDIUM   | Bug         | `apiPrefix` without leading slash produces malformed paths    |
| BUG-5 | LOW      | Bug         | Entity routes have no actual handlers (expected for Phase 3)  |
| BUG-6 | LOW      | Bug         | `after.update` two-arg signature is untested                  |
| DX-1  | MEDIUM   | DX          | No runtime guard for missing `model`                          |
| DX-2  | LOW      | DX          | `tenant()` method name is ambiguous                           |
| DX-3  | MEDIUM   | DX          | Custom actions forced to instance-level only                  |
| DX-4  | LOW      | DX          | No JSDoc on public API                                        |
| DX-5  | MEDIUM   | DX          | Access rule `row` parameter loses model type information      |
| DX-6  | LOW      | DX          | Duplicated test fixtures across test files                    |

**Critical count:** 0
**High count:** 2 (BUG-1, BUG-2)
**Medium count:** 7 (T-1, T-2, BUG-3, BUG-4, DX-1, DX-3, DX-5)
**Low count:** 8 (T-3, T-4, T-5, BUG-5, BUG-6, DX-2, DX-4, DX-6)

---

## Resolution

| ID    | Status | Resolution |
|-------|--------|------------|
| T-1   | ACCEPTED | Intentional widening. EntityDefinition drops TActions — downstream consumers iterate over `def.actions` keys dynamically. Adding a second generic would cascade through every usage site. Tradeoff accepted. |
| T-2   | DEFERRED | Relation field narrowing requires changes to RelationDef in @vertz/db to thread target table column types. Deferred to post-v0.1.0. |
| T-3   | FIXED | Added `@ts-expect-error` type test for `access: { list: true }` in entity.test-d.ts. |
| T-4   | ACCEPTED | Branded role types deferred. `string` is the right default for v0.1.0 — role systems vary widely. |
| T-5   | ACCEPTED | Core forward declaration is intentionally loose to avoid cross-package coupling. The authoritative type is in @vertz/server. |
| BUG-1 | FIXED | Replaced `Object.freeze` with `deepFreeze` from @vertz/core. Added test for nested immutability. |
| BUG-2 | FIXED | Added `/^[a-z][a-z0-9-]*$/` validation regex with descriptive error. Tests for empty, slashes, uppercase, numbers-first. |
| BUG-3 | DEFERRED | Duplicate entity name detection belongs in Phase 6 (route generation). Will add in app-builder when wiring real handlers. |
| BUG-4 | DEFERRED | apiPrefix normalization belongs in Phase 6 (route generation). Will fix with leading slash normalization. |
| BUG-5 | ACCEPTED | By design. Phase 3 registers route metadata only. Phase 5-6 wire actual handlers. |
| BUG-6 | FIXED | Added type test for `after.update` two-arg signature (prev + next) in entity.test-d.ts. |
| DX-1  | FIXED | Added runtime guard: `if (!config.model) throw new Error(...)`. Test with `as any` cast. |
| DX-2  | ACCEPTED | `tenant()` name is consistent with ctx.authenticated() pattern. JSDoc will be added in a docs pass. |
| DX-3  | ACCEPTED | Collection-level actions are out of scope for v0.1.0. Instance-level is the EDA design doc scope. Future enhancement. |
| DX-4  | DEFERRED | JSDoc will be added in a docs pass after the feature is complete. |
| DX-5  | DEFERRED | Making AccessRule generic would complicate the type. Current approach allows property access via Record<string, unknown>. Future enhancement. |
| DX-6  | DEFERRED | Test fixtures are small (~20 lines). Extracting to a shared file is a minor refactor — will do if more test files are added. |

**Fixed:** 5 (BUG-1, BUG-2, BUG-6, T-3, DX-1)
**Accepted:** 5 (T-1, T-4, T-5, BUG-5, DX-2, DX-3)
**Deferred:** 5 (T-2, BUG-3, BUG-4, DX-4, DX-5, DX-6)
