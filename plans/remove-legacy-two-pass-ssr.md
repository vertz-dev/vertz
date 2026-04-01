# Remove Legacy Two-Pass SSR

**Status:** In Review
**Author:** Vinicius Dacal
**Date:** 2026-04-01

## Summary

Remove the legacy two-pass SSR functions (`ssrRenderToString`, `ssrDiscoverQueries`) from `@vertz/ui-server`. Move `ssrStreamNavQueries` from the two-pass module to the single-pass module (it only uses discovery, not the two-pass render). The single-pass SSR (`ssrRenderSinglePass`) and AOT pipeline (`ssrRenderAot`) become the sole rendering paths.

## API Surface

### Before (removed)

```ts
// These exports are removed from @vertz/ui-server
import { ssrRenderToString, ssrDiscoverQueries } from '@vertz/ui-server';
import { ssrRenderToString, ssrDiscoverQueries } from '@vertz/ui-server/ssr';
```

### After

```ts
// Single-pass is the entry point for all SSR
import { ssrRenderSinglePass } from '@vertz/ui-server';

// Production SSR entry point
import { ssrRenderSinglePass } from '@vertz/ui-server/ssr';

// Pre-rendering uses single-pass
import { prerenderRoutes, discoverRoutes } from '@vertz/ui-server/ssr';

// Nav pre-fetch (moved from ssr-render to ssr-single-pass, new public export)
import { ssrStreamNavQueries } from '@vertz/ui-server';
import { ssrStreamNavQueries } from '@vertz/ui-server/ssr';
```

### Prerender changes

```ts
// discoverRoutes() and prerenderRoutes() switch from ssrRenderToString
// to ssrRenderSinglePass internally. No external API change.
```

## Manifesto Alignment

- **Principle 1 (LLM-first):** Fewer code paths = less confusion for agents. Two rendering modes where one is strictly better adds cognitive overhead.
- **Principle 3 (Zero-config):** Single-pass is the default — no need to choose between render strategies.
- **Principle 6 (Performance by default):** Single-pass is faster. Removing the two-pass eliminates a slower fallback that no one should use.

### Tradeoffs

- **Breaking change for `ssrRenderToString` / `ssrDiscoverQueries` consumers:** Pre-v1 policy allows this. No external users.
- **`prefetch: false` option removed:** The escape hatch to fall back to two-pass is deleted. To skip manifest-driven prefetching: `ssrRenderSinglePass(module, url, { manifest: { routePatterns: [] } })`.

### Rejected alternatives

- **Keep two-pass as internal-only (unexported):** Still dead code, still maintenance burden, still confusing to agents reading the codebase.
- **Deprecation period:** Pre-v1, no external users. Clean removal is better.

## Non-Goals

- Changing single-pass SSR behavior — this is purely a removal.
- Changing AOT pipeline behavior.
- Performance optimization of single-pass — out of scope.
- Changing the progressive streaming path.

## Unknowns

### Route discovery via single-pass (resolved)

`discoverRoutes()` currently calls `ssrRenderToString(module, '/')` and reads `result.discoveredRoutes`. In the two-pass pipeline, routes are discovered during Pass 1 (discovery context) but `discoveredRoutes` is read from Pass 2's render context (where `createRouter()` re-executes and registers routes).

In `ssrRenderSinglePass`, the discovery runs in one context and the render runs in a separate context. `discoveredRoutes` is populated on the **render** context (line 193 of `ssr-single-pass.ts`), which is what's returned. This works correctly — `createRouter()` registers routes during the render pass, and the render context's `discoveredRoutes` is included in the result.

**Verification:** Phase 2 includes an explicit test that `discoverRoutes()` works via single-pass and returns the expected route patterns.

## Type Flow Map

No new generics introduced. The removed types (`SSRDiscoverResult`) are unused after deletion. Retained types (`SSRRenderResult`, `SSRModule`) continue to flow from `ssr-render.ts` (which becomes a shared utilities file).

## Dependency Analysis

### `ssr-render.ts` — What stays vs what goes

