# AOT SSR for Parameterized Routes

**Issue:** #1913
**Status:** Draft (Rev 2 — addressing review feedback)
**Author:** viniciusdacal

## Problem

The AOT SSR compiler only generates pre-compiled render functions for static routes. Parameterized routes (`/games/:slug`, `/cards/:id`) fall back to single-pass runtime SSR, which is 1.9-2.0x slower than Hono — compared to 1.2-1.4x for AOT routes. These parameterized routes carry 65% of benchmark traffic weight, dragging the overall average to 2.5x Hono.

### Root Cause

When a component calls `useParams()` and passes the param to a query key (e.g., `` query(fn, { key: `game-${slug}` }) ``), the AOT string transformer can't resolve the query cache key statically. The `_extractQueryVars` method only recognizes `api.entity.operation()` descriptor chains (Strategy 1) or literal `{ key: '...' }` strings (Strategy 2). Template literals with route params are opaque, so the component gets classified as `runtime-fallback`.

### Two Distinct Patterns

There are two patterns for parameterized queries, with very different AOT implications:

**Pattern A: Entity descriptor with param argument**
```typescript
const { id } = useParams<'/cards/:id'>();
const card = query(api.cards.get(id));
```
- Cache key: `cards-get` (static, param-independent)
- `_extractQueryVars` Strategy 1 already extracts this key from the `api.cards.get` chain
- `prefetchForAot()` + `reconstructDescriptors()` already resolves the `id` param via `idParam` binding
- **This already works in the current pipeline.** The AOT key is `cards-get`, the prefetch stores data under `cards-get`, the AOT function reads `ctx.getData('cards-get')`.
- **However, the component is still classified as `runtime-fallback`** because `useParams()` is not tracked, and variables from `useParams()` prevent the component from being recognized as data-driven.

**Pattern B: Custom arrow-function query with template key**
```typescript
const { slug } = useParams<'/games/:slug'>();
const game = query(async () => db.getGameWithSets(slug), { key: `game-${slug}` });
```
- Cache key: `game-${slug}` (parameterized, depends on route params)
- Strategy 1 fails (first arg is `ArrowFunction`, not a property access chain) — this is expected
- Strategy 2 fails (`TemplateExpression` is not a `StringLiteral`) — this is the gap
- **Needs new Strategy 3** to parse template literals in the options object
- **Needs `aotDataResolver`** to fetch data at render time (no entity descriptor to reconstruct)

## API Surface

No new public APIs. This is an internal compiler enhancement. The `aotDataResolver` option already exists — developers who use custom arrow-function queries need to provide one (this is pre-existing, not introduced by this change).

### What Changes Internally

**1. AOT string transformer** — Track `useParams()` params and handle both patterns:

```typescript
// Pattern A: Entity descriptor — already works, just needs classification fix
function CardDetailPage() {
  const { id } = useParams<'/cards/:id'>();
  const card = query(api.cards.get(id));
  return <div>{card.data.name}</div>;
}
// Generated AOT function (same as for static routes):
export function __ssr_CardDetailPage(data: Record<string, unknown>, ctx: SSRAotContext): string {
  const __q0 = ctx.getData('cards-get');
  return '<div>' + __esc(__q0.name) + '</div>';
}

// Pattern B: Custom query with template key — NEW
function GameDetailPage() {
  const { slug } = useParams<'/games/:slug'>();
  const game = query(async () => db.getGameWithSets(slug), { key: `game-${slug}` });
  return <h1>{game.data.name}</h1>;
}
// Generated AOT function (new — backtick template with ctx.params):
export function __ssr_GameDetailPage(data: Record<string, unknown>, ctx: SSRAotContext): string {
  const __q0 = ctx.getData(`game-${ctx.params.slug}`);
  return '<h1>' + __esc(__q0.name) + '</h1>';
}
```

**2. AOT manifest** — Include `paramBindings` for routes with parameterized query keys:

```typescript
// Route entry for Pattern A (no paramBindings — key is static):
"/cards/:id": {
  "renderFn": "__ssr_CardDetailPage",
  "holes": [],
  "queryKeys": ["cards-get"]
}

// Route entry for Pattern B (paramBindings present):
"/games/:slug": {
  "renderFn": "__ssr_GameDetailPage",
  "holes": [],
  "queryKeys": ["game-${slug}"],        // Template with ${paramName} placeholder
  "paramBindings": ["slug"]             // Params referenced in queryKeys
}
```

Note: `queryKeys` values use `${paramName}` as a custom placeholder syntax (not JS template literals). They are resolved by `resolveParamQueryKeys()` at render time.

**3. AOT pipeline** — Resolve parameterized query keys before ALL downstream uses:

```typescript
// In ssrRenderAot(), BEFORE prefetchForAot, aotDataResolver, AND allKeysResolved:
const resolvedQueryKeys = resolveParamQueryKeys(aotEntry.queryKeys, match.params);

// ALL downstream code uses resolvedQueryKeys, never aotEntry.queryKeys:
// - prefetchForAot(resolvedQueryKeys, ...)
// - unresolvedKeys = resolvedQueryKeys.filter(k => !queryCache.has(k))
// - allKeysResolved = resolvedQueryKeys.every(k => queryCache.has(k))
```

### Concrete TypeScript Examples

```typescript
// ─── Extended QueryVarMeta (compiler-internal) ──────────

interface QueryVarMeta {
  varName: string;
  cacheKey: string;              // May be 'cards-get' or 'game-${slug}'
  index: number;
  derivedAliases: string[];
  paramRefs: string[];           // NEW: ['slug'] for template keys, [] for static keys
  paramMap?: Map<string, string>; // NEW: Maps local alias → route param name
                                  // e.g., { gameSlug → slug } for destructured aliases
}

// ─── Extended AotRouteMapEntry ──────────────────────────

interface AotRouteMapEntry {
  renderFn: string;
  holes: string[];
  queryKeys: string[];           // May contain '${paramName}' placeholders
  paramBindings?: string[];      // Param names referenced in queryKeys
}

// ─── Query key resolution (new) ─────────────────────────

function resolveParamQueryKeys(
  queryKeys: string[],
  params: Record<string, string>,
): string[] {
  return queryKeys.map((key) =>
    key.replace(/\$\{(\w+)\}/g, (_, name) => params[name] ?? ''),
  );
}

// ─── Conditional code generation in _emitAotFunction ────

// If qv.paramRefs.length > 0:
//   Emit backtick template: ctx.getData(`game-${ctx.params.slug}`)
// Else:
//   Emit single-quoted string: ctx.getData('cards-get')
```

### Aliased Destructuring

```typescript
// This pattern must be handled:
const { slug: gameSlug } = useParams<'/games/:slug'>();
const game = query(fn, { key: `game-${gameSlug}` });

// The compiler must track: gameSlug (local) → slug (route param)
// Generated code uses the ROUTE param name, not the local alias:
const __q0 = ctx.getData(`game-${ctx.params.slug}`);
//                                         ^^^^  route param, not gameSlug
```

The `_collectUseParamsVars` method returns a `Map<string, string>` (local name → route param name) by inspecting `ObjectBindingPattern` elements: `el.propertyName?.getText()` gives the route param name, `el.name.getText()` gives the local alias.

### Diagnostics

When a component with `useParams()` falls back to `runtime-fallback`, the classification log includes a reason:

```
GameDetailPage: runtime-fallback (query key is not a static string or template literal with useParams() interpolation)
```

The `AotComponentInfo` type gains an optional `fallbackReason?: string` field.

## Manifesto Alignment

### Principle 7: Performance is not optional
This is a pure performance improvement. Parameterized routes get the same AOT fast path as static routes, closing the gap with hand-rolled Hono templates from 2.0x to 1.2-1.4x.

### Principle 1: If it builds, it works
The compiler statically verifies that `useParams()` destructured variables flow into query keys. If the param name doesn't match a route segment, the AOT classifier falls back to runtime — no silent corruption.

