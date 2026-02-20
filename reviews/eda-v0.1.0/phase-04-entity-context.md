# Phase 4 Review: EntityContext, EntityRegistry, EntityOperations, createEntityContext

**Reviewer:** Claude Opus 4.6
**Date:** 2026-02-20
**Scope:** EntityContext (updated with TModel generic), EntityOperations interface, EntityRegistry class, createEntityContext factory, entity.ts (updated with deepFreeze and validation), barrel exports, runtime tests, type-level tests, registry tests

---

## Type Safety Findings

### T-1: `createEntityContext` return type drops the `TModel` generic -- typed `entity` ops become untyped

**Severity:** CRITICAL

`createEntityContext` accepts `EntityOperations<TModel>` as the second parameter but its return type is `EntityContext` (bare, no generic), not `EntityContext<TModel>`. This means the strongly-typed entity operations passed in are widened to `EntityOperations<ModelDef>` on the returned context, erasing all column-level type information.

```ts
// context.ts:17-21
export function createEntityContext<TModel extends ModelDef = ModelDef>(
  request: RequestInfo,
  entityOps: EntityOperations<TModel>,
  registryProxy: Record<string, EntityOperations>,
): EntityContext {  // <-- should be EntityContext<TModel>
```

The TModel generic parameter is accepted by the function but never threaded to the return type. This is a "dead generic" -- the exact pattern the project's TDD rules explicitly call a bug (see `.claude/rules/tdd.md` Type Flow Verification section).

**Location:** `packages/server/src/entity/context.ts:21`

**Impact:** Every consumer of `createEntityContext` gets an untyped context. `ctx.entity.create(data)` accepts `ModelDef['table']['$create_input']` which resolves to `unknown`, not the model's actual input type. The type tests in `context.test-d.ts` exercise `EntityContext<UsersModel>` as a standalone type (which works), but they never test the return type of `createEntityContext` -- so this hole is invisible in the current test suite.

**Suggested fix:**
```ts
export function createEntityContext<TModel extends ModelDef = ModelDef>(
  request: RequestInfo,
  entityOps: EntityOperations<TModel>,
  registryProxy: Record<string, EntityOperations>,
): EntityContext<TModel> {
```
Add a type test proving the return type preserves `TModel`:
```ts
it('createEntityContext preserves TModel in return type', () => {
  declare const ops: EntityOperations<UsersModel>;
  const ctx = createEntityContext({}, ops, {});
  type CreateParam = Parameters<typeof ctx.entity.create>[0];
  expectTypeOf<CreateParam>().toHaveProperty('email');
});
```

---

### T-2: `EntityContext.entities` is typed as `Record<string, EntityOperations>` -- no type error on accessing non-existent entities

**Severity:** MEDIUM

`ctx.entities` is `Record<string, EntityOperations>`, which means `ctx.entities.nonExistentEntity` compiles without error and has type `EntityOperations` (not `EntityOperations | undefined`). At runtime, the Proxy in `EntityRegistry.createProxy()` will throw, but the type system says it is always safe. This is a gap between the type contract and the runtime behavior.

**Location:** `packages/server/src/entity/types.ts:18`

**Impact:** An LLM or developer can write `ctx.entities.typoedName.get(id)` and get no compile-time feedback that `typoedName` might not exist. The error only surfaces at runtime. TypeScript's `noUncheckedIndexedAccess` would help, but `Record<string, T>` deliberately bypasses that for known-key access patterns.