**Stays (shared utilities used by single-pass, AOT, handlers):**
- `compileThemeCached()` — used by `ssr-handler-shared.ts`, `render-to-html.ts`, `ssr-single-pass.ts`
- `createRequestContext()` — used by `ssr-single-pass.ts`, `ssr-aot-pipeline.ts`, `render-to-html.ts`
- `SSRModule` type — used everywhere
- `SSRRenderResult` type — used by `ssr-single-pass.ts`, `ssr-aot-pipeline.ts`, `prerender.ts`
- `ensureDomShim()` — used by `ssr-single-pass.ts` (has its own copy, dedup opportunity)
- `resolveAppFactory()` — used by `ssr-single-pass.ts` (has its own copy, dedup opportunity)
- `collectCSS()` — used by `ssr-single-pass.ts` (has its own copy, dedup opportunity)

**Goes (two-pass only):**
- `ssrRenderToString()` — the two-pass render function
- `ssrDiscoverQueries()` — discovery-only (pass 1, no render)
- `ssrStreamNavQueries()` — SSE streaming of discovery results

### `ssrStreamNavQueries` — Special case

This function uses only Pass 1 (discovery, no render). It's used by:
- `ssr-handler.ts` (nav pre-fetch)
- `node-handler.ts` (nav pre-fetch)
- `bun-dev-server.ts` (nav pre-fetch)

It doesn't need the two-pass render. It should be **moved** to `ssr-single-pass.ts` since it uses the same discovery mechanism.

**Important:** `ssrStreamNavQueries` cannot directly reuse `runDiscoveryPhase()`. The existing `runDiscoveryPhase` batch-resolves all queries (via `Promise.allSettled`) before returning. `ssrStreamNavQueries` needs to stream individual SSE events as each query settles — fundamentally different from batch resolution. The move strategy is:

1. Extract a lower-level `runQueryDiscovery()` helper that only runs Pass 1 (app factory execution + lazy route resolution) and returns the raw query handles without awaiting them.
2. `runDiscoveryPhase()` calls `runQueryDiscovery()` then batch-resolves.
3. `ssrStreamNavQueries()` calls `runQueryDiscovery()` then streams per-query SSE events.

This avoids duplicating the discovery logic while preserving the streaming behavior.

### Files requiring changes

| File | Change |
|------|--------|
| `ssr-render.ts` | Remove `ssrRenderToString`, `ssrDiscoverQueries`, `ssrStreamNavQueries`. Keep shared utilities. Consider renaming to `ssr-shared.ts`. |
| `ssr-single-pass.ts` | Remove `prefetch: false` fallback (line 89-90). Remove `ssrRenderToString` import. Absorb `ssrStreamNavQueries` (rewritten using `runDiscoveryPhase`). Deduplicate `ensureDomShim`, `resolveAppFactory`, `collectCSS` (already has copies). |
| `index.ts` | Remove `ssrRenderToString`, `ssrDiscoverQueries` exports. Add `ssrStreamNavQueries` export from new location. Keep type exports (`SSRModule`, `SSRRenderResult`). Remove `SSRDiscoverResult` type export. |
| `ssr/index.ts` | Remove two-pass exports, add `ssrRenderSinglePass` and `ssrStreamNavQueries` exports (new public exports for production sub-path). |
| `prerender.ts` | Switch from `ssrRenderToString` to `ssrRenderSinglePass`. |
| `ssr-handler.ts` | Import `ssrStreamNavQueries` from `ssr-single-pass` instead of `ssr-render`. |
| `node-handler.ts` | Same. |
| `bun-dev-server.ts` | Same. |
| `ssr-handler-shared.ts` | Import `compileThemeCached` from `ssr-shared` (renamed). |
| `render-to-html.ts` | Import from `ssr-shared`. |
| `ssr-aot-pipeline.ts` | Import from `ssr-shared`. |
| `landing/benchmark-ssr-direct.ts` | Remove two-pass benchmark. Only benchmark single-pass variants. |
| `examples/task-manager/src/__tests__/ssr.test.ts` | Switch to `ssrRenderSinglePass`. |

### Test files

