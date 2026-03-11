# Reduce Unused JS in Client Bundles

**Issue:** [#1143](https://github.com/vertz-dev/vertz/issues/1143)
**Status:** Draft

## Problem

Lighthouse reports **30.5 KiB unused JavaScript** in the landing page client entry bundle (43% of 70.6 KiB transfer). The framework's client exports aren't being tree-shaken effectively.

### Root Cause Analysis

**1. `@vertz/ui-primitives` single-file bundle (primary cause)**

The package builds to a single `dist/index.js` (119 KB raw). It contains 30+ headless components (Accordion, Dialog, Select, Tooltip, etc.), but the landing page only imports `Tooltip`. Bun's bundler cannot reliably tree-shake individual component functions from a pre-bundled single file — initialization code, floating-ui setup, and JSX factory calls create implicit side effects that prevent elimination.

Import chain: `entry-client.ts` → `app.tsx` → `HomePage` → `SchemaFlow`/`GlueCode` → `TokenLines` → `Tooltip` from `@vertz/ui-primitives`.

**2. Eager route imports (secondary cause — deferred)**

`app.tsx` imports `ManifestoPage` at the top level. On the `/` route, the ManifestoPage module is loaded but never executed. The router supports lazy loading via `Promise<{ default: () => Node }>`, but **lazy routes do not SSR** — `RouterView` handles promises via `.then()` which doesn't execute before SSR serializes the DOM tree. Since ManifestoPage is content-heavy and benefits from SSR for SEO, converting it to a lazy route would be a regression. This is deferred until SSR Suspense supports async route resolution.

**3. Missing `sideEffects` in some packages (not applicable)**

13 of 28 packages lack a `sideEffects` field. However, all 13 are server-side, build-time, or CLI packages — none appear in client bundles. The client-facing packages (`@vertz/ui`, `@vertz/ui-primitives`, `@vertz/core`, `@vertz/schema`, `@vertz/fetch`, `@vertz/icons`, `@vertz/theme-shadcn`) already have correct `sideEffects` declarations.

## API Surface

### `@vertz/ui-primitives` — no consumer-facing changes

Consumer code stays the same:

```ts
import { Tooltip } from '@vertz/ui-primitives';
```

The multi-entry build ensures the barrel re-exports resolve to separate chunk files. With `sideEffects: false`, Bun follows the re-export chain and only bundles the Tooltip chunk + its floating-ui dependency.

## Manifesto Alignment

- **Principle: Production-Ready by Default** — Bundle optimization should work out-of-the-box. A framework that ships 43% unused JS to users violates this principle.
- **Principle: Explicit over Implicit** — Multi-entry builds make the package's split structure explicit rather than relying on bundler heuristics to tree-shake a monolithic file.

### Tradeoffs

- Multi-entry build produces more files in `dist/` — acceptable for better tree-shaking.
- Build time for `@vertz/ui-primitives` increases slightly (more entry points) — acceptable given the package is rebuilt infrequently.

### Rejected Alternatives

- **Subpath exports (`@vertz/ui-primitives/tooltip`)** — Would guarantee tree-shaking but forces import path changes on all consumers. Falls back to this if the multi-entry + barrel approach doesn't tree-shake.
- **Manual chunk splitting in landing build script** — Would only fix the landing page, not all consumers of `@vertz/ui-primitives`.
- **Dynamic `import()` for Tooltip** — Tooltip is used on the home page (via `TokenLines`), so lazy-loading it would cause layout shift.
- **Lazy route loading for ManifestoPage** — Lazy routes don't SSR (RouterView handles promises via `.then()`, which doesn't execute before SSR serialization). ManifestoPage is content-heavy and benefits from SSR. Deferred until SSR Suspense supports async routes.
- **Adding `sideEffects: false` to build-time packages** — `@vertz/ui-compiler` and `@vertz/ui-server` don't appear in client bundles. Adding the field would be harmless but pointless and potentially misleading (both have genuine module-level side effects on the server).

## Non-Goals

- Micro-optimizing `@vertz/ui` bundle — it already uses multi-entry build with shared chunks.
- Route-level code splitting — lazy routes don't SSR. Deferred until SSR Suspense.
- Changing consumer import paths (`@vertz/ui-primitives` barrel import stays unchanged).
- Server-side / build-time package `sideEffects` — they don't appear in client bundles.