**Suggested fix:** This is likely an intentional design trade-off (dynamic entity names can't be known at compile time). If so, add a JSDoc comment on the `entities` field making the runtime behavior explicit:
```ts
/**
 * Loosely-typed access to all registered entities.
 * Throws at runtime if the entity name is not registered.
 */
readonly entities: Record<string, EntityOperations>;
```
Alternatively, if a stricter approach is desired in the future, consider:
```ts
readonly entities: { get(name: string): EntityOperations };
```
This forces explicit access and makes the "might not exist" contract clearer at the call site.

---

### T-3: Proxy handler `get` trap types `prop` as `string` -- but property keys can be `symbol`

**Severity:** MEDIUM

The Proxy `get` trap in `EntityRegistry.createProxy()` types the `prop` parameter as `string`:

```ts
get: (_target, prop: string) => this.get(prop),
```

However, the Proxy `get` trap signature is `(target, prop: string | symbol, receiver)`. When JavaScript internals (or libraries) access Symbol properties on this proxy (e.g., `Symbol.toPrimitive`, `Symbol.iterator`, `Symbol.toStringTag`, `Symbol.hasInstance`), the `prop` will be a `symbol`, not a `string`. This value is then passed to `this.get(prop)` where `prop` is expected to be a `string`. The `Map.get()` call won't find it (symbols are never registered), and the error message will read:

```
Entity "Symbol(Symbol.toPrimitive)" is not registered. Available entities: users, tasks
```

This will happen in common scenarios:
- Logging: `console.log(proxy)` accesses `Symbol.toStringTag` and `Symbol(nodejs.util.inspect.custom)`
- Promise resolution: `await proxy` accesses `Symbol.toPrimitive` / `.then`
- Serialization: `JSON.stringify(proxy)` accesses `.toJSON`
- Template literals: `${proxy}` accesses `Symbol.toPrimitive`
- Node.js inspection: `util.inspect(proxy)` accesses multiple symbols

**Location:** `packages/server/src/entity/entity-registry.ts:26`

**Suggested fix:**
```ts
createProxy(): Record<string, EntityOperations> {
  return new Proxy({} as Record<string, EntityOperations>, {
    get: (_target, prop) => {
      if (typeof prop === 'symbol') return undefined;
      return this.get(prop);
    },
  });
}
```

Add a test:
```ts
it('Then proxy does not throw on symbol access', () => {
  const registry = new EntityRegistry();
  registry.register('users', stubOps());
  const proxy = registry.createProxy();

  // Should not throw when Node/browser internals access symbols
  expect(() => `${String(proxy)}`).not.toThrow();
});
```

---

### T-4: `EntityOperations.list()` uses `Record<string, unknown>` for `where` -- no type threading from model columns

**Severity:** LOW

The `list` method's `where` option is typed as `Record<string, unknown>`, which allows `where: { nonExistentColumn: 'value' }` without type error. The model's column names are available through `TModel['table']`, but they are not used to constrain the `where` clause.

**Location:** `packages/server/src/entity/entity-operations.ts:12`

**Suggested fix:** This is likely acceptable for v0.1.0 since the `where` clause semantics (operators, nested conditions, etc.) are not yet defined. However, note this as a future hardening point:
```ts
list(options?: {
  where?: Partial<Record<keyof TModel['table']['$response'], unknown>>;
  limit?: number;
  cursor?: string;
}): Promise<TModel['table']['$response'][]>;
```

---

### T-5: `EntityOperations.get()` has no `undefined` or `null` in return type -- implies entity always exists

**Severity:** LOW

`get(id: string): Promise<TModel['table']['$response']>` implies a get always succeeds. In practice, if the entity is not found, the implementation will likely throw or return `null`. If it throws, the type is fine. If it returns `null`, the type is misleading. The design should pick one and document it.

**Location:** `packages/server/src/entity/entity-operations.ts:10`

**Suggested fix:** Add JSDoc clarifying the contract:
```ts
/** Fetches an entity by ID. Throws if not found. */
get(id: string): Promise<TModel['table']['$response']>;
```
Or if nullable return is intended:
```ts
get(id: string): Promise<TModel['table']['$response'] | null>;
```

---

## Bug and Edge Case Findings

### BUG-1: `EntityRegistry.register()` silently overwrites existing entries -- no duplicate detection

**Severity:** HIGH

`EntityRegistry.register()` calls `Map.set()`, which silently overwrites any existing entry with the same name. If two different entity modules both call `registry.register('users', ops)`, the second silently replaces the first with no error and no warning. This is a data corruption vector -- the first entity's operations become unreachable, and any context created before the overwrite will use stale ops while new contexts use the replacement.

**Location:** `packages/server/src/entity/entity-registry.ts:6-8`

**Suggested fix:**
```ts
register(name: string, ops: EntityOperations): void {
  if (this.entries.has(name)) {
    throw new Error(
      `Entity "${name}" is already registered. Each entity must have a unique name.`
    );
  }
  this.entries.set(name, ops);
}
```

Add a test:
```ts
it('Then throws if registering the same name twice', () => {
  const registry = new EntityRegistry();
  registry.register('users', stubOps());

  expect(() => registry.register('users', stubOps())).toThrow(
    /Entity "users" is already registered/
  );
});
```

---

### BUG-2: `ctx.role()` with zero arguments returns `false` -- correct but untested edge case

**Severity:** LOW

`role(...rolesToCheck: string[])` with no arguments calls `[].some(...)` which returns `false`. This is correct behavior (no roles to check means no match), but the edge case is not tested. If someone refactors to use a different algorithm (e.g., `every` instead of `some`), the zero-argument behavior changes to `true`, which would be a security issue.

**Location:** `packages/server/src/entity/context.ts:34-36`

**Suggested fix:** Add a test:
```ts
describe('When calling ctx.role() with no arguments', () => {
  it('Then returns false', () => {
    const ctx = createEntityContext({ roles: ['admin'] }, stubOps(), {});
    expect(ctx.role()).toBe(false);
  });
});
```

---

### BUG-3: `RequestInfo.userId` accepts `undefined` via optional chaining, but `EntityContext.userId` is `string | null` -- implicit coercion

**Severity:** LOW

`RequestInfo` declares `userId?: string | null` (optional). `createEntityContext` normalizes with `request.userId ?? null`. This means `undefined` becomes `null`, which is correct. However, there is a subtle gap: `RequestInfo` allows `userId: undefined` explicitly (not just omission), and the test suite does not cover this case. The behavior is correct because `??` catches both `undefined` and `null`, but a future refactoring to `||` would break this (since `||` also catches empty strings).

**Location:** `packages/server/src/entity/context.ts:8-9,22`

**Suggested fix:** The current code is correct. Add a test for the explicit `undefined` case to prevent regression:
```ts
it('Then userId: undefined is normalized to null', () => {
  const ctx = createEntityContext({ userId: undefined }, stubOps(), {});
  expect(ctx.userId).toBeNull();
});
```

---

### BUG-4: `EntityRegistry.createProxy()` returns a new Proxy on each call -- no caching

**Severity:** LOW

Every call to `createProxy()` creates a new Proxy object. If `createProxy()` is called per-request (to pass as `registryProxy` in `createEntityContext`), this creates a new Proxy per request. Since the Proxy delegates to the same `entries` Map, the behavior is correct, but it is a minor performance concern in high-throughput scenarios.

**Location:** `packages/server/src/entity/entity-registry.ts:24-28`

**Suggested fix:** Cache the Proxy:
```ts
private proxy: Record<string, EntityOperations> | null = null;

createProxy(): Record<string, EntityOperations> {
  if (!this.proxy) {
    this.proxy = new Proxy({} as Record<string, EntityOperations>, {
      get: (_target, prop) => {
        if (typeof prop === 'symbol') return undefined;
        return this.get(prop);
      },
    });
  }
  return this.proxy;
}
```

This is safe because the Proxy delegates to `this.entries`, which reflects any registrations made after proxy creation. Caching does not change behavior.

---

### BUG-5: `createEntityContext` returns a plain object -- `userId` is writable despite `readonly` in the interface

**Severity:** MEDIUM

The `EntityContext` interface marks `userId` as `readonly`, but `createEntityContext` returns a plain object literal. TypeScript's `readonly` is compile-time only -- at runtime, the object is fully mutable:

```ts
const ctx = createEntityContext({ userId: 'user-1' }, stubOps(), {});
(ctx as any).userId = 'attacker-id';  // succeeds at runtime
ctx.authenticated();  // still returns true, but userId is now wrong
```

More critically, even without `as any`, the `authenticated()` method closes over the `const userId` variable, not the `ctx.userId` property. If someone mutates `ctx.userId` directly, `authenticated()` still returns the original answer because it checks the closed-over `userId` local, not `this.userId`. This creates an inconsistency: `ctx.userId` says one thing, `ctx.authenticated()` says another.

**Location:** `packages/server/src/entity/context.ts:26-39`

**Suggested fix:** Either freeze the returned context:
```ts
return Object.freeze({
  userId,
  authenticated() { ... },
  // ...
});
```

Or make the methods reference `this` instead of closure:
```ts
const context: EntityContext<TModel> = {
  userId,
  authenticated() {
    return this.userId !== null;
  },
  // ...
};
return context;
```

The freeze approach is more aligned with the project's pattern (`entity()` already uses `deepFreeze`).

---

## DX and Design Findings

### DX-1: `createEntityContext` requires three separate arguments -- easy to get wrong

**Severity:** MEDIUM

The factory takes `(request, entityOps, registryProxy)` as three separate positional arguments. For an LLM generating code, the ordering of `entityOps` vs `registryProxy` is easy to confuse -- both are related to entity operations, and the type system won't catch a swap when using the default `ModelDef` (both accept `Record<string, EntityOperations>`-compatible shapes).

**Location:** `packages/server/src/entity/context.ts:17-21`

**Suggested fix:** Consider a named-parameter pattern:
```ts
export function createEntityContext<TModel extends ModelDef = ModelDef>(opts: {
  request: RequestInfo;
  entityOps: EntityOperations<TModel>;
  registry: Record<string, EntityOperations>;
}): EntityContext<TModel> {
```

This makes call sites self-documenting:
```ts
createEntityContext({
  request: { userId: 'user-1' },
  entityOps: tasksOps,
  registry: registry.createProxy(),
});
```

If positional arguments are preferred for performance, at minimum add JSDoc to the function parameters.

---

### DX-2: `EntityRegistry` has no `names()` or `entries()` iterator -- hard to inspect

**Severity:** LOW

`EntityRegistry` only exposes `register`, `get`, `has`, and `createProxy`. There is no way to list all registered entity names or iterate over entries. This makes debugging difficult -- a developer cannot write `registry.names()` or `for (const [name, ops] of registry)` to inspect what is registered.

**Location:** `packages/server/src/entity/entity-registry.ts:3-29`

**Suggested fix:**
```ts
names(): IterableIterator<string> {
  return this.entries.keys();
}

size(): number {
  return this.entries.size;
}
```

The `get()` error message already computes the names list (`[...this.entries.keys()].join(', ')`), so the internal data is there -- it just is not exposed.

---

### DX-3: `context.test-d.ts` tests `EntityContext<UsersModel>` types in isolation but never tests `createEntityContext` return type

**Severity:** HIGH

The type-level tests in `context.test-d.ts` construct `EntityContext<UsersModel>` directly as a type alias and verify its properties. They never test the actual `createEntityContext` function. This means the test suite certifies "the interface is correct" but not "the factory returns the correct interface." Since T-1 (above) shows the factory returns the unparameterized `EntityContext`, these type tests provide a false sense of security.

Per the project's TDD rules (`.claude/rules/tdd.md`): "Every generic type parameter must be tested end-to-end -- if a type is defined at layer A, there must be a `.test-d.ts` test proving it surfaces at layer Z."

**Location:** `packages/server/src/entity/__tests__/context.test-d.ts` (entire file)

**Suggested fix:** Add type tests that exercise `createEntityContext`:
```ts
import { createEntityContext } from '../context';
import type { EntityOperations } from '../entity-operations';

it('createEntityContext return type preserves TModel on ctx.entity', () => {
  declare const ops: EntityOperations<UsersModel>;
  const ctx = createEntityContext({}, ops, {});

  type CreateParam = Parameters<typeof ctx.entity.create>[0];
  expectTypeOf<CreateParam>().toHaveProperty('email');
  expectTypeOf<CreateParam>().toHaveProperty('name');
});

it('createEntityContext return type excludes readOnly from create input', () => {
  declare const ops: EntityOperations<UsersModel>;
  const ctx = createEntityContext({}, ops, {});

  type CreateParam = Parameters<typeof ctx.entity.create>[0];
  // @ts-expect-error -- createdAt is readOnly
  type _Test = CreateParam['createdAt'];
});
```

These tests would currently **fail** because of T-1 (the return type is unparameterized), which is exactly the point -- they would have caught the bug.

---

### DX-4: `EntityOperations.delete()` returns `Promise<void>` -- no confirmation of what was deleted

**Severity:** LOW

`delete(id: string): Promise<void>` provides no information about whether the delete actually removed something. A `Promise<{ deleted: boolean }>` or `Promise<TModel['table']['$response']>` (returning the deleted row) would give the caller confirmation. This matters for after-hooks -- the `EntityAfterHooks.delete` signature in `types.ts:51` expects `(row: TResponse, ctx)`, implying the deleted row is available. But `EntityOperations.delete` returns `void`, so where does the after-hook's `row` come from?

**Location:** `packages/server/src/entity/entity-operations.ts:18`, `packages/server/src/entity/types.ts:51`

**Suggested fix:** Consider returning the deleted entity to support after-hooks:
```ts
delete(id: string): Promise<TModel['table']['$response']>;
```
Or keep `void` and document that the runtime layer will fetch the row before deletion for the after-hook.

---

### DX-5: `EntityContext` exposes `tenantId` check but not the `tenantId` value itself

**Severity:** MEDIUM

`EntityContext` provides `userId` as a property and `authenticated()` as a boolean check. But for tenants, only `tenant()` (the boolean check) is available -- there is no `tenantId` property. This is inconsistent:

| Concept | Value accessor | Boolean check |
|---------|---------------|---------------|
| User    | `ctx.userId`  | `ctx.authenticated()` |
| Tenant  | _(missing)_   | `ctx.tenant()` |
| Roles   | _(missing)_   | `ctx.role(...)` |

A developer who needs the actual tenant ID (e.g., for multi-tenant queries, scoping, logging) has no way to access it through the context. They would need to pass it through a separate channel.

**Location:** `packages/server/src/entity/types.ts:8-13`

**Suggested fix:** Add `tenantId` to the interface for consistency:
```ts
export interface EntityContext<TModel extends ModelDef = ModelDef> {
  readonly userId: string | null;
  readonly tenantId: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;
  // ...
}
```

---

### DX-6: No test for `EntityRegistry.get()` on a completely empty registry

**Severity:** LOW

The test "Then registry.get('comments') throws with available entity names" registers `users` and `posts` first, then calls `.get('comments')`. But there is no test for calling `.get()` on a completely empty registry. The error message in that case would be:

```
Entity "comments" is not registered. Available entities:
```

(trailing `: ` with no names, because `[...this.entries.keys()].join(', ')` produces an empty string). This is not a bug but a cosmetic issue in the error message.

**Location:** `packages/server/src/entity/__tests__/entity-registry.test.ts:45-62`, `packages/server/src/entity/entity-registry.ts:13`

**Suggested fix:** Add a test and improve the error message:
```ts
it('Then registry.get() on empty registry throws with helpful message', () => {
  const registry = new EntityRegistry();
  expect(() => registry.get('users')).toThrow(/Entity "users" is not registered/);
});
```

Improve the message:
```ts
get(name: string): EntityOperations {
  const entry = this.entries.get(name);
  if (!entry) {
    const available = [...this.entries.keys()];
    const suffix = available.length > 0
      ? ` Available entities: ${available.join(', ')}`
      : ' No entities have been registered.';
    throw new Error(`Entity "${name}" is not registered.${suffix}`);
  }
  return entry;
}
```

---

## Summary

| ID    | Severity | Category    | Summary                                                          |
|-------|----------|-------------|------------------------------------------------------------------|
| T-1   | CRITICAL | Type Safety | `createEntityContext` return type drops `TModel` -- dead generic |
| T-2   | MEDIUM   | Type Safety | `ctx.entities` allows access to any key without type error       |
| T-3   | MEDIUM   | Type Safety | Proxy handler types `prop` as `string` but receives `symbol`     |
| T-4   | LOW      | Type Safety | `list()` `where` clause is untyped `Record<string, unknown>`     |
| T-5   | LOW      | Type Safety | `get()` return type implies entity always exists                 |
| BUG-1 | HIGH     | Bug         | `register()` silently overwrites -- no duplicate detection       |
| BUG-2 | LOW      | Bug         | `ctx.role()` with zero args is correct but untested              |
| BUG-3 | LOW      | Bug         | `RequestInfo.userId: undefined` normalization is untested        |
| BUG-4 | LOW      | Bug         | `createProxy()` creates new Proxy on each call -- no caching    |
| BUG-5 | MEDIUM   | Bug         | Returned context object is mutable; closure/property mismatch    |
| DX-1  | MEDIUM   | DX          | Three positional args in factory -- easy to swap                 |
| DX-2  | LOW      | DX          | No `names()`/`size()` on EntityRegistry for debugging            |
| DX-3  | HIGH     | DX          | Type tests never exercise `createEntityContext` -- false safety  |
| DX-4  | LOW      | DX          | `delete()` returns void but after-hook expects the deleted row   |
| DX-5  | MEDIUM   | DX          | `tenantId` value inaccessible -- only boolean check exposed      |
| DX-6  | LOW      | DX          | Empty registry error message is awkward                          |

**Critical count:** 1 (T-1)
**High count:** 2 (BUG-1, DX-3)
**Medium count:** 5 (T-2, T-3, BUG-5, DX-1, DX-5)
**Low count:** 8 (T-4, T-5, BUG-2, BUG-3, BUG-4, DX-2, DX-4, DX-6)

---

## Priority Recommendations

**Must fix before moving to Phase 5:**
1. **T-1 + DX-3** (interrelated): Fix `createEntityContext` return type to `EntityContext<TModel>` and add type-level tests that exercise the factory's return type end-to-end. These two findings together represent a dead generic that violates the project's Type Flow Verification mandate.
2. **T-3**: Guard against `symbol` property access in the Proxy handler. This will cause runtime crashes in common debugging/logging scenarios.
3. **BUG-1**: Add duplicate registration detection in `EntityRegistry.register()`.

**Should fix (before feature completion):**
4. **BUG-5**: Freeze the returned context object or use `this`-based methods.
5. **DX-5**: Expose `tenantId` on `EntityContext` for consistency with `userId`.

**Can defer:**
6. Everything else -- these are hardening improvements and DX polish that can be addressed in later phases or post-v0.1.0.
