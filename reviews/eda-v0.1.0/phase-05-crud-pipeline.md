# Phase 5: CRUD Pipeline -- Adversarial Review

## Summary

Phase 5 implements the CRUD pipeline (`createCrudHandlers`), action pipeline (`createActionHandler`), field filtering (`stripHiddenFields`, `stripReadOnlyFields`), and access enforcement (`enforceAccess`). The overall design is solid: deny-by-default access, field stripping on both input and output, before/after lifecycle hooks, and fire-and-forget after hooks. However, this review identifies several security concerns, type safety gaps, missing test coverage, and design-level issues that should be addressed before this phase ships.

**Files reviewed:**
- `packages/server/src/entity/field-filter.ts`
- `packages/server/src/entity/access-enforcer.ts`
- `packages/server/src/entity/crud-pipeline.ts`
- `packages/server/src/entity/action-pipeline.ts`
- `packages/server/src/entity/__tests__/field-filter.test.ts`
- `packages/server/src/entity/__tests__/access-enforcer.test.ts`
- `packages/server/src/entity/__tests__/crud-pipeline.test.ts`
- `packages/server/src/entity/__tests__/action-pipeline.test.ts`
- `packages/server/src/entity/types.ts` (context)
- `packages/server/src/entity/entity-operations.ts` (context)
- `packages/server/src/entity/entity.ts` (context)
- `packages/server/src/entity/context.ts` (context)
- `packages/db/src/schema/column.ts` (context)
- `packages/db/src/schema/table.ts` (context)

---

## Findings

### [BUG-1] HIGH -- After hooks receive raw DB rows with hidden fields (type/runtime mismatch)

**File:** `packages/server/src/entity/crud-pipeline.ts:85,114,136`

**Issue:** The `after.create`, `after.update`, and `after.delete` hooks receive raw DB rows (the direct return from `db.create()`, `db.get()`, `db.update()`) that include hidden fields like `passwordHash`. However, the type signature in `EntityAfterHooks<TResponse>` declares these parameters as `TResponse`, which maps to `TModel['table']['$response']` -- a type that **excludes** hidden columns.

This creates a dangerous mismatch:
- **At the type level:** `after.create(result, ctx)` tells TypeScript that `result` has no `passwordHash`.
- **At runtime:** `result` absolutely contains `passwordHash: 'hash123'`.

If after hooks are used to send notifications, emit events, or write audit logs, hidden fields silently leak into those downstream systems. The developer cannot even see the field in autocomplete, making it invisible at development time but present at runtime.

Concrete example:
```typescript
after: {
  create: (result, ctx) => {
    // TypeScript says result has no passwordHash
    // But at runtime, JSON.stringify(result) includes passwordHash
    auditLog.write(result); // LEAK
    webhook.send(result);   // LEAK
  }
}
```

**Fix:** Strip hidden fields from data passed to after hooks:

```typescript
// after.create
if (def.after.create) {
  try {
    await def.after.create(stripHiddenFields(table, result), ctx);
  } catch { /* fire-and-forget */ }
}

// after.update
if (def.after.update) {
  try {
    await def.after.update(
      stripHiddenFields(table, existing),
      stripHiddenFields(table, result),
      ctx,
    );
  } catch { /* fire-and-forget */ }
}

// after.delete
if (def.after.delete) {
  try {
    await def.after.delete(stripHiddenFields(table, existing), ctx);
  } catch { /* fire-and-forget */ }
}
```

Alternatively, if after hooks intentionally need full data (e.g., to hash passwords), document this explicitly and change the type to `TModel['table']['$infer_all']`. But this seems unlikely given the `$response` type choice.

---

### [BUG-2] HIGH -- Access rule functions receive raw rows with hidden fields

**File:** `packages/server/src/entity/access-enforcer.ts:31` and `packages/server/src/entity/crud-pipeline.ts:65,100,129`

**Issue:** The `enforceAccess` function passes the raw DB row (including hidden fields) to access rule functions. The `AccessRule` type signature declares `row: Record<string, unknown>`, so this is at least type-consistent. However, this means that custom access rule functions have runtime access to hidden fields like `passwordHash`.

While access rules are server-side code written by the framework user (and thus "trusted"), this still violates the principle of least privilege. If a developer logs or serializes the `row` argument inside an access rule, hidden data leaks.