### Principle 3: AI agents are first-class users
No new APIs. Developers write the same code; the compiler handles the optimization transparently.

### Tradeoffs
- **Scope limited to `useParams()` + entity descriptors OR template-literal query keys.** Components that compute param-dependent keys in non-trivial ways (e.g., conditionals, function calls) still fall back to runtime.
- **No cross-file analysis.** If a param flows through a helper function before reaching the query key, the compiler can't trace it. Consistent with the existing per-file, single-pass architecture.
- **Pattern B requires `aotDataResolver`.** Custom arrow-function queries can't be fetched via the entity prefetch pipeline. The existing `aotDataResolver` option must be provided for these routes. If no resolver is provided, the route falls back to single-pass SSR.

### Rejected Alternatives
- **Adding `useParams` to `REACTIVE_SOURCE_APIS`** — `useParams()` returns a plain object, not a reactive source. Treating it as reactive would cause the signal transformer to insert `.value` unwrapping, which is wrong.
- **Custom query key resolver in the AOT manifest** — Over-engineering for v1. Template interpolation covers the common case. Complex key derivation falls back to runtime.
- **Cross-file param tracing** — Would require fundamentally different compiler architecture. Consistent with per-file, single-pass constraint.

## Non-Goals

- **`useSearchParams()` in AOT** — Search params are not part of the route pattern; they're unbounded. Different problem, different solution.
- **Cross-file param tracing** — If the param passes through an imported helper before reaching the query key, it falls back to runtime.
- **Custom query key functions** — `{ key: computeKey(slug) }` is opaque to static analysis. Falls back to runtime.
- **Nested/parent route params** — Params from parent layout routes (e.g., `/org/:orgId/games/:slug` where page reads `:orgId` from parent) are out of scope. The route matcher already provides all matched params, so this may work automatically, but is not explicitly tested or guaranteed in this design.

## Unknowns

None. Template literal parsing in ts-morph is straightforward:
- `SyntaxKind.TemplateExpression` with `.getHead()` (TemplateHead) and `.getTemplateSpans()` (TemplateSpan[])
- Each span has `.getExpression()` (the interpolated identifier) and `.getLiteral()` (TemplateMiddle/TemplateTail)
- Extract param names by checking if each expression is a simple Identifier in the `useParams` set
- Build the cache key pattern by concatenating: `head.getLiteralText()` + `${span.getExpression().getText()}` + ...

## Type Flow Map

No new generics introduced. The type changes are:
- `QueryVarMeta.paramRefs: string[]` (compiler-internal, plain string array)
- `QueryVarMeta.paramMap?: Map<string, string>` (compiler-internal)
- `AotRouteMapEntry.paramBindings?: string[]` (manifest type, plain string array)
- `AotComponentInfo.fallbackReason?: string` (diagnostics, plain string)

No generic flow to trace.

## E2E Acceptance Test

