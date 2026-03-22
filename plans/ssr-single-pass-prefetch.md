# SSR Single-Pass Prefetch via Static Query Analysis

> Eliminate the SSR discovery pass by extracting a per-route query dependency graph at build time, with auth-aware prefetching that skips queries the current user can't access.

## Status

**Draft** — Awaiting design review and sign-off.

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

A **build-time static analysis** step that:

1. Extracts the route → component mapping from `defineRoutes()` calls
2. Walks the import graph from each route's component to find all reachable `query()` calls
3. Annotates each query with its **auth requirement** (public, authenticated, specific entitlement)
4. Produces a **prefetch manifest** — a JSON artifact mapping route patterns to their query descriptors

At request time, the SSR pipeline:

1. Matches the URL to a route in the manifest
2. Reads the JWT to determine auth state (`AccessSet`)
3. Filters queries: skip those whose auth requirement isn't met by the current user
4. Fires all eligible queries in parallel
5. Renders the app **once** with pre-populated cache

## API Surface

### Route Definitions (No Change — Convention-Based Extraction)

Routes remain runtime objects. The build step extracts the mapping via **AST analysis** of `defineRoutes()` calls:

```tsx
// src/routes.ts — existing pattern, no changes needed
import { defineRoutes } from '@vertz/ui';

export const routes = defineRoutes({
  '/': { component: () => HomePage() },
  '/tasks': { component: () => TaskListPage() },
  '/tasks/:id': { component: () => TaskDetailPage() },
  '/settings': {
    component: () => SettingsLayout(),
    children: {
      '/profile': { component: () => ProfilePage() },
      '/billing': { component: () => BillingPage() },
    },
  },
});
```

The build step statically resolves `HomePage`, `TaskListPage`, etc. to their source files via import resolution.

### Query Auth Annotations

Queries that require auth use a new `access` option on the query descriptor:

```tsx
// TaskListPage.tsx
import { query } from '@vertz/ui';
import { rules } from '@vertz/auth/rules';

function TaskListPage() {
  // Public query — always prefetched
  const stats = query(() => api.tasks.stats(), {
    key: 'task-stats',
  });

  // Authenticated query — only prefetched when user is logged in
  const tasks = query(() => api.tasks.list(), {
    key: 'task-list',
    access: rules.authenticated(),
  });

  // Entitlement-gated query — only prefetched when user has entitlement
  const analytics = query(() => api.tasks.analytics(), {
    key: 'task-analytics',
    access: rules.entitlement('task:analytics'),
  });

  return (
    <div>
      <PublicStats data={stats.data} />
      {tasks.data && <TaskTable tasks={tasks.data} />}
      {analytics.data && <AnalyticsPanel data={analytics.data} />}
    </div>
  );
}
```

When `access` is omitted, the query is treated as **public** (always prefetched) for backward compatibility.

### Prefetch Manifest (Build Output)

The build step produces a `.vertz/prefetch-manifest.json`:

```json
{
  "routes": {
    "/": {
      "queries": [
        { "key": "homepage-featured", "access": { "type": "public" } }
      ]
    },
    "/tasks": {
      "queries": [
        { "key": "task-stats", "access": { "type": "public" } },
        { "key": "task-list", "access": { "type": "authenticated" } },
        { "key": "task-analytics", "access": { "type": "entitlement", "name": "task:analytics" } }
      ],
      "components": ["src/pages/task-list-page.tsx"]
    },
    "/tasks/:id": {
      "queries": [
        { "key": "task-detail", "access": { "type": "authenticated" }, "params": ["id"] }
      ],
      "components": ["src/pages/task-detail-page.tsx"]
    }
  },
  "generatedAt": "2026-03-22T10:00:00Z"
}
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
    accessSet?: AccessSet;
  },
): Promise<SSRResult> {
  const { manifest, session, accessSet } = options;

  // 1. Match URL to route pattern
  const matched = matchRoute(manifest.routes, url);
  if (!matched) {
    // Fallback to two-pass for unknown routes
    return ssrRenderToString(module, url, options);
  }

  // 2. Filter queries by auth state
  const eligible = matched.queries.filter((q) =>
    isEligible(q.access, session, accessSet)
  );

  // 3. Substitute route params into query keys
  const resolved = eligible.map((q) => ({
    ...q,
    key: substituteParams(q.key, matched.params),
  }));

  // 4. Fire all queries in parallel
  const cache = await prefetchAll(resolved, options.queryTimeout);

  // 5. Single render pass with pre-populated cache
  const ctx = createRequestContext({ cache, session });
  const result = renderToString(module, url, ctx);

  return result;
}
```

