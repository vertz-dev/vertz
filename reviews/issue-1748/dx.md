# DX Review: Server-Side Query Cache for `@vertz/db`

**Verdict: CONDITIONAL APPROVAL — Needs significant API adjustments before implementation**

## Summary

The design doc is thoughtful about transparency and explicitness, but the proposed API has several inconsistencies with the current `@vertz/db` API that will confuse developers. Key issues: stale method names, Result type incompatibility, and complex nested config that's hard to discover.

---

## Issues

### 🔴 BLOCKER: Stale API Names in Design Doc

The design doc uses `findUnique`/`findMany`/`findFirst` throughout, but the actual `@vertz/db` API uses:
- `get` / `getOrThrow` (was `findOne`/`findOneOrThrow`, now deprecated)
- `list` / `listAndCount` (was `findMany`/`findManyAndCount`, now deprecated)

**Impact**: A developer reading this doc will try `db.urls.findUnique({ where: { id } })` and get a TypeScript error. This creates immediate friction.

**Fix**: Update all examples in the design doc to use `get`, `list`, `create`, `update`, `delete`.

---

### 🔴 BLOCKER: Result Type Incompatibility

The current `@vertz/db` API returns `Promise<Result<T, ReadError>>`:

```typescript
// Current API (database.ts)
get<TOptions>(options?: TOptions): Promise<Result<FindResult<...>, ReadError>>

// Design doc proposes:
result.cached;  // true if served from cache
result.cacheAge; // milliseconds since cache hit
```

**Problem**: The `Result` type is a discriminated union `{ ok: true, value: T } | { ok: false, error: E }`. Adding cache metadata to the success path (`result.cached`) requires either:
1. Changing `T` to include cache metadata (breaking change)
2. Wrapping in a new type that adds cache metadata alongside Result (ugly)

**Example of proposed broken API**:
```typescript
// What the design doc shows:
const result = await db.urls.findUnique({ where: { id }, cache: { includeMetadata: true } });
result.cached; // This doesn't fit with Result<T, ReadError>
result.data;   // How to get data from Result<T, ReadError>?
```

**Fix**: Define a `CachedResult<T>` that properly composes with `Result`:
```typescript
type CachedResult<T, E> = 
  | { ok: true; value: T; cached: boolean; cacheAge?: number }
  | { ok: false; error: E };
```

Or keep it simple and return cache metadata separately:
```typescript
const [result, stats] = await db.urls.findUnique({ where: { id }, cache: true });
// result is the data
// stats.cached indicates cache hit
```

---

### 🔴 BLOCKER: Cache Key Format is Opaque

The design doc mentions:
```
deriveCacheKey(table: string, query: FindOptions<T>): string
// → "urls:findUnique:where:id=abc123"
```

But there's no public API to inspect cache keys. Developers using `deleteByPrefix('urls:*')` or `cache.delete('urls:id=abc123')` must guess the format.

**Impact**: Debugging cache misses is painful. Developers will resort to console.log debugging.

**Fix**: Expose a method to derive cache keys:
```typescript
// In QueryCache
deriveKey<T>(table: string, operation: string, options: object): string

// Or better: make invalidation use the same query options
cache.invalidate('urls', 'get', { where: { id: 'abc123' } });
cache.invalidateByTable('urls'); // clear all 'urls' entries
```

---

### 🟡 SHOULD-FIX: Complex Nested Configuration

The `createDb` cache config has 3 levels of nesting:

```typescript
createDb({
  cache: {
    enabled: true,
    store: new QueryCache(),
    queries: {           // Level 1: operation-level overrides
      findUnique: { ttl: 300_000 },
      update: { cache: false },
    },
    tables: {             // Level 2: table-level overrides
      urls: {
        defaultTtl: 30_000,
      },
      sessions: {
        cache: false,
      },
    },
  },
});
```

**Problems**:
1. `queries.findUnique` doesn't match current API (`get`, not `findUnique`)
2. "Operation-level" vs "table-level" distinction is confusing
3. No way to see what the effective cache config is for a given query

**Fix**: Flatten the config or use a more intuitive pattern:
```typescript
cache: {
  enabled: true,
  store: new QueryCache(),
  defaults: {
    ttl: 60_000,
    cacheReadOperations: true,
  },
  tables: {
    urls: {
      ttl: 30_000,
      skipCache: false,
    },
    sessions: {
      skipCache: true, // security-sensitive
    },
  },
}
```

---

### 🟡 SHOULD-FIX: No `db.getCache()` Method Documented in Usage Examples

The design doc shows `const cache = db.getCache();` but this method isn't in the `DatabaseClient` type definition. Is this adding a new method to `DatabaseClient`?

