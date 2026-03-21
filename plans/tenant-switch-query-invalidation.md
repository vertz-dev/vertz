# Auto-Invalidate Tenant-Scoped Queries on Tenant Switch

**Issue:** #1696
**Status:** Design — Rev 3 (all 3 reviewers approved)
**Date:** 2026-03-21

## Problem

When a user switches tenants via `switchTenant()`, cached entity queries still show data from the previous tenant. There's no reactive link between the tenant switch and the query cache. Developers must manually invalidate queries via `onSwitchComplete` callbacks — a pit of failure that violates "if it builds, it works."

## API Surface

### Zero-config for developers

This feature is invisible to developers. No new API to learn, no callbacks to wire. When `switchTenant()` succeeds, tenant-scoped queries auto-invalidate and refetch.

```tsx
// Before: developer must manually invalidate
<TenantProvider
  listTenants={sdk.listTenants}
  switchTenant={sdk.switchTenant}
  onSwitchComplete={() => {
    // Manual invalidation — easy to forget, easy to get wrong
    invalidate(api.tasks.list());
    invalidate(api.projects.list());
    // Oops, forgot api.comments.list()...
  }}
>

// After: just works™ — no onSwitchComplete needed for cache management
<TenantProvider
  listTenants={sdk.listTenants}
  switchTenant={sdk.switchTenant}
>
```

`onSwitchComplete` remains available for **navigation side effects** (e.g., `navigate({ to: '/dashboard' })`), but is no longer needed for cache management.

### What happens under the hood

```
switchTenant('tenant-2') succeeds
  → TenantProvider calls invalidateTenantQueries()
  → Active query registry filters: entityMeta.tenantScoped === true
  → For each match: clearData() resets query to "no data" state (see below)
  → For each match: refetch() triggers fresh fetch with new tenant's JWT
  → Non-tenant-scoped queries (user profile, global settings) untouched
  → onSwitchComplete fires AFTER invalidation (for navigation side effects)
```

**Data isolation during refetch:** Unlike standard SWR invalidation, tenant-switch invalidation **clears cached data before refetching**. During the refetch window, `data === undefined` and `isLoading === true`. The UI shows a loading state — never cross-tenant data. This is an intentional tradeoff: a brief loading flash is preferable to showing Tenant A's data in a Tenant B context.

### EntityQueryMeta extension

```ts
// packages/fetch/src/types.ts
export interface EntityQueryMeta {
  readonly entityType: string;
  readonly kind: 'get' | 'list';
  readonly id?: string;
  readonly tenantScoped?: boolean; // NEW — codegen sets this from entity manifest
}
```

### QueryRegistration extension

```ts
// packages/ui/src/query/invalidate.ts
interface QueryRegistration {
  entityMeta: EntityQueryMeta;
  refetch: () => void;
  clearData?: () => void; // NEW — clears cached data for this specific query
}
```

When `query()` registers with the active query registry, it provides a `clearData` callback. This callback is defined inside the `query()` closure, so it has direct access to the query's internal signals. It performs six operations to fully reset the query to a "no data yet" state:

1. **Set `entityBacked.value = false`** — Disables the entity-store-backed computed path. Without this, `get` queries would still read stale data from the entity store by ID, and `list` queries would read stale IDs from queryIndices.
2. **Set `rawData.value = undefined`** — The computed now returns `undefined` (same as before any fetch).
3. **Set `loading.value = true`** — UI shows loading state during refetch.
4. **Clear the query's cache entry** — Forces cache miss on next fetch.
5. **Clear the queryIndices entry** (list queries) — Removes old tenant's entity ID list.
6. **Clear the query envelope** (list queries) — Removes old pagination metadata.

After `clearData()`, the `data` computed returns `undefined` for both `get` and `list` queries. When `refetch()` resolves with the new tenant's data, `normalizeToEntityStore` sets `entityBacked.value = true` again, and the computed returns fresh data.

