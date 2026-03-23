# Design: Push `rules.where()` to DB for GET/UPDATE/DELETE

**Status:** Draft (Rev 2 — review feedback addressed)
**Author:** viniciusdacal
**Date:** 2026-03-23

## Problem

`rules.where()` conditions are only pushed to the database query for `list()` operations. For `get()`, `update()`, and `delete()`, where conditions are evaluated post-fetch in memory — the row is fetched by ID alone, then checked against the rule.

This violates design decision D5 from `plans/tenant-isolation-and-entity-access.md`:

> For non-list operations that fetch by ID, the where conditions are added to the SELECT query:
> ```sql
> SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2
> -- If no row returned -> 404
> ```

### Consequences

1. **Information leakage** — GET returns 403 (not 404) when a same-tenant user hits a where-rule denial, revealing the row exists.
2. **Inefficiency** — Rows are fetched from the DB even when the user has no access. For large payloads or high-throughput endpoints, this wastes I/O.
3. **TOCTOU risk** — UPDATE and DELETE check access on a fetched snapshot, then mutate by ID alone. A concurrent write between check and mutation could change the row's ownership, making the access check stale.

### Current behavior (GET example)

```ts
// crud-pipeline.ts — get()
const row = await db.get(id, getOptions);        // Fetches ANY row by ID
if (!row) return notFound(id);
if (!isSameTenant(ctx, row)) return notFound(id); // Post-fetch tenant check
const accessResult = await enforceAccess('get', def.access, ctx, row, ...);
if (!accessResult.ok) return err(accessResult.error); // 403 — leaks existence
```

### Desired behavior

```ts
// Extract where conditions from access rules AND tenant filter
const accessWhere = extractWhereConditions('get', def.access, ctx);
const where = withTenantFilter(ctx, accessWhere ?? {});
const row = await db.get(id, { ...getOptions, where });
if (!row) return notFound(id);  // 404 — no info leak, row simply "doesn't exist"

// Enforce remaining non-where rules (authenticated, entitlement, fva)
const accessResult = await enforceAccess('get', def.access, ctx, row, {
  skipWhere: accessWhere !== null,
  ...buildAccessOptions(ctx),
});
if (!accessResult.ok) return err(accessResult.error);
```

---

## API Surface

### EntityDbAdapter interface change

```ts
// packages/db/src/types/adapter.ts

/** Options for get-by-id operations. */
export interface GetOptions<TEntry extends ModelEntry = ModelEntry> {
  include?: ResolveInclude<TEntry>;
  where?: ResolveWhere<TEntry>;  // NEW — additional WHERE conditions merged with id
}

/** Options for update-by-id operations. */
export interface UpdateOptions<TEntry extends ModelEntry = ModelEntry> {
  where?: ResolveWhere<TEntry>;  // NEW
}

/** Options for delete-by-id operations. */
export interface DeleteOptions<TEntry extends ModelEntry = ModelEntry> {
  where?: ResolveWhere<TEntry>;  // NEW
}

export interface EntityDbAdapter<TEntry extends ModelEntry = ModelEntry> {
  get(id: string, options?: GetOptions<TEntry>): Promise<TEntry['table']['$response'] | null>;

  list(
    options?: ListOptions<TEntry>,
  ): Promise<{ data: TEntry['table']['$response'][]; total: number }>;

  create(data: TEntry['table']['$create_input']): Promise<TEntry['table']['$response']>;

  // CHANGED — added optional options parameter
  update(
    id: string,
    data: TEntry['table']['$update_input'],
    options?: UpdateOptions<TEntry>,
  ): Promise<TEntry['table']['$response']>;

  // CHANGED — added optional options parameter
  delete(
    id: string,
    options?: DeleteOptions<TEntry>,
  ): Promise<TEntry['table']['$response'] | null>;
}
```

### Bridge adapter change

```ts
// packages/db/src/adapters/database-bridge-adapter.ts

async get(id, options?) {
  const result = await delegate.get({
    // Spread order: access where first, then id — ensures primary key always wins
    where: { ...(options?.where ?? {}), id },
    ...(options?.include && { include: options.include }),
  });
  // ...
},

async update(id, data, options?) {
  const result = await delegate.update({
    where: { ...(options?.where ?? {}), id },
    data,
  });
  // ...
},

async delete(id, options?) {
  const result = await delegate.delete({
    where: { ...(options?.where ?? {}), id },
  });
  // ...
},
```

