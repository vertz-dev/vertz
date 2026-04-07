# Technical Review: Server-Side Query Cache for `@vertz/db`

## Summary Verdict

**BUILDABLE with significant work.** The core ideas (LRU + TTL cache, opt-in API, per-query overrides) are sound and achievable. However, there are critical API mismatches, type flow gaps, and hidden complexity that must be resolved before implementation.

---

## Critical Issues (Blockers)

### 1. API Name Mismatch — `findUnique`/`findMany` vs `get`/`list`

The design doc uses the old API names (`findUnique`, `findMany`) throughout, but the current codebase has been migrated to `get`, `getOrThrow`, `list`, `listAndCount`.

**Evidence:** `packages/db/src/query/crud.ts` defines:
- `get()` — single row or null
- `getOrThrow()` — single row or NotFoundError
- `list()` — multiple rows
- `listAndCount()` — multiple rows with total count

The `ModelDelegate` interface in `database.ts` exposes these methods, not `findUnique`/`findMany`.

**Impact:** The entire design doc examples are written against the wrong API. The implementation plan files also reference the wrong method names.

**Required action:** Update all design doc examples and implementation plan files to use `get`/`getOrThrow`/`list`/`listAndCount`, OR add backward-compatible aliases if the old names are intended to be supported.

---

### 2. `CreateDbOptions` Has No `cache` Field

The design doc specifies:

```typescript
const db = createDb({
  url: process.env.DATABASE_URL,
  cache: {
    enabled: true,
    store: new QueryCache({ ... }),
  },
});
```

But the current `CreateDbOptions` interface in `database.ts` does not include a `cache` field:

```typescript
interface CreateDbBaseOptions<TModels extends Record<string, ModelEntry>> {
  readonly models: TModels;
  readonly casing?: 'snake_case' | 'camelCase';
  readonly casingOverrides?: Record<string, string>;
  readonly log?: (message: string) => void;
  readonly _queryFn?: QueryFn;
  // ... no cache field
}
```

**Impact:** This is a core API addition that must be designed carefully:
- Does it live in `CreateDbBaseOptions` or only in PostgreSQL variant?
- Should SQLite/D1 users be able to use it?
- How does it interact with `_queryFn` (testing escape hatch)?

**Required action:** Extend `CreateDbOptions` to include `cache?: CacheConfig`, define the `CacheConfig` interface, and ensure it works across all dialect variants.

---

### 3. Per-Query Cache Options — Type Integration

The design doc shows:

```typescript
const url = await db.urls.findUnique({
  where: { id },
  cache: { ttl: 60_000 },
});

const adminUrl = await db.urls.findUnique({
  where: { id },
  cache: false,
});
```

But `TypedGetOptions` in `database.ts` is:

```typescript
type TypedGetOptions<TEntry extends ModelEntry, TModels> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  readonly orderBy?: OrderByType<EntryColumns<TEntry>>;
  readonly include?: IncludeOption<...>;
  // ... no cache field
}
```

**Impact:** Adding `cache` to every query option type requires modifying multiple type definitions and propagating the cache option through `buildDelegates()` to the underlying CRUD functions.

**Required action:** Define `CacheQueryOptions` type, extend all `Typed*Options` types to accept `cache?: CacheQueryOptions | boolean`, and update `buildDelegates()` implementation.

---

## Should-Fix Issues

### 4. Cache Key Derivation — Object Key Ordering

The design doc shows cache keys like:

```
"urls:findUnique:where:id=abc123"
"urls:findMany:where:active=true:select:..."
```

**Hidden complexity:** `JSON.stringify` produces different strings for the same data if key order differs:

```typescript
JSON.stringify({ a: 1, b: 2 }) !== JSON.stringify({ b: 2, a: 1 })
// But these represent the same query!
```

**Impact:** 
- Developer error: same query produces different cache results due to accidental key reordering
- `include` parameter adds complexity — should `{ posts: true }` and `{ posts: { where: {} } }` share the same cache entry?

**Required action:** 
- Document the requirement for consistent key ordering in cache keys
- Consider a hash-based approach (stable serialization)
- Define behavior for `include` parameter in cache keys

---

### 5. TTL Implementation — Timer vs Lazy Expiry

The design doc mentions:

> TTL expiry using `setTimeout` (or timestamp check)

**Hidden complexity:**
- `setTimeout` timers prevent Node.js process from exiting cleanly
- `setTimeout` timers are not freed when entries are manually deleted
- Timer drift: `setTimeout` is not precise for long durations

**Recommendation:** Use **lazy expiry with timestamp check**:

```typescript
get(key: string): CachedResult<T> | undefined {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry;
  }
  // Entry expired — delete and return undefined
  cache.delete(key);
  return undefined;
}
```

Add optional background cleanup for memory hygiene (remove expired entries on `set()` when size is high), but don't rely on timers for correctness.

---

### 6. LRU Implementation — Not Built-in to Map

The design doc requires LRU eviction when `maxSize` exceeded. JavaScript `Map` maintains insertion order, not access order.

**Hidden complexity:**
- Simple `Map` eviction is FIFO (first-in-first-out), not LRU (least-recently-used)
- True LRU requires double-linked list + hash map
- Implementations like `lru-cache` package handle this correctly

**Recommendation:** Either:
1. Use an existing LRU library (e.g., `lru-cache` npm package)
2. Implement custom linked-list-based LRU (higher effort, more control)

**Required action:** Choose implementation strategy before Phase 1.

---

### 7. `include` Relations — Caching Complexity

The current API supports eager loading of relations:

```typescript
db.users.get({ where: { id }, include: { posts: true, comments: true } })
```

**Hidden complexity:**
- Should relations be included in the cache key? (`include` changes shape)
- Should related rows be cached separately?
- If table A is updated, should cached entries for table B that included A be invalidated?

**The design doc is silent on this.**

**Required action:** Define behavior for `include` parameter:
- Option A: Include `include` specifier in cache key
- Option B: Don't cache queries with `include` (safer, simpler)
- Document the chosen approach

---

### 8. Multi-Tenant Isolation Not Resolved

The design doc lists as "Unknown #3":

> Cache key should include tenant context. Need to verify `createDb()` receives tenant context.

**Current state:** `createDb()` does NOT receive tenant context at runtime. Tenant scoping is defined at **model definition time** via `.tenant()` on table definitions, not at query time.

**Impact:** If different tenants query the same table, they share cache entries, potentially leaking data.

**Example of current behavior:**
```typescript
// Model defined with tenant scoping
d.table('posts', {
  id: d.text(),
  title: d.text(),
}).tenant('tenantId'); // All queries scoped to current tenant

// But cache key doesn't include tenant!
cacheKey = "posts:where:id=123" // No tenant context
```

**Required action:** Define how tenant context is passed to the cache. Options:
1. Thread tenant ID through `request-scope.ts` session vars
2. Require tenants to have separate `createDb()` instances with separate caches
3. Include tenant in cache key derivation (requires integration with request scope)

---

## Nit Issues

### 9. Type Name Conflict — `CachedResult` vs `QueryResult`

The design doc defines `CachedResult<T>`:

```typescript
interface CachedResult<T> {
  readonly data: T;
  readonly cachedAt: number;
  readonly expiresAt: number;
}
```

But the codebase already has `QueryResult<T>` in `database.ts`:

```typescript
interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}
```

**Recommendation:** Rename to avoid confusion:
- `CachedResult<T>` → `CacheEntry<T>`
- Or use a different name altogether

---

### 10. `includeMetadata` Return Type

The design doc shows:

```typescript
result.data;     // The cached/fresh data
result.cached;    // true if served from cache
result.cacheAge;  // milliseconds since cache hit
```

But the current return types (`Result<T, E>`) always unwrap the value. Adding metadata would require changing the return shape or adding a wrapper type.

**Recommendation:** Consider returning a `CacheResult<T>` wrapper when `includeMetadata: true`:
```typescript
interface CacheResult<T> {
  readonly data: T;
  readonly cached: boolean;
  readonly cacheAge: number;
}
```

---

## Architecture Observations

### 11. `buildDelegates()` Is the Integration Point

The current architecture creates model delegates dynamically in `buildDelegates()`:

```typescript
function buildDelegates<TModels>(
  qfn: QueryFn,
  models: TModels,
  dialectObj: Dialect,
  modelsRegistry: Record<string, TableRegistryEntry>,
): Record<string, ModelDelegate<ModelEntry>>
```

**Implication:** To inject cache, you would need to:
1. Pass `QueryCache` instance to `buildDelegates()`
2. Modify each `impl*` function to check cache before calling CRUD
3. Handle cache invalidation after write operations

This is cleaner than hooking into the lower-level `queryFn`, but requires careful handling of the `AnyResult` type (currently `any`).

---

### 12. `QueryFn` Is the Low-Level Hook

`QueryFn` is the primitive query function:

```typescript
type QueryFn = <T>(sqlStr: string, params: readonly unknown[]) => Promise<{
  rows: readonly T[];
  rowCount: number;
}>;
```

The design doc says:

> Caching happens after query execution, before result return. Prepared statements are unaffected.

**This suggests:**
- Cache should be at the `ModelDelegate` level (above `QueryFn`)
- NOT at the `QueryFn` level (which operates on raw SQL)
- Reason: cache key must derive from query shape (typed), not raw SQL

This is the correct architectural choice given the typed API.

---

## Recommendations

### Must Fix Before Phase 1

1. **Update API names:** Replace all `findUnique`/`findMany` with `get`/`list` in the design doc
2. **Extend `CreateDbOptions`:** Add `cache?: CacheConfig` to the options interface
3. **Extend query option types:** Add `cache` field to `TypedGetOptions`, `TypedListOptions`, etc.
4. **Resolve tenant isolation:** Define how tenant context flows to cache

### Should Fix Before Phase 1

5. **Document cache key derivation:** Clarify object key ordering requirements
6. **Choose LRU strategy:** Library vs custom implementation
7. **Define `include` behavior:** Document whether cached queries can include relations

### Consider

8. **Rename `CachedResult`:** Avoid collision with existing `QueryResult`
9. **Decide on `includeMetadata`:** Optional return shape vs always included

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| API mismatch causes rework | High | Medium | Update design doc before implementation |
| Tenant data leakage | Medium | High | Define tenant integration upfront |
| Cache key instability | Medium | Medium | Use stable serialization |
| Timer prevents graceful shutdown | Low | Low | Use lazy expiry (timestamp check) |
| LRU implementation bugs | Medium | Medium | Use well-tested library |

---

## Conclusion

The design is **architecturally sound** but requires significant clarification before implementation:
- Core API mismatches (method names) must be resolved
- Type integration points must be designed
- Multi-tenant isolation is a critical undecided issue
- Several hidden complexities (LRU, cache key derivation, `include` handling) need explicit decisions

**Recommended next step:** Create a detailed type flow diagram showing how `cache` flows from `createDb()` through `buildDelegates()` to individual query methods, using the **current API names** (`get`/`list` not `findUnique`/`findMany`).