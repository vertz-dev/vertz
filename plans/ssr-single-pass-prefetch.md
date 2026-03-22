# SSR Single-Pass Prefetch via Discovery-Only Execution + Static Manifest

> Eliminate the SSR discovery pass by pre-populating query cache before rendering. Discovery-only execution captures exact cache keys at ~12% of render cost; a build-time manifest provides route→component mapping and entity access filtering.

## Status

**Draft — Rev 3** — Updated with consolidated review findings from three-agent review (DX, Product/Scope, Technical). All blockers addressed.

**Depends on:** `queryMatch` removal — completed (PR #1732).

## POC Results

Three POCs were conducted to validate the core assumptions. All passed. Test files:
- `packages/ui-server/src/__tests__/ssr-single-pass-poc.test.ts` (16 tests)
- `packages/ui-server/src/__tests__/ssr-manifest-poc.test.ts` (28 tests)
- `packages/ui-server/src/__tests__/ssr-prefetch-poc.test.ts` (12 tests)

### POC 1: Single-Pass Render Correctness

**Question:** If we pre-populate `ctx.queryCache` before rendering, does a single `createApp()` call produce the same HTML as the current two-pass pipeline?

**Result: YES — validated.**

- Pre-populating `ctx.queryCache` with `descriptor._key` values produces **identical HTML** to two-pass
- `query(descriptor)` internally sets `key: descriptor._key`, and `getDefaultCache()` returns `ctx.queryCache` during SSR — so pre-population is transparent
- Setting `ctx.resolvedComponents = new Map()` signals "Pass 2 mode" to the router
- Partial cache (some queries missing) gracefully degrades: missing queries register in `ctx.queries` for SSR fetch, present queries render from cache
- `ssrRedirect` detection works identically in single-pass
- Null thunk queries (`query(() => null)`) stay idle as expected

**Performance:** Single-pass is **~37% faster** than two-pass (63% of two-pass wall clock).

### POC 2: Static Route + Query Extraction

**Question:** Can we extract an accurate route → component → query mapping from AST analysis?

**Result: YES — 100% extraction on the linear clone.**

Tested against `examples/linear/` (the most complex example app):

| Metric | Result |
|--------|--------|
| Routes extracted | 8/9 (root index child collapses with parent — non-issue) |
| Queries extracted (page + layout) | **11/11 (100%)** |
| Param dependencies detected | 100% (`projectId`, `issueId` from `useParams()`) |
| Dialog queries (unanalyzable) | 1 (ManageLabelsDialog — expected gap) |
| Analysis time | ~240ms for entire app |

**Full manifest output:**
```
/login (LoginPage) → (no queries)
/ (ProtectedRoute) → (no queries)
/projects (ProjectsPage) → [api.projects.list]
/projects/:projectId (ProjectLayout) → [api.projects.get]
/projects/:projectId (IssueListPage) → [api.issues.list, api.projects.get, api.labels.list]
/projects/:projectId/board (ProjectBoardPage) → [api.issues.list, api.projects.get, api.labels.list]
/projects/:projectId/issues/:issueId (IssueDetailPage) → [api.issues.get, api.labels.list, api.issueLabels.list]
```

**Key discovery: cache keys are auto-derived from QueryDescriptors.** The original design assumed explicit `key` strings on queries (e.g., `{ key: 'task-list' }`). In practice, keys are auto-derived: `query(descriptor)` sets `key: descriptor._key`, where `_key = ${method}:${path}${serializedQueryParams}`. The manifest must record descriptor factory metadata (entity + method + params), not string keys.

**Unanalyzable patterns (documented gaps):**
- Queries inside imperatively-opened dialogs (`stack.open(Component, props)`)
- Queries behind runtime conditionals (feature flags)
- Computed route keys or spread operators in `defineRoutes()`

### POC 3: Prefetch Execution

**Question:** Can we reconstruct cache keys from manifest metadata, and how does lightweight execution compare to full rendering?

**Result: YES — keys reconstruct correctly, and discovery-only is dramatically cheaper.**

**3a — Key reconstruction:** Given manifest metadata `{ entity, method, routeParams, queryParams }` and runtime-resolved params, the reconstructed `_key` matches the runtime descriptor `_key` for all tested cases.

Mapping rules:
- `entity.list()` → `GET:/{entity}`
- `entity.get(id)` → `GET:/{entity}/{id}`
- `entity.list({ where: { projectId } })` → `GET:/{entity}?projectId={value}`

**3b — Cost breakdown (20 iterations, 50-item page with 3 queries):**

| Mode | Avg time | % of two-pass |
|------|----------|---------------|
| Two-pass SSR | 0.150ms | 100% |
| Single-pass SSR | 0.096ms | 64% |
| Discovery-only (no render) | 0.012ms | 8% |

- **DOM rendering is 87.5% of single-pass cost** — running the component function without rendering to a stream captures all queries at ~12% of the render cost
- Discovery-only queries match full Pass 1 queries exactly
- **Recommendation: discovery-only is worth the complexity** (>20% savings threshold)

## Resolved Blockers

### Original Design Blockers (from Rev 1)

### ~~1. Prefetch execution mechanism is undefined~~

**Resolved.** Discovery-only execution is the chosen mechanism.

- **Discovery-only execution** runs the component function in SSR context to register queries, but skips DOM stream rendering. It captures 100% of queries (including computed params, conditionals) at ~12% of render cost.
- **Registry-based reconstruction (rejected)**: The `resolveVertzQL()` pipeline transforms `where` → bracket notation (`where[field]=value`) and `select`/`include` → base64url `q` parameter. Reconstructing these keys from manifest metadata alone is fragile and would require duplicating the full `resolveVertzQL` pipeline in the prefetcher. Discovery-only sidesteps this entirely by running real descriptor factories.

### ~~2. `access` option dependency direction~~

**Resolved differently.** Per-query `access` annotations are **unnecessary**. Access rules are already defined per-entity via `rules.*` descriptors. The prefetcher can derive eligibility from entity definitions: entity + operation → access rule. No new API surface needed on `query()`.

### ~~3. Default for unannotated queries~~

**Resolved.** With entity-level access derivation, there's no "unannotated" state. Every query's descriptor references an entity, and every entity has access rules. The prefetcher evaluates the entity's access rule for the relevant operation (list/get) against the current user's session.

### Review Blockers (from Rev 2 three-agent review)

### ~~4. Cache key reconstruction ignores `resolveVertzQL` transformations~~

**Source:** DX BLOCKER-1, Technical BLOCKER-1, Product SHOULD-FIX-2

**Problem:** The `resolveVertzQL()` pipeline produces keys like `GET:/issues?q=eyJzZWxlY3Q...&where%5BprojectId%5D=p-123`, but the manifest's `reconstructKey()` would produce `GET:/issues?projectId=p-123`. These don't match.

**Resolution:** Registry-based key reconstruction (Option B) is **rejected**. Discovery-only execution runs real descriptor factories, which call `resolveVertzQL` internally, producing exact cache keys. The static manifest provides route→component mapping and entity access hints, **not** cache key generation.

### ~~5. `getEntityDefinition()` doesn't exist; cross-package dependency~~

**Source:** DX BLOCKER-2, Technical BLOCKER-2, Product BLOCKER-1

**Problem:** `@vertz/ui-server` cannot import entity definitions from `@vertz/server` without pulling the full server runtime.

**Resolution:** The build step (which runs in Node/Bun, not the browser) imports entity definitions from the app's server config and serializes access rules into the manifest. The serialized format is a subset of the `rules.*` descriptor types (already plain JSON-serializable objects with `type` discriminants). At SSR request time, the prefetcher evaluates the serialized rules without importing `@vertz/server`.

### ~~6. `evaluateAccessRule()` incomplete — missing rule types~~

**Source:** Technical BLOCKER-2

**Problem:** The evaluator only handled `public`, `authenticated`, `entitlement`, `all`, `any`. Missing: `where`, `role`, `fva`.

**Resolution:** Complete rule type handling matrix (see "Entity Access Eligibility" section below).

### ~~7. Discovery-only contradicts manifest's value proposition~~

**Source:** Product BLOCKER-2

**Problem:** If discovery-only execution gets exact cache keys, what value does the static manifest provide?

**Resolution:** The manifest and discovery-only serve **complementary roles**:

| Concern | Manifest | Discovery-only |
|---------|----------|----------------|
| Route → component mapping | **Primary** | N/A |
| Entity access filtering | **Primary** (serialized rules) | N/A |
| Cache key generation | N/A | **Primary** (exact keys) |
| Parallelization hints | **Primary** (fire fetches before discovery completes) | N/A |
| Query completeness | Partial (misses computed/conditional) | **Complete** (runs real code) |

The manifest enables **speculative prefetching**: fire likely queries in parallel while discovery-only runs. Discovery-only then confirms the exact set. Queries speculatively prefetched that match discovery results → cache hit. Extra speculative queries → harmless (data discarded). Missing queries → fetched normally.

### ~~8. Manifest layout vs page component disambiguation~~

**Source:** Technical SHOULD-FIX-3

**Problem:** For URL `/projects/abc123/board`, the manifest must know that `ProjectLayout` renders (layout) but `IssueListPage` does NOT (it's the index child of `/projects/:projectId`, not of `/projects/:projectId/board`).

**Resolution:** The manifest distinguishes `layout` and `page` components per route. Layouts render for all child routes; pages render only when the specific pattern matches. See updated manifest format below.

## Problem

The current SSR pipeline uses **two render passes**:

1. **Pass 1 (Discovery)** — Renders the full component tree to discover which `query()` calls execute. Queries register their promises in `ctx.queries`. The server awaits all of them.
2. **Pass 2 (Render)** — Renders again with pre-populated cache, producing the final HTML.

This means:
- Every SSR request runs the app factory **twice**
- Pass 1 is pure overhead — its only purpose is to learn what data the page needs
- Component initialization, context setup, and JSX evaluation all happen twice
- For pages with many queries, the wall-clock cost is `2 × render_time + data_fetch_time`

**The insight:** If we know what queries a route needs *before* rendering, we can prefetch all data and render in a single pass: `render_time + data_fetch_time` (with data fetch parallelized).

## Solution

Two complementary mechanisms work together:

### 1. Build-time static manifest

A **build-time static analysis** step that:

1. Extracts the route → component mapping from `defineRoutes()` calls via AST
2. Follows component imports to find all reachable `query()` calls
3. Extracts descriptor factory metadata (entity, method, params) from each query
4. Serializes entity access rules into the manifest (decoupled from `@vertz/server`)
5. Produces a **prefetch manifest** mapping route patterns to component metadata and query hints

### 2. Request-time discovery-only execution

At request time, the SSR pipeline:

1. Matches the URL to a route pattern in the manifest
2. Reads the JWT to determine auth state
3. **Speculative prefetch (optional):** Uses manifest hints + entity access rules to fire likely queries in parallel with step 4
4. **Discovery-only execution:** Runs the matched component functions in SSR context to register queries — captures exact cache keys via real descriptor factories (no `resolveVertzQL` reconstruction needed)
5. Awaits all discovered queries (including any that were speculatively prefetched — cache hits)
6. Renders the app **once** with pre-populated `ctx.queryCache`

**Why both mechanisms?** Discovery-only alone captures exact keys but can only fire queries *after* component functions run. The manifest enables *speculative* parallel prefetching — fire queries before discovery completes, so data is already arriving when discovery confirms the exact set. For the common case (no computed params, no feature flag conditionals), speculative and discovery results match exactly.

**Graceful degradation:** Queries that exceed the SSR timeout are NOT abandoned — the server continues fetching and **streams** the result to the client. The client hydrates with the streamed data without re-fetching. The "missing" state only affects the initial HTML paint. The `ssrRenderSinglePass()` function must integrate with the existing `renderToStream` Suspense boundary mechanism — timed-out queries register in `ctx.queries` during the render pass (partial cache miss path), and the stream emits `<template>` completion chunks when data resolves.

## API Surface

### Route Definitions (No Change — Convention-Based Extraction)

Routes remain runtime objects. The build step extracts the mapping via AST analysis of `defineRoutes()` calls:

```tsx
// src/routes.ts — existing pattern, no changes needed
import { defineRoutes } from '@vertz/ui';

export const routes = defineRoutes({
  '/login': { component: () => <LoginPage /> },
  '/': {
    component: () => <ProtectedRoute><WorkspaceShell /></ProtectedRoute>,
    children: {
      '/projects': { component: () => <ProjectsPage /> },
      '/projects/:projectId': {
        component: () => <ProjectLayout />,
        children: {
          '/': { component: () => <IssueListPage /> },
          '/board': { component: () => <ProjectBoardPage /> },
          '/issues/:issueId': { component: () => <IssueDetailPage /> },
        },
      },
    },
  },
});
```

### Query Calls (No Change — Descriptor-Based Keys)

Queries use existing descriptor patterns. **No `access` annotation needed** — eligibility is derived from entity definitions:

```tsx
function IssueListPage() {
  const { projectId } = useParams<'/projects/:projectId'>();

  // These descriptors produce auto-derived cache keys:
  // api.issues.list({ where: { projectId } }) → GET:/issues?projectId={value}
  // api.projects.get(projectId) → GET:/projects/{value}
  // api.labels.list({ where: { projectId } }) → GET:/labels?projectId={value}
  const issues = query(api.issues.list({
    where: { projectId },
    select: { id: true, number: true, title: true, status: true },
    include: { labels: true },
  }));
  const project = query(api.projects.get(projectId));
  const labels = query(api.labels.list({ where: { projectId } }));

  // ... render
}
```

### Prefetch Manifest (Build Output)

The build step produces `.vertz/prefetch-manifest.json`. The manifest distinguishes **layout** components (render for all child routes) from **page** components (render only for their specific pattern):

```json
{
  "routes": {
    "/projects": {
      "layouts": [],
      "page": {
        "file": "src/pages/projects-page.tsx",
        "queries": [
          { "entity": "projects", "method": "list" }
        ]
      }
    },
    "/projects/:projectId": {
      "layouts": [
        {
          "file": "src/components/project-layout.tsx",
          "queries": [
            { "entity": "projects", "method": "get", "routeParams": ["projectId"] }
          ]
        }
      ],
      "page": {
        "file": "src/pages/issue-list-page.tsx",
        "queries": [
          { "entity": "issues", "method": "list", "queryParams": { "projectId": "$projectId" } },
          { "entity": "projects", "method": "get", "routeParams": ["projectId"] },
          { "entity": "labels", "method": "list", "queryParams": { "projectId": "$projectId" } }
        ]
      }
    },
    "/projects/:projectId/board": {
      "layouts": [
        {
          "file": "src/components/project-layout.tsx",
          "queries": [
            { "entity": "projects", "method": "get", "routeParams": ["projectId"] }
          ]
        }
      ],
      "page": {
        "file": "src/pages/project-board-page.tsx",
        "queries": [
          { "entity": "issues", "method": "list", "queryParams": { "projectId": "$projectId" } },
          { "entity": "projects", "method": "get", "routeParams": ["projectId"] },
          { "entity": "labels", "method": "list", "queryParams": { "projectId": "$projectId" } }
        ]
      }
    },
    "/projects/:projectId/issues/:issueId": {
      "layouts": [
        {
          "file": "src/components/project-layout.tsx",
          "queries": [
            { "entity": "projects", "method": "get", "routeParams": ["projectId"] }
          ]
        }
      ],
      "page": {
        "file": "src/pages/issue-detail-page.tsx",
        "queries": [
          { "entity": "issues", "method": "get", "routeParams": ["issueId"] },
          { "entity": "labels", "method": "list", "queryParams": { "projectId": "$projectId" } },
          { "entity": "issueLabels", "method": "list", "queryParams": { "issueId": "$issueId" } }
        ]
      }
    }
  },
  "entityAccess": {
    "projects": {
      "list": { "type": "authenticated" },
      "get": { "type": "authenticated" }
    },
    "issues": {
      "list": { "type": "authenticated" },
      "get": { "type": "authenticated" }
    },
    "labels": {
      "list": { "type": "authenticated" },
      "get": { "type": "authenticated" }
    },
    "issueLabels": {
      "list": { "type": "authenticated" }
    }
  },
  "unanalyzable": [
    { "pattern": "dialog-query", "file": "src/components/manage-labels-dialog.tsx", "reason": "Query inside imperatively-opened dialog" }
  ],
  "generatedAt": "2026-03-22T10:00:00Z"
}
```

**Note:** The `queries` in the manifest are **hints for speculative prefetching**, not the source of truth for cache keys. Cache keys are generated by discovery-only execution using real descriptor factories. Query hints that include `select`/`include` metadata are intentionally omitted from the manifest — the `resolveVertzQL` pipeline encodes them into base64url `q` parameters, and reproducing that transformation statically is fragile. Discovery-only handles this correctly.
```

### SSR Pipeline (New Single-Pass Path)

```tsx
// packages/ui-server/src/ssr-render.ts — new function alongside existing

export async function ssrRenderSinglePass(
  module: SSRModule,
  url: string,
  options: SSRRenderOptions & {
    manifest: PrefetchManifest;
    session: SSRAuth;
  },
): Promise<SSRResult> {
  const { manifest, session } = options;

  // 1. Match URL to route pattern in manifest
  const matched = matchRoute(manifest.routes, url);
  if (!matched) {
    // Fallback to two-pass for unknown routes
    return ssrRenderToString(module, url, options);
  }

  // 2. Discovery-only execution — run components to capture exact query keys
  const ctx = createRequestContext(url);
  ctx.resolvedComponents = new Map();
  if (session) ctx.ssrAuth = session;

  const discoveredQueries = await ssrStorage.run(ctx, async () => {
    // Run component functions — registers queries in ctx.queries
    // but does NOT render to a stream (skip DOM serialization)
    const app = module.default();
    discoverQueries(app, ctx);
    return new Map(ctx.queries);
  });

  // 3. Filter discovered queries by entity access rules (from manifest)
  const eligible = new Map<string, Promise<unknown>>();
  for (const [key, queryPromise] of discoveredQueries) {
    const entityName = extractEntityFromKey(key); // GET:/issues?... → "issues"
    const method = extractMethodFromKey(key);      // GET:/issues?... → "list"
    if (isEntityAccessEligible(entityName, method, manifest, session)) {
      eligible.set(key, queryPromise);
    }
  }

  // 4. Await all eligible queries (with timeout)
  const cache = await prefetchWithTimeout(eligible, options.queryTimeout);

  // 5. Single render pass with pre-populated cache
  const renderCtx = createRequestContext(url);
  for (const [key, data] of cache) {
    renderCtx.queryCache.set(key, data);
  }
  renderCtx.resolvedComponents = new Map();
  if (session) renderCtx.ssrAuth = session;

  return ssrStorage.run(renderCtx, async () => {
    const app = module.default();
    const vnode = toVNode(app);
    // renderToStream handles Suspense boundaries for timed-out queries:
    // queries absent from cache register in renderCtx.queries, and the
    // stream emits <template> completion chunks when they resolve
    const stream = renderToStream(vnode);
    const html = await streamToString(stream);
    return { html, redirect: renderCtx.ssrRedirect, queries: renderCtx.queries };
  });
}
```

**Discovery-only safety notes:**
- Discovery-only still runs component function bodies, creating DOM shim nodes (discarded). This is ~12% of full render cost (POC 3).
- Components with `ref()` or `domEffect()` may produce side effects during discovery. These are safe in SSR context because the DOM shim is inert — no real layout, scroll, or focus.
- Computed values (array transforms, string formatting) execute during discovery. This is unavoidable — the same cost exists in the current two-pass pipeline's Pass 1.

### Entity Access Eligibility

Access rules are read from the serialized `entityAccess` section of the manifest (no runtime import of `@vertz/server`). The build step extracts and serializes the `rules.*` descriptors from entity definitions.

```tsx
function isEntityAccessEligible(
  entityName: string,
  method: string,
  manifest: PrefetchManifest,
  session: SSRAuth,
): boolean {
  const entityRules = manifest.entityAccess[entityName];
  if (!entityRules) return true; // No access rules → always eligible

  const rule = entityRules[method]; // e.g., entityRules.list
  if (!rule) return true;

  return evaluateAccessRule(rule, session);
}
```

#### Complete Rule Type Handling Matrix

```tsx
function evaluateAccessRule(rule: SerializedAccessRule, session: SSRAuth): boolean {
  switch (rule.type) {
    case 'public':
      return true;

    case 'authenticated':
      return session.status === 'authenticated';

    case 'entitlement':
      return session.accessSet?.entitlements[rule.entitlement]?.allowed === true;

    case 'role':
      return session.roles?.some((r) => rule.roles.includes(r)) === true;

    case 'where':
      // Row-level filter — applied at DB level, not an access gate.
      // The query is always eligible; the WHERE condition narrows results.
      return true;

    case 'fva':
      // MFA freshness check. For SSR prefetch, we're optimistic:
      // if the user is authenticated, prefetch. The server-side
      // middleware will enforce the actual FVA check on the API call.
      return session.status === 'authenticated';

    case 'all':
      return rule.rules.every((r) => evaluateAccessRule(r, session));

    case 'any':
      return rule.rules.some((r) => evaluateAccessRule(r, session));

    default:
      return false; // Unknown rule type → don't prefetch (fail-secure)
  }
}
```

**Design rationale for `where` → `true`:** `rules.where({ createdBy: rules.user.id })` is a row-level filter, not an access gate. The query always executes — it just returns fewer rows for non-owners. Skipping the prefetch would mean no data for pages like "My Tasks" even when the user is authenticated.

**Design rationale for `fva` → optimistic:** MFA freshness is enforced on the actual API call. For SSR prefetch, we fire the query and let the API response determine the outcome. If the FVA check fails server-side, the query returns an error result, and the component renders the error state — same as if we hadn't prefetched.

### E2E Acceptance Test

```tsx
describe('Feature: SSR single-pass prefetch', () => {
  describe('Given a route with entity-level access rules', () => {
    describe('When an anonymous user requests the page', () => {
      it('Then only queries for public entities are prefetched', () => {});
      it('Then the page renders in a single pass with public data', () => {});
      it('Then authenticated-entity queries show loading state in HTML', () => {});
    });

    describe('When an authenticated user requests the page', () => {
      it('Then all entity queries the user can access are prefetched', () => {});
      it('Then the page renders in a single pass with all eligible data', () => {});
    });
  });

  describe('Given a route with parameterized queries', () => {
    describe('When /projects/abc123 is requested', () => {
      it('Then route params are resolved into descriptor keys', () => {});
      it('Then cache key matches what query(api.projects.get(projectId)) produces', () => {});
    });
  });

  describe('Given a route NOT in the manifest', () => {
    describe('When the route is requested', () => {
      it('Then falls back to two-pass rendering', () => {});
    });
  });

  describe('Given a query that exceeds the SSR timeout', () => {
    describe('When the timeout fires', () => {
      it('Then initial HTML shows loading state for that query', () => {});
      it('Then the server continues fetching and streams the result', () => {});
      it('Then the client hydrates with streamed data (no re-fetch)', () => {});
    });
  });

  describe('Given the dev server is running', () => {
    describe('When a component file with query() calls changes', () => {
      it('Then the manifest is rebuilt incrementally', () => {});
      it('Then the next SSR request uses the updated manifest', () => {});
    });
  });
});
```

## Manifesto Alignment

### Principle: Zero Wasted Work
Today we render twice; tomorrow we render once. Queries the user can't access are skipped entirely — no request, no parse, no cache entry. POC confirmed ~37% wall-clock savings.

### Principle: Compiler Does the Work
The static analysis extends the existing compiler infrastructure (manifest generator, import resolver, field selection analyzer). Developers write normal `query()` calls; the build step extracts the dependency graph. **No annotations needed** — entity access rules provide the auth metadata.

### Principle: Declarative Over Imperative
Auth rules use the existing `rules.*` descriptors on entity definitions. No new API surface for developers to learn. The prefetcher reads what's already declared.

### Principle: Secure by Default
Fail-secure: unknown rule types → don't prefetch. Entity access rules are evaluated at the edge before any query fires. Over-prefetching can only occur for public entities.

## Non-Goals

1. **Cross-query cascading prefetch** — If query B depends on query A's result, B cannot be prefetched statically. Cascading queries fall through to the normal SSR query registration path and are streamed to the client.

2. **Full elimination of two-pass rendering** — Discovery-only + single-pass is the default path. Two-pass remains as a fallback when discovery produces no queries or when explicitly needed.

3. **Per-query `access` annotations** — Entity-level access derivation is sufficient. No `access` option on `query()`.

4. **Client-side prefetch** — This design covers SSR only. Client-side route prefetching (on hover/link visibility) is a separate feature.

5. **Dialog query prefetching** — Queries inside imperatively-opened dialogs are not statically analyzable. They fall back to client-side fetching. This is acceptable because dialogs are user-initiated (not part of the initial page load).

6. **`prefetch: false` escape hatch** — Not in scope for initial implementation. If needed in the future, developers could opt out individual queries from prefetching via `query(descriptor, { prefetch: false })`. For now, the over-include strategy (prefetch all discovered queries) is correct — the cost of an unused prefetch is far lower than a missed one.

7. **Static key reconstruction** — The manifest does NOT attempt to reconstruct `resolveVertzQL`-encoded cache keys. The `resolveVertzQL` pipeline (bracket-notation `where`, base64url `q` for `select`/`include`) produces complex keys that are fragile to reproduce statically. Discovery-only execution handles key generation through real descriptor factories.

## Unknowns

All unknowns are resolved.

### 1. ~~Route extraction reliability~~ — RESOLVED

POC 2 extracted 100% of routes from the linear clone. Convention: `defineRoutes()` must use a static object literal. Unanalyzable patterns (spread operators, computed keys) are excluded with warnings.

### 2. ~~Query key derivation~~ — RESOLVED

Keys are auto-derived from `QueryDescriptor._key` via real descriptor factories during discovery-only execution. The manifest provides query hints (entity + method + params) for speculative prefetching, but exact key generation always goes through the runtime `resolveVertzQL` pipeline.

### 3. ~~Conditional query extraction~~ — RESOLVED

Discovery-only execution runs real component code, so conditional queries execute naturally. The manifest's over-include strategy (all reachable `query()` calls) provides speculative hints. Entity access rules handle auth gating.

### 4. ~~Lazy route components~~ — RESOLVED

`resolvedComponents = new Map()` signals "Pass 2 mode" to the router. Lazy components need to be resolved before the single-pass render. The prefetcher imports them in parallel with data fetching.

### 5. ~~Prefetch execution~~ — RESOLVED

Discovery-only execution is the chosen approach: run the component function in SSR context to register queries, but skip DOM rendering. This captures all queries (including computed/conditional ones) at ~12% of the full render cost. The manifest serves as an optimization hint for speculative parallel fetching.

### 6. ~~Entity access rule availability~~ — RESOLVED

The build step imports entity definitions from the app's server config and serializes access rules into the manifest as JSON. The SSR prefetcher reads serialized rules from the manifest — no `@vertz/server` import at request time. See "Entity Access Eligibility" section for the complete rule type handling matrix.

## Type Flow Map

```
BUILD TIME:
defineRoutes({ pattern: { component } })              → AST extraction
  ↓ (manifest-generator)
ManifestRoute { layouts[], page, queries[] }           → .vertz/prefetch-manifest.json
  + entityAccess (serialized rules.*  descriptors)

REQUEST TIME:
url + manifest → matchRoute()                          → ManifestRoute | null
  ↓
module.default() → discoverQueries(app, ctx)           → Map<string, Promise> (exact keys)
  ↓ (entity access filtering via manifest.entityAccess)
isEntityAccessEligible(entity, method, manifest, session) → boolean
  ↓ (await eligible queries with timeout)
prefetchWithTimeout(eligible, timeout)                 → Map<string, unknown> (cache)
  ↓ (inject into ctx.queryCache)
ssrStorage.run(ctx, () => render())                    → SSRResult { html, queries }
```

## Performance Model

### Current (Two-Pass)

```
Total = render₁ + await_queries + render₂
      ≈ 2 × render_time + max(query_times)
```

### Proposed (Single-Pass with Discovery)

```
Total = discovery + await_queries + render₁
      ≈ 0.12 × render_time + max(query_times) + render_time
      ≈ 1.12 × render_time + max(query_times)
```

### POC Measurements (DOM shim, 50-item page, 3 queries)

| Mode | Avg time | % of two-pass |
|------|----------|---------------|
| Two-pass | 0.150ms | 100% |
| Single-pass (render only) | 0.096ms | 64% |
| Discovery-only (no render) | 0.012ms | 8% |

**Important caveats on these numbers:**
- POC uses the DOM shim (lightweight mock objects), not a full DOM implementation. Production render times will be higher in absolute terms.
- The **ratio** (single-pass is ~64% of two-pass) is the meaningful metric, not the absolute times. The ratio should hold because both modes exercise the same DOM shim / render pipeline — single-pass simply does it once instead of twice.
- For pages where query time dominates render time (e.g., slow DB queries), the savings from eliminating one render pass are proportionally smaller.

### Projected Production Savings

For a production page with 200ms render time and 150ms query time:
- Two-pass: 200 + 150 + 200 = **550ms**
- Single-pass with discovery: 24 + 150 + 200 = **374ms** (~32% faster)

For a page with 50ms render time and 500ms query time:
- Two-pass: 50 + 500 + 50 = **600ms**
- Single-pass with discovery: 6 + 500 + 50 = **556ms** (~7% faster)

The savings are most significant for **render-heavy pages** (complex DOM, many components).

### Additional win: entity access skipping

Anonymous user hitting a page where 3/5 entities require auth:
- Two-pass: renders everything, fires all 5 queries (2 fail with 401), re-renders
- Single-pass: discovery captures all 5, access filtering skips 3, fires only 2 eligible, renders once

## Implementation Phases

Phases are ordered for **earliest possible value delivery**. Phase 1 delivers the core SSR improvement (single-pass rendering) using discovery-only execution without static analysis. Phase 2 adds the static manifest for speculative prefetching and entity access filtering.

### Phase 1: Discovery-Only Single-Pass SSR

The thinnest possible end-to-end slice: discovery-only execution captures queries, data is prefetched, and the app renders once. No static manifest yet — the existing two-pass Pass 1 is replaced with a lighter discovery-only pass.

**What changes:**
- New `discoverQueries()` function: runs component tree to register queries but skips stream rendering
- New `ssrRenderSinglePass()`: discovery → prefetch → single render
- Fallback: if discovery produces no queries, falls back to `ssrRenderToString()`

**Why this delivers value immediately:** Any page with `query()` calls benefits from single-pass rendering. No build step, no manifest, no entity access rules needed. The ~37% render time savings (POC 1) are available from day one.

**Acceptance criteria:**

```typescript
describe('Feature: Discovery-only single-pass SSR', () => {
  describe('Given a page with query() calls', () => {
    describe('When ssrRenderSinglePass() is called', () => {
      it('Then discoverQueries() captures all query keys', () => {});
      it('Then the app factory renders exactly once (not twice)', () => {});
      it('Then HTML output matches two-pass output for same data', () => {});
      it('Then queries that hit cache register 0 SSR queries in render ctx', () => {});
    });
  });

  describe('Given a page with partial cache (one query times out)', () => {
    describe('When the render pass executes', () => {
      it('Then cached queries render data, timed-out query shows loading', () => {});
      it('Then the timed-out query registers in ctx.queries for streaming', () => {});
      it('Then the stream emits a <template> chunk when the query resolves', () => {});
    });
  });

  describe('Given an SSR redirect during single-pass render', () => {
    describe('When ProtectedRoute redirects', () => {
      it('Then the result contains redirect.to', () => {});
    });
  });

  describe('Given discoverQueries() runs component functions', () => {
    describe('When components use ref() or domEffect()', () => {
      it('Then no side effects leak (DOM shim is inert)', () => {});
    });
  });
});
```

### Phase 2: Static Manifest Generation

Build-time analysis: route extraction, component graph traversal, query hint collection, entity access rule serialization, manifest output.

**Reuses existing infrastructure:**
- `ts.createSourceFile()` pattern from `manifest-generator.ts`
- Import resolution from `manifest-resolver.ts` (extension probing, tsconfig paths)
- Component detection from `component-analyzer.ts`

**What this enables:** Speculative prefetching (fire likely queries before discovery completes), entity access filtering (skip queries for entities the user can't access), and the diagnostic endpoint.

**Acceptance criteria:**

```typescript
describe('Feature: Prefetch manifest generation', () => {
  describe('Given a routes.ts with defineRoutes() using static object literals', () => {
    describe('When the manifest generator runs', () => {
      it('Then all static routes are extracted with correct patterns', () => {});
      it('Then nested routes produce joined patterns (/projects/:projectId/board)', () => {});
      it('Then component imports are resolved to source file paths', () => {});
      it('Then layout components are distinguished from page components', () => {});
    });
  });

  describe('Given a route component with query(api.entity.method(...)) calls', () => {
    describe('When the query extractor runs', () => {
      it('Then the manifest includes { entity, method } for each query', () => {});
      it('Then routeParams are detected from useParams() destructuring', () => {});
      it('Then queryParams from where clauses reference route params with $ prefix', () => {});
    });
  });

  describe('Given entity definitions with access rules', () => {
    describe('When the manifest is generated', () => {
      it('Then entityAccess contains serialized rules per entity per operation', () => {});
      it('Then rules.where, rules.authenticated, rules.entitlement are all serialized', () => {});
    });
  });

  describe('Given unanalyzable patterns', () => {
    describe('When routes use spread operators or queries are in dialogs', () => {
      it('Then those are excluded with entries in manifest.unanalyzable[]', () => {});
    });
  });
});
```

### Phase 3: Manifest-Guided Speculative Prefetching

Integrate the manifest with the single-pass pipeline: speculative prefetch fires before discovery, entity access filtering skips ineligible queries.

**Acceptance criteria:**

```typescript
describe('Feature: Manifest-guided speculative prefetching', () => {
  describe('Given manifest entry for /projects/:projectId with entity access rules', () => {
    describe('When an anonymous user requests the page', () => {
      it('Then only public-entity queries are speculatively prefetched', () => {});
      it('Then discovery-only confirms the query set', () => {});
    });
    describe('When an authenticated user requests the page', () => {
      it('Then all eligible entity queries are speculatively prefetched', () => {});
      it('Then speculative results are cache hits during discovery', () => {});
    });
  });

  describe('Given a route NOT in the manifest', () => {
    describe('When ssrRenderSinglePass() is called', () => {
      it('Then discovery-only still runs (no speculative prefetch)', () => {});
      it('Then the page still renders in single-pass', () => {});
    });
  });

  describe('Given manifest rules with where/role/fva types', () => {
    describe('When evaluateAccessRule() runs', () => {
      it('Then where rules return true (row-level filter, not access gate)', () => {});
      it('Then role rules check session.roles', () => {});
      it('Then fva rules are optimistic for authenticated users', () => {});
    });
  });

  describe('Given a query that times out during speculative prefetch', () => {
    describe('When the timeout fires', () => {
      it('Then the query is absent from cache', () => {});
      it('Then discovery-only still registers it for streaming', () => {});
    });
  });
});
```

### Phase 4: Developer Experience

- Build step integration (runs automatically with `vertz build`)
- **Dev server: manifest auto-rebuild on file change** (same file watcher as HMR, incremental single-file re-analysis, sub-millisecond for typical changes)
- **In-memory manifest** during dev (no disk I/O on hot path, atomic updates, no race conditions with concurrent SSR requests)
- Diagnostic: `GET /__vertz_prefetch_manifest` endpoint returns current manifest JSON with additional metadata (last rebuild time, rebuild count, processing time)
- Warnings for unanalyzable patterns in terminal output
- `VERTZ_DEBUG=prefetch` logging category for manifest rebuild events

**Critical requirement:** Dev/prod parity. Developers must see the same prefetch behavior during development as in production. The manifest must rebuild automatically when a file changes — no manual rebuild, no CLI command, no restart.

**Acceptance criteria:**

```typescript
describe('Feature: DX integration', () => {
  describe('Given vertz build runs', () => {
    describe('When the project has a routes.ts with defineRoutes()', () => {
      it('Then .vertz/prefetch-manifest.json is generated', () => {});
    });
  });

  describe('Given the dev server is running', () => {
    describe('When a component file with query() calls is saved', () => {
      it('Then the in-memory manifest is rebuilt incrementally (<10ms)', () => {});
      it('Then the next SSR request uses the updated manifest', () => {});
    });
    describe('When the router file is saved', () => {
      it('Then route extraction re-runs and manifest is fully rebuilt', () => {});
    });
    describe('When GET /__vertz_prefetch_manifest is called', () => {
      it('Then the current manifest JSON is returned with rebuild metadata', () => {});
    });
  });

  describe('Given concurrent SSR requests during manifest rebuild', () => {
    describe('When the manifest is being updated', () => {
      it('Then SSR requests use the previous manifest (no partial reads)', () => {});
    });
  });
});
```

### Production Manifest Lifecycle

- `vertz build` generates `.vertz/prefetch-manifest.json` alongside other build artifacts
- The manifest is loaded once at server startup and held in memory
- No runtime manifest updates in production (deterministic, reproducible)
- If the manifest file is missing (e.g., legacy project), the single-pass pipeline uses discovery-only without speculative prefetching (graceful degradation)

## Resolved Questions

1. **Entity-level access derivation replaces per-query `access`.** Access rules are already defined per-entity via `rules.*` descriptors. The prefetcher evaluates `entity.access[method]` against the session. No new API surface on `query()`.

2. **Cache keys come from discovery-only execution, not static reconstruction.** The manifest records query hints (entity, method, params) for speculative prefetching, but exact cache keys are generated by running real descriptor factories during discovery-only execution. This avoids the need to reproduce the `resolveVertzQL` pipeline statically.

3. **Nested layouts: the manifest distinguishes layout vs page components.** Layouts render for all child routes; pages render only for their specific pattern. When matching `/projects/abc123/board`, the prefetcher collects queries from `ProjectLayout` (layout) + `ProjectBoardPage` (page), NOT from `IssueListPage` (different page).

4. **Manifest rebuilds on file change during dev.** Hooks into the existing dev server file watcher. Incremental re-analysis of changed files. Full re-extraction when the router file changes. ~240ms for full rebuild, sub-millisecond for incremental. **Dev mode uses in-memory manifest** (no file I/O, atomic updates, no race conditions with concurrent SSR requests).

5. **Dialog queries are a documented, acceptable gap.** Queries inside `stack.open(Component)` are not statically reachable from the route graph. They execute on user interaction (not page load), so prefetching them would be wasteful anyway.

6. **Entity access rules are serialized into the manifest at build time.** The build step imports entity definitions from the app's server config, serializes the `rules.*` descriptors as JSON, and includes them in `manifest.entityAccess`. At request time, the SSR prefetcher reads serialized rules without importing `@vertz/server`.

7. **`evaluateAccessRule()` handles all rule types.** `where` → always eligible (row-level filter). `role` → checks session roles. `fva` → optimistic for authenticated users. `public`, `authenticated`, `entitlement`, `all`, `any` → standard evaluation. Unknown types → fail-secure (don't prefetch).

8. **Discovery-only execution is safe in SSR context.** Components run their full function body (DOM shim node creation, computed values), but the DOM shim is inert — no layout, scroll, focus, or network side effects. `ref()` and `domEffect()` produce no-ops in the shim. This is the same safety model as the current two-pass Pass 1.

9. **Concurrent manifest rebuild + SSR reads are safe in dev.** Dev mode holds the manifest in memory. Updates are atomic (replace the reference). Concurrent SSR reads see either the old or new manifest — never a partial state.

## Appendix: Three-Agent Review Consolidation (2026-03-22)

### Review summary

| Reviewer | Blockers | Should-Fix | Nits | Status |
|----------|----------|------------|------|--------|
| DX | 2 | 4 | 4 | All addressed in Rev 3 |
| Product/Scope | 2 | 4 | 3 | All addressed in Rev 3 |
| Technical | 2 | 6 | 3 | All addressed in Rev 3 |

### How blockers were resolved

| Finding | Resolution |
|---------|------------|
| Key reconstruction ignores `resolveVertzQL` (DX-B1, Tech-B1, Prod-SF2) | Rejected Option B (registry-based reconstruction). Discovery-only runs real descriptor factories → exact keys. Static manifest provides hints only. |
| `getEntityDefinition()` doesn't exist (DX-B2, Tech-B2, Prod-B1) | Build step serializes entity access rules into `manifest.entityAccess`. No `@vertz/server` import at request time. |
| `evaluateAccessRule()` incomplete (Tech-B2) | Added complete rule type matrix: `where` → true, `role` → check session, `fva` → optimistic, all standard types handled. |
| Discovery-only vs manifest value proposition (Prod-B2) | Clarified complementary roles: manifest = route mapping + entity access + speculative hints; discovery = exact keys + completeness. |

### How should-fixes were addressed

| Finding | Resolution |
|---------|------------|
| Phase ordering (Prod-SF4, Tech-NIT1) | Reordered: Phase 1 = discovery-only single-pass (immediate value), Phase 2+ = static manifest |
| Performance extrapolation (Prod-SF1, Tech-SF6) | Added caveats, two production scenarios showing ratio sensitivity to render vs query time |
| Manifest layout vs page disambiguation (Tech-SF3) | Updated manifest format with `layouts[]` and `page` structure |
| Race condition in dev manifest (Tech-SF4) | Specified in-memory manifest for dev mode with atomic reference swap |
| Streaming integration underspecified (Tech-SF5) | Updated `ssrRenderSinglePass()` to integrate with `renderToStream` Suspense boundaries |
| Discovery-only side effects (Tech-SF2) | Documented safety model: DOM shim is inert, same as current Pass 1 |
| `where` bracket-notation mismatch (Tech-SF1) | Subsumed by rejecting Option B — discovery-only handles this |
| Over-include strategy (DX-SF1) | Added `prefetch: false` escape hatch as a non-goal with rationale |
| Production manifest lifecycle (DX-SF4) | Added "Production Manifest Lifecycle" section |
| Diagnostic endpoint (DX-SF3) | Phase 4 now specifies rebuild metadata in diagnostic response |
| `evaluateAccessRule` property name (Tech-NIT2) | Fixed `rule.name` → `rule.entitlement` |