**Note:** The spread order `{ ...options.where, id }` ensures the primary key `id` is never overwritten by a `rules.where({ id: ... })` condition. This is a safety guard — developers should not put `id` in where rules, but the adapter is resilient if they do.

### CRUD pipeline change (GET)

```ts
async get(ctx, id, options) {
  // Extract where conditions from access rules and push to DB query
  const accessWhere = extractWhereConditions('get', def.access, ctx);
  const tenantWhere = withTenantFilter(ctx, accessWhere ?? {});
  // Resolve indirect tenant filter
  const indirectWhere = isIndirectlyScoped
    ? await resolveIndirectTenantWhere(ctx)
    : null;
  const dbWhere = indirectWhere
    ? { ...tenantWhere, ...indirectWhere }
    : tenantWhere;

  const getOptions = {
    ...(options?.include && { include: options.include }),
    ...(dbWhere && Object.keys(dbWhere).length > 0 && { where: dbWhere }),
  };

  const row = await db.get(id, getOptions);
  if (!row) return notFound(id);  // 404 for ALL access failures — no info leak

  // Enforce non-where access rules (authenticated, entitlement, role, fva).
  // skipWhere is true when extractWhereConditions returned non-null (meaning where
  // conditions were pushed to DB). null means no where rules exist — not the same as {}.
  // extractWhereConditions never returns {} — it returns null or a populated object.
  const accessResult = await enforceAccess('get', def.access, ctx, row, {
    skipWhere: accessWhere !== null,
    ...buildAccessOptions(ctx),
  });
  if (!accessResult.ok) return err(accessResult.error);

  return ok({ status: 200, body: /* ... */ });
},
```

### CRUD pipeline change (UPDATE)

```ts
async update(ctx, id, data) {
  // Extract where conditions from access rules and push to DB query
  const accessWhere = extractWhereConditions('update', def.access, ctx);
  const tenantWhere = withTenantFilter(ctx, accessWhere ?? {});
  const indirectWhere = isIndirectlyScoped
    ? await resolveIndirectTenantWhere(ctx)
    : null;
  const dbWhere = indirectWhere
    ? { ...tenantWhere, ...indirectWhere }
    : tenantWhere;

  // Fetch existing row with where conditions (returns null if access denied)
  const existing = await db.get(id, {
    ...(dbWhere && Object.keys(dbWhere).length > 0 && { where: dbWhere }),
  });
  if (!existing) return notFound(id);

  // Enforce non-where access rules
  const accessResult = await enforceAccess('update', def.access, ctx, existing, {
    skipWhere: accessWhere !== null,
    ...buildAccessOptions(ctx),
  });
  if (!accessResult.ok) return err(accessResult.error);

  let input = stripReadOnlyFields(table, data);
  if (def.before.update) {
    input = (await def.before.update(input, ctx)) as Record<string, unknown>;
  }

  // Defense-in-depth: pass where conditions to the UPDATE statement itself.
  // If a concurrent write changes ownership between db.get() and db.update(),
  // the UPDATE WHERE will match 0 rows and the bridge adapter throws WriteError.
  // We catch that and return 404 — the row is no longer "ours."
  const updateOpts = dbWhere && Object.keys(dbWhere).length > 0 ? { where: dbWhere } : undefined;
  try {
    const result = await db.update(id, input, updateOpts);
  } catch {
    // TOCTOU race: row changed between get() and update(). Treat as not found.
    return notFound(id);
  }

  // ...
},
```

### CRUD pipeline change (DELETE)