```typescript
describe('Feature: AOT SSR for parameterized routes', () => {
  // Pattern A: Entity descriptor with param
  describe('Given a route /cards/:id with api.cards.get(id) from useParams()', () => {
    describe('When the AOT compiler processes the component', () => {
      it('Then classifies the component as data-driven (not runtime-fallback)', () => {});
      it('Then queryKeys contain the static entity-operation key (cards-get)', () => {});
      it('Then the generated function uses ctx.getData("cards-get") (static key)', () => {});
    });
  });

  // Pattern B: Custom query with template key
  describe('Given a route /games/:slug with template-literal query key', () => {
    describe('When the AOT compiler processes the component', () => {
      it('Then classifies the component as data-driven (not runtime-fallback)', () => {});
      it('Then queryKeys contain the template pattern (game-${slug})', () => {});
      it('Then the generated function uses ctx.getData(`game-${ctx.params.slug}`)', () => {});
    });
  });

  // Aliased destructuring
  describe('Given const { slug: gameSlug } = useParams()', () => {
    describe('When the AOT compiler processes the component', () => {
      it('Then uses ctx.params.slug (route param name), not ctx.params.gameSlug', () => {});
    });
  });

  // Pipeline resolution
  describe('Given an AOT manifest with parameterized query keys', () => {
    describe('When ssrRenderAot() is called for /games/pokemon-tcg', () => {
      it('Then resolves the query key to game-pokemon-tcg', () => {});
      it('Then passes resolved key to the data resolver (not the template)', () => {});
      it('Then the allKeysResolved check uses resolved keys', () => {});
      it('Then calls the AOT render function with the fetched data', () => {});
      it('Then returns the rendered HTML (not single-pass fallback)', () => {});
    });
  });

  // Fallback cases
  describe('Given a component with a non-template query key using useParams()', () => {
    describe('When the AOT compiler processes it', () => {
      it('Then falls back to runtime-fallback tier', () => {});
      it('Then includes a fallbackReason explaining why', () => {});
    });
  });

  describe('Given a parameterized route where aotDataResolver is not provided', () => {
    describe('When ssrRenderAot() is called for Pattern B (custom key)', () => {
      it('Then falls back to single-pass SSR gracefully', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Compiler — Track `useParams()` and support both patterns

**Goal:** The AOT string transformer tracks `useParams()` destructured variables (including aliases), supports template-literal query keys (Strategy 3), and correctly classifies components using both Pattern A and Pattern B.

**Changes:**

1. **Add `_collectUseParamsVars()` method** (new, ts-morph) — Scan the component body for `const { ... } = useParams()` and return a `Map<string, string>` of local name → route param name. Handle aliased destructuring (`{ slug: gameSlug }` → `gameSlug` → `slug`).

2. **Add `paramRefs` and `paramMap` to `QueryVarMeta`** — `paramRefs: string[]` lists route param names referenced in the cache key. `paramMap` maps local aliases to route param names.

3. **Add Strategy 3 to `_extractQueryVars`** — When the second argument's `key` property is a `TemplateExpression` (not `StringLiteral`), parse it:
   - Iterate `.getTemplateSpans()`, check each `.getExpression()` is a simple `Identifier` in the `useParams` set
   - If any interpolation is NOT from `useParams`, bail (no cache key → runtime fallback as before)
   - Build the cache key pattern: `head.getLiteralText()` + `${routeParamName}` + ... (using route param name from `paramMap`, not the local alias)
   - Set `paramRefs` to the list of route param names

4. **Fix ArrowFunction first-arg handling** — When Strategy 1 finds an `ArrowFunction` first argument (not a descriptor chain), `cacheKey` is null from Strategy 1 — this is expected. Strategy 3 (or existing Strategy 2 for static string keys) provides the key. Document this explicitly in a code comment.

5. **Update `_emitAotFunction` for parameterized keys** — When `qv.paramRefs.length > 0`, emit backtick template: `` ctx.getData(`game-${ctx.params.slug}`) ``. When `paramRefs` is empty, emit single-quoted string (existing behavior).

6. **Fix `useParams()` component classification** — The presence of `useParams()` should NOT cause `runtime-fallback` when all query vars have resolvable cache keys (either via Strategy 1 entity chain or Strategy 3 template literal).

7. **Add `fallbackReason` to `AotComponentInfo`** — When a component falls back because of unresolvable query keys, record why.

**Acceptance Criteria:**
```typescript
describe('Phase 1: Compiler recognizes useParams in AOT', () => {
  // Pattern A: entity descriptor
  describe('Given a component with useParams() and api.cards.get(id)', () => {
    describe('When compileForSSRAot() processes it', () => {
      it('Then tier is data-driven (not runtime-fallback)', () => {});
      it('Then queryKeys contain static key (cards-get)', () => {});
      it('Then generated function uses ctx.getData("cards-get")', () => {});
    });
  });

  // Pattern B: template literal key
  describe('Given a component with useParams() and template-literal query key', () => {
    describe('When compileForSSRAot() processes it', () => {
      it('Then tier is data-driven (not runtime-fallback)', () => {});
      it('Then queryKeys contain the template pattern (game-${slug})', () => {});
      it('Then generated function uses ctx.getData with backtick template', () => {});
      it('Then paramRefs contains ["slug"]', () => {});
    });
  });

  // Aliased destructuring
  describe('Given const { slug: gameSlug } = useParams()', () => {
    describe('When compileForSSRAot() processes it', () => {
      it('Then generated code uses ctx.params.slug (not ctx.params.gameSlug)', () => {});
    });
  });

  // Multiple params
  describe('Given useParams() destructuring multiple params', () => {
    describe('When compileForSSRAot() processes it', () => {
      it('Then both params are available in ctx.params references', () => {});
      it('Then template keys reference both params', () => {});
    });
  });

  // Non-template key fallback
  describe('Given a component with useParams() but non-template query key', () => {
    describe('When compileForSSRAot() processes it', () => {
      it('Then tier is runtime-fallback (unchanged behavior)', () => {});
      it('Then fallbackReason explains why', () => {});
    });
  });

  // ArrowFunction first arg is OK when Strategy 3 resolves
  describe('Given query(async () => ..., { key: `game-${slug}` })', () => {
    describe('When _extractQueryVars processes it', () => {
      it('Then Strategy 1 returns null (ArrowFunction first arg) — expected', () => {});
      it('Then Strategy 3 provides the cache key from the template literal', () => {});
    });
  });
});
```

### Phase 2: Manifest & Pipeline — Resolve parameterized keys at render time

**Goal:** The AOT manifest includes param binding info and the AOT pipeline resolves template query keys to actual values BEFORE all downstream uses (prefetch, resolver, allKeysResolved check).

This is the critical correctness phase. The `allKeysResolved` check is the centerpiece — if it compares template patterns against resolved cache keys, the feature silently fails.

**Changes:**

1. **Extend `AotRouteMapEntry`** in `aot-manifest-build.ts` with `paramBindings?: string[]`.

2. **In `buildAotRouteMap`**, populate `paramBindings` by extracting `${...}` patterns from query keys.

3. **Add `resolveParamQueryKeys()` utility** in `ssr-aot-pipeline.ts`:
   ```typescript
   function resolveParamQueryKeys(
     queryKeys: string[],
     params: Record<string, string>,
   ): string[] {
     return queryKeys.map((key) =>
       key.replace(/\$\{(\w+)\}/g, (_, name) => params[name] ?? ''),
     );
   }
   ```

4. **CRITICAL: Replace `aotEntry.queryKeys` with resolved keys for ALL downstream uses in `ssrRenderAot()`:**
   ```typescript
   const resolvedQueryKeys = resolveParamQueryKeys(aotEntry.queryKeys ?? [], match.params);
   // Use resolvedQueryKeys EVERYWHERE below:
   // - prefetchForAot(resolvedQueryKeys, ...)
   // - unresolvedKeys = resolvedQueryKeys.filter(k => !queryCache.has(k))
   // - options.aotDataResolver(match.pattern, match.params, unresolvedKeys)
   // - allKeysResolved = resolvedQueryKeys.every(k => queryCache.has(k))
   ```
   Without this, `queryCache.has('game-${slug}')` will never match `queryCache.has('game-pokemon-tcg')`.

5. **Handle missing params gracefully** — If `resolveParamQueryKeys` produces a key with an empty segment (param not in URL match), treat it as unresolved and fall back to single-pass SSR rather than producing a key like `game-`. Specifically: after resolution, check if any resolved key still contains an empty segment (`''` from the `?? ''` fallback). If so, the `allKeysResolved` check will fail naturally (the data resolver won't have data for a malformed key), triggering the existing single-pass fallback path. No explicit empty-segment detection is needed — the existing `allKeysResolved` guard handles it.

**Acceptance Criteria:**
```typescript
describe('Phase 2: Pipeline resolves parameterized query keys', () => {
  describe('Given an AOT manifest with queryKeys ["game-${slug}"]', () => {
    describe('When ssrRenderAot() is called for URL /games/pokemon-tcg', () => {
      it('Then resolves query key to "game-pokemon-tcg"', () => {});
      it('Then passes "game-pokemon-tcg" (not "game-${slug}") to the data resolver', () => {});
      it('Then allKeysResolved compares "game-pokemon-tcg" against queryCache', () => {});
      it('Then the AOT render function receives data via ctx.getData("game-pokemon-tcg")', () => {});
    });
  });

  describe('Given an AOT manifest with paramBindings ["slug"]', () => {
    describe('When buildAotRouteMap() is called', () => {
      it('Then the route entry includes paramBindings: ["slug"]', () => {});
    });
  });

  describe('Given a route where URL match is missing a required param', () => {
    describe('When resolveParamQueryKeys produces an empty segment', () => {
      it('Then falls back to single-pass SSR (not crash or wrong key)', () => {});
    });
  });

  describe('Given a parameterized route where data resolver fails', () => {
    describe('When ssrRenderAot() is called', () => {
      it('Then falls back to single-pass SSR (existing behavior)', () => {});
    });
  });

  // Mixed: route has both static and parameterized queryKeys
  describe('Given queryKeys ["cards-list", "card-${id}"]', () => {
    describe('When ssrRenderAot() is called', () => {
      it('Then resolves "card-${id}" but leaves "cards-list" unchanged', () => {});
    });
  });
});
```

### Phase 3: Entity prefetch integration for Pattern A routes

**Goal:** Verify that Pattern A (`api.entity.get(paramId)`) works end-to-end through the existing entity prefetch pipeline, and close any remaining gaps.

**Context:** The entity prefetch pipeline (`prefetchForAot()` + `reconstructDescriptors()`) already handles parameterized routes for entity descriptor patterns. The `idParam` binding in the prefetch manifest tells `reconstructDescriptors` to pass `params[idParam]` to the entity SDK's `get()` method. The AOT key is `entity-operation` (static), which matches between the compiler output and the prefetch cache.

Phase 1 enables these components to be classified as AOT-eligible (previously they fell back because `useParams()` was present). Phase 2 ensures the pipeline resolves keys correctly. Phase 3 is a **verification phase** — it confirms the existing prefetch pipeline handles Pattern A correctly now that the compiler no longer blocks it.

**Changes:**
1. **Integration test** — Write an end-to-end test that compiles a Pattern A component, builds the manifest, runs `ssrRenderAot()` with a mock API client, and verifies the full pipeline produces correct HTML.
2. **Fix any gaps** — If `prefetchForAot()` doesn't match AOT query keys against prefetch manifest entries for parameterized routes, add the mapping.
3. **Verify Pattern B with `aotDataResolver`** — Write an integration test for Pattern B showing the resolver receives the resolved key and the pipeline uses the resolved data.

**Acceptance Criteria:**
```typescript
describe('Phase 3: End-to-end integration', () => {
  // Pattern A: entity prefetch
  describe('Given route /cards/:id with api.cards.get(id)', () => {
    describe('When ssrRenderAot() runs for /cards/abc-123 with mock API', () => {
      it('Then prefetchForAot calls api.cards.get("abc-123")', () => {});
      it('Then stores result under "cards-get" in queryCache', () => {});
      it('Then AOT function renders correct HTML with card data', () => {});
    });
  });

  // Pattern B: custom key with aotDataResolver
  describe('Given route /games/:slug with template key and aotDataResolver', () => {
    describe('When ssrRenderAot() runs for /games/pokemon-tcg', () => {
      it('Then aotDataResolver receives unresolvedKeys: ["game-pokemon-tcg"]', () => {});
      it('Then AOT function renders correct HTML with game data', () => {});
    });
  });

  // Pattern B without resolver: graceful fallback
  describe('Given route /games/:slug with template key and NO aotDataResolver', () => {
    describe('When ssrRenderAot() runs for /games/pokemon-tcg', () => {
      it('Then falls back to single-pass SSR (no crash)', () => {});
    });
  });
});
```