| Test file | Change |
|-----------|--------|
| `ssr-render.test.ts` | Delete or significantly rework. Tests for `ssrRenderToString` are deleted. Tests for `ssrStreamNavQueries` move to a new or existing test file. Tests for shared utilities (theme caching, context creation) stay. |
| `ssr-css-treeshake.test.ts` | Switch from `ssrRenderToString` to `ssrRenderSinglePass`. |
| `ssr-single-pass.test.ts` | Remove two-pass comparison tests (lines that call `ssrRenderToString`). |
| `ssr-aot-poc.test.ts` | Switch from `ssrRenderToString` to `ssrRenderSinglePass`. Update `createRequestContext` import. |
| `ssr-handler.test.ts` | Update `SSRModule` type import from `ssr-shared`. |
| `ssr-aot-pipeline.test.ts` | Update `SSRModule` type import from `ssr-shared`. |
| `aot-e2e-pipeline.test.ts` | Update `SSRModule` type import from `ssr-shared`. |
| `node-handler.test.ts` | Update `SSRModule` type import from `ssr-shared`. |
| `query-ssr-threshold.test.ts` | Update `createRequestContext` import from `ssr-shared`. |

### Documentation files

| File | Change |
|------|--------|
| `packages/ui-server/ARCHITECTURE.md` | Remove two-pass references, update to single-pass only. |
| `.claude/rules/dev-server-debugging.md` | Remove two-pass references. |
| `docs/guides/bun-dev-server.md` | Update code examples from `ssrRenderToString` to `ssrRenderSinglePass`. |

### Downstream impacts

- **Benchmarks repo** (`vertz-benchmarks`): Vendors `dist/` from this monorepo. When the vendored dist is next updated, it will need to account for the removed exports. Track as a follow-up task after merge.

## E2E Acceptance Test

```typescript
describe('Feature: Legacy two-pass SSR removed', () => {
  describe('Given @vertz/ui-server exports', () => {
    it('Then ssrRenderToString is not exported', () => {
      // @ts-expect-error — ssrRenderToString no longer exists
      const _: typeof import('@vertz/ui-server')['ssrRenderToString'] = undefined;
    });

    it('Then ssrDiscoverQueries is not exported', () => {
      // @ts-expect-error — ssrDiscoverQueries no longer exists
      const _: typeof import('@vertz/ui-server')['ssrDiscoverQueries'] = undefined;
    });

    it('Then ssrRenderSinglePass is still exported', async () => {
      const { ssrRenderSinglePass } = await import('@vertz/ui-server');
      expect(typeof ssrRenderSinglePass).toBe('function');
    });

    it('Then ssrStreamNavQueries is still exported', async () => {
      const { ssrStreamNavQueries } = await import('@vertz/ui-server');
      expect(typeof ssrStreamNavQueries).toBe('function');
    });
  });

  describe('Given ssrRenderSinglePass called without prefetch option', () => {
    it('Then it renders successfully (no two-pass fallback needed)', async () => {
      const result = await ssrRenderSinglePass(module, '/');
      expect(result.html).toContain('app-root');
    });
  });

  describe('Given prerender pipeline', () => {
    it('Then discoverRoutes works via single-pass', async () => {
      const routes = await discoverRoutes(module);
      expect(routes).toContain('/');
    });

    it('Then prerenderRoutes works via single-pass', async () => {
      const results = await prerenderRoutes(module, template, { routes: ['/'] });
      expect(results[0].html).toContain('app-root');
    });
  });
});
```

## Implementation Plan

### Phase 1: Rename `ssr-render.ts` → `ssr-shared.ts`, move `ssrStreamNavQueries`

**Goal:** Rename `ssr-render.ts` to `ssr-shared.ts` (keeping all current contents). Extract a `runQueryDiscovery()` helper from the discovery logic. Move `ssrStreamNavQueries` to `ssr-single-pass.ts` using the new helper. Update all import paths throughout the codebase to point to `ssr-shared`.

**Strategy:** Rename-then-prune (Phase 1 renames the file and moves `ssrStreamNavQueries`; Phase 2 deletes the two-pass functions from the renamed file).