**Why `entityBacked = false` is needed for `get` queries:** The `data` computed for `get` queries reads `store.get(entityType, id).value` directly from the entity store. Clearing cache/indices doesn't remove the entity from the store. Without disabling the entity-backed path, the computed returns the old tenant's entity during the refetch window — a cross-tenant data leak. Setting `entityBacked = false` is preferable to removing the entity from the store, because other queries may hold references to the same entity.

**Orphaned entity cleanup:** After `clearData()`, old tenant entities in the store become orphans (no query references them). They are garbage-collected by the existing `evictOrphans()` mechanism.

### New query module export

```ts
// packages/ui/src/query/invalidate.ts
/**
 * Invalidate all active queries targeting tenant-scoped entities.
 * Clears cached data first (no SWR stale window), then refetches.
 *
 * Called automatically by TenantProvider after switchTenant() succeeds.
 * Can also be called manually if needed.
 *
 * No-op during SSR.
 */
export function invalidateTenantQueries(): void;
```

### Codegen change

The entity SDK generator already knows `entity.tenantScoped` from codegen IR. It passes `tenantScoped` in the entity metadata of descriptors:

```ts
// Generated: .vertz/generated/entities/tasks.ts (tenant-scoped entity)
createDescriptor('GET', '/api/tasks', () => client.get<...>('/api/tasks', { query }), resolvedQuery, {
  entityType: 'tasks',
  kind: 'list' as const,
  tenantScoped: true,
});

// Generated: .vertz/generated/entities/system-templates.ts (non-tenant-scoped)
createDescriptor('GET', '/api/system-templates', () => client.get<...>('/api/system-templates', { query }), resolvedQuery, {
  entityType: 'system-templates',
  kind: 'list' as const,
  tenantScoped: false,
});
```

Both `true` and `false` are always emitted (not omitted) for debuggability — inspecting a descriptor always tells you whether it's tenant-scoped.

## Manifesto Alignment

### "If it builds, it works" (Principle #1)
Tenant-scoped queries showing stale data after a tenant switch is a correctness bug that passes compilation. This feature closes that gap — the framework handles invalidation automatically because it has all the information needed.

### "One way to do things" (Principle #2)
Eliminates the pattern of manual `onSwitchComplete` callbacks for cache management. There is now one way to handle tenant switch cache state: don't — the framework does it. `onSwitchComplete` is for navigation, not data.

### "AI agents are first-class users" (Principle #3)
An LLM scaffolding a multi-tenant app no longer needs to remember to wire up cache invalidation on tenant switch. The generated code handles it.

### "Production-ready by default"
Multi-tenant apps need cache invalidation on tenant switch from day one. This isn't a plugin — it's built into the query lifecycle.

### What was rejected
- **Global invalidation (invalidate ALL queries):** Wasteful. User profile queries, global config, etc. don't need refetch. The framework has the metadata to be precise.
- **New event bus channel (`tenant:switched`):** Over-engineering. The active query registry already has `refetch()` handles. A simple function that filters and calls them is sufficient.
- **Watcher/effect on `currentTenantId` signal:** Couples the query system to the tenant context's internal signal. Direct function call from TenantProvider is simpler and more explicit.
- **Remounting the component tree:** The "nuclear option" (React `key` prop pattern) that unmounts everything and starts fresh. It works but kills all UI state (form inputs, scroll positions, dialog stacks). The framework can be precise — invalidate only what's tenant-scoped, preserve everything else.
- **SWR-style stale display during refetch:** Standard invalidation shows stale data while refetching (SWR pattern). For tenant switches, this creates a cross-tenant data leak window. We clear cached data first, show a loading state, then populate fresh data. Brief loading flash > showing wrong tenant's data.

## Non-Goals

- **Clearing ALL entity store entries on switch.** We clear query cache entries (cache + queryIndices + envelopes), not individual entity store entries. Orphaned entity entries from the old tenant are garbage-collected by the existing `evictOrphans()` mechanism. Clearing the entire entity store would affect non-tenant-scoped entities unnecessarily.
- **Invalidating non-entity queries.** Queries without `EntityQueryMeta` (raw URL fetches, custom queries) are not tracked in the registry. If a developer needs to invalidate those, `onSwitchComplete` still works as an escape hatch for non-entity queries.
- **Optimistic tenant switch.** We don't optimistically update query data before the switch completes. The switch must succeed (new JWT issued) before we refetch with the new tenant's credentials.
- **Cross-tab tenant sync.** If a user switches tenant in one tab, other tabs are not affected.