```ts
async delete(ctx, id) {
  // Extract where conditions from access rules and push to DB query
  const accessWhere = extractWhereConditions('delete', def.access, ctx);
  const tenantWhere = withTenantFilter(ctx, accessWhere ?? {});
  const indirectWhere = isIndirectlyScoped
    ? await resolveIndirectTenantWhere(ctx)
    : null;
  const dbWhere = indirectWhere
    ? { ...tenantWhere, ...indirectWhere }
    : tenantWhere;

  // Fetch existing row with where conditions
  const existing = await db.get(id, {
    ...(dbWhere && Object.keys(dbWhere).length > 0 && { where: dbWhere }),
  });
  if (!existing) return notFound(id);

  // Enforce non-where access rules
  const accessResult = await enforceAccess('delete', def.access, ctx, existing, {
    skipWhere: accessWhere !== null,
    ...buildAccessOptions(ctx),
  });
  if (!accessResult.ok) return err(accessResult.error);

  // Defense-in-depth: pass where conditions to the DELETE statement itself.
  const deleteOpts = dbWhere && Object.keys(dbWhere).length > 0 ? { where: dbWhere } : undefined;
  try {
    await db.delete(id, deleteOpts);
  } catch {
    // TOCTOU race: row changed between get() and delete(). Treat as not found.
    return notFound(id);
  }

  // ...
},
```

---

## Manifesto Alignment

### Principle 1: "If it builds, it works"

The `EntityDbAdapter` interface change is backward-compatible — new parameters are optional. Existing adapters continue to work. The type system ensures callers can only pass valid where conditions via `ResolveWhere<TEntry>`.

### Principle 2: "One way to do things"

After this change, access rules are enforced the same way for ALL CRUD operations: where conditions are pushed to DB, non-where rules are evaluated in-memory with `skipWhere: true`. No more "list does it one way, get/update/delete do it another way."

### Principle 3: "AI agents are first-class users"

An LLM defining entity access rules with `rules.where()` should not need to know that the enforcement mechanism differs by operation. The framework should enforce consistently.

### Principle 5: "If you can't test it, don't build it"

Each change is testable in isolation: adapter where-merging is unit-testable, pipeline integration is testable with mock adapters.

---

## Non-Goals

