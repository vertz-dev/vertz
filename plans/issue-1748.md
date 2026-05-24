# Server-Side Query Cache for `@vertz/db`

**Issue:** #1748
**Status:** Draft
**Date:** 2026-04-04

## Problem

Hot read paths in server-side applications repeatedly query for the same rows. During the rinha-de-backend benchmark challenge, adding an in-memory `Map<code, row>` cache to avoid redundant `SELECT` queries improved throughput from ~1500 rps to ~2450 rps — a **63% improvement**. This pattern is common and should be automated by the framework.

## Proposal

Add an opt-in server-side query cache to `@vertz/db` that:
1. Caches query results keyed by query shape
2. Supports TTL-based expiry
3. Uses LRU eviction for memory bounds
4. Provides explicit invalidation APIs
5. Is transparent to correctness (stale reads are worse than slow reads)

---

## 1. API Surface

### 1.1 `QueryCache` — core cache interface

```typescript
// packages/db/src/cache/query-cache.ts

/**
 * In-memory query cache with TTL expiry and LRU eviction.
 * Thread-safe for multi-isolate use (uses atomic operations).
 */
export class QueryCache {
  constructor(options?: {
    /** Maximum entries before LRU eviction (default: 1000) */
    maxSize?: number;
    /** Default TTL in milliseconds (default: 30_000 = 30s) */
    defaultTtl?: number;
  });

  /** Get cached result for a query key */
  get<T>(key: string): CachedResult<T> | undefined;

  /** Set a cached result with optional custom TTL */
  set<T>(key: string, result: T, options?: { ttl?: number }): void;

  /** Invalidate a single key */
  delete(key: string): void;

  /** Invalidate all keys matching a table prefix (e.g., "urls:") */
  deleteByPrefix(prefix: string): void;

  /** Invalidate by exact query shape (supports wildcards) */
  invalidate(query: QueryPattern): void;

  /** Clear all entries */
  clear(): void;

  /** Get cache statistics */
  stats(): CacheStats;
}

interface CachedResult<T> {
  readonly data: T;
  readonly cachedAt: number;
  readonly expiresAt: number;
}

interface CacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

type QueryPattern = 
  | { table: string; where?: Record<string, unknown> }
  | { table: string; id?: string }
  | { table: string; '*': true }; // wildcard = all rows of table
```

### 1.2 `createDb()` with cache configuration

```typescript
// packages/db/src/index.ts

import { createDb } from '@vertz/db';
import { QueryCache } from '@vertz/db/cache';

const db = createDb({
  url: process.env.DATABASE_URL,
  
  // Cache configuration (opt-in)
  cache: {
    // Enable caching (must be explicit)
    enabled: true,
    
    // Cache instance (share across requests)
    store: new QueryCache({ 
      maxSize: 5000,
      defaultTtl: 60_000, // 60 seconds
    }),
    
    // Per-query overrides
    queries: {
      // Cache findUnique by primary key for 5 minutes
      findUnique: { ttl: 300_000 },
      
      // Don't cache update/delete operations (default: false)
      update: { cache: false },
      delete: { cache: false },
      create: { cache: false },
    },
    
    // Table-level overrides
    tables: {
      urls: {
        // Cache all reads on the urls table for 30 seconds
        defaultTtl: 30_000,
      },
      sessions: {
        // Never cache sessions (security-sensitive)
        cache: false,
      },
    },
  },
});
```

### 1.3 Per-query cache control

```typescript
// Individual queries can override cache behavior

// Explicitly use cache (with custom TTL)
const url = await db.urls.findUnique({
  where: { id },
  cache: { ttl: 60_000 }, // override default
});

// Bypass cache for this query (e.g., admin panel needs fresh data)
const adminUrl = await db.urls.findUnique({
  where: { id },
  cache: false, // explicitly no cache
});

// Cache with table invalidation pattern
const users = await db.users.findMany({
  where: { active: true },
  cache: { 
    ttl: 120_000,
    invalidateOn: ['users'], // invalidate this cache entry when users table is written to
  },
});
```

### 1.4 Cache invalidation API