## Unknowns

1. **Does Bun's bundler tree-shake re-exports from multi-entry barrel files?** — Needs POC verification. If Bun follows the `sideEffects: false` hint and eliminates unused re-exports from `dist/index.js` → `dist/shared/chunk-*.js`, the approach works.

### Resolution Plan
- Phase 1 starts with a POC: build `@vertz/ui-primitives` with multi-entry, then build the landing page and measure bundle size.
- **Fallback:** If Bun doesn't tree-shake barrel re-exports, Phase 1 pivots to subpath exports (`@vertz/ui-primitives/tooltip`, etc.). This is a breaking change to import paths but guarantees tree-shaking. All consumers would need to update imports.

## Type Flow Map

No generic type parameters introduced. The changes are purely build-configuration.

## E2E Acceptance Test

```ts
describe('Feature: Reduced unused JS in client bundles', () => {
  describe('Given @vertz/ui-primitives built with multi-entry', () => {
    describe('When building the landing page production bundle', () => {
      it('Then the entry bundle size is smaller than the single-entry build', () => {
        // Build landing page with multi-entry ui-primitives
        // Compare total bundle size vs baseline (70.6 KiB)
      });
    });
  });

  describe('Given a user visits the home page /', () => {
    describe('When the page hydrates', () => {
      it('Then all interactive components work (tooltips, FAQ, etc.)', () => {
        // Verify tooltip on code tokens works
        // Verify FAQ accordion works
        // No regression in functionality
      });
    });
  });

  describe('Given a user navigates to /manifesto', () => {
    describe('When the page loads', () => {
      it('Then the manifesto content renders via SSR (no regression)', () => {
        // Navigate to /manifesto
        // Verify "The Vertz Manifesto" heading is visible
        // Verify SSR still works (content in initial HTML)
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: `@vertz/ui-primitives` multi-entry build

Split the single-entry bunup config into per-component entries so the barrel file re-exports from separate chunks. This mirrors the approach already used by `@vertz/ui` (which has 9 entry points producing shared chunks).

**Changes:**
- `packages/ui-primitives/bunup.config.ts` — Add all component source files as entries alongside the barrel `src/index.ts`
- Verify `package.json` `exports` map still works (`.` → `dist/index.js` barrel with re-exports to chunks)
- Build and verify the dist produces separate chunk files per component
- Build the landing page and measure bundle size reduction

**Acceptance Criteria:**
```ts
describe('Given @vertz/ui-primitives built with multi-entry', () => {
  describe('When a consumer imports only Tooltip', () => {
    it('Then the bundled output excludes Accordion, Dialog, Select, etc.', () => {
      // Build a minimal test bundle that imports only Tooltip
      // Verify bundle size is significantly smaller than 119 KB
    });
  });

  describe('When a consumer imports from the barrel', () => {
    it('Then all components are still available', () => {
      // Import { Tooltip, Dialog, Select } from '@vertz/ui-primitives'
      // All resolve correctly
    });
  });

  describe('When building all packages', () => {
    it('Then bun run build succeeds', () => {});
    it('Then bun run typecheck passes', () => {});
    it('Then bun test passes across all packages', () => {});
  });
});
```

**POC gate:** After building with multi-entry, build the landing page and compare bundle size. If no meaningful reduction, pivot to subpath exports (see Fallback in Unknowns).

## Review Sign-offs

### DX Review
- **Verdict:** APPROVED
- Barrel import preserved — zero consumer-facing changes
- Lazy route pattern matches industry standard but correctly deferred due to SSR gap
- Phase 3 scope inconsistency resolved (removed)

### Product/Scope Review
- **Verdict:** APPROVED (after changes)
- Phase 2 (lazy routes) dropped due to SSR regression risk
- Phase 3 (sideEffects) dropped — targeted packages don't appear in client bundles
- Fallback plan added for Bun tree-shaking unknown
- Quantitative measurement included in Phase 1 POC gate

### Technical Review
- **Verdict:** APPROVED (after changes)
- SSR + lazy routes issue resolved by deferring lazy routes entirely
- `sideEffects` Phase 3 removed — wrong targets
- Multi-entry build feasible (proven by `@vertz/ui`)
- POC approach sufficient for Bun tree-shaking unknown