## Unknowns

None identified. This feature extends existing, well-tested patterns:
- `EntityQueryMeta` already carries entity metadata through the entire pipeline
- The active query registry already supports filtering and refetching
- Codegen already knows `tenantScoped` per entity
- `TenantProvider` already has the hook point (`doSwitchTenant` success path)

## POC Results

N/A — no unknowns requiring proof-of-concept. All integration points exist and are verified by existing tests.

## Type Flow Map

```
CodegenIR.entity.tenantScoped (boolean)
  → EntitySdkGenerator: embedded in createDescriptor() call as literal (true/false)
  → EntityQueryMeta.tenantScoped (readonly boolean | undefined)
  → query() reads descriptor._entity.tenantScoped, passes to registerActiveQuery
  → QueryRegistration stores entityMeta + refetch + clearData callbacks
  → invalidateTenantQueries() filters by entityMeta.tenantScoped === true
  → clearData() resets query: entityBacked=false, rawData=undefined, loading=true, cache/indices/envelope cleared
  → refetch() triggers fresh fetch with new JWT
  → fetch resolves → normalizeToEntityStore → entityBacked=true → rawData set → computed returns fresh data
```

No new generics. The `tenantScoped` field is a plain boolean — no type-level flow to verify beyond ensuring the field exists on `EntityQueryMeta`.

## Race Condition Safety

**In-flight fetches from the old tenant:** The `query()` function uses a monotonic `fetchId` counter. Each `refetch()` call increments the counter. When an in-flight fetch from the old tenant resolves, it sees `id !== fetchId` and discards the response. This is the same mechanism that protects against stale responses from mutation-triggered refetches.

**Polling/interval refetches during switchTenant():** If a polling interval triggers between `switchTenantSdk()` returning and `invalidateTenantQueries()` firing, the poll fetch uses the new JWT (already set server-side). The subsequent `invalidateTenantQueries()` refetch bumps fetchId again, discarding the poll result. The final refetch resolves with correct data. This causes one redundant fetch but no data leak.

## Thundering Herd

When `invalidateTenantQueries()` fires with many active tenant-scoped queries (e.g., 30+), all refetches start concurrently. Each becomes an independent HTTP request. For typical apps with 5-15 active queries, this is acceptable. For apps with very high query counts, the browser's connection limit (6 per origin) naturally throttles the burst. We don't add artificial staggering — it would complicate the implementation for an edge case. If this becomes a problem, we can add batching in a follow-up.

## E2E Acceptance Test

