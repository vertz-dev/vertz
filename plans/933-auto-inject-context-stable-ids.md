# Auto-Inject Stable Context IDs During @vertz/ui Build

**Issue:** [#933](https://github.com/vertz-dev/vertz/issues/933)

## Problem

Framework-internal contexts (`RouterContext`, `OutletContext`, `DialogStackContext`) in `@vertz/ui` need hardcoded `__stableId` parameters to survive Bun's HMR module re-evaluation. PR #937 added manual stable IDs, but this relies on developers remembering to add them for every new context. That's fragile.

The `injectContextStableIds()` transform already exists in `packages/ui-server/src/bun-plugin/context-stable-ids.ts` and runs automatically for **user code** via the dev server plugin. But `@vertz/ui` itself is pre-built — the dev server plugin never processes it. The goal is to run the same transform during `@vertz/ui`'s bunup build so manual IDs are unnecessary.

## API Surface

No public API change. The `createContext()` signature is unchanged. The only observable effect is that `@vertz/ui`'s dist output contains auto-injected stable IDs instead of manually written ones.

Before (source):
```ts
// Manual — fragile, easy to forget
export const RouterContext = createContext<Router>(undefined, '@vertz/ui::RouterContext');
```

After (source):
```ts
// No manual ID needed — injected at build time
export const RouterContext = createContext<Router>();
```

After (dist output):
```js
// Auto-injected by build plugin
const RouterContext = createContext(undefined, 'src/router/router-context.ts::RouterContext');
```

## Manifesto Alignment

- **Convention over configuration** — contexts automatically get stable IDs without developer intervention
- **Predictability over convenience** — the ID format (`filePath::varName`) is deterministic and debuggable
- **Compile-time over runtime** — stable IDs are injected at build time, no runtime overhead

## Design Decision: Where Does the Transform Live?

### Constraint: Circular Dependency

- `@vertz/ui-compiler` depends on `@vertz/ui` (prod dependency — it imports UI types)
- If `@vertz/ui` imports from `@vertz/ui-compiler` at build time (even as devDep), the build order becomes circular: `ui` must be built before `ui-compiler`, but `ui`'s bunup plugin needs `ui-compiler` built first

### Approach: Local Plugin in `@vertz/ui`

Create a self-contained bunup plugin within `@vertz/ui` that handles stable ID injection. The transform is ~40 lines and the pattern is highly constrained (`const X = createContext(...)` at top level), so this is a reasonable scope for a local plugin.

**Dependencies:** `magic-string` (devDependency — already used across the monorepo, ~1.5KB). No `ts-morph` needed — we use a targeted regex + parenthesis-matching approach since the pattern is constrained to top-level const declarations.

**Alternative considered:** Import from `ui-compiler` via devDependency. Rejected due to circular build order. The transform is small and stable enough that code proximity is acceptable. If the transform ever evolves (unlikely — the `createContext()` API is settled), both copies would need updating.

**Alternative considered:** Extract to a shared micro-package (`@vertz/build-utils`). Rejected — 40 lines don't justify a package.

## Implementation Plan

### Phase 1: Build Plugin + Remove Manual IDs

1. Add `magic-string` as devDependency to `@vertz/ui`
2. Create `packages/ui/build-plugins/context-stable-ids-plugin.ts`:
   - A `BunPlugin` with `onLoad` for `.ts` files
   - Finds `const <Name> = createContext(` patterns at top level
   - Injects `'<relPath>::<Name>'` as the last argument using MagicString
   - Skips files with no `createContext` (fast path — string check before parsing)
3. Wire the plugin into `packages/ui/bunup.config.ts`
4. Remove manual stable ID strings from:
   - `packages/ui/src/router/router-context.ts`
   - `packages/ui/src/router/outlet.ts`
   - `packages/ui/src/dialog/dialog-stack.ts`
5. Build and verify dist output contains injected IDs

**Acceptance test:** After `bun run build --filter @vertz/ui`, the dist files for router-context, outlet, and dialog-stack contain `createContext(undefined, 'src/router/router-context.ts::RouterContext')` (and equivalents) — without any manual ID in the source files.

### Phase 2: Verify HMR

1. Start the example app dev server
2. Verify contexts survive HMR (edit a file, navigate, confirm no "useRouter() must be called within Provider" error)
3. Add a new `createContext()` call to a test file, build, verify it gets an auto-injected ID

**Acceptance test:** HMR edit + navigation cycle works without context errors. A newly added `createContext()` in source gets a stable ID in dist without any manual annotation.

## Non-Goals

- **Replacing the dev server transform for user code.** The dev server plugin (`ui-server`) continues to handle user contexts at dev time. This only covers the pre-built `@vertz/ui` dist.
- **Deduplicating the transform logic.** The circular dependency makes code sharing impractical. Two copies (~40 lines each) is acceptable.
- **Handling `createContext` calls inside function bodies.** Only top-level `const` declarations are matched — same as the existing transform. Contexts created inside functions are per-invocation and don't need stable IDs.

## Unknowns

No unknowns identified. The transform logic is proven (running in production via the dev server plugin), the build tooling (bunup + BunPlugin) is well-understood, and the three context files to modify are known.

## Estimate

Small task — ~1-2 hours implementation + verification.