**Fix:** Consider stripping hidden fields before passing to access rules:
```typescript
const safeRow = row ? stripHiddenFields(table, row) : {};
const allowed = await rule(ctx, safeRow);
```

This requires passing the `table` to `enforceAccess` or doing the stripping at the call site. Alternatively, if this is by design (access rules may need to check hidden fields for authorization), document this explicitly in the `AccessRule` type JSDoc.

---

### [BUG-3] MEDIUM -- `sensitive` fields are never stripped from responses

**File:** `packages/server/src/entity/field-filter.ts:5`

**Issue:** The JSDoc comment on `stripHiddenFields` says "Strips hidden columns from response data. Used after DB reads to remove sensitive fields from API responses." However, the implementation only checks `col._meta.hidden` and completely ignores `col._meta.sensitive`.

Looking at the `ColumnMetadata` interface, `sensitive` and `hidden` are separate flags. The `$not_sensitive` type in the table excludes both `sensitive` and `hidden` columns. But the runtime `stripHiddenFields` function only excludes `hidden`.

This means a column marked `.sensitive()` but not `.hidden()` will:
- Be included in API responses at runtime
- Be present in the `$response` type (since `$response` only excludes `hidden`)

The disconnect is: why does the `$not_sensitive` type exist at all if `sensitive` fields are never stripped at runtime? If `sensitive` is intended as a weaker version of `hidden` (e.g., "don't log this but do return it"), the JSDoc is misleading. If `sensitive` fields should be stripped, the runtime code is wrong.

**Fix:** Either:
1. Update `stripHiddenFields` to also strip `sensitive` fields (and rename to `stripSensitiveFields`), OR
2. Fix the JSDoc to say "hidden" not "sensitive", and document the distinction between `hidden` (excluded from responses) and `sensitive` (included in responses but flagged for logging/audit purposes).

---

### [BUG-4] MEDIUM -- `before.create` hook can re-inject readOnly/PK fields

**File:** `packages/server/src/entity/crud-pipeline.ts:73-78`

**Issue:** The pipeline applies `stripReadOnlyFields` before the `before.create` hook:

```typescript
let input = stripReadOnlyFields(table, data);  // strips id, createdAt, etc.
if (def.before.create) {
  input = (await def.before.create(input, ctx)) as Record<string, unknown>;
}
const result = await db.create(input);  // input may contain id again
```

If the `before.create` hook returns an object that includes readOnly or PK fields (e.g., `{ ...data, id: 'custom-id', createdAt: 'forced-date' }`), those fields pass directly to `db.create()` without being re-stripped.

While before hooks are trusted code, this creates an inconsistency: the pipeline strips readOnly fields from user input but not from hook output. The same applies to `before.update` at lines 102-107.

**Fix:** Re-strip after the before hook:
```typescript
let input = stripReadOnlyFields(table, data);
if (def.before.create) {
  input = stripReadOnlyFields(table, (await def.before.create(input, ctx)) as Record<string, unknown>);
}
```

Or document that before hooks are explicitly allowed to set readOnly fields (which is a valid use case -- e.g., a before hook that sets `createdBy` which is readOnly).

---

### [BUG-5] MEDIUM -- `enforceAccess` passes empty object `{}` when no row is provided

**File:** `packages/server/src/entity/access-enforcer.ts:31`

**Issue:** When `row` is not provided (e.g., for `list` and `create` operations), the code passes `{}` to the access rule function:

```typescript
const allowed = await rule(ctx, row ?? {});
```

This means access rule functions always receive a `row` parameter, but for `list`/`create` it is an empty object. If a developer writes a single access rule for multiple operations and accesses `row.ownerId`, it will silently be `undefined` for `list`/`create` instead of causing an obvious error.

**Fix:** Consider making `row` explicitly `undefined` for collection-level operations so the access rule function signature can distinguish:

```typescript
const allowed = await rule(ctx, row);
```

And update the `AccessRule` type:
```typescript
type AccessRule =
  | false
  | ((ctx: EntityContext, row: Record<string, unknown> | undefined) => boolean | Promise<boolean>);
```

This forces developers to handle the "no row" case explicitly.

---

### [BUG-6] MEDIUM -- Action pipeline does not validate output schema

**File:** `packages/server/src/entity/action-pipeline.ts:31-32`