```ts
describe('Feature: Auto-invalidate tenant-scoped queries on tenant switch', () => {
  describe('Given active queries for tenant-scoped and non-tenant-scoped entities', () => {
    describe('When switchTenant() succeeds', () => {
      it('Then tenant-scoped queries clearData + refetch', () => {
        const taskRefetch = vi.fn();
        const taskClear = vi.fn();
        const templateRefetch = vi.fn();
        const templateClear = vi.fn();

        registerActiveQuery(
          { entityType: 'tasks', kind: 'list', tenantScoped: true },
          taskRefetch,
          taskClear,
        );
        registerActiveQuery(
          { entityType: 'system-templates', kind: 'list', tenantScoped: false },
          templateRefetch,
          templateClear,
        );

        invalidateTenantQueries();

        expect(taskClear).toHaveBeenCalledOnce();
        expect(taskRefetch).toHaveBeenCalledOnce();
        expect(templateClear).not.toHaveBeenCalled();
        expect(templateRefetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given no active tenant-scoped queries', () => {
    describe('When invalidateTenantQueries() is called', () => {
      it('Then no queries are affected', () => {
        const globalRefetch = vi.fn();
        registerActiveQuery(
          { entityType: 'settings', kind: 'get', id: 'global' },
          globalRefetch,
        );

        invalidateTenantQueries();

        expect(globalRefetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given a TenantProvider with active entity queries', () => {
    describe('When switchTenant() succeeds', () => {
      it('Then invalidateTenantQueries fires before onSwitchComplete', () => {
        const order: string[] = [];
        const taskRefetch = vi.fn(() => order.push('refetch'));

        registerActiveQuery(
          { entityType: 'tasks', kind: 'list', tenantScoped: true },
          taskRefetch,
        );

        // TenantProvider.doSwitchTenant:
        // 1. switchTenantSdk succeeds
        // 2. invalidateTenantQueries() — triggers refetch
        // 3. onSwitchComplete — fires after

        // Verify ordering: refetch happens, then callback
        // (tested via mock TenantProvider in phase 3)
      });
    });

    describe('When switchTenant() fails', () => {
      it('Then no queries are invalidated', () => {
        const taskRefetch = vi.fn();
        registerActiveQuery(
          { entityType: 'tasks', kind: 'list', tenantScoped: true },
          taskRefetch,
        );

        // switchTenantSdk returns { ok: false, error }
        // doSwitchTenant returns error result
        // invalidateTenantQueries() is NOT called

        expect(taskRefetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given SSR context', () => {
    describe('When invalidateTenantQueries() is called', () => {
      it('Then it is a no-op', () => {
        // SSR guard: isSSR() === true → early return
      });
    });
  });

  // Type-level: EntityQueryMeta accepts tenantScoped as boolean
  // @ts-expect-error — tenantScoped must be boolean, not string
  const _badMeta: EntityQueryMeta = { entityType: 'x', kind: 'list', tenantScoped: 'yes' };
});
```

---

## Implementation Plan

### Phase 1: EntityQueryMeta + invalidateTenantQueries() + codegen

**Goal:** Add `tenantScoped` to `EntityQueryMeta`, implement `invalidateTenantQueries()` with `clearData` support, and update codegen to emit `tenantScoped` in descriptors. This is the minimal vertical slice — metadata flows end-to-end from codegen to invalidation.

**Changes:**
- `packages/fetch/src/types.ts` — Add `tenantScoped?: boolean` to `EntityQueryMeta`
- `packages/ui/src/query/invalidate.ts` — Extend `QueryRegistration` with `clearData`, add `invalidateTenantQueries()`, update `registerActiveQuery` signature
- `packages/ui/src/query/query.ts` — Pass `clearData` callback when calling `registerActiveQuery`
- `packages/ui/src/index.ts` — Export `invalidateTenantQueries`
- `packages/codegen/src/generators/entity-sdk-generator.ts` — Emit `tenantScoped: true/false` in entity metadata for all list/get descriptors

**Acceptance Criteria:**
```ts
describe('Feature: invalidateTenantQueries + codegen', () => {
  // --- invalidateTenantQueries ---

  describe('Given registered queries with mixed tenantScoped flags', () => {
    describe('When invalidateTenantQueries() is called', () => {
      it('Then only queries with tenantScoped=true call clearData + refetch', () => {});
      it('Then queries without tenantScoped are not affected', () => {});
    });
  });

  describe('Given registered queries where none are tenantScoped', () => {
    describe('When invalidateTenantQueries() is called', () => {
      it('Then no queries are refetched', () => {});
    });
  });

  describe('Given both get and list tenant-scoped queries', () => {
    describe('When invalidateTenantQueries() is called', () => {
      it('Then both get and list queries call clearData + refetch', () => {});
    });
  });

  describe('Given SSR context (isSSR() returns true)', () => {
    describe('When invalidateTenantQueries() is called', () => {
      it('Then it returns immediately without affecting any queries', () => {});
    });
  });

  describe('Given a query registered without clearData callback', () => {
    describe('When invalidateTenantQueries() is called', () => {
      it('Then refetch is still called (clearData is optional)', () => {});
    });
  });

  // --- Codegen ---

  describe('Given a tenant-scoped entity in the codegen IR', () => {
    describe('When the entity SDK is generated', () => {
      it('Then list/get descriptors include tenantScoped: true', () => {});
    });
  });

  describe('Given a non-tenant-scoped entity in the codegen IR', () => {
    describe('When the entity SDK is generated', () => {
      it('Then list/get descriptors include tenantScoped: false', () => {});
    });
  });

  describe('Given a mutation descriptor (create/update/delete)', () => {
    describe('When the entity SDK is generated', () => {
      it('Then mutation descriptors do NOT include tenantScoped (only queries)', () => {});
    });
  });
});
```