**Acceptance criteria:**
```typescript
describe('Phase 1: Shared utilities extraction + ssrStreamNavQueries move', () => {
  describe('Given ssr-shared.ts (renamed from ssr-render.ts)', () => {
    it('Then compileThemeCached is importable', () => {});
    it('Then createRequestContext is importable', () => {});
    it('Then SSRModule type is importable', () => {});
    it('Then SSRRenderResult type is importable', () => {});
  });

  describe('Given runQueryDiscovery in ssr-single-pass.ts', () => {
    describe('When called with a module and URL', () => {
      it('Then executes app factory to capture query registrations', () => {});
      it('Then resolves lazy route components', () => {});
      it('Then returns raw query handles (not awaited)', () => {});
    });
  });

  describe('Given ssrStreamNavQueries moved to ssr-single-pass.ts', () => {
    describe('When called with a module and URL', () => {
      it('Then returns a ReadableStream of SSE events', () => {});
      it('Then emits individual data events as each query resolves', () => {});
      it('Then emits done event when all queries settle', () => {});
      it('Then silently drops timed-out queries (no event)', () => {});
    });
  });

  describe('Given existing imports', () => {
    it('Then all consumers compile without errors (typecheck passes)', () => {});
  });
});
```

### Phase 2: Remove two-pass functions and update consumers

**Goal:** Delete `ssrRenderToString`, `ssrDiscoverQueries` from `ssr-render.ts` (now `ssr-shared.ts`). Update `prerender.ts` to use `ssrRenderSinglePass`. Remove `prefetch: false` fallback. Update all exports.

**Acceptance criteria:**
```typescript
describe('Phase 2: Two-pass removal', () => {
  describe('Given ssr-shared.ts (formerly ssr-render.ts)', () => {
    it('Then ssrRenderToString does not exist', () => {});
    it('Then ssrDiscoverQueries does not exist', () => {});
  });

  describe('Given SSRSinglePassOptions', () => {
    it('Then prefetch option does not exist', () => {});
  });

  describe('Given prerender.ts using ssrRenderSinglePass', () => {
    describe('When discoverRoutes is called', () => {
      it('Then discovers routes via single-pass', () => {});
    });
    describe('When prerenderRoutes is called', () => {
      it('Then renders routes via single-pass', () => {});
    });
  });

  describe('Given @vertz/ui-server exports', () => {
    it('Then ssrRenderToString is not exported', () => {});
    it('Then ssrDiscoverQueries is not exported', () => {});
    it('Then SSRDiscoverResult type is not exported', () => {});
    it('Then ssrRenderSinglePass IS exported', () => {});
    it('Then ssrStreamNavQueries IS exported', () => {});
  });

  describe('Given @vertz/ui-server/ssr exports', () => {
    it('Then ssrRenderToString is not exported', () => {});
    it('Then ssrDiscoverQueries is not exported', () => {});
    it('Then ssrRenderSinglePass IS exported', () => {});
  });
});
```

### Phase 3: Update tests, benchmark, and examples

**Goal:** Delete/update test files that reference two-pass. Update benchmark. Update example SSR test.

**Acceptance criteria:**
```typescript
describe('Phase 3: Test and example cleanup', () => {
  describe('Given ssr-render.test.ts', () => {
    it('Then no test references ssrRenderToString', () => {});
    it('Then shared utility tests (theme caching, context) still pass', () => {});
  });

  describe('Given ssr-css-treeshake.test.ts', () => {
    it('Then all tests use ssrRenderSinglePass', () => {});
    it('Then all CSS filtering tests still pass', () => {});
  });

  describe('Given ssr-single-pass.test.ts', () => {
    it('Then no two-pass comparison tests exist', () => {});
    it('Then ssrStreamNavQueries tests are present', () => {});
  });

  describe('Given task-manager example', () => {
    it('Then SSR test uses ssrRenderSinglePass', () => {});
    it('Then all SSR tests pass', () => {});
  });

  describe('Given benchmark-ssr-direct.ts', () => {
    it('Then only benchmarks single-pass variants', () => {});
  });

  describe('Given full quality gates', () => {
    it('Then bun test passes', () => {});
    it('Then bun run typecheck passes', () => {});
    it('Then bun run lint passes', () => {});
  });
});
```

### Phase 4: Documentation and cleanup

**Goal:** Update architecture docs, dev-server debugging guide, user-facing docs. Add changeset.

**Acceptance criteria:**
- `packages/ui-server/ARCHITECTURE.md` references single-pass only
- `.claude/rules/dev-server-debugging.md` updated to remove two-pass references
- `docs/guides/bun-dev-server.md` updated to use `ssrRenderSinglePass` in examples
- Changeset added for `@vertz/ui-server`
