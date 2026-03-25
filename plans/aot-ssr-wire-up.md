# AOT SSR Wire-Up: Connect Build Pipeline to Runtime

> Fix the compiler to generate standalone page-level AOT functions, then wire build pipeline to runtime so `vertz build` emits loadable render functions and `createSSRHandler()` uses them.

## Status

**Draft — Rev 3** — Simplified from Rev 2. Compiler fix included. Tier-based phasing removed.

**Depends on:** AOT Compiled SSR (#1745, phases 0-2 implemented). SSR single-pass with zero-discovery (#1741, merged).

**Issue:** #1843

## Issue #1843 Acceptance Criteria Mapping

| #1843 Criterion | Design Section |
|---|---|
| `vertz build` emits a loadable AOT routes module alongside `aot-manifest.json` | Solution §2 (Build-time emission via `Bun.build()`) |
| `createSSRHandler` loads the AOT manifest at startup when available | Solution §4 (`loadAotManifest()`) + §5 (`vertz start`) |
| Routes with AOT entries use `ssrRenderAot()` (string concatenation, no DOM shim) | Solution §3 (Handler integration) |
| Routes without AOT entries fall back to `ssrRenderSinglePass()` | Solution §3 (`ssrRenderAot()` already has fallback) |
| HTML output is identical between AOT and single-pass paths (verified by `VERTZ_DEBUG=aot`) | Phase 4 (E2E validation) |
| Build log shows which routes use AOT vs fallback | Solution §2 (Route mapping) + Phase 3 |

## Problem

### Compiler: page functions have free variables

The compiler generates `__ssr_*` functions as **companions** appended after the original component. For components with `query()`, the generated function references component-local variables as free variables:

```ts
// Original component
function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>{projects.data?.items.map(p => <ProjectCard project={p} />)}</div>;
}

// Compiler currently appends:
function __ssr_ProjectsPage(): string {
  return '<div>' + (projects.data?.items ?? []).map(p =>  // ← `projects` is a free variable!
    __ssr_ProjectCard({ project: p })).join('') + '</div>';
}
```

The parent design doc always intended page functions to take `(data, ctx)`:

```ts
// What the design doc specifies:
function __ssr_ProjectsPage(data: Record<string, unknown>, ctx: SSRAotContext): string {
  return '<div>' + ((data['projects-list'] as any)?.items ?? []).map(p =>
    __ssr_ProjectCard({ project: p })).join('') + '</div>';
}
```

The `ReactivityAnalyzer` already knows which variables come from `query()`. The `AotStringTransformer` just needs to replace those references with `ctx.getData(key)` calls instead of copying them verbatim.

Child components (like `ProjectCard`) that only use props are already correct — they take `(props)` and are self-contained.

### Build pipeline: compiled code is discarded

`generateAotBuildManifest()` calls `compileForSSRAot()` and gets back `AotCompileOutput` with `code` containing `__ssr_*` functions. But line 37-42 of `aot-manifest-build.ts` only keeps component metadata and discards `code`.

Additionally, `code` is the **entire transformed source file** (imports, original functions, file-scoped variables, plus the appended `__ssr_*` functions). Naive concatenation would produce a broken module with duplicate imports, scope conflicts, and TypeScript annotations.

### No route-to-function mapping

The `AotManifest` runtime type expects `routes: Record<string, AotRouteEntry>` with a `render: AotRenderFn` per route. No build step creates this mapping.

### Handler never calls `ssrRenderAot()`

`createSSRHandler()` has no `aotManifest` field. Always calls `ssrRenderSinglePass()`.

## Solution

### 1. Compiler fix: standalone page-level functions

Modify `AotStringTransformer._emitAotFunction()` to generate standalone functions for components that use `query()`:

**What changes:**
- The `ReactivityAnalyzer` already classifies variables by source. Variables from `query()` have `signalProperties: Set(['data', 'loading', 'error', ...])`.
- **Cache key extraction**: In `compileForSSRAot()`, after reactivity analysis, scan each query variable's initializer AST to extract the descriptor chain (e.g., `api.projects.list` → cache key `projects-list`). Uses the same property-access-chain parsing as `extractPropertyAccessChain()` in `prefetch-manifest.ts` (line 512), adapted for ts-morph AST. The `parseEntityOperation()` pattern (line 326) derives `entity-operation` format keys.
- **String expression post-processing**: After `_jsxToString()` builds the string expression (which references `projects.data`, `projects.loading`, etc.), replace query variable references with AOT equivalents:
  - `queryVar.data` → `__q{N}` (where `__q{N} = ctx.getData('entity-operation')`)
  - `queryVar.loading` → `false` (SSR always resolves)
  - `queryVar.error` → `undefined`
- When emitting the `__ssr_*` function for a component with query-sourced variables:
  - Add `data: Record<string, unknown>, ctx: SSRAotContext` parameters
  - Prepend `const __q0 = ctx.getData('key');` bindings before the return
- Emit the query-to-cacheKey mapping in `AotComponentInfo.queryKeys` so the build step knows which data keys each function needs
- Child-only components (no `query()`) keep the existing `(props)` signature — unchanged

**Extended `AotComponentInfo`:**

```ts
export interface AotComponentInfo {
  name: string;
  tier: AotTier;
  holes: string[];
  /** Query cache keys this component reads via ctx.getData(). Empty for props-only components. */
  queryKeys: string[];
}
```

**Before (current):**
```ts
function __ssr_ProjectsPage(): string {
  return '<div>' + (projects.data?.items ?? []).map(p =>
    __ssr_ProjectCard({ project: p })).join('') + '</div>';
}
```

**After (fixed):**
```ts
function __ssr_ProjectsPage(data: Record<string, unknown>, ctx: SSRAotContext): string {
  const __q0 = ctx.getData('projects-list') as any;
  return '<div>' + (__q0?.items ?? []).map(p =>
    __ssr_ProjectCard({ project: p })).join('') + '</div>';
}
```

### 2. Build-time: Emit AOT routes module via `Bun.build()`

Extend `generateAotBuildManifest()` to preserve compiled code:

```ts
export interface AotBuildManifest {
  components: Record<string, AotBuildComponentEntry>;
  classificationLog: string[];
  /** Per-file compiled AOT code. Key = source file path. */
  compiledFiles: Map<string, AotCompiledFile>;
}

export interface AotCompiledFile {
  code: string;
  components: AotComponentInfo[];
}
```

The CLI build pipeline uses `Bun.build()` to produce the AOT module:

1. Write each compiled file to a temp directory as `.ts` files
2. Generate a barrel `index.ts` re-exporting all `__ssr_*` functions
3. Run `Bun.build({ entrypoints: ['index.ts'], target: 'bun', external: ['@vertz/ui-server'] })`
4. Write output to `dist/server/aot-routes.js`

**Why `Bun.build()` over concatenation:**
- Isolates file-scoped variables (e.g., `const styles = css(...)`) in separate module scopes
- Deduplicates imports
- Strips TypeScript annotations
- Resolves cross-file `__ssr_*` references via the barrel
- Tree-shakes original component functions (not needed for AOT)

**Route-to-function mapping** is written into the unified `aot-manifest.json`:

```json
{
  "components": {
    "ProjectCard": { "tier": "data-driven", "holes": [], "queryKeys": [] },
    "ProjectsPage": { "tier": "conditional", "holes": ["DialogTrigger"], "queryKeys": ["projects-list"] }
  },
  "routes": {
    "/projects": { "functionName": "__ssr_ProjectsPage", "holes": [], "queryKeys": ["projects-list"] },
    "/projects/:id": { "functionName": "__ssr_ProjectLayout", "holes": ["Outlet"], "queryKeys": ["project-detail"] }
  }
}
```

**Route resolution mechanism:** The CLI build pipeline already imports the SSR module for prefetch manifest generation. After this import, it runs a discovery pass (same as `runDiscoveryPhase()`) to map route patterns to component names, then matches component names to `__ssr_*` function names from the AOT compilation. Components classified as `runtime-fallback` are excluded.

**Build output:**

```
dist/server/
├── index.js           # SSR module (existing)
├── aot-routes.js      # Bundled __ssr_* functions (NEW)
└── aot-manifest.json  # Component metadata + route mapping (EXTENDED)
```

**Build log:**

```
Generating AOT manifest...
  ProjectCard: data-driven
  ProjectsPage: conditional, 1 hole (DialogTrigger)
  LoginPage: runtime-fallback
  Coverage: 18/23 components (78%)
  AOT routes module: dist/server/aot-routes.js
  Route mapping: 12 routes mapped
  /projects -> __ssr_ProjectsPage (AOT)
  /projects/:id -> __ssr_ProjectLayout (AOT, 1 hole)
  /login -> fallback (runtime-fallback)
```

### 3. Runtime: Handler integration

Add AOT support to `createSSRHandler()`:

```ts
export interface SSRHandlerOptions {
  // ... existing options ...
  /** AOT manifest with pre-compiled render functions. Loaded via loadAotManifest(). */
  aotManifest?: AotManifest;
}
```

The `aotManifest` is captured in the handler's closure (like `manifest` already is):

```ts
const { aotManifest, /* ...existing... */ } = options;

// In the request handler:
if (aotManifest && !useProgressive) {
  const result = await ssrRenderAot(module, url, {
    aotManifest,
    manifest,
    ssrTimeout,
    fallbackMetrics,
    ssrAuth,
    prefetchSession,
  });

  // ssrRenderAot() falls back to ssrRenderSinglePass() for unmatched routes
  if (result.redirect) {
    return new Response(null, { status: 302, headers: { Location: result.redirect.to } });
  }

  const modulepreloadTags = resolveRouteModulepreload(
    routeChunkManifest, result.matchedRoutePatterns, staticModulepreloadTags,
  );
  const html = injectIntoTemplate({ template, appHtml: result.html, /* ... */ });
  return new Response(html, { status: 200, headers });
}

// Existing single-pass path (unchanged)
```

**Required fixes to `ssrRenderAot()`:**

1. **Data prefetch**: Before calling `aotEntry.render()`, populate the `queryCache` using the zero-discovery prefetch pipeline:
   - Get `ExtractedQuery[]` from `SSRPrefetchManifest.routeEntries` for the matched route pattern
   - Call `reconstructDescriptors(queries, match.params, module.api)` from `ssr-manifest-prefetch.ts`
   - Call `prefetchFromDescriptors(descriptors, ssrTimeout)` to fetch data in parallel
   - Populate `queryCache` with results, keyed by `entity-operation` format (matching compiler convention)

2. **`matchedRoutePatterns`**: Return `matchedRoutePatterns: [match.pattern]` in the result so per-route modulepreload works.

3. **Redirect safety**: After AOT render (which may invoke hole closures), check if any hole set `ssrRedirect` on its context. Routes containing `ProtectedRoute` are naturally classified as `runtime-fallback` (imperative side effects the compiler can't statically analyze), but as a safety net, `ssrRenderAot()` should check for redirects from hole execution.

### 4. Startup: Load AOT manifest

```ts
/**
 * Load AOT manifest from the server build directory.
 * Returns undefined if AOT files don't exist (graceful fallback).
 */
export async function loadAotManifest(
  serverDir: string,
): Promise<AotManifest | undefined> {
  const aotRoutesPath = resolve(serverDir, 'aot-routes.js');
  const aotManifestPath = resolve(serverDir, 'aot-manifest.json');

  try {
    const manifestExists = await Bun.file(aotManifestPath).exists();
    if (!manifestExists) return undefined;

    const [aotModule, manifestRaw] = await Promise.all([
      import(aotRoutesPath),
      Bun.file(aotManifestPath).text(),
    ]);

    const manifest = JSON.parse(manifestRaw) as {
      routes?: Record<string, { functionName: string; holes: string[]; queryKeys?: string[] }>;
    };

    if (!manifest.routes) return undefined;

    const routes: Record<string, AotRouteEntry> = {};

    for (const [pattern, entry] of Object.entries(manifest.routes)) {
      const renderFn = aotModule[entry.functionName];
      if (typeof renderFn !== 'function') {
        console.warn(`[AOT] Route ${pattern}: missing function ${entry.functionName}, using fallback`);
        continue;
      }
      routes[pattern] = {
        render: renderFn as AotRenderFn,
        holes: entry.holes,
        queryKeys: entry.queryKeys,
      };
    }

    const routeCount = Object.keys(routes).length;
    if (routeCount === 0) return undefined;

    console.log(`[AOT] Loaded ${routeCount} AOT route(s)`);
    return { routes };
  } catch (err) {
    console.warn('[AOT] Failed to load AOT manifest:', err instanceof Error ? err.message : err);
    return undefined;
  }
}
```

### 5. `vertz start` integration

The `start` command auto-loads AOT when available:

```ts
const serverDir = resolve(projectRoot, 'dist/server');
const aotManifest = await loadAotManifest(serverDir);

const handler = createSSRHandler({
  module,
  template,
  aotManifest,
  // ... existing options
});
```

Since `loadAotManifest()` returns `undefined` when files don't exist, this is backward-compatible.

### Adapter integration (example: Bun)

```ts
import { createSSRHandler, loadAotManifest } from '@vertz/ui-server';
import { resolve } from 'node:path';

const serverDir = resolve(import.meta.dir, 'dist/server');
const module = await import(resolve(serverDir, 'index.js'));
const template = await Bun.file(resolve('dist/client/index.html')).text();

const handler = createSSRHandler({
  module,
  template,
  aotManifest: await loadAotManifest(serverDir),
});
```

## API Surface

### No change to developer-facing APIs

Developers write the same components. AOT is a transparent build optimization.

### Framework/adapter API

```ts
// New export from @vertz/ui-server
export function loadAotManifest(serverDir: string): Promise<AotManifest | undefined>;

// Extended existing interface
export interface SSRHandlerOptions {
  aotManifest?: AotManifest;  // NEW optional field
}
```

## Manifesto Alignment

### Principle 7: Performance is not optional

Delivers POC-validated 4-6x render speedup to production.

### Principle 2: One way to do things

No configuration. `vertz build` emits AOT when possible. `vertz start` loads it automatically. Fallback is transparent.

### Principle 1: If it builds, it works

AOT functions are compiled at build time. If the build succeeds, HTML output is correct — verified by byte-identical comparison in CI.

## Non-Goals

1. **Progressive streaming with AOT** — AOT targets buffered rendering. Progressive/streaming continues to use `ssrRenderSinglePass()`.
2. **Dev server AOT rendering** — Dev mode uses single-pass. `VERTZ_DEBUG=aot` validates parity.
3. **Route-level opt-out** — If a component is `runtime-fallback`, the route uses single-pass automatically.
4. **Source maps for AOT module** — Deferred. Errors trace to components via `__ssr_ComponentName` naming.

## Unknowns

### 1. CSS collection completeness for AOT-rendered pages

**Question:** When a page renders via AOT (skipping the component tree), does `collectCSSFromModule()` return all needed CSS?

**Current thinking:** `css()` calls execute at module-import time (when `aot-routes.js` loads), so CSS should be available. The full SSR module's `getInjectedCSS()` is used for CSS collection (not the AOT module), so all component CSS is included.

**Resolution path:** Verify during Phase 4 E2E testing.

## Data Flow Map

```
BUILD TIME:
  *.tsx files
    | compileForSSRAot() per file (with compiler fix for query data)
    v
  AotBuildManifest { components, compiledFiles }
    |
    +--> Bun.build() (bundle, tree-shake, strip TS)
    |    v
    |    dist/server/aot-routes.js
    |
    +--> Discovery pass (reuse existing SSR module import)
    |    | Map route patterns -> component names -> __ssr_* functions
    |    v
    +--> dist/server/aot-manifest.json { components + routes }

STARTUP:
  loadAotManifest(serverDir)
    | Import aot-routes.js + read aot-manifest.json
    | Resolve route -> render function references
    v
  AotManifest { routes: { pattern -> { render: fn, holes, queryKeys } } }
    v
  createSSRHandler({ module, template, aotManifest })

REQUEST TIME:
  Request -> URL
    v
  ssrRenderAot(module, url, { aotManifest, manifest, ... })
    | Match URL to AOT route patterns
    | (no match -> ssrRenderSinglePass fallback)
    |
    | Zero-discovery prefetch (from SSRPrefetchManifest)
    v
  aotEntry.render(data, ctx) -> HTML string
    v
  SSRRenderResult { html, css, ssrData, headTags, matchedRoutePatterns }
    v
  injectIntoTemplate() -> Response
```

## E2E Acceptance Test

```typescript
describe('Feature: AOT SSR wire-up (#1843)', () => {
  describe('Given a page component with query() calls', () => {
    describe('When compiled with compileForSSRAot()', () => {
      it('Then __ssr_* function accepts (data, ctx) parameters', () => {});
      it('Then query().data references use ctx.getData(key)', () => {});
      it('Then query().loading is replaced with false', () => {});
      it('Then queryKeys are emitted in AotComponentInfo', () => {});
    });
  });

  describe('Given a props-only child component', () => {
    describe('When compiled with compileForSSRAot()', () => {
      it('Then __ssr_* function accepts (props) parameter (unchanged)', () => {});
    });
  });

  describe('Given a project built with vertz build', () => {
    describe('When the build completes', () => {
      it('Then dist/server/aot-routes.js exists and is importable', () => {});
      it('Then dist/server/aot-manifest.json contains routes mapping', () => {});
      it('Then build log shows which routes use AOT vs fallback', () => {});
    });
  });

  describe('Given loadAotManifest(serverDir)', () => {
    describe('When AOT files exist', () => {
      it('Then returns AotManifest with render functions', () => {});
    });

    describe('When AOT files do not exist', () => {
      it('Then returns undefined', () => {});
    });

    describe('When AOT files exist but fail to load', () => {
      it('Then logs warning and returns undefined', () => {});
    });
  });

  describe('Given createSSRHandler() with aotManifest', () => {
    describe('When request matches an AOT route', () => {
      it('Then ssrRenderAot() is called', () => {});
      it('Then HTML output is identical to single-pass rendering', () => {});
      it('Then ssrData is populated for client hydration', () => {});
      it('Then CSS is collected correctly', () => {});
      it('Then matchedRoutePatterns is returned for modulepreload', () => {});
    });

    describe('When request matches a non-AOT route', () => {
      it('Then ssrRenderSinglePass() is used as fallback', () => {});
    });
  });

  describe('Given createSSRHandler() without aotManifest', () => {
    describe('When any request arrives', () => {
      it('Then ssrRenderSinglePass() is used (backward compatible)', () => {});
    });
  });

  describe('Given vertz start with AOT build output', () => {
    describe('When the server starts', () => {
      it('Then AOT manifest is loaded automatically', () => {});
    });
  });

  describe('Given an AOT route with runtime holes', () => {
    describe('When rendering the route', () => {
      it('Then AOT shell renders via string concatenation', () => {});
      it('Then holes are filled via DOM shim closures', () => {});
      it('Then combined output matches full single-pass rendering', () => {});
    });
  });

  describe('Given SSRHandlerOptions', () => {
    // @ts-expect-error — aotManifest must be AotManifest | undefined, not a string
    createSSRHandler({ module, template, aotManifest: 'invalid' });
  });
});
```

## Implementation Phases

Phase dependencies: Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 (sequential).

### Phase 1: Compiler fix — standalone page-level AOT functions

**What:**
- Modify `AotStringTransformer._emitAotFunction()` to detect query-sourced variables
- Replace `queryVar.data` references with `ctx.getData(cacheKey)` in the string expression
- Replace `queryVar.loading` with `false`, `queryVar.error` with `undefined`
- Add `data: Record<string, unknown>, ctx: SSRAotContext` parameters for page components
- Emit `queryKeys` in `AotComponentInfo`
- Child-only components (no `query()`) keep `(props)` signature — unchanged

**Acceptance criteria:**

```typescript
describe('Feature: Standalone page-level AOT functions', () => {
  describe('Given a component with query() calls', () => {
    describe('When compiled with compileForSSRAot()', () => {
      it('Then __ssr_* function has (data, ctx) signature', () => {});
      it('Then query().data references become ctx.getData(key)', () => {});
      it('Then query().loading becomes false', () => {});
      it('Then queryKeys lists all query cache keys', () => {});
      it('Then the function is callable standalone with data + ctx', () => {});
      it('Then output matches DOM shim rendering for same data', () => {});
    });
  });

  describe('Given a props-only component', () => {
    describe('When compiled with compileForSSRAot()', () => {
      it('Then __ssr_* function keeps (props) signature', () => {});
      it('Then behavior is unchanged from current implementation', () => {});
    });
  });
});
```

### Phase 2: Build-time AOT module emission

**What:**
- Extend `generateAotBuildManifest()` to preserve compiled code
- New `emitAotRoutesModule()` — extract `__ssr_*` functions, generate barrel, bundle via `Bun.build()`
- Route discovery pass + mapping into unified `aot-manifest.json`
- CLI build pipeline integration
- Build log with per-route AOT status

**Acceptance criteria:**

```typescript
describe('Feature: Build-time AOT emission', () => {
  describe('Given a source directory with AOT-eligible components', () => {
    describe('When the build pipeline runs', () => {
      it('Then dist/server/aot-routes.js is a valid importable JS module', () => {});
      it('Then all __ssr_* functions are exported and callable', () => {});
      it('Then file-scoped variables (css() results) are preserved', () => {});
      it('Then cross-component __ssr_* calls resolve within the module', () => {});
      it('Then aot-manifest.json contains component metadata and route mapping', () => {});
      it('Then build log shows per-route AOT vs fallback status', () => {});
    });
  });
});
```

### Phase 3: Runtime handler integration + `vertz start`

**What:**
- New `loadAotManifest(serverDir)` in `@vertz/ui-server`
- Add `aotManifest?: AotManifest` to `SSRHandlerOptions`
- Wire `ssrRenderAot()` into `createSSRHandler()` (captured in closure)
- Extend `ssrRenderAot()` to return `matchedRoutePatterns`
- `vertz start` auto-loads AOT manifest
- Changeset

**Acceptance criteria:**

```typescript
describe('Feature: Runtime handler integration', () => {
  describe('Given createSSRHandler() with aotManifest', () => {
    describe('When request matches an AOT route', () => {
      it('Then ssrRenderAot() is invoked', () => {});
      it('Then HTML matches ssrRenderSinglePass() for same URL', () => {});
      it('Then ssrData and CSS are correct', () => {});
      it('Then matchedRoutePatterns is returned', () => {});
    });

    describe('When request matches a non-AOT route', () => {
      it('Then ssrRenderSinglePass() is used', () => {});
    });
  });

  describe('Given createSSRHandler() without aotManifest', () => {
    it('Then ssrRenderSinglePass() is used (backward compatible)', () => {});
  });

  describe('Given vertz start with AOT build output', () => {
    it('Then AOT manifest is loaded automatically', () => {});
  });
});
```

### Phase 4: E2E validation and docs

**What:**
- Full `vertz build` -> `serve` -> `request` E2E test
- HTML parity: AOT output === single-pass output for all routes
- Client hydration verification
- Documentation updates in `packages/mint-docs/`

**Acceptance criteria:**

```typescript
describe('Feature: E2E AOT validation', () => {
  describe('Given a full vertz build of the task-manager example', () => {
    describe('When the production server receives requests', () => {
      it('Then AOT routes render via string concatenation', () => {});
      it('Then fallback routes render via ssrRenderSinglePass', () => {});
      it('Then HTML output matches between AOT and single-pass for all routes', () => {});
      it('Then client hydration works correctly on AOT-rendered pages', () => {});
    });
  });
});
```

## Risks

1. **Query cache key resolution** — The compiler needs to determine cache keys for `query()` calls at compile time. The cache key format (`GET:/entity?params`) is deterministic from the query descriptor. The `ReactivityAnalyzer` already tracks query sources; extending it to extract cache keys is targeted work.

2. **`Bun.build()` in the build pipeline** — Adds a bundling step. `Bun.build()` is fast (sub-second for typical component counts). AOT compilation itself is already the bottleneck.

3. **Route discovery side effects** — The discovery pass imports the SSR module, but this import already happens during prefetch manifest generation. No additional risk.

4. **Backward compatibility** — `aotManifest` is optional. `loadAotManifest()` returns `undefined` when files don't exist. `vertz start` degrades silently. Zero risk.
