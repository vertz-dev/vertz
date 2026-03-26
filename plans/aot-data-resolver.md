# Design: `aotDataResolver` for Non-Entity Data Sources

**Issue:** [#1890](https://github.com/vertz-dev/vertz/issues/1890)
**Status:** Draft
**Package:** `@vertz/ui-server`

## Problem

`ssrRenderAot()` only populates the AOT query cache through the entity-based prefetch pipeline (`module.api` + `manifest.routeEntries`). Apps using custom data layers (JSON files, third-party APIs, custom DB clients) cannot use AOT rendering — it silently falls back to single-pass runtime SSR.

The AOT render functions themselves are data-agnostic — they call `ctx.getData("key")` which is a Map lookup. The gap is that there's no user-facing way to populate that Map from outside the entity pipeline.

## API Surface

### Type Definition

```typescript
/**
 * Resolves custom data for AOT-rendered routes.
 *
 * Called after the entity prefetch pipeline, before the `allKeysResolved` bail check.
 * Only called when there are unresolved query keys remaining.
 *
 * @param pattern - Matched route pattern (e.g., '/products/:id')
 * @param params - Route params (e.g., { id: 'abc-123' })
 * @param unresolvedKeys - Query keys not yet populated by entity prefetch
 * @returns Map of cache key → data, or empty Map to skip
 */
export type AotDataResolver = (
  pattern: string,
  params: Record<string, string>,
  unresolvedKeys: string[],
) => Promise<Map<string, unknown>> | Map<string, unknown>;
```

### On `SSRRenderAotOptions`

```typescript
export interface SSRRenderAotOptions {
  aotManifest: AotManifest;
  manifest?: SSRPrefetchManifest;
  ssrTimeout?: number;
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
  ssrAuth?: SSRAuth;
  prefetchSession?: PrefetchSession;
  diagnostics?: AotDiagnostics;
  /** Custom data resolver for non-entity AOT routes. */
  aotDataResolver?: AotDataResolver;  // ← new
}
```

### On `SSRHandlerOptions`

```typescript
export interface SSRHandlerOptions {
  // ... existing options ...
  aotManifest?: AotManifest;
  /** Custom data resolver for non-entity AOT routes. */
  aotDataResolver?: AotDataResolver;  // ← new
}
```

### Usage

```typescript
createSSRHandler({
  module: ssrModule,
  template,
  aotManifest,
  aotDataResolver: async (pattern, params, unresolvedKeys) => {
    const data = new Map<string, unknown>();
    if (pattern === '/') {
      if (unresolvedKeys.includes('home-games'))
        data.set('home-games', await db.getGames());
      if (unresolvedKeys.includes('home-trending'))
        data.set('home-trending', await db.getTrendingCards(8));
    }
    if (pattern === '/products/:id') {
      if (unresolvedKeys.includes('product-get'))
        data.set('product-get', await db.getProduct(params.id));
    }
    return data;
  },
});
```

## Priority Order

1. **Entity prefetch** (automatic, zero-config for Vertz entities)
2. **`aotDataResolver` callback** (custom data sources — only called with unresolved keys)
3. **Single-pass fallback** (existing behavior when neither provides all keys)

Entity prefetch runs first so it can populate some keys, then `aotDataResolver` fills remaining gaps. The two approaches compose: a route can have both entity queries and custom data.

## Manifesto Alignment

- **Principle 3 (AI agents are first-class users):** Simple callback API — one function, three arguments, return a Map. LLMs can generate this on first prompt.
- **Principle 7 (Performance is not optional):** Enables AOT (0.37-0.80ms) for non-entity routes that currently fall back to single-pass (1.04-2.16ms). Direct performance win for edge deployments.
- **Principle 2 (One way to do things):** Not introducing an alternative to entity prefetch. This is the escape hatch for apps that don't use entities, not a second way to fetch entity data.

## Non-Goals

- **Replacing the entity prefetch pipeline.** Entity apps continue to use the automatic pipeline. `aotDataResolver` is for custom data layers only.
- **Per-key granularity.** The resolver receives all unresolved keys at once and returns a Map. No per-key callback pattern — that would complicate the API without benefit.
- **Caching or memoization.** The resolver is called per-request. Caching is the user's responsibility (e.g., cache headers, KV stores).
- **Error recovery.** If the resolver throws, fallback to single-pass. No retry logic.

## Unknowns

None identified. The insertion point is clear (after entity prefetch, before the bail check), the API is a single callback, and the existing test infrastructure covers the pipeline.

## Type Flow Map

```
AotDataResolver (user-defined function)
  → SSRHandlerOptions.aotDataResolver (handler config)
    → SSRRenderAotOptions.aotDataResolver (render options)
      → ssrRenderAot() invokes with (pattern, params, unresolvedKeys)
        → returned Map entries → queryCache.set(key, value)
```

No generics involved. The resolver returns `Map<string, unknown>` — same shape as the existing query cache.

## Implementation Plan

### Phase 1: Core Implementation

Add `aotDataResolver` to types, wire into `ssrRenderAot()`, thread through `createSSRHandler()`.

**Changes:**
- `packages/ui-server/src/ssr-aot-pipeline.ts` — Add `AotDataResolver` type, add to `SSRRenderAotOptions`, call in `ssrRenderAot()` after entity prefetch
- `packages/ui-server/src/ssr-handler.ts` — Add to `SSRHandlerOptions`, pass through to `ssrRenderAot()`
- `packages/ui-server/src/ssr/index.ts` — Export `AotDataResolver` type

**Acceptance Criteria:**

```typescript
describe('Feature: aotDataResolver for non-entity data sources', () => {
  describe('Given an AOT route with queryKeys and an aotDataResolver', () => {
    describe('When the resolver provides all keys', () => {
      it('Then AOT renders with resolved data (no single-pass fallback)', () => {})
      it('Then resolver receives the correct pattern, params, and queryKeys', () => {})
      it('Then query cache entries appear in ssrData for client hydration', () => {})
    })
  })

  describe('Given an AOT route with queryKeys and NO aotDataResolver', () => {
    describe('When no entity prefetch is available', () => {
      it('Then falls back to ssrRenderSinglePass (existing behavior)', () => {})
    })
  })

  describe('Given an AOT route where entity prefetch resolves some keys', () => {
    describe('When aotDataResolver fills the remaining keys', () => {
      it('Then AOT renders with combined data from both sources', () => {})
      it('Then resolver only receives unresolved keys', () => {})
    })
  })

  describe('Given an AOT route where aotDataResolver provides partial keys', () => {
    describe('When not all keys are resolved after both pipelines', () => {
      it('Then falls back to ssrRenderSinglePass', () => {})
    })
  })

  describe('Given an aotDataResolver that throws', () => {
    describe('When ssrRenderAot is called', () => {
      it('Then falls back to ssrRenderSinglePass (graceful degradation)', () => {})
    })
  })

  describe('Given an AOT route without queryKeys', () => {
    describe('When aotDataResolver is provided', () => {
      it('Then resolver is NOT called (no unresolved keys)', () => {})
    })
  })

  describe('Given createSSRHandler with aotDataResolver', () => {
    describe('When an AOT route is requested', () => {
      it('Then the resolver is passed through to ssrRenderAot', () => {})
    })
  })

  describe('Given an aotDataResolver that returns synchronously', () => {
    describe('When ssrRenderAot is called', () => {
      it('Then the sync Map is used without awaiting', () => {})
    })
  })
})
```

## E2E Acceptance Test

```typescript
// Developer experience: custom JSON data with AOT rendering
const handler = createSSRHandler({
  module: ssrModule,
  template: '<html><head></head><body><!--ssr-outlet--></body></html>',
  aotManifest: {
    routes: {
      '/': {
        render: (data, ctx) => `<h1>${ctx.getData('home-hero')}</h1>`,
        holes: [],
        queryKeys: ['home-hero'],
      },
    },
  },
  aotDataResolver: async (_pattern, _params, keys) => {
    const data = new Map<string, unknown>();
    if (keys.includes('home-hero')) data.set('home-hero', 'Welcome');
    return data;
  },
});

const response = await handler(new Request('http://localhost/'));
const html = await response.text();
// ✅ AOT render with custom data, NOT single-pass fallback
expect(html).toContain('<h1>Welcome</h1>');
```

### Invalid usage (type errors)

```typescript
// @ts-expect-error — resolver must return Map, not plain object
aotDataResolver: async () => ({ key: 'value' }),

// @ts-expect-error — resolver must accept 3 arguments
aotDataResolver: async (pattern: string) => new Map(),
```