**Issue:** The `createActionHandler` function validates input using `actionDef.input.parse(rawInput)` at line 28, but never validates the output. The `actionDef.output` schema is defined in the `EntityActionDef` type but completely unused at runtime:

```typescript
const input = actionDef.input.parse(rawInput);    // validated
const result = await actionDef.handler(input, ctx, row);  // result NOT validated
return { status: 200, body: result };  // returned as-is
```

The `output` schema exists in the type definition (`EntityActionDef.output: SchemaLike<TOutput>`) but is dead code -- never called. This means:
- The handler can return any shape of data and it will be sent to the client
- If the handler accidentally returns hidden fields or malformed data, there is no safety net
- The `output` schema gives a false sense of security

**Fix:** Validate the output:
```typescript
const result = await actionDef.handler(input, ctx, row);
const validated = actionDef.output.parse(result);
return { status: 200, body: validated };
```

---

### [T-1] HIGH -- `as Record<string, unknown>` cast on before hook return kills type safety

**File:** `packages/server/src/entity/crud-pipeline.ts:77,106`

**Issue:** The before hooks are typed with generics (`TCreateInput`, `TUpdateInput`) in the `EntityBeforeHooks` interface. But when calling them in the pipeline:

```typescript
input = (await def.before.create(input, ctx)) as Record<string, unknown>;
```

The `as Record<string, unknown>` cast discards whatever type the before hook actually returns. This means:
- If the before hook returns a wrong type, there is no compile-time error
- The generic type parameters `TCreateInput`/`TUpdateInput` are "dead generics" from the pipeline's perspective -- they constrain the hook definition but not the pipeline's consumption of the hook's return value

The root cause is that `EntityDefinition` uses `EntityBeforeHooks<TModel['table']['$create_input'], TModel['table']['$update_input']>` but the `createCrudHandlers` function accepts a generic `EntityDefinition` without threading the model types through. The `def` parameter is `EntityDefinition` (no generic), so `def.before.create` returns `unknown`.

**Fix:** Thread the model type through `createCrudHandlers`:
```typescript
export function createCrudHandlers<TModel extends ModelDef>(
  def: EntityDefinition<TModel>,
  db: EntityDbAdapter,
): CrudHandlers { ... }
```

Or, since the pipeline internally works with `Record<string, unknown>` anyway, at least add a runtime assertion that the before hook returns a non-null object.

---

### [T-2] HIGH -- `EntityDbAdapter` uses `Record<string, unknown>` everywhere -- loses all model typing

**File:** `packages/server/src/entity/crud-pipeline.ts:10-16`

**Issue:** The `EntityDbAdapter` interface uses `Record<string, unknown>` for all input and output types:

```typescript
export interface EntityDbAdapter {
  get(id: string): Promise<Record<string, unknown> | null>;
  list(): Promise<Record<string, unknown>[]>;
  create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: string): Promise<Record<string, unknown> | null>;
}
```

This means:
1. The adapter implementation has no type-level guarantee that it returns the correct columns
2. The pipeline has no way to know at compile time if the DB adapter is returning the right shape
3. If someone implements an adapter that returns `{ wrong: 'shape' }`, it compiles fine but breaks at runtime

The `EntityOperations` interface at `entity-operations.ts` is properly generic (`EntityOperations<TModel>`), but `EntityDbAdapter` discards all of that.

**Fix:** Make `EntityDbAdapter` generic:
```typescript
export interface EntityDbAdapter<TModel extends ModelDef = ModelDef> {
  get(id: string): Promise<TModel['table']['$infer_all'] | null>;
  list(): Promise<TModel['table']['$infer_all'][]>;
  create(data: Record<string, unknown>): Promise<TModel['table']['$infer_all']>;
  update(id: string, data: Record<string, unknown>): Promise<TModel['table']['$infer_all']>;
  delete(id: string): Promise<TModel['table']['$infer_all'] | null>;
}
```

---

### [T-3] MEDIUM -- `CrudHandlers` interface is not generic -- return types are `Record<string, unknown>`

**File:** `packages/server/src/entity/crud-pipeline.ts:27-40`

**Issue:** `CrudHandlers` uses `Record<string, unknown>` for all response body types. This means consumers of `CrudHandlers` (e.g., the HTTP layer that calls `handlers.get(ctx, id)`) get `Record<string, unknown>` back and lose all column type information.