### Auth Eligibility Check

```tsx
function isEligible(
  access: SerializedAccessRule,
  session: SSRAuth,
  accessSet?: AccessSet,
): boolean {
  switch (access.type) {
    case 'public':
      return true;

    case 'authenticated':
      return session.status === 'authenticated';

    case 'entitlement':
      // AccessSet is already in the JWT — pre-computed, no DB lookup
      if (!accessSet) return false;
      const check = accessSet.entitlements[access.name];
      return check?.allowed === true;

    case 'role':
      return session.status === 'authenticated'
        && access.roles.some((r) => r === session.user.role);

    case 'all':
      return access.rules.every((r) => isEligible(r, session, accessSet));

    case 'any':
      return access.rules.some((r) => isEligible(r, session, accessSet));

    default:
      return false; // Unknown rule type — don't prefetch
  }
}
```

### E2E Acceptance Test

```tsx
describe('Feature: SSR single-pass prefetch', () => {
  describe('Given a route with public and authenticated queries', () => {
    describe('When an anonymous user requests the page', () => {
      it('Then only public queries are prefetched', () => {
        const manifest = {
          routes: {
            '/tasks': {
              queries: [
                { key: 'task-stats', access: { type: 'public' } },
                { key: 'task-list', access: { type: 'authenticated' } },
              ],
            },
          },
        };
        const session = { status: 'unauthenticated' };

        const eligible = filterEligible(manifest.routes['/tasks'].queries, session);
        expect(eligible).toEqual([{ key: 'task-stats', access: { type: 'public' } }]);
      });

      it('Then the page renders in a single pass with only public data', async () => {
        const result = await ssrRenderSinglePass(module, '/tasks', {
          manifest, session: { status: 'unauthenticated' },
        });
        expect(result.html).toContain('task-stats'); // public data present
        expect(result.html).not.toContain('task-list-item'); // auth data absent
        expect(result.renderPassCount).toBe(1);
      });
    });

    describe('When an authenticated user requests the page', () => {
      it('Then both public and authenticated queries are prefetched', () => {
        const session = { status: 'authenticated', user: { id: 'u1' } };
        const eligible = filterEligible(manifest.routes['/tasks'].queries, session);
        expect(eligible).toHaveLength(2);
      });

      it('Then the page renders in a single pass with all data', async () => {
        const result = await ssrRenderSinglePass(module, '/tasks', {
          manifest, session: authenticatedSession,
        });
        expect(result.html).toContain('task-stats');
        expect(result.html).toContain('task-list-item');
        expect(result.renderPassCount).toBe(1);
      });
    });
  });

  describe('Given a route with entitlement-gated queries', () => {
    describe('When a user without the entitlement requests the page', () => {
      it('Then the gated query is skipped', () => {
        const accessSet = { entitlements: {}, flags: {}, plan: 'free', computedAt: '' };
        const eligible = filterEligible(
          [{ key: 'analytics', access: { type: 'entitlement', name: 'task:analytics' } }],
          authenticatedSession, accessSet,
        );
        expect(eligible).toEqual([]);
      });
    });

    describe('When a user WITH the entitlement requests the page', () => {
      it('Then the gated query is prefetched', () => {
        const accessSet = {
          entitlements: { 'task:analytics': { allowed: true, reasons: [] } },
          flags: {}, plan: 'pro', computedAt: '',
        };
        const eligible = filterEligible(
          [{ key: 'analytics', access: { type: 'entitlement', name: 'task:analytics' } }],
          authenticatedSession, accessSet,
        );
        expect(eligible).toHaveLength(1);
      });
    });
  });

  describe('Given a route with parameterized queries', () => {
    describe('When /tasks/abc123 is requested', () => {
      it('Then route params are substituted into query keys', () => {
        const matched = matchRoute(manifest.routes, '/tasks/abc123');
        const resolved = substituteParams(
          matched.queries[0].key, // 'task-detail:$id'
          matched.params,         // { id: 'abc123' }
        );
        expect(resolved).toBe('task-detail:abc123');
      });
    });
  });

  describe('Given a route NOT in the manifest', () => {
    describe('When the route is requested', () => {
      it('Then falls back to two-pass rendering', async () => {
        const result = await ssrRenderSinglePass(module, '/unknown-route', {
          manifest: { routes: {} }, session: anonymousSession,
        });
        expect(result.renderPassCount).toBe(2); // fallback
      });
    });
  });

  // @ts-expect-error — access option must be a valid rule descriptor
  query(() => fetch('/api'), { key: 'test', access: 'not-a-rule' });

  // @ts-expect-error — access option doesn't accept callback functions
  query(() => fetch('/api'), { key: 'test', access: (ctx) => ctx.authenticated() });
});
```