```typescript
// Manual invalidation (useful after bulk operations)

const cache = db.getCache();

// Invalidate specific row
cache.delete('urls:id=abc123');

// Invalidate all rows for a table
cache.deleteByPrefix('urls:*');

// Invalidate using pattern
cache.invalidate({ table: 'urls', id: 'abc123' });
cache.invalidate({ table: 'urls', '*': true }); // all urls

// Subscribe to write events for automatic invalidation
cache.on('write', (event) => {
  // event: { table: 'urls', operation: 'update' | 'delete', rowIds: ['abc123'] }
  cache.invalidate({ table: event.table, id: event.rowIds[0] });
});
```

### 1.5 Cache-aware query result

```typescript
// Query result includes cache metadata (optional)

const result = await db.urls.findUnique({
  where: { id },
  cache: { includeMetadata: true },
});

result.data;     // The cached/fresh data
result.cached;  // true if served from cache
result.cacheAge; // milliseconds since cache hit
```

### 1.6 Public exports

```typescript
// packages/db/src/cache/index.ts
export { QueryCache } from './query-cache';
export type { CachedResult, CacheStats, QueryPattern, CacheOptions } from './types';
```

```typescript
// packages/db/src/index.ts — additions
export { QueryCache } from './cache';
export type { CacheOptions, CacheQueryOptions, CacheTableOptions } from './cache/types';
```

---

## 2. Manifesto Alignment

### Explicit Over Implicit
- Caching is **opt-in** at the `createDb()` level and per-query level
- No magic: developers must explicitly enable and configure caching
- Cache behavior is visible in the query API (`cache: { ttl: ... }`)

### One Way to Do Things
- Single cache mechanism: `QueryCache` with TTL + LRU
- No separate "hot path" vs "cold path" APIs
- Write operations (`create`, `update`, `delete`) have a single invalidation path

### If It Builds, It Works
- Type-safe cache options with sensible defaults
- Compiler ensures `cache: false` is respected
- No runtime surprises: invalid queries throw, not silently ignore

### LLM-First
- `QueryCache`, `cache: { ttl: 60_000 }` — obvious naming
- Clear semantics: TTL = time-to-live, invalidation = explicit removal
- No special decorators or class inheritance needed

---

## 3. Non-Goals

1. **Client-side caching** — Already handled by `@vertz/ui` EntityStore/MemoryCache
2. **HTTP-level caching** — CDN, Cache-Control headers, etags are a separate layer
3. **Automatic write invalidation** — Scoping writes to invalidate cache entries is O(n) without schema metadata. Manual `cache.invalidate()` is the primary pattern. Automatic invalidation can be explored as a Phase 2 POC.
4. **Distributed cache** — Single-process in-memory cache only. Multi-instance deployments need external cache (Redis) — out of scope for v1.
5. **Query result pagination caching** — Cursor/offset pagination with cache invalidation is complex. Single-row lookups by PK are the primary use case.
6. **Soft deletes handling** — If rows are soft-deleted, the cache may still return stale results. This requires explicit user configuration, not automatic detection.

---

## 4. Unknowns

1. **Automatic invalidation on writes** — The original benchmark used O(n) scan to invalidate on UPDATE/DELETE. With schema metadata (which tables have which PKs), we could do O(1) invalidation. **Resolution needed:** Should Phase 1 include automatic invalidation, or defer to manual pattern?

2. **Integration with prepared statements** — The prepared statement fix (`prepare: true`) was a separate optimization. How does caching interact with prepared statements? **Resolution:** Caching happens after query execution, before result return. Prepared statements are unaffected.

3. **Multi-tenant isolation** — If tenants share a cache but have different row-level permissions, stale data could leak. **Resolution:** Cache key should include tenant context. Need to verify `createDb()` receives tenant context.

4. **Memory pressure in serverless** — In-memory caches grow until process restart. In serverless (Lambda, Cloudflare Workers), memory is bounded. **Resolution:** `maxSize` option with LRU eviction prevents unbounded growth. Default of 1000 entries (~few MB) is conservative.

5. **Cache warming on startup** — Should the cache be pre-populated with "hot" queries? **Resolution:** Out of scope for Phase 1. Manual `cache.set()` can be used for warming.

---

## 5. POC Results

Not applicable — this design doc is the starting point for exploration. A POC should be created to validate:

1. **Key question: Transparent vs explicit integration**
   - Try: Transparent hook into `db.query()` — does it add unexpected latency?
   - Try: Explicit `cache.query()` wrapper — is the ergonomics acceptable?