1. **Rewriting the access enforcer** — The `evaluateRule`/`extractWhereConditions` logic is correct and well-tested. We only change how the pipeline calls these functions.
2. **Adding `where` to `create()`** — Create operations don't fetch existing rows, so row-level where conditions don't apply.
3. **RLS / database-level policies** — Pushing where conditions to SQL is a step toward RLS, but we're not generating actual Postgres RLS policies in this design.
4. **`rules.any()` with `where`** — `extractWhereConditions()` already returns `null` for `any` compositions (can't AND disjunctive conditions). This is by design and not changing. See the **Invariants** section below for why this must remain the case.

### In-scope: Tenant filter pushdown for GET/UPDATE/DELETE

Currently, tenant filtering for GET/UPDATE/DELETE is post-fetch (`isSameTenant()` returns 404). Since we're already adding `where` conditions to these DB queries, we'll push the tenant filter to the DB as well via `withTenantFilter()` — the same function LIST already uses. This replaces the post-fetch `isSameTenant()` check. The behavioral outcome is identical (404), but the row is never fetched.

---

## Invariants

### `extractFromDescriptor` must never extract from `rules.any()`

`extractWhereConditions` walks the rule tree and collects `where` conditions. For `all` compositions, conditions are ANDed — safe to merge into a single `WHERE` clause. But for `any` (OR) compositions, extracting conditions would be semantically wrong:

- `evaluateRuleSkipWhere` treats `where` rules as `ok()` when `skipWhere: true`.
- In an `any` (OR) evaluation, if a `where` branch is skipped (treated as `ok()`), the `any` short-circuits — the other branches (e.g., `rules.entitlement('x')`) are **never evaluated**.
- This would silently grant access to users who don't meet ANY branch.

The invariant: **`extractFromDescriptor` returns `null` for `any`, and `skipWhere` is only `true` when `extractWhereConditions` returns non-null.** This ensures `any` branches containing `where` are always evaluated in-memory.

Add a code comment at `access-enforcer.ts` `extractFromDescriptor`'s `default` case:
```ts
// INVARIANT: Do NOT extract from 'any'. evaluateRuleSkipWhere treats
// skipped where branches as ok(), which would short-circuit OR evaluation
// and silently grant access. 'any' with 'where' must be evaluated in-memory.
```

---

## Unknowns

### U1. Bridge adapter `update` return value when where conditions filter out the row

**Question:** If `db.update(id, data, { where: { createdBy: 'user-1' } })` matches no rows (because the row's `createdBy` is `user-2`), what does the underlying query builder return?

**Resolution:** The bridge adapter calls `delegate.update({ where: { id, ...extraWhere }, data })`. The query builder's `buildUpdate` generates `UPDATE ... WHERE id = $1 AND created_by = $2 RETURNING *`. If no rows match, the `RETURNING` clause returns nothing. The delegate returns `Result.err(WriteError)`. The bridge adapter throws.

The pipeline wraps the defense-in-depth `db.update()` and `db.delete()` calls in try-catch blocks. If the throw fires (TOCTOU race — row ownership changed between `db.get()` and `db.update()`), the pipeline returns `notFound(id)` (404). This is the correct response: from the user's perspective, the row they were allowed to update no longer exists in their access scope.

**Status:** Resolved — no POC needed. The pipeline catches the throw and returns 404.

---

## Type Flow Map

```
rules.where({ createdBy: rules.user.id })
  │
  ▼ (entity definition)
EntityDefinition.access.get: AccessRule (AuthAccessRule | false | function)
  │
  ▼ (extractWhereConditions)
extractWhereConditions('get', def.access, ctx)
  → extractFromDescriptor(rule, ctx)
    → resolves UserMarker to ctx.userId
    → returns Record<string, unknown> | null
  │
  ▼ (crud-pipeline merges with tenant filter)
{ createdBy: 'user-42', tenantId: 'tenant-abc' }
  : Record<string, unknown>
  │
  ▼ (passed to EntityDbAdapter)
db.get(id, { where: Record<string, unknown> })
  : GetOptions.where → ResolveWhere<TEntry>
  │
  ▼ (bridge adapter merges with { id })
delegate.get({ where: { id: 'task-1', createdBy: 'user-42', tenantId: 'tenant-abc' } })
  │
  ▼ (query builder)
SELECT * FROM tasks WHERE id = 'task-1' AND created_by = 'user-42' AND tenant_id = 'tenant-abc'
  │
  ▼ (returns row or null)
TEntry['table']['$response'] | null
```

No dead generics. `ResolveWhere<TEntry>` flows from the adapter interface through to the query builder.

---

## E2E Acceptance Test

```ts
describe('Feature: rules.where() enforced at DB level for all operations', () => {
  // Setup: entity with access rule rules.where({ createdBy: rules.user.id })
  // Two rows: task-1 (createdBy: 'user-A'), task-2 (createdBy: 'user-B')

  describe('Given entity access: { get: rules.where({ createdBy: rules.user.id }) }', () => {
    describe('When user-A calls get(task-1)', () => {
      it('Then returns the row (owner match)', () => {});
    });

    describe('When user-A calls get(task-2)', () => {
      it('Then returns 404 (not 403) — does not reveal existence', () => {});
      it('Then the DB query includes WHERE created_by = user-A (not fetched then filtered)', () => {});
    });
  });

  describe('Given entity access: { update: rules.where({ createdBy: rules.user.id }) }', () => {
    describe('When user-A calls update(task-1, { title: "new" })', () => {
      it('Then updates successfully (owner match)', () => {});
    });

    describe('When user-A calls update(task-2, { title: "new" })', () => {
      it('Then returns 404 (not 403)', () => {});
      it('Then the DB was NOT mutated', () => {});
    });
  });

  describe('Given entity access: { delete: rules.where({ createdBy: rules.user.id }) }', () => {
    describe('When user-A calls delete(task-1)', () => {
      it('Then deletes successfully (owner match)', () => {});
    });

    describe('When user-A calls delete(task-2)', () => {
      it('Then returns 404 (not 403)', () => {});
      it('Then the row still exists in DB', () => {});
    });
  });

  describe('Given entity access: { get: rules.all(rules.authenticated(), rules.where({ status: "published" })) }', () => {
    describe('When authenticated user calls get(draft-task)', () => {
      it('Then returns 404 (where condition pushed to DB)', () => {});
    });

    describe('When unauthenticated user calls get(published-task)', () => {
      it('Then returns 403 (non-where rule still evaluated in-memory)', () => {});
    });
  });

  describe('Given entity access: { get: rules.all(rules.where({ status: "published" }), rules.any(rules.where({ visibility: "public" }), rules.entitlement("content:read"))) }', () => {
    describe('When extracting where conditions', () => {
      it('Then only extracts { status: "published" } from the all-level where', () => {});
      it('Then does NOT extract from the any branch (any returns null)', () => {});
      it('Then the any branch is evaluated in-memory (not skipped)', () => {});
    });
  });

  describe('Given entity with access where rule AND include on get', () => {
    describe('When get(id, { include: { assignee: true } }) is called', () => {
      it('Then db.get receives both include and where options', () => {});
    });
  });

  describe('Given TOCTOU race: row ownership changes between get and update', () => {
    describe('When db.get succeeds but db.update where conditions no longer match', () => {
      it('Then returns 404 (not 500)', () => {});
    });

    describe('When db.get succeeds but db.delete where conditions no longer match', () => {
      it('Then returns 404 (not 500)', () => {});
    });
  });

  // Type-level tests
  describe('Type: EntityDbAdapter.update accepts optional options', () => {
    it('compiles with db.update(id, data)', () => {
      // Existing call site — backward compatible
    });

    it('compiles with db.update(id, data, { where: { status: "active" } })', () => {
      // New call site — where conditions
    });

    // @ts-expect-error — where must match table columns
    it('rejects invalid where columns', () => {
      // db.update(id, data, { where: { nonExistent: true } })
    });
  });

  describe('Type: EntityDbAdapter.delete accepts optional options', () => {
    it('compiles with db.delete(id)', () => {
      // Existing call site — backward compatible
    });

    it('compiles with db.delete(id, { where: { status: "active" } })', () => {
      // New call site — where conditions
    });

    // @ts-expect-error — where must match table columns
    it('rejects invalid where columns', () => {
      // db.delete(id, { where: { nonExistent: true } })
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Extend EntityDbAdapter interface and bridge adapter

**Goal:** The adapter layer accepts and applies additional `where` conditions on `get`, `update`, and `delete`.

**Changes:**
- `packages/db/src/types/adapter.ts` — Add `where` to `GetOptions`, create `UpdateOptions` and `DeleteOptions` types, update `EntityDbAdapter` method signatures
- `packages/db/src/adapters/database-bridge-adapter.ts` — Merge `options.where` into the delegate's `where` clause for `get`, `update`, `delete`

**Acceptance criteria:**
```ts
describe('Given a bridge adapter with where conditions', () => {
  describe('When get(id, { where: { createdBy: "user-1" } }) is called', () => {
    it('Then delegate.get receives where: { id, createdBy: "user-1" }', () => {});
  });

  describe('When get(id) is called without where (backward compat)', () => {
    it('Then delegate.get receives where: { id } only', () => {});
  });

  describe('When update(id, data, { where: { createdBy: "user-1" } }) is called', () => {
    it('Then delegate.update receives where: { id, createdBy: "user-1" }', () => {});
  });

  describe('When update(id, data) is called without options (backward compat)', () => {
    it('Then delegate.update receives where: { id } only', () => {});
  });

  describe('When delete(id, { where: { createdBy: "user-1" } }) is called', () => {
    it('Then delegate.delete receives where: { id, createdBy: "user-1" }', () => {});
  });

  describe('When delete(id) is called without options (backward compat)', () => {
    it('Then delegate.delete receives where: { id } only', () => {});
  });
});
```

### Phase 2: Push where conditions to DB in crud-pipeline for GET/UPDATE/DELETE

**Goal:** The CRUD pipeline extracts `rules.where()` conditions for `get`, `update`, and `delete` operations and passes them to the adapter, matching the existing LIST behavior.

**Changes:**
- `packages/server/src/entity/crud-pipeline.ts` — Update `get()`, `update()`, `delete()` handlers to:
  1. Call `extractWhereConditions()` for their operation
  2. Merge with `withTenantFilter()` and indirect tenant where
  3. Pass merged where to `db.get()` (and `db.update()`/`db.delete()` for defense-in-depth)
  4. Call `enforceAccess()` with `skipWhere: true` when where conditions were extracted
  5. Remove separate `isSameTenant()` and `verifyIndirectTenantOwnership()` post-fetch checks for these operations (pushed to DB)
  6. Wrap `db.update()` and `db.delete()` in try-catch for TOCTOU defense-in-depth (return 404 on race)
- `packages/server/src/entity/crud-pipeline.ts` — Update `withTenantFilter()` JSDoc from "for list queries" to "for DB queries" (it now serves all operations)
- `packages/server/src/entity/access-enforcer.ts` — Add invariant comment at `extractFromDescriptor` `default` case (see Invariants section)
- **Test adapter updates:** Update mock/stub DB in `crud-pipeline.test.ts` to accept optional `options` param on `update` and `delete`. Audit existing tests for 403 assertions on where-rule-denied GET/UPDATE/DELETE that need changing to 404.
- **In-memory test adapters:** If `tenant-isolation.test.ts` uses a custom adapter, extend it to support `where` on `get()`, `update()`, `delete()` so the new code paths are actually exercised.

**Acceptance criteria:**
```ts
describe('Given entity access: { get: rules.where({ createdBy: rules.user.id }) }', () => {
  describe('When get() is called', () => {
    it('Then db.get receives where: { createdBy: userId }', () => {});
    it('Then returns 404 when where conditions filter out the row', () => {});
  });
});

describe('Given entity access: { update: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })) }', () => {
  describe('When update() is called by the owner', () => {
    it('Then db.get receives where: { createdBy: userId }', () => {});
    it('Then db.update receives where: { createdBy: userId } (defense-in-depth)', () => {});
    it('Then update succeeds', () => {});
  });

  describe('When update() is called by a non-owner', () => {
    it('Then returns 404 (not 403)', () => {});
    it('Then db.update is NOT called', () => {});
  });
});

describe('Given entity access: { delete: rules.where({ createdBy: rules.user.id }) }', () => {
  describe('When delete() is called by a non-owner', () => {
    it('Then returns 404', () => {});
    it('Then db.delete is NOT called', () => {});
  });
});

describe('Given tenant-scoped entity with where rule on get', () => {
  describe('When get() is called', () => {
    it('Then db.get receives where with BOTH tenantId AND access where conditions', () => {});
  });
});

describe('Given entity with no where rules on get (e.g., rules.authenticated())', () => {
  describe('When get() is called', () => {
    it('Then db.get receives where with tenant filter only (no access where)', () => {});
    it('Then enforceAccess is called WITHOUT skipWhere', () => {});
  });
});

describe('Given entity with access where rule AND include on get', () => {
  describe('When get(id, { include: { assignee: true } }) is called', () => {
    it('Then db.get receives both include and where in options', () => {});
  });
});

describe('Given TOCTOU race: row ownership changes between get and update', () => {
  describe('When db.get succeeds but db.update throws (simulated race)', () => {
    it('Then returns 404 (not 500)', () => {});
  });

  describe('When db.get succeeds but db.delete throws (simulated race)', () => {
    it('Then returns 404 (not 500)', () => {});
  });
});

describe('Given entity access: { get: rules.all(rules.where({ a: 1 }), rules.any(rules.where({ b: 2 }), rules.entitlement("x"))) }', () => {
  describe('When extracting where conditions', () => {
    it('Then only { a: 1 } is extracted (any branch returns null)', () => {});
    it('Then the any branch is evaluated in-memory with skipWhere', () => {});
  });
});
```

### Phase dependencies

- Phase 1 has no external dependencies
- Phase 2 depends on Phase 1 (uses the new adapter signatures)

---

## Breaking Changes

**None for external consumers.** All changes are additive:
- `EntityDbAdapter.update()` and `delete()` gain an optional third/second parameter
- `GetOptions` gains an optional `where` field
- Existing callers that don't pass these options continue to work identically

**Internal behavior change:** GET/UPDATE/DELETE with `rules.where()` now return 404 instead of 403 when the where condition fails. This is the **correct** behavior per the design doc and eliminates information leakage. Any test that asserts 403 for a where-rule failure on these operations will need to be updated to expect 404.