## Manifesto Alignment

### Principle: Zero Wasted Work
The core motivation. Today we render twice; tomorrow we render once. Queries the user can't access are skipped entirely — no request, no parse, no cache entry.

### Principle: Compiler Does the Work
The static analysis extends the existing compiler infrastructure (field selection analyzer, reactivity manifests). Developers write normal `query()` calls; the build step extracts the dependency graph.

### Principle: Declarative Over Imperative
Auth annotations on queries use the same `rules.*` descriptors already used for entity access. No new API surface to learn.

### Principle: Secure by Default
Fail-secure: unknown rule types → don't prefetch (server still handles auth at the API layer). Over-prefetching only occurs for public/cheap data; gated data is never fetched without entitlement verification.

## Non-Goals

1. **Cross-query cascading prefetch** — If query B depends on query A's result, B cannot be prefetched statically. This design handles independent queries only. Cascading queries fall back to client-side fetching after the initial render.

2. **Full elimination of two-pass rendering** — Routes not in the manifest (dynamic routes, lazy-loaded routes not yet analyzed) fall back to the existing two-pass pipeline. The manifest is an optimization, not a requirement.

3. **Build-time type checking of query keys** — The manifest records query keys as strings. Validating that keys match actual API endpoints is a separate concern.

4. **Client-side prefetch** — This design covers SSR only. Client-side route prefetching (on hover/link visibility) is a separate feature.