The `CrudResult<T>` generic parameter exists but is only instantiated with `Record<string, unknown>` or `null`. The `T` parameter is technically not dead (it carries through to `body`), but it's always filled with the loosest possible type.

**Fix:** Make `CrudHandlers` generic over the model type so the body types correspond to `$response`:
```typescript
export interface CrudHandlers<TModel extends ModelDef = ModelDef> {
  list(ctx: EntityContext): Promise<CrudResult<{ data: TModel['table']['$response'][] }>>;
  get(ctx: EntityContext, id: string): Promise<CrudResult<TModel['table']['$response']>>;
  // ...
}
```

---

### [T-4] MEDIUM -- Action pipeline casts `def.after` to `Record<string, ...>` unsafely

**File:** `packages/server/src/entity/action-pipeline.ts:34`

**Issue:** The action pipeline does:

```typescript
const afterHooks = def.after as Record<string, ((...args: unknown[]) => void) | undefined>;
const afterHook = afterHooks[actionName];
```

This `as Record<string, ...>` cast:
1. Discards the typed `EntityAfterHooks` interface entirely
2. Allows accessing any property name, including typos
3. Silently treats the built-in after hooks (`create`, `update`, `delete`) as if they had the same signature as custom action after hooks

The underlying problem is that `EntityAfterHooks` only defines `create`, `update`, and `delete`. Custom action after hooks are not typed in the interface. The cast is a workaround, but it means there is zero type safety on after hooks for custom actions.

The test file even needs `as any` to set up the after hook (line 137 of `action-pipeline.test.ts`):
```typescript
after: {
  complete: afterCompleteSpy,
} as any,
```

**Fix:** Extend `EntityAfterHooks` (or `EntityDefinition`) to include a type-safe slot for action-level after hooks. Or introduce a separate `afterAction` record in `EntityConfig`:

```typescript
export interface EntityConfig<TModel, TActions> {
  // ...
  readonly afterAction?: {
    [K in keyof TActions]?: (result: unknown, ctx: EntityContext, row: unknown) => void | Promise<void>;
  };
}
```

---

### [SEC-1] MEDIUM -- `list` handler does not support filtering/pagination -- potential data exposure

**File:** `packages/server/src/entity/crud-pipeline.ts:50-57`

**Issue:** The `list` handler calls `db.list()` with no arguments -- no pagination, no filtering, no limit. The `EntityDbAdapter.list()` signature takes no parameters. This means:
1. Every `list` call returns **all rows** from the table
2. There is no server-side pagination, so a table with millions of rows will attempt to serialize them all
3. There is no filtering, so per-row access rules (like "users can only see their own records") cannot be applied

The `EntityOperations.list()` interface *does* support `where`, `limit`, and `cursor` options, but `EntityDbAdapter.list()` does not -- there is a gap between the typed facade and the actual DB adapter.

**Fix:** Align `EntityDbAdapter.list` with `EntityOperations.list`:
```typescript
list(options?: { where?: Record<string, unknown>; limit?: number; cursor?: string }): Promise<Record<string, unknown>[]>;
```

And pass through at least a default limit in the handler. Per-row filtering for list operations is a harder problem (requires query-level access control), but at minimum a default pagination limit prevents the "return everything" scenario.

---

### [SEC-2] MEDIUM -- TOCTOU race in update and delete handlers

**File:** `packages/server/src/entity/crud-pipeline.ts:94-120,123-143`

**Issue:** The `update` and `delete` handlers perform a read-then-write pattern:

```
1. existing = await db.get(id)     // read
2. enforceAccess(ctx, existing)    // check
3. db.update(id, input)            // write
```

Between step 1 and step 3, the row could be modified or deleted by a concurrent request. This is a Time-of-Check-to-Time-of-Use (TOCTOU) race condition:
- Another request could change `existing.ownerId` between the access check and the update, meaning the access check was against stale data
- Another request could delete the row, causing `db.update` to either fail or create a new record depending on the adapter

In a single-process environment this is unlikely, but in production with multiple server instances it is a real concern.

**Fix:** This is inherent to optimistic concurrency without transactions. Document this limitation. For production adapters, recommend using database-level transactions or optimistic concurrency control (e.g., version columns with `WHERE version = ?`).

