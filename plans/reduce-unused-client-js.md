# Reduce Unused JS in Client Bundles

**Issue:** [#1143](https://github.com/vertz-dev/vertz/issues/1143)
**Status:** In Progress

## Problem

Lighthouse reports **32.5 KiB unused JavaScript** in the landing page client entry bundle (43.7% of 74.4 KiB transfer). The framework's client exports aren't being tree-shaken effectively.

### Root Cause Analysis

**1. `@vertz/theme-shadcn` monolithic `configureTheme()` (primary cause)**

The landing page calls `configureTheme()` but only uses `{ theme, globals }` — the returned `styles` (38 component style factories) and `components` (30+ component wrapper factories) are completely unused. However, `configureTheme()` eagerly imports and instantiates ALL style and component factories. The built `dist/index.js` is 161 KB raw. Since all imports are static at the module level, tree-shaking cannot eliminate unused factories — the function body references everything.

Import chain: `entry-client.ts` → `app.tsx` → `theme.ts` → `configureTheme()` from `@vertz/theme-shadcn`.

**2. `@vertz/ui-primitives` single-file bundle (resolved — Phase 1)**

Previously the package built to a single `dist/index.js` (119 KB raw). Fixed in PR #1153 by switching to multi-entry build. Single-import ratio dropped from ~100% to 16.1%.

**3. Eager route imports (deferred)**

`app.tsx` imports `ManifestoPage` at the top level. On the `/` route, the ManifestoPage module is loaded but never executed. The router supports lazy loading via `Promise<{ default: () => Node }>`, but **lazy routes do not SSR** — `RouterView` handles promises via `.then()` which doesn't execute before SSR serializes the DOM tree. Since ManifestoPage is content-heavy and benefits from SSR for SEO, converting it to a lazy route would be a regression. This is deferred until SSR Suspense supports async route resolution.

**4. Missing `sideEffects` in some packages (not applicable)**

13 of 28 packages lack a `sideEffects` field. However, all 13 are server-side, build-time, or CLI packages — none appear in client bundles. The client-facing packages (`@vertz/ui`, `@vertz/ui-primitives`, `@vertz/core`, `@vertz/schema`, `@vertz/fetch`, `@vertz/icons`, `@vertz/theme-shadcn`) already have correct `sideEffects` declarations.

## API Surface

### `@vertz/theme-shadcn` — new `./base` subpath export

Consumers that only need the theme definition and global CSS (no component styles/factories) import from the lightweight base entry:

```ts
// Before — pulls in all 38 style factories + 30 component factories (161 KB)
import { configureTheme } from '@vertz/theme-shadcn';
const { theme, globals } = configureTheme({ palette: 'zinc', radius: 'md' });

// After — only palette tokens + defineTheme + globalCss (~5 KB)
import { configureThemeBase } from '@vertz/theme-shadcn/base';
const { theme, globals } = configureThemeBase({ palette: 'zinc', radius: 'md' });
```

The full `configureTheme()` from `@vertz/theme-shadcn` remains unchanged — apps that need `styles` and `components` keep using it. Internally, `configureTheme()` calls `configureThemeBase()` to avoid duplication.

### `@vertz/ui-primitives` — no consumer-facing changes (Phase 1, done)

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

- **Lazy property resolution in `configureTheme()`** — Using Proxy or lazy getters for `styles`/`components` properties. Doesn't help because the bundler includes code for getter bodies regardless — tree-shaking operates at the import level, not property access level.
- **Making `configureTheme()` accept a component list** — `configureTheme({ components: [button, tooltip] })`. Would work but changes the API for all consumers. The `./base` subpath is simpler and non-breaking.
- **Multi-entry build for theme-shadcn** — Like ui-primitives Phase 1. Wouldn't help because `configureTheme()` imports everything in one function body. Multi-entry only helps when consumers import individual exports from a barrel.
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

1. ~~**Does Bun's bundler tree-shake re-exports from multi-entry barrel files?**~~ — **Resolved.** Phase 1 verified that esbuild tree-shakes multi-entry barrels effectively (16.1% ratio). Bun's production bundler was already tree-shaking adequately for ui-primitives.

2. **None remaining for Phase 2.** The `./base` subpath approach is a straightforward module split with no bundler-behavior unknowns.

## Type Flow Map

No generic type parameters introduced. The changes are purely build-configuration.

## E2E Acceptance Test

```ts
describe('Feature: Reduced unused JS in client bundles', () => {
  describe('Given @vertz/theme-shadcn/base used instead of full configureTheme', () => {
    describe('When building the landing page production bundle', () => {
      it('Then the entry bundle is significantly smaller than with full configureTheme', () => {
        // Build landing page with configureThemeBase
        // Compare total bundle size vs baseline (74.4 KiB transfer)
        // Expect substantial reduction (theme-shadcn was 56% of bundle)
      });
    });
  });

  describe('Given a consumer imports from @vertz/theme-shadcn (full)', () => {
    describe('When using configureTheme()', () => {
      it('Then styles and components are still available (no regression)', () => {
        // configureTheme() returns { theme, globals, styles, components }
        // All 38 style definitions present
        // All component factories work
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

### Phase 1: `@vertz/ui-primitives` multi-entry build (DONE — PR #1153)

Split the single-entry bunup config into per-component entries so the barrel file re-exports from separate chunks. Single-import ratio dropped from ~100% to 16.1%. Merged and deployed.

### Phase 2: `@vertz/theme-shadcn` base subpath export

Extract the lightweight theme base logic (palette resolution, `defineTheme()`, `globalCss()`) into a separate module so consumers that only need `{ theme, globals }` don't pull in all 38 style factories and 30+ component factories.

**Expected Impact:**
- Current: 74.4 KiB transfer, 43.7% unused (32.5 KiB wasted)
- Theme-shadcn contribution: ~41.7 KiB (56% of bundle, 161 KB raw)
- Base-only estimate: ~5 KiB (palette tokens + defineTheme + globalCss)
- Expected new bundle: ~37.7 KiB transfer
- Expected unused JS: well under 25%

**Changes:**
- `packages/theme-shadcn/src/base.ts` — New module containing `configureThemeBase()`, `ThemeConfig`, `ThemeStyle`, `ResolvedThemeBase`, and `RADIUS_VALUES`. These types/values **move out of** `configure.ts` into `base.ts` to avoid pulling style factory imports. `ResolvedThemeBase` is `{ theme: Theme; globals: GlobalCSSOutput }`. `ResolvedTheme` in `configure.ts` extends `ResolvedThemeBase`.
- `packages/theme-shadcn/src/configure.ts` — Refactor `configureTheme()` to import and call `configureThemeBase()` from `./base`. Remove duplicated palette/globals logic. Import `ThemeConfig` from `./base`. `ResolvedTheme extends ResolvedThemeBase`.
- `packages/theme-shadcn/src/index.ts` — Re-export `ThemeConfig` via `configure.ts` (which re-exports from `./base`). No change needed if `configure.ts` re-exports the type.
- `packages/theme-shadcn/bunup.config.ts` — Add `src/base.ts` as third entry point.
- `packages/theme-shadcn/package.json` — Add `./base` subpath export: `{ "import": "./dist/base.js", "types": "./dist/base.d.ts" }`.
- `sites/landing/src/styles/theme.ts` — Change import from `@vertz/theme-shadcn` to `@vertz/theme-shadcn/base`.
- `packages/create-vertz-app/src/templates/index.ts` — Update scaffolded theme template to import from `@vertz/theme-shadcn/base` (new apps should use the lightweight import by default).
- `tests/tree-shaking/tree-shaking.test.ts` — Add `@vertz/theme-shadcn` to packages list with alias for `@vertz/theme-shadcn/base` subpath.

**Acceptance Criteria:**
```ts
describe('Given @vertz/theme-shadcn/base subpath export', () => {
  describe('When a consumer imports configureThemeBase from @vertz/theme-shadcn/base', () => {
    it('Then the bundled output excludes all style factories and component factories', () => {
      // Build a minimal test bundle that imports only configureThemeBase
      // Verify bundle is <10% of the full configureTheme bundle
    });
  });

  describe('When a consumer imports configureTheme from @vertz/theme-shadcn', () => {
    it('Then styles and components are still available (no regression)', () => {
      // configureTheme() returns { theme, globals, styles, components }
      // All 38 style definitions present
    });
  });

  describe('When building the landing page', () => {
    it('Then the entry bundle is significantly smaller', () => {
      // Build landing page with configureThemeBase
      // Compare vs baseline (74.4 KiB transfer, 43.7% unused)
    });

    it('Then unused JavaScript is below 25% of total transfer', () => {
      // Run Lighthouse or coverage analysis on built landing page
      // Verify unused JS ratio < 25%
    });
  });

  describe('When building all packages', () => {
    it('Then bun run build succeeds', () => {});
    it('Then bun run typecheck passes', () => {});
    it('Then bun test passes across all packages', () => {});
  });
});
```

## Review Sign-offs

### Phase 1 Reviews (DONE)

#### DX Review
- **Verdict:** APPROVED
- Barrel import preserved — zero consumer-facing changes

#### Product/Scope Review
- **Verdict:** APPROVED

#### Technical Review
- **Verdict:** APPROVED
- Multi-entry build feasible (proven by `@vertz/ui`)

### Phase 2 Reviews

#### DX Review
- **Verdict:** APPROVED WITH CHANGES (changes addressed)
- `configureThemeBase` naming is adequate — JSDoc should cross-reference full `configureTheme()`
- Must update `create-vertz-app` template to use `@vertz/theme-shadcn/base` (added to changes list)
- No conflict with existing `./configs` subpath

#### Product/Scope Review
- **Verdict:** APPROVED WITH CHANGES (changes addressed)
- Added explicit <25% unused JS acceptance criterion
- Added expected impact estimate (74.4 KiB → ~37.7 KiB)
- Scope correctly bounded, non-goals correct

#### Technical Review
- **Verdict:** APPROVED WITH CHANGES (changes addressed)
- `ThemeConfig`, `ThemeStyle`, `RADIUS_VALUES` must be defined in `base.ts`, not imported from `configure.ts` (addressed in changes list)
- `ResolvedTheme` should extend `ResolvedThemeBase` for proper type hierarchy (addressed)
- No circular dependency risk confirmed
- `sideEffects: false` works correctly with this split confirmed
- 3 bunup entry points supported confirmed