5. **Automatic access inference from entity definitions** — The developer explicitly annotates queries with `access`. We don't automatically infer from the backend entity's access rules (which may differ from the UI's prefetch requirements).

## Unknowns

### 1. Route extraction reliability

**Question:** Can we reliably extract route → component mappings from `defineRoutes()` via AST analysis?

**Concern:** `defineRoutes()` accepts runtime objects. If routes are constructed dynamically (spread operators, conditional routes, imported route fragments), AST extraction may miss them.

**Resolution approach:** Start with a convention: the `defineRoutes()` call must be a single static object literal in a dedicated `routes.ts` file. Routes that don't follow this convention are excluded from the manifest. The build step logs warnings for unanalyzable patterns. Lazy routes (`component: () => import('./page')`) are supported via import resolution.

### 2. Query key derivation

**Question:** How do we extract query keys when they depend on expressions?

**Concern:** `query(() => api.tasks.list(), { key: 'task-list' })` has a static key. But `query(() => api.tasks.get(id), { key: \`task-\${id}\` })` has a dynamic key that depends on a route param.

**Resolution approach:** The manifest supports **param slots**: `{ key: "task-$id", params: ["id"] }`. The build step detects template literals referencing `useParams()` destructured variables and records which params feed into the key. At request time, the server substitutes actual param values.

### 3. Conditional query extraction

**Question:** If `query()` is inside an `if` block, should the manifest include it?

**Resolution approach:** **Over-include.** The manifest includes all reachable `query()` calls in the component graph, regardless of control flow. The `access` annotation handles the auth gating. For non-auth conditionals (e.g., feature flags), the query fires but the result is simply unused if the branch doesn't render — cache population is cheap, the SSR render is the expensive part.

### 4. Lazy route components

**Question:** How does the manifest handle `component: () => import('./page')`?

**Resolution approach:** The build step resolves dynamic imports to their target files and analyzes them normally. The manifest records the resolved component path. At request time, the SSR pipeline imports the lazy component as part of prefetching (parallel with query fetching).

## Type Flow Map

```
rules.authenticated()                    → SerializedAccessRule { type: 'authenticated' }
  ↓ (build-time serialization)
PrefetchManifest.routes[path].queries[n].access   → { type: 'authenticated' }
  ↓ (request-time matching)
isEligible(access, session, accessSet)   → boolean
  ↓ (prefetch decision)
prefetchAll(eligibleQueries)             → Map<string, unknown>  (cache)
  ↓ (injected into render context)
ssrRenderSinglePass(module, url, { cache })  → SSRResult { html, css, renderPassCount: 1 }

QueryOptions<T>.access                   → AccessRule (typed, same as entity access)
  ↓ (compiler field-selection analyzer sees it)
FieldSelectionAnalyzer.queryFieldSelection → includes access metadata
  ↓ (manifest generator aggregates per-route)
ManifestGenerator.generateManifest()     → PrefetchManifest JSON
```

## POC Results

*No POC conducted yet. The following should be validated:*

1. **Route extraction accuracy** — Can we extract 90%+ of routes from a real app's `defineRoutes()` call via AST?
2. **Build-time performance** — Does the cross-file import graph traversal add meaningful build time?
3. **Single-pass correctness** — Does the app render identically with pre-populated cache vs. two-pass?

## Performance Model

### Current (Two-Pass)

```
Total = render₁ + await_queries + render₂
      ≈ 2 × render_time + max(query_times)
```

### Proposed (Single-Pass)

```
Total = resolve_manifest + prefetch + render₁
      ≈ O(1) + max(query_times) + render_time
```

**Savings:** One full render pass eliminated. For a page with 50ms render time and 100ms data fetch:
- Two-pass: 50 + 100 + 50 = **200ms**
- Single-pass: 0 + 100 + 50 = **150ms** (25% faster)

For heavier pages (200ms render, 150ms fetch):
- Two-pass: 200 + 150 + 200 = **550ms**
- Single-pass: 0 + 150 + 200 = **350ms** (36% faster)

The savings scale with render complexity — the heavier the component tree, the more we save by not rendering it twice.

### Additional win: auth-aware skipping

Anonymous user hitting a page where 3/5 queries require auth:
- Two-pass: renders everything, fires all 5 queries (2 fail with 401), re-renders
- Single-pass: fires only 2 eligible queries, renders once with correct data

## Implementation Phases

### Phase 1: Manifest Generation

Build-time analysis: route extraction, component graph traversal, query collection, manifest output.

**Acceptance criteria:**
- `defineRoutes()` with static object literals → correct manifest
- Lazy route components resolved via dynamic import
- `query()` calls with `key` and `access` options extracted
- Template literal keys with `useParams()` vars → param slots
- Warns on unanalyzable patterns (dynamic routes, computed keys)

### Phase 2: Auth-Aware Prefetcher

Runtime prefetch engine: manifest lookup, auth filtering, parallel query execution, cache population.

**Acceptance criteria:**
- Anonymous user → only public queries prefetched
- Authenticated user → public + authenticated queries prefetched
- Entitlement-gated queries → checked against AccessSet from JWT
- Route params substituted into query keys
- Prefetch timeout per-query with graceful degradation

### Phase 3: Single-Pass SSR Pipeline

New `ssrRenderSinglePass()` alongside existing `ssrRenderToString()`. Fallback to two-pass for unmanifested routes.

**Acceptance criteria:**
- Manifested route → single render pass, `renderPassCount === 1`
- Unmanifested route → falls back to two-pass, `renderPassCount === 2`
- HTML output identical between single-pass and two-pass for same data
- Performance improvement measurable in benchmarks

### Phase 4: Developer Experience

- Build step integration (runs automatically with `vertz build`)
- Dev server: manifest auto-regeneration on route/query changes
- Diagnostic: `/__vertz_prefetch_manifest` endpoint in dev mode
- Warnings for queries without `access` annotation (suggest adding one)

## Open Questions for Review

1. **Should `access` on `query()` be required or optional?** Optional (default: public) is backward-compatible but means unannotated queries are always prefetched. Required forces developers to think about auth for every query.

2. **Should the manifest include the query's fetch function reference?** Currently the manifest only has the key. The prefetcher needs to know *how* to fetch. Options: (a) import the page module and extract query factories, (b) map keys to API SDK methods via convention, (c) queries self-register their factories at import time.

3. **Nested layouts:** A route like `/settings/billing` renders `SettingsLayout` + `BillingPage`. Both may have queries. The manifest should aggregate queries from all components in the matched chain — is the import graph traversal sufficient, or do we need explicit layout→child relationships?