2. **Key question: Invalidation granularity**
   - Try: O(n) scan invalidation on writes (like the benchmark)
   - Try: O(1) invalidation using table metadata
   - Measure: Invalidation time for 10K cached entries

3. **Key question: API ergonomics**
   - Survey: Would developers prefer `cache: true` shorthand or explicit options?

---

## 6. Type Flow Map

```
createDb({ cache: { enabled: true, store: new QueryCache() } })
        ↓
CacheOptions
        ↓
createDbInternal() passes cache to QueryCacheProvider
        ↓
db.query() reads from QueryCacheProvider
        ↓
QueryCache.get(key) → CachedResult<T> | undefined
        ↓
QueryCache.set(key, result) → stores with TTL metadata
        ↓
Cache invalidation: QueryCache.delete() / deleteByPrefix() / invalidate()
```

### Type generics trace

```typescript
// User-facing: QueryCache<T>
QueryCache<Url>  // T = row type

// Internal: Query key derivation
deriveCacheKey(table: string, query: FindOptions<T>): string
// → "urls:findUnique:where:id=abc123"

// Cached result wrapping
CachedResult<T> = { data: T, cachedAt: number, expiresAt: number }

// Cache options on queries
CacheQueryOptions: { ttl?: number; cache?: boolean | CacheOptions; invalidateOn?: string[] }

// Table-level overrides
CacheTableOptions: { defaultTtl?: number; cache?: boolean }
```

---

## 7. E2E Acceptance Test

From a developer's perspective, using the public `@vertz/db` API:

```typescript
import { createDb, QueryCache } from '@vertz/db';

const cache = new QueryCache({ maxSize: 100, defaultTtl: 60_000 });

const db = createDb({
  url: process.env.DATABASE_URL,
  cache: {
    enabled: true,
    store: cache,
    tables: {
      urls: { defaultTtl: 30_000 },
    },
  },
});

// Seed
const url = await db.urls.create({
  data: { slug: 'test', target: 'https://example.com' },
});

// First call: cache miss, fetches from DB
const result1 = await db.urls.findUnique({ where: { id: url.id } });
expect(result1.slug).toBe('test');

// Second call: cache hit
const result2 = await db.urls.findUnique({ where: { id: url.id } });
expect(result2.slug).toBe('test');

// Verify cache was used
const stats = cache.stats();
expect(stats.hits).toBe(1);
expect(stats.misses).toBe(1);

// Cache hit includes metadata
const result3 = await db.urls.findUnique({ 
  where: { id: url.id },
  cache: { includeMetadata: true },
});
expect(result3.cached).toBe(true);

// Update invalidates the cache entry
await db.urls.update({
  where: { id: url.id },
  data: { slug: 'updated' },
});

// Next read is a fresh fetch
const result4 = await db.urls.findUnique({ where: { id: url.id } });
expect(result4.slug).toBe('updated');

// Manual invalidation
cache.delete(`urls:findUnique:${JSON.stringify({ where: { id: url.id } })}`);

// Per-query cache override
const fresh = await db.urls.findUnique({
  where: { id: url.id },
  cache: false, // bypass cache
});
expect(fresh.slug).toBe('updated');

// Custom TTL
const cached = await db.urls.findUnique({
  where: { id: url.id },
  cache: { ttl: 5_000 }, // 5 seconds
});

// Cache by prefix invalidation
cache.deleteByPrefix('urls:*'); // clear all urls entries

// @ts-expect-error — cache must be boolean or object
await db.urls.findUnique({ where: { id }, cache: 'yes' });

// @ts-expect-error — invalid table name
db.getCache().invalidate({ table: 123 });
```

---

## 8. Implementation Plan

### Phase 1: Core Query Cache (MVP)

**Goal:** Thin vertical slice — in-memory cache with TTL, basic invalidation.

**Scope:**
- `QueryCache` class with `get`/`set`/`delete`/`clear`
- TTL expiry using `setTimeout` (or timestamp check)
- LRU eviction when `maxSize` exceeded
- `createDb()` accepts `cache.enabled` + `cache.store`
- Per-query `cache` option on `findUnique`/`findFirst`/`findMany`
- Cache key derivation from query shape