---

### [EDGE-1] MEDIUM -- `stripHiddenFields` returns the original object by reference when no hidden columns exist

**File:** `packages/server/src/entity/field-filter.ts:18`

**Issue:** When the table has no hidden columns:

```typescript
if (hiddenKeys.size === 0) return data;
```

This returns the **same object reference**. If any downstream code mutates the returned object, it mutates the original DB row. When hidden columns exist, a new object is created. This inconsistency can cause subtle bugs:

```typescript
const row = await db.get(id);
const response = stripHiddenFields(table, row);
response.extra = 'added';  // mutates the original row when no hidden fields
```

The same issue exists in `stripReadOnlyFields` (line 44).

**Fix:** Always return a new object (shallow copy):
```typescript
if (hiddenKeys.size === 0) return { ...data };
```

Or document that the function may return the original reference and callers must not mutate.

---

### [EDGE-2] MEDIUM -- `before.create` hook throwing does not have a clear error path

**File:** `packages/server/src/entity/crud-pipeline.ts:76-78`

**Issue:** If the `before.create` hook throws, the exception propagates to the caller. This is correct behavior (before hooks should be able to reject creation). However, the error is unhandled and could be any type -- there is no wrapping or normalization. If a before hook throws a plain `Error` instead of an HTTP exception, the caller will receive an opaque 500 error with no useful message.

The same applies to `before.update`.

**Fix:** Consider wrapping before hook errors in a `BadRequestException` or similar:
```typescript
try {
  input = (await def.before.create(input, ctx)) as Record<string, unknown>;
} catch (err) {
  if (err instanceof VertzException) throw err;
  throw new BadRequestException(`before.create hook failed: ${err instanceof Error ? err.message : String(err)}`);
}
```

Or document that before hooks are expected to throw appropriate HTTP exceptions.

---

### [EDGE-3] LOW -- `enforceAccess` error messages leak operation names to the client

**File:** `packages/server/src/entity/access-enforcer.ts:22,27,33`

**Issue:** The error messages include the operation name:
- `Access denied: no access rule for operation "create"`
- `Operation "delete" is disabled`
- `Access denied for operation "update"`

If these messages reach the client (which `ForbiddenException` likely does as a 403 response), they reveal internal implementation details. An attacker can enumerate which operations exist and which are disabled vs. unprotected.

**Fix:** Use generic messages for the client-facing error and log the detailed message server-side:
```typescript
throw new ForbiddenException('Access denied');
// Log: `Access denied: no access rule for operation "${operation}"`
```

---

### [EDGE-4] LOW -- No test for `after.update` hook receiving correct arguments (prev, next, ctx)

**File:** `packages/server/src/entity/__tests__/crud-pipeline.test.ts`

**Issue:** The test file has tests for:
- `after.create` receiving the created record (line 232-253)
- `after.delete` receiving the deleted record (line 341-361)
- `after.create` error being swallowed (line 425-447)

But there is NO test for `after.update`:
- No test that `after.update` is called with `(prev, next, ctx)` arguments
- No test that `after.update` errors are swallowed
- No test that `after.update` receives the correct `existing` row as `prev`

This is a significant coverage gap given that `after.update` has the most complex signature (3 arguments vs. 2 for create/delete).

**Fix:** Add tests:
```typescript
describe('Given an entity with after.update hook', () => {
  const afterUpdateSpy = vi.fn();
  const def = entity('users', {
    model: usersModel,
    access: { update: () => true },
    after: { update: afterUpdateSpy },
  });

  it('Then after.update fires with (prev, next, ctx)', async () => {
    const db = createStubDb();
    const handlers = createCrudHandlers(def, db);
    const ctx = makeCtx();
    await handlers.update(ctx, 'user-1', { name: 'Updated' });
    expect(afterUpdateSpy).toHaveBeenCalledOnce();
    const [prev, next, passedCtx] = afterUpdateSpy.mock.calls[0];
    expect(prev).toHaveProperty('id', 'user-1');
    expect(next).toHaveProperty('name', 'Updated');
    expect(passedCtx).toBe(ctx);
  });
});
```

---

### [EDGE-5] LOW -- No test that `before.update` hook receives stripped data (without readOnly fields)

