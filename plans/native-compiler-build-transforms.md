# Native Compiler: Build-Time Transforms (#1910)

## Overview

Port 7 build-time transforms from ts-morph TypeScript to the native Rust/oxc compiler. These transforms currently only run at production build time where ts-morph's ~50-200ms/file cost is amortized, but porting them enables a complete `VERTZ_NATIVE_COMPILER=1` experience.

## API Surface

No new public API — this is a 1:1 port of existing transforms. The `compile()` NAPI function gains new `CompileOptions` fields:

```typescript
interface CompileOptions {
  filename?: string;
  fast_refresh?: boolean;
  target?: string;  // 'dom' | 'ssr'
  manifests?: NapiManifestEntry[];
  // NEW — build-time options:
  route_splitting?: boolean;    // Phase 1
  aot_ssr?: boolean;            // Phase 4
  hydration_markers?: boolean;  // Phase 2
  field_selection?: boolean;    // Phase 5
  prefetch_manifest?: boolean;  // Phase 6
}
```

Output gains build-time metadata in `CompileResult`:

```typescript
interface CompileResult {
  code: string;
  css?: string;
  map?: string;
  diagnostics?: Diagnostic[];
  components?: NapiComponentInfo[];
  // NEW:
  field_selections?: FieldSelectionEntry[];
  prefetch_manifest?: PrefetchManifestEntry[];
  hydration_ids?: string[];
}
```

## Non-Goals

- CSS token resolution (already handled by existing `css_transform.rs`)
- Cross-file analysis (manifests handle cross-file via NAPI input)
- Changing any transform behavior — strict 1:1 parity with ts-morph

## Implementation Plan

### Phase 1: Route Code Splitting (503 LoC TS → ~400 LoC Rust)

Self-contained transform. Rewrites `defineRoutes()` to use dynamic `import()`.

**Acceptance Criteria:**
- `defineRoutes({ '/': () => <Home /> })` → dynamic import with `.then(m => ...)`
- Static imports of lazified components are cleaned up
- Components used outside route factories are NOT lazified
- Block body arrow functions are skipped
- Already-lazy imports are preserved

### Phase 2: Hydration Markers (130 LoC TS → ~100 LoC Rust)

Simplest transform. Injects `data-v-id` into root JSX of stateful components.

**Acceptance Criteria:**
- Components with `let` declarations get `data-v-id="ComponentName"` on root element
- Pure components (no `let`) are not marked
- Nested functions don't trigger marking
- Works with both regular and arrow function components

### Phase 3: Field Selection Analyzer (600 LoC TS → ~500 LoC Rust)

Analysis-only (no code transform). Extracts field access patterns from `query()` calls.

**Acceptance Criteria:**
- Direct access: `tasks.data.name` → `['name']`
- List item access: `tasks.data.items.map(t => t.name)` → `['name']`
- Destructuring: `const { name } = tasks.data` → `['name']`
- Spread detection → mark as opaque
- Nested paths: `task.assignee.name` → `[{field: 'assignee', nested: ['name']}]`

### Phase 4: AOT String-Builder SSR (1,248 LoC TS → ~900 LoC Rust)

Most complex transform. Converts components to string concatenation for SSR.

**Acceptance Criteria:**
- Tier classification: static / data-driven / conditional / runtime-fallback
- JSX → string concatenation with HTML escaping
- Query variable extraction from `query(api.entity.operation())`
- Guard pattern detection (if-guarded returns)
- Void elements, boolean attrs, style objects, spread attributes

### Phase 5: Component Prop Analysis + Prefetch Manifest (680 LoC TS → ~500 LoC Rust)

Route → component → query mapping for SSR prefetching.

**Acceptance Criteria:**
- Extracts routes from `defineRoutes()` with nested patterns
- Identifies component names from JSX/function calls/dynamic imports
- Finds `query()` calls in component files
- Extracts descriptor chains and query options
- Binds route params (`$paramName`)

### Phase 6: Integration + Parity Tests

Wire all transforms into the compilation pipeline, add cross-transform parity tests.

**Acceptance Criteria:**
- All 5 build-time transforms can be enabled via CompileOptions
- Cross-compiler equivalence tests for each transform
- Benchmark: native build-time transforms ≥ 10x faster than ts-morph
