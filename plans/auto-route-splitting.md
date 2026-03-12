# Design: Automatic Per-Page Code Splitting in Route Definitions

**Issue:** [#1186](https://github.com/vertz-dev/vertz/issues/1186)
**Parent:** [#1174](https://github.com/vertz-dev/vertz/issues/1174) (Gap 2)
**Author:** viniciusdacal
**Date:** 2026-03-11
**Status:** Design
**Rev:** 2 (post-review — addresses DX, Product, and Technical review findings)

## Problem

Developers must manually write `import()` for route-level code splitting. Forgetting silently ships a larger bundle — there's no compiler error, no runtime error, just worse performance.

Currently, routes are defined with sync component factories that reference static imports:

```ts
import { TaskListPage } from './pages/task-list';
import { SettingsPage } from './pages/settings';

export const routes = defineRoutes({
  '/': { component: () => TaskListPage() },
  '/settings': { component: () => SettingsPage() },
});
```

All page components are bundled into the entry chunk. Next.js splits per-page automatically.

## API Surface

### Developer API: Zero change

The developer writes exactly the same code as today. The build transform is transparent:

```ts
// Developer writes (unchanged) — function call syntax:
import { TaskListPage } from './pages/task-list';
import { SettingsPage } from './pages/settings';

export const routes = defineRoutes({
  '/': {
    component: () => TaskListPage(),
    loader: async () => await api.tasks.list(),
  },
  '/settings': {
    component: () => SettingsPage(),
  },
});
```

JSX syntax is equally supported:

```tsx
// Developer writes (unchanged) — JSX syntax:
import { HomePage } from './pages/home';
import ManifestoPage from './pages/manifesto';

export const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/manifesto': { component: () => <ManifestoPage /> },
});
```

### Build output (automatic)

At production build time, the transform rewrites component factories to use dynamic `import()`:

```ts
// After transform:
export const routes = defineRoutes({
  '/': {
    component: () => import('./pages/task-list').then(m => ({ default: () => m.TaskListPage() })),
    loader: async () => await api.tasks.list(),
  },
  '/settings': {
    component: () => import('./pages/settings').then(m => ({ default: () => m.SettingsPage() })),
  },
});
```

The now-unused static imports are removed. Bun's `splitting: true` creates separate chunks for each `import()`.

This works because `RouterView` already handles async component factories — when `component()` returns a `Promise<{ default: () => Node }>`, it awaits resolution before rendering (see `router-view.ts:123`).

### Plugin configuration

```ts
// In createVertzBunPlugin options
interface VertzBunPluginOptions {
  // ... existing options ...
  /** Auto-split route component factories into lazy imports. Default: false in dev, true in prod. */
  routeSplitting?: boolean;
}
```

The production build pipeline (`ui-build-pipeline.ts`) passes `routeSplitting: true` for the client plugin. The server plugin and dev server do NOT use route splitting.

### Transformer API (internal)

```ts
// packages/ui-compiler/src/transformers/route-splitting-transformer.ts

export interface RouteSplittingResult {
  code: string;
  map: SourceMap | null;
  /** Whether any component factories were transformed. */
  transformed: boolean;
  /** Per-route diagnostics for successfully transformed routes. */
  diagnostics: RouteSplittingDiagnostic[];
  /** Per-route diagnostics for routes that were NOT transformed (bail-out). */
  skipped: RouteSplittingSkipped[];
}

export interface RouteSplittingDiagnostic {
  /** Route path pattern, e.g., '/settings'. */
  routePath: string;
  /** The import source that was lazified, e.g., './pages/settings'. */
  importSource: string;
  /** The symbol name, e.g., 'SettingsPage'. */
  symbolName: string;
}

export interface RouteSplittingSkipped {
  /** Route path pattern, e.g., '/settings'. */
  routePath: string;
  /** Reason the route was not transformed. */
  reason:
    | 'block-body'
    | 'not-arrow-function'
    | 'not-imported-symbol'
    | 'package-import'
    | 'already-lazy'
    | 'symbol-used-elsewhere'
    | 'namespace-import'
    | 'dynamic-route-map'
    | 'spread-element';
}

/**
 * Transform route definitions to use lazy imports for code splitting.
 *
 * Detects `defineRoutes({...})` calls and rewrites component factories
 * that reference static imports from local files into dynamic `import()` calls.
 */
export function transformRouteSplitting(
  source: string,
  filePath: string,
): RouteSplittingResult;
```

## Transform Rules

### What gets transformed

A component factory is transformed when ALL conditions are met:

1. **Inside `defineRoutes()` call** — the factory is a value of a `component` property in a route config object literal passed to `defineRoutes()`. The `defineRoutes` function must be imported from `@vertz/ui` or `@vertz/ui/router` (user functions with the same name are not transformed).
2. **Arrow function with expression body** — the factory is `() => X()`, `() => X(args)`, or `() => <X />`. Block bodies (`() => { ... }`) are skipped.
3. **Calls or renders an imported symbol** — `X` is a named or default import from a **relative path** (starts with `./` or `../`). Package imports (e.g., `@vertz/ui`) are never transformed.
4. **Symbol only used in component factories** — if `X` is used elsewhere in the file (outside `defineRoutes` component factories), the factory is skipped and the import is preserved.

### Supported patterns

| Pattern | Transformed to |
|---------|----------------|
| `() => Page()` (named import) | `() => import('./page').then(m => ({ default: () => m.Page() }))` |
| `() => Page(args)` (with arguments) | `() => import('./page').then(m => ({ default: () => m.Page(args) }))` |
| `() => <Page />` (JSX self-closing) | `() => import('./page').then(m => ({ default: () => m.Page() }))` |
| `() => <Page prop={val} />` (JSX with props) | `() => import('./page').then(m => ({ default: () => m.Page(props) }))` |
| `() => DefaultPage()` (default import) | `() => import('./page').then(m => ({ default: () => m.default() }))` |

### What is NOT transformed (bail-out conditions)

| Pattern | Reason | Skipped diagnostic |
|---------|--------|-------------------|
| `component: () => { setup(); return Page() }` | Block body — can't safely extract | `block-body` |
| `component: () => LocalComponent()` | Not an import — local function | `not-imported-symbol` |
| `component: () => SomePackageThing()` | Package import, not a local file | `package-import` |
| `component: someVariable` | Not an arrow factory | `not-arrow-function` |
| `component: () => import('./page')` | Already lazy — no-op | `already-lazy` |
| `component: () => pages.TaskList()` | Namespace import (`* as pages`) | `namespace-import` |
| Symbol used outside defineRoutes | Import removal would break other code | `symbol-used-elsewhere` |
| `defineRoutes(routeMap)` (variable arg) | Not an object literal — can't analyze | `dynamic-route-map` |
| `...otherRoutes` inside defineRoutes | Spread element — can't follow cross-file | `spread-element` |

Bail-out is always safe: the worst outcome is the route is not split (larger bundle), never broken code. **All bail-outs produce a `skipped` diagnostic** so the build output shows what was not split and why.

### Nested routes

The transform recurses into `children` route definitions:

```ts
defineRoutes({
  '/dashboard': {
    component: () => DashboardLayout(),  // ← transformed
    children: {
      '/': { component: () => DashboardHome() },       // ← transformed
      '/analytics': { component: () => Analytics() },   // ← transformed
    },
  },
});
```

### Import cleanup

After transformation, static imports that have no remaining references are removed entirely. Imports with remaining specifiers keep only those specifiers:

```ts
// Before:
import { TaskListPage, taskUtils } from './pages/task-list';

// After (TaskListPage lazified, taskUtils still used):
import { taskUtils } from './pages/task-list';
```

**Argument safety rule:** When rewriting `() => X(args)`, the transform scans argument expressions for references to symbols from the same import declaration as `X`. If any argument references a co-imported symbol, that specifier is preserved in the static import — never removed.

```ts
// Before:
import { Page, defaultConfig } from './pages/page';
component: () => Page(defaultConfig)

// After: Page lazified, but defaultConfig is preserved because it's in the .then() callback
import { defaultConfig } from './pages/page';
component: () => import('./pages/page').then(m => ({ default: () => m.Page(defaultConfig) }))
```

## Integration Points

### Bun Plugin Pipeline

Route splitting is added as **step 0** — before hydration transform — in the existing Bun plugin. For `.ts` files (which don't match the current `/\.tsx$/` filter), a **second `onLoad` handler** is registered:

```
Plugin setup:
  onLoad({ filter: /\.tsx$/ }) → [routeSplitting → hydration → ... → compile → ...]
  onLoad({ filter: /\.ts$/ })  → [routeSplitting only] (only when routeSplitting: true)
```

The `.ts` handler:
1. Reads the file
2. Quick-checks for BOTH `defineRoutes(` AND `@vertz/ui` strings (fast bail-out — must have both)
3. If found, runs the transform
4. Returns `{ contents, loader: 'ts' }` (always returns contents, even if unchanged — Bun `onLoad` cannot return `undefined` to fall through)
5. Appends inline source map comment to `contents` for debuggability

**Note:** Source maps for `.ts` files are appended as inline `//# sourceMappingURL=data:...` comments. For `.tsx` files, the route splitting map chains into the existing `@ampproject/remapping` pipeline.

### Production Build Pipeline

In `ui-build-pipeline.ts`:

```ts
const { plugin: clientPlugin, fileExtractions } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
  routeSplitting: true,  // NEW: enable for production client builds
});
```

### Dev Server

No change. `routeSplitting` defaults to `false`. Dev mode uses sync imports for instant rebuilds (as specified in the issue).

### SSR Compatibility

The two-pass SSR render (`ssr-render.ts`) already handles lazy route components:
- **Pass 1**: Invokes component factories, collects Promises from lazy components
- **Between passes**: Awaits all Promises, stores resolved factories
- **Pass 2**: Uses resolved factories for synchronous rendering

Auto-splitting is fully compatible — no SSR changes needed.

## Manifesto Alignment

| Principle | How this aligns |
|-----------|-----------------|
| **One way to do things** | Developers write routes the same way always. The build handles splitting transparently. No choice between sync/lazy patterns. |
| **If it builds, it works** | The transform is conservative — bail-out preserves correctness. Worse case is no splitting, never broken code. |
| **AI agents are first-class users** | LLMs write `component: () => Page()` naturally. No need to know about `import()` conventions. |
| **Compile-time over runtime** | Splitting decisions are made at build time by static analysis. Zero runtime overhead. |
| **Performance is not optional** | Automatic per-route chunks reduce initial JS payload without developer effort. |

## Non-Goals

- **Dynamic route registration** — only `defineRoutes()` call-site transforms are supported. Runtime `addRoute()` is not split.
- **Custom splitting strategies** — no config for controlling granularity. Every route gets its own chunk. (Future: a `splitting: false` per-route escape hatch may be added if needed.)
- **Dev mode code splitting** — dev uses sync imports for fast rebuilds. Only production splits.
- **Cross-file route composition** — routes spread across multiple files with `...otherRoutes` are not followed. Each file is transformed independently (per-file, single-pass). Spread elements emit a `spread-element` skipped diagnostic.
- **Package import splitting** — only relative imports (`./`, `../`) are transformed. Components from packages are never lazified.
- **Splitting non-component properties** — only `component` factories are transformed. `loader`, `errorComponent` stay as-is.
- **Dynamic route map variables** — `defineRoutes(routeMap)` where the argument is a variable (not an object literal) is not transformed. This pattern is valid but uncommon; it bails out with a `dynamic-route-map` diagnostic.
- **Namespace imports** — `import * as pages from './pages'` with `component: () => pages.X()` is not transformed.
- **Loading indicators** — Auto-splitting makes all routes lazy in production, meaning there is no loading indicator between route transitions beyond what `RouterView` currently provides. Adding a `loadingComponent` prop to routes is a separate concern tracked as future work.

## Unknowns

1. **Bun `import()` in `onLoad` return** — Does Bun correctly split dynamic `import()` calls that appear in the transformed code returned from an `onLoad` handler? **Resolution: Yes.** Bun.build processes the returned `contents` as if it were the original source. Dynamic imports in the output are resolved and split normally with `splitting: true`. This is the same mechanism the field selection injection and other transforms rely on.

2. **Source maps through the transform** — The route splitting transform uses MagicString, which generates a source map. This map needs to chain with the subsequent transforms (hydration, compile). **Resolution: Already solved.** The plugin already chains maps via `@ampproject/remapping` (see plugin.ts step 4). Adding another map layer is trivial.

## POC Results

No POC needed. The transform is a straightforward MagicString rewrite using patterns already proven in the codebase:
- The hydration transformer uses MagicString + ts-morph AST for source rewrites
- The field selection injection does similar import analysis and code injection
- RouterView already handles `Promise<{ default: () => Node }>` component factories

## Type Flow Map

No new generic type parameters. The transform operates at the source text level — it rewrites JavaScript/TypeScript source code. The output type signature of `component` remains `() => Node | Promise<{ default: () => Node }>`, which is already the union type in `RouteConfig`.

The type narrowing in `RouterView` (`result instanceof Promise`) continues to work correctly because `import().then(...)` returns a `Promise`.

## E2E Acceptance Test

### Core transform behavior

```typescript
describe('Feature: Automatic route code splitting', () => {
  describe('Given a route file with named component imports', () => {
    const input = `
      import { defineRoutes } from '@vertz/ui';
      import { HomePage } from './pages/home';
      import { AboutPage } from './pages/about';

      export const routes = defineRoutes({
        '/': { component: () => HomePage() },
        '/about': { component: () => AboutPage() },
      });
    `;

    describe('When transformRouteSplitting is called', () => {
      it('Then rewrites component factories to lazy import()', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain("import('./pages/home')");
        expect(result.code).toContain("import('./pages/about')");
        expect(result.code).not.toContain("import { HomePage }");
        expect(result.code).not.toContain("import { AboutPage }");
      });

      it('Then preserves the { default: () => Node } contract', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.code).toContain(".then(m => ({ default: () => m.HomePage() }))");
        expect(result.code).toContain(".then(m => ({ default: () => m.AboutPage() }))");
      });

      it('Then reports diagnostics for each transformed route', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.diagnostics).toHaveLength(2);
        expect(result.diagnostics[0]).toEqual({
          routePath: '/',
          importSource: './pages/home',
          symbolName: 'HomePage',
        });
      });
    });
  });

  describe('Given a route file with default imports', () => {
    const input = `
      import { defineRoutes } from '@vertz/ui';
      import ManifestoPage from './pages/manifesto';

      export const routes = defineRoutes({
        '/manifesto': { component: () => ManifestoPage() },
      });
    `;

    describe('When transformRouteSplitting is called', () => {
      it('Then uses m.default() for default imports', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain(".then(m => ({ default: () => m.default() }))");
      });
    });
  });

  describe('Given a route file with JSX component factories', () => {
    const input = `
      import { defineRoutes } from '@vertz/ui';
      import { HomePage } from './pages/home';

      export const routes = defineRoutes({
        '/': { component: () => <HomePage /> },
      });
    `;

    describe('When transformRouteSplitting is called', () => {
      it('Then transforms JSX factories to lazy import()', () => {
        const result = transformRouteSplitting(input, '/app/src/router.tsx');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain("import('./pages/home')");
        expect(result.code).toContain(".then(m => ({ default: () => m.HomePage() }))");
      });
    });
  });

  describe('Given a component factory with arguments from same import', () => {
    const input = `
      import { defineRoutes } from '@vertz/ui';
      import { Page, defaultConfig } from './pages/page';

      export const routes = defineRoutes({
        '/': { component: () => Page(defaultConfig) },
      });
    `;

    describe('When transformRouteSplitting is called', () => {
      it('Then preserves the co-imported argument specifier', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain("import { defaultConfig }");
      });
    });
  });
});
```

### Bail-out behavior

```typescript
describe('Feature: Route splitting bail-outs', () => {
  describe('Given a component used outside defineRoutes', () => {
    const input = `
      import { defineRoutes } from '@vertz/ui';
      import { SharedPage } from './pages/shared';

      console.log(SharedPage);

      export const routes = defineRoutes({
        '/shared': { component: () => SharedPage() },
      });
    `;

    describe('When transformRouteSplitting is called', () => {
      it('Then skips the factory and reports symbol-used-elsewhere', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.code).toContain("import { SharedPage }");
        expect(result.skipped[0]?.reason).toBe('symbol-used-elsewhere');
      });
    });
  });

  describe('Given a component factory with block body', () => {
    const input = `
      import { defineRoutes } from '@vertz/ui';
      import { Page } from './pages/page';

      export const routes = defineRoutes({
        '/': { component: () => { return Page(); } },
      });
    `;

    describe('When transformRouteSplitting is called', () => {
      it('Then skips the factory and reports block-body', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.skipped[0]?.reason).toBe('block-body');
      });
    });
  });

  describe('Given defineRoutes from a non-vertz package', () => {
    const input = `
      import { defineRoutes } from 'some-other-lib';
      import { Page } from './pages/page';

      export const routes = defineRoutes({
        '/': { component: () => Page() },
      });
    `;

    describe('When transformRouteSplitting is called', () => {
      it('Then does not transform (not a vertz defineRoutes)', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given a route file with no defineRoutes call', () => {
    const input = `
      import { something } from './utils';
      export const x = something();
    `;

    describe('When transformRouteSplitting is called', () => {
      it('Then returns the source unchanged', () => {
        const result = transformRouteSplitting(input, '/app/src/utils.ts');
        expect(result.transformed).toBe(false);
        expect(result.code).toBe(input);
      });
    });
  });
});
```

### Integration: build output summary format

```
Route splitting:
  /           -> ./pages/home (HomePage)         [split]
  /about      -> ./pages/about (AboutPage)       [split]
  /settings   -> (skipped: block-body)           [not split]
```

### Integration: bundle output verification

```typescript
describe('Feature: Production build with auto-splitting', () => {
  describe('Given an app with 3 routes and routeSplitting enabled', () => {
    describe('When building for production', () => {
      it('Then the build output contains per-route chunk files', () => {
        // Build outputs: entry-<hash>.js + chunk-<hash>.js per lazy route
        // At least 3 chunks (one per page) + entry + shared chunks
      });

      it('Then the entry chunk does NOT contain page component code', () => {
        // Read entry chunk, verify page-specific code is absent
      });

      it('Then each page chunk contains its component code', () => {
        // Read each chunk, verify it contains the page component
      });

      it('Then per-route chunks appear in modulepreload link tags', () => {
        // Verify the _shell.html includes modulepreload for route chunks
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Route Splitting Transformer (unit-tested)

**Package:** `@vertz/ui-compiler`
**File:** `src/transformers/route-splitting-transformer.ts`
**Test file:** `src/transformers/__tests__/route-splitting-transformer.test.ts`

Implement the pure transform function with MagicString + ts-morph AST:
1. Parse source to find import declarations (named, default, and verify `defineRoutes` import source)
2. Find `defineRoutes()` calls where the argument is an object literal
3. For each route's `component` factory, check transform eligibility
4. Rewrite eligible factories to `import().then(m => ({ default: () => m.X() }))`
5. Handle JSX factories (`() => <X />`) — extract tag name, transform to function call form
6. Handle default imports — generate `m.default()` instead of `m.SymbolName()`
7. Scan factory arguments for co-imported symbols — preserve those specifiers
8. Remove unused imports, emit skipped diagnostics for bail-outs

**Acceptance criteria:**
- Named import factories: `() => Page()` → `() => import('./page').then(m => ({ default: () => m.Page() }))`
- Default import factories: `() => Page()` → `() => import('./page').then(m => ({ default: () => m.default() }))`
- JSX factories: `() => <Page />` → lazy import (same output)
- Factory arguments preserved: `() => Page(config)` → config still accessible in `.then()` callback
- Co-imported argument symbols preserved in static import
- Nested `children` routes transformed recursively
- Skips block body factories → `skipped` diagnostic with `block-body`
- Skips non-imported / package-imported symbols → `skipped` diagnostic
- Skips symbols used outside `defineRoutes` → `skipped` diagnostic with `symbol-used-elsewhere`
- Skips namespace imports (`* as`) → `skipped` diagnostic with `namespace-import`
- Skips non-object-literal arguments → `skipped` diagnostic with `dynamic-route-map`
- Reports spread elements in defineRoutes → `skipped` diagnostic with `spread-element`
- Only transforms `defineRoutes` imported from `@vertz/ui` or `@vertz/ui/router`
- Removes unused static imports after transform
- Preserves partially-used imports (removes only lazified specifiers)
- Generates valid source map via MagicString
- Returns `diagnostics` for transformed routes, `skipped` for bail-outs

### Phase 2: Bun Plugin Integration

**Package:** `@vertz/ui-server`
**File:** `src/bun-plugin/plugin.ts`
**Types file:** `src/bun-plugin/types.ts`

1. Add `routeSplitting` option to `VertzBunPluginOptions`
2. For `.tsx` files: add route splitting as step 0 in the pipeline (before hydration)
3. For `.ts` files: add a new `onLoad` handler when `routeSplitting: true`
   - Fast bail-out: check for both `defineRoutes(` and `@vertz/ui` strings
   - Always return `{ contents, loader: 'ts' }` (never `undefined`)
   - Append inline source map comment
4. Wire `.tsx` route splitting source map into the existing `@ampproject/remapping` chain
5. Add diagnostic logging via existing `logger` and `diagnostics` interfaces

**Acceptance criteria:**
- `routeSplitting: true` enables the transform for `.tsx` files in the existing pipeline
- New `.ts` onLoad handler processes route files only (dual string check bail-out)
- `.ts` handler always returns `{ contents, loader: 'ts' }` — never `undefined`
- Source maps chain correctly through the transform (`.tsx`: remapping chain; `.ts`: inline comment)
- `routeSplitting: false` (default) has zero overhead — no `.ts` handler registered
- Diagnostic logging shows split/skipped routes

### Phase 3: Production Build Integration & E2E Verification

**Package:** `@vertz/cli`
**File:** `src/production-build/ui-build-pipeline.ts`

1. Pass `routeSplitting: true` in client plugin options
2. Log route splitting results in the build summary format:
   ```
   Route splitting:
     /           -> ./pages/home (HomePage)         [split]
     /about      -> ./pages/about (AboutPage)       [split]
     /settings   -> (skipped: block-body)           [not split]
   ```
3. Add E2E test: build example app, verify per-route chunks exist
4. Verify shared chunks still extracted correctly
5. Verify per-route chunks appear in modulepreload `<link>` tags

**Acceptance criteria:**
- Production build creates per-route chunks for the task-manager example
- Entry chunk does not contain page-specific code
- SSR build (server plugin) does NOT use route splitting
- Build output logs show which routes were split AND which were skipped
- Per-route chunks are included in modulepreload links in `_shell.html`
- Dev server works unchanged (no route splitting)