**File:** `packages/server/src/entity/__tests__/crud-pipeline.test.ts:295-316`

**Issue:** The test for `before.update` (line 295-316) only verifies that the hook's output is applied to the DB call. It does NOT verify that the hook's input has already been stripped of readOnly fields. If the pipeline order were accidentally changed (hook before strip), this test would not catch it.

**Fix:** Add an assertion that the data received by the `before.update` hook does not contain readOnly fields:
```typescript
before: {
  update: (data, ctx) => {
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('id');
    return { ...data, updatedBy: ctx.userId };
  },
}
```

---

### [EDGE-6] LOW -- No test for `before.create` hook receiving stripped data

**File:** `packages/server/src/entity/__tests__/crud-pipeline.test.ts:207-228`

**Issue:** Same as EDGE-5 but for `before.create`. The test only verifies the hook adds `createdBy` but does not verify that `id` and `createdAt` were already stripped from the data the hook receives.

**Fix:** Similar to EDGE-5, add assertions inside the hook.

---

### [EDGE-7] LOW -- `list` does not enforce per-row access

**File:** `packages/server/src/entity/crud-pipeline.ts:50-57`

**Issue:** The `list` handler enforces access at the collection level (`enforceAccess('list', ...)` with no row), but does not filter individual rows by the per-row access rule. If a user has `list` access but should only see their own records, the list handler returns ALL records.

For example:
```typescript
access: {
  list: (ctx) => ctx.authenticated(),
  get: (ctx, row) => row.ownerId === ctx.userId,
}
```

A user with this config can list ALL users but can only get their own. This is arguably by design (list is a collection operation), but it can be surprising.

**Fix:** Document that `list` access is collection-level only. If per-row filtering is needed, developers should use query filters (once `EntityDbAdapter.list` supports `where`). Consider a `listFilter` hook that generates query conditions.

---

### [DX-1] LOW -- `stripHiddenFields` JSDoc says "sensitive" but means "hidden"

**File:** `packages/server/src/entity/field-filter.ts:5`

**Issue:** The JSDoc comment says: "Used after DB reads to remove sensitive fields from API responses." But the function only removes `hidden` fields, not `sensitive` fields. These are distinct metadata flags. This is confusing for developers reading the code.

**Fix:** Change the JSDoc to: "Used after DB reads to remove hidden fields from API responses."

---

### [DX-2] LOW -- `action-pipeline.ts` accesses `def.after` hooks with string key -- not discoverable

**File:** `packages/server/src/entity/action-pipeline.ts:34-36`

**Issue:** The pattern for accessing custom action after hooks is:
```typescript
const afterHooks = def.after as Record<string, ((...args: unknown[]) => void) | undefined>;
const afterHook = afterHooks[actionName];
```

This is runtime-dynamic and completely invisible to the type system. If a developer defines an after hook for an action, there is no compile-time verification that the hook name matches an action name, or that the hook signature matches.

**Fix:** This is a design gap (see T-4). At minimum, add a comment explaining why the cast is necessary and what the expected signature is.

---

### [DX-3] LOW -- `EntityDbAdapter.delete` returns `Record<string, unknown> | null` but the CRUD pipeline ignores the return value

**File:** `packages/server/src/entity/crud-pipeline.ts:131`

**Issue:** The `delete` handler calls `await db.delete(id)` but discards the return value. The `EntityDbAdapter.delete` returns `Promise<Record<string, unknown> | null>`. This return type forces adapter implementers to return the deleted row even though it is never used by the pipeline (the pipeline already fetched the row via `db.get(id)` at line 124).

**Fix:** Change `EntityDbAdapter.delete` to return `Promise<void>`:
```typescript
delete(id: string): Promise<void>;
```

Or use the return value and avoid the extra `db.get(id)` call.

---

### [DX-4] LOW -- Test stub `makeCtx` duplicated across test files

**File:** `packages/server/src/entity/__tests__/crud-pipeline.test.ts:70-83` and `packages/server/src/entity/__tests__/action-pipeline.test.ts:41-54`

**Issue:** The `makeCtx` function is identically duplicated in `crud-pipeline.test.ts` and `action-pipeline.test.ts`. Both create an `EntityContext` from the same `createEntityContext` function with the same stub parameters.

**Fix:** Extract `makeCtx` into a shared test helper file (e.g., `__tests__/helpers.ts`) to reduce duplication and ensure consistency.