**Fix**: Explicitly define this in the API surface section:
```typescript
// New method on DatabaseClient
interface DatabaseClient<TModels> {
  // ...existing methods...
  getCache(): QueryCache;
}
```

---

### 🟡 SHOULD-FIX: `QueryPattern` Type is Confusing

```typescript
type QueryPattern = 
  | { table: string; where?: Record<string, unknown> }
  | { table: string; id?: string }
  | { table: string; '*': true }; // wildcard = all rows of table
```

**Problems**:
1. The `id` variant overlaps semantically with `where: { id: string }`
2. Using `'*': true` as a sentinel is unconventional
3. `invalidate` with different patterns has inconsistent behavior

**Fix**: Make invalidation simpler:
```typescript
// Just invalidate by table
cache.invalidateByTable('urls');

// Or invalidate specific rows using the same query options
cache.invalidate('urls', { where: { id: 'abc123' } });
cache.invalidateAll(); // clear everything
```

---

### 🟡 SHOULD-FIX: Event Subscription API is Under-specified

```typescript
cache.on('write', (event) => {
  cache.invalidate({ table: event.table, id: event.rowIds[0] });
});
```

**Problems**:
1. What events are available? (`'write'` only?)
2. When does the event fire — before or after the write?
3. How do you unsubscribe?
4. How does this interact with transactions?

**Fix**: Define the full event API:
```typescript
// Event types
type CacheEvent = 
  | { type: 'write'; table: string; operation: 'create' | 'update' | 'delete'; rowIds: string[] }
  | { type: 'evict'; table: string; reason: 'ttl' | 'lru' | 'manual' };

// Subscription returns unsubscribe function
const unsubscribe = cache.on('write', handler);
unsubscribe(); // clean up

// Or with cleanup on db close
const cache = db.getCache();
cache.on('write', handler, { autoCleanup: true });
```

---

### 🟡 SHOULD-FIX: `cache: false` Bypass Has Wrong Mental Model

```typescript
// Bypass cache for this query (e.g., admin panel needs fresh data)
const adminUrl = await db.urls.findUnique({
  where: { id },
  cache: false, // explicitly no cache
});
```

**Problem**: The comment suggests this is for "admin panel needs fresh data", but if the cache has TTL=60s and the row was just updated, a cache hit is correct data. The admin panel should use `cache: false` only if it needs to bypass caching entirely (e.g., very sensitive data that should never be cached at all).

**Fix**: Clarify the semantics or add a more explicit option:
```typescript
// Option 1: Clearer semantics
cache: { enabled: false }  // Don't cache this specific query

// Option 2: Add "stale" awareness
cache: { ttl: 0 }  // Zero TTL = don't use cache

// Option 3: Separate concerns
cache: true,           // Use caching
cachePolicy: 'strict'  // Never serve stale data
```

---

### 🟡 SHOULD-FIX: Missing `includeMetadata` in `TypedGetOptions`

The design doc shows `cache: { includeMetadata: true }` as an option, but this needs to be added to the `TypedGetOptions` type definition:

```typescript
type TypedGetOptions<TEntry> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  // ...existing options...
  
  // Need to add:
  readonly cache?: boolean | CacheQueryOptions;
};
```

---

### 🟢 NIT: Missing Examples for Common Patterns

The design doc lacks examples for:
1. **Cache warming on startup** — mentioned in Non-Goals but should show workaround
2. **Testing with mocked cache** — how to test cache behavior?
3. **Monitoring cache health** — what to log/monitor in production?

**Fix**: Add a "Real-world Patterns" section with these examples.

---

## What Works Well ✅

1. **Opt-in by default**: `enabled: true` requirement is good — no surprise caching
2. **QueryCache as first-class export**: `import { QueryCache } from '@vertz/db'` is intuitive
3. **TTL + LRU combo**: Addresses real performance concerns from the benchmark
4. **Explicit invalidation**: `cache.invalidate()` is clear and controllable
5. **Manifesto alignment**: The design doc explicitly maps to framework principles

---

## Recommendations

1. **Before Phase 1**: Fix API naming to match current `@vertz/db` methods (`get`/`list`, not `findUnique`/`findMany`)
2. **Before Phase 1**: Define how `CachedResult` composes with `Result<T, E>` without breaking changes
3. **Phase 1 scope reduction**: Start with `QueryCache` + `get`/`list` + basic TTL + manual invalidation. Defer `invalidateOn`, events, and table-level overrides.
4. **Add public key derivation**: Developers need to know what keys are in the cache
5. **Write integration tests first**: The E2E test in the doc is good — keep it as the source of truth for API behavior

---

## DX Score: 6/10

The concept is solid and the performance motivation is clear. But the API needs significant refinement to match the existing `@vertz/db` patterns before implementation.