**Acceptance criteria:**
- [ ] `QueryCache.get()` returns cached result if TTL not expired
- [ ] `QueryCache.set()` stores with TTL metadata
- [ ] LRU eviction removes oldest entry when `maxSize` exceeded
- [ ] `createDb({ cache: { enabled: true, store } })` configures cache
- [ ] `db.urls.findUnique({ where, cache: true })` uses cache
- [ ] Unit tests for `QueryCache` pass
- [ ] Integration test: cache hit/miss scenarios work

**Files:**
| File | Change |
|------|--------|
| `packages/db/src/cache/query-cache.ts` | New — `QueryCache` class |
| `packages/db/src/cache/types.ts` | New — cache type definitions |
| `packages/db/src/cache/index.ts` | New — exports |
| `packages/db/src/client/create-db.ts` | Accept cache config |
| `packages/db/src/query/crud.ts` | Hook cache into find queries |
| `packages/db/src/index.ts` | Re-export cache types |
| `packages/db/src/__tests__/cache.test.ts` | Unit tests |

---

### Phase 2: Invalidation & Statistics

**Goal:** Complete the cache lifecycle — invalidation, stats, table-level config.

**Scope:**
- `deleteByPrefix()` for table-level invalidation
- `invalidate()` with `QueryPattern`
- `stats()` for cache metrics (hits, misses, size, evictions)
- Table-level TTL overrides (`tables.urls.defaultTtl`)
- Query-level cache overrides (`queries.findUnique.ttl`)
- `on('write')` event subscription for automatic invalidation

**Acceptance criteria:**
- [ ] `cache.deleteByPrefix('urls:*')` invalidates all url entries
- [ ] `cache.stats().hits` increments on cache hits
- [ ] `tables.urls.defaultTtl` overrides global TTL for that table
- [ ] `cache.on('write', handler)` fires on mutations
- [ ] Integration test: invalidation clears correct entries

**Files:**
| File | Change |
|------|--------|
| `packages/db/src/cache/query-cache.ts` | Add invalidation methods, stats |
| `packages/db/src/cache/types.ts` | Add `QueryPattern`, event types |
| `packages/db/src/client/create-db.ts` | Parse table/query overrides |
| `packages/db/src/query/crud.ts` | Emit write events |
| `packages/db/src/__tests__/cache-invalidation.test.ts` | Invalidation tests |

---

### Phase 3: Production Hardening

**Goal:** Make cache production-ready with observability and edge cases.

**Scope:**
- Thread-safety (atomic operations for multi-isolate)
- Memory pressure handling (evict on low memory)
- Error handling (cache failures don't break queries)
- Metrics integration (emit to observability)
- Cache warm-up helper
- Documentation in `packages/mint-docs/`

**Acceptance criteria:**
- [ ] Cache operations don't throw on OOM — graceful degradation
- [ ] Metrics exported for hits/misses/evictions
- [ ] Cache survives 10K entries without memory leak
- [ ] Docs updated with cache usage guide

**Files:**
| File | Change |
|------|--------|
| `packages/db/src/cache/query-cache.ts` | Thread-safety, error handling |
| `packages/db/src/cache/metrics.ts` | New — metrics export |
| `packages/mint-docs/` | Cache documentation |
| `packages/db/src/__tests__/cache-stress.test.ts` | Stress tests |

---

## Appendix: Benchmark Reference

From the rinha-de-backend URL shortener challenge:

```typescript
// What worked in the benchmark
const redirectCache = new Map<string, UrlRow>();

// GET /:code — hot path
app.get('/:code', async (req, res) => {
  const cached = redirectCache.get(req.params.code);
  if (cached) return res.redirect(cached.target);
  
  const row = await db.query('SELECT * FROM urls WHERE code = $1', [req.params.code]);
  redirectCache.set(req.params.code, row);
  res.redirect(row.target);
});

// Invalidation on write
app.post('/urls', async (req, res) => {
  await db.query('INSERT INTO urls ...', [...]);
  // Invalidate all entries (O(n) scan — acceptable for small caches)
  for (const key of redirectCache.keys()) {
    redirectCache.delete(key);
  }
});
```

Key learnings:
1. FIFO eviction was sufficient (simple `Map`)
2. Cache invalidation by scanning was O(n) but fast for small maps
3. Write-heavy endpoints don't benefit from caching
4. Single-row lookups by PK were the primary use case