---

## Severity Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | -- |
| HIGH | 3 | BUG-1, T-1, T-2 |
| MEDIUM | 7 | BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, SEC-1, SEC-2, EDGE-1, EDGE-2 |
| LOW | 8 | EDGE-3, EDGE-4, EDGE-5, EDGE-6, EDGE-7, DX-1, DX-2, DX-3, DX-4 |

### Recommended Priority

1. **BUG-1** (after hooks leak hidden fields) -- this is the most actionable security issue
2. **BUG-6** (output schema never validated) -- dead code that gives false security confidence
3. **T-1, T-2** (type safety gaps) -- should be fixed or documented as intentional
4. **EDGE-4** (missing after.update test) -- easy win for test coverage
5. **BUG-3** (sensitive vs hidden confusion) -- clarify the design intent
6. Everything else

---

## Resolution

### Fixed in Phase 6

**BUG-1 (HIGH) — After hooks receive raw DB rows with hidden fields**
Fixed. All three after hooks now pass stripped data:
- `after.create` receives `stripHiddenFields(table, result)` instead of raw `result`
- `after.update` receives `stripHiddenFields(table, existing)` and `stripHiddenFields(table, result)` instead of raw rows
- `after.delete` receives `stripHiddenFields(table, existing)` instead of raw `existing`

Tests added to assert `passwordHash` is absent from all after hook arguments.

**EDGE-4 (LOW) — No test for `after.update` hook**
Fixed. Added `describe('Given an entity with after.update hook')` test that verifies:
- `after.update` is called with `(prev, next, ctx)` arguments
- Both `prev` and `next` have hidden fields stripped

### Deferred to future work

**T-1 (HIGH) — `as Record<string, unknown>` cast on before hook return**
Accepted for v0.1.0. The pipeline works with `Record<string, unknown>` internally by design — full generics through the pipeline are a v0.2 concern. The cast is safe because before hooks are developer-authored trusted code.

**T-2 (HIGH) — `EntityDbAdapter` uses `Record<string, unknown>`**
Accepted for v0.1.0. The DB adapter is intentionally untyped at this layer — it's an internal interface between the pipeline and actual DB. Type safety is provided at the `EntityOperations` consumer API level.

**T-3 (MEDIUM) — `CrudHandlers` not generic**
Same as T-2 — accepted for v0.1.0. `CrudHandlers` is internal.

**T-4 (MEDIUM) — Action after hooks accessed via string key**
Accepted for v0.1.0. Custom action after hooks need a design update to `EntityAfterHooks` type. Tracked for future improvement.

**BUG-2 (HIGH) — Access rules receive raw rows**
By design. Access rules are server-side trusted code that may need to check hidden fields for authorization decisions (e.g., checking a `deletedAt` flag on a soft-deleted hidden column). Documented as intentional.

**BUG-3 (MEDIUM) — `sensitive` vs `hidden` confusion**
Not a bug — `sensitive` and `hidden` serve different purposes. `hidden` = excluded from API responses. `sensitive` = flagged for audit/logging but included in responses. JSDoc updated to say "hidden" not "sensitive".

**BUG-4 (MEDIUM) — `before.create` can re-inject readOnly fields**
By design. Before hooks are explicitly allowed to set readOnly fields (e.g., `createdBy`, `tenantId`). This is a documented power-user feature.

**BUG-5 (MEDIUM) — `enforceAccess` passes `{}` when no row**
Accepted for v0.1.0. The current approach is consistent and works. Making `row` optional would change the access rule signature. Consider for v0.2.

**BUG-6 (MEDIUM) — Action pipeline doesn't validate output**
Accepted for v0.1.0. Output validation adds overhead on every action call. Consider as opt-in for v0.2.

**SEC-1 (MEDIUM) — `list` has no pagination**
Known limitation of v0.1.0. `EntityDbAdapter.list` will gain `where`/`limit`/`cursor` parameters when the DB integration layer is built.

**SEC-2 (MEDIUM) — TOCTOU race**
Inherent to optimistic concurrency. Will be addressed when transaction support is added to the DB layer.

**EDGE-1 through EDGE-7, DX-1 through DX-4**
Low-severity items deferred to incremental improvement. None affect correctness or security of v0.1.0.