### Phase 2: TenantProvider integration

**Goal:** `TenantProvider.doSwitchTenant()` calls `invalidateTenantQueries()` after a successful switch, before `onSwitchComplete`.

**Depends on:** Phase 1

**Changes:**
- `packages/ui/src/auth/tenant-context.ts` — Import and call `invalidateTenantQueries()` in `doSwitchTenant` success path, between signal updates and `onSwitchComplete`

**Acceptance Criteria:**
```ts
describe('Feature: TenantProvider auto-invalidation', () => {
  describe('Given a TenantProvider with active tenant-scoped queries', () => {
    describe('When switchTenant() succeeds', () => {
      it('Then tenant-scoped queries are refetched', () => {});
      it('Then non-tenant-scoped queries are NOT refetched', () => {});
      it('Then invalidation fires BEFORE onSwitchComplete callback', () => {});
    });
  });

  describe('Given a TenantProvider when switchTenant() fails', () => {
    describe('When the switch returns an error result', () => {
      it('Then no queries are invalidated', () => {});
    });
  });
});
```

### Phase 3: Documentation + changeset

**Goal:** Update docs and add changeset.

**Depends on:** Phase 2

**Changes:**
- `packages/docs/` — Document auto-invalidation behavior in multi-tenant guide. Note that `onSwitchComplete` is no longer needed for cache management (only for navigation side effects). Update any examples that used `onSwitchComplete` for invalidation.
- `.changeset/` — Patch changesets for `@vertz/fetch`, `@vertz/ui`, `@vertz/codegen`

---

## Review Findings Addressed (Rev 2 + Rev 3)

| Finding | Source | Resolution |
|---------|--------|------------|
| Entity store data leakage during SWR window | All 3 reviewers (Blocker) | Rev 2: Added `clearData` callback. Rev 3: Expanded `clearData` to 6 operations including `entityBacked=false`, `rawData=undefined`, `loading=true`. This fully prevents cross-tenant leaks for both `get` and `list` queries. |
| `invalidateTenantQueries()` naming | DX reviewer (Should-fix) | Kept as-is. It's clear, specific, and discoverable. The existing `invalidate(descriptor)` targets a specific query; `invalidateTenantQueries()` targets a category. Different use cases, both discoverable under "invalidate" search. |
| Ordering: invalidation vs onSwitchComplete | DX reviewer (Should-fix) | Documented: `invalidateTenantQueries()` fires before `onSwitchComplete`. |
| In-flight query race condition | DX + Tech reviewers (Should-fix) | Added "Race Condition Safety" section documenting that `fetchId` monotonic counter handles this. |
| SSR safety | Tech reviewer (Should-fix) | Added `isSSR()` early-return guard in `invalidateTenantQueries()`. |
| Thundering herd for many queries | Tech reviewer (Should-fix) | Added "Thundering Herd" section. Acceptable for typical apps; browser connection limits throttle naturally. |
| Phase ordering (vertical slices) | Product reviewer (Should-fix) | Collapsed Phases 1+2 into single Phase 1 (metadata + invalidation + codegen). |
| Always emit tenantScoped | Tech reviewer (Nit) | Codegen now emits `tenantScoped: false` explicitly for non-tenant-scoped entities (debuggability). |
| Remount component tree as rejected | Product reviewer (Nit) | Added to "What was rejected" in Manifesto Alignment. |
| onSwitchComplete deprecation for cache | Product reviewer (Should-fix) | Clarified in API Surface and Phase 3 docs scope. |
| JWT ordering guarantee | Product reviewer (Should-fix) | Covered in Race Condition Safety section — switchTenantSdk() must succeed (new JWT issued) before invalidation fires. |
