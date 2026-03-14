# POC: CLI ↔ `@vertz/ui-compiler` Build Contract

**Issue:** #1161
**Date:** 2026-03-11
**Status:** Complete

---

## Question

What is the thinnest viable compiler contract the CLI should invoke, where does the responsibility boundary stop, and what are the exact success/failure signals?

## Current State

### The placeholder

`packages/cli/src/pipeline/orchestrator.ts` lines 351–367 — `runBuildUI()` returns a hardcoded success without doing any work:

```ts
private async runBuildUI(): Promise<StageResult> {
  return {
    stage: 'build-ui',
    success: true,
    durationMs: performance.now() - startTime,
    output: 'UI build delegated to Vite',
  };
}
```

### Two existing integration paths

| Path | Where | How compiler is reached |
|------|-------|------------------------|
| **Dev server** | `@vertz/ui-server` bun plugin | `createVertzBunPlugin()` → per-file `onLoad` → `compile()` |
| **Production build** | `packages/cli/src/production-build/ui-build-pipeline.ts` | `buildUI()` dynamically imports `createVertzBunPlugin` from `@vertz/ui-server/bun-plugin`, passes it to `Bun.build()` |

Both paths reach the compiler **through `@vertz/ui-server/bun-plugin`**, not through `@vertz/ui-compiler` directly. The CLI has no direct dependency on `@vertz/ui-compiler` in its `package.json` (it reaches it transitively via `@vertz/ui-server`).

### Note: Vite is no longer in the picture

The issue description and the orchestrator placeholder string both say "UI build delegated to Vite." This is stale. The Vite plugin was removed from `@vertz/ui-compiler` (its index.ts says: `// Note: Vite plugin has been removed`). The CLI has no Vite dependency. Both the dev server and the production build use Bun's bundler exclusively. All references to "Vite" in the orchestrator and the implementation plan should be read as "Bun's bundler."

### The bun plugin transform pipeline (per file)

1. Hydration transform (adds `__hydrationId`)
2. Context stable IDs (if `fastRefresh`)
3. Field selection injection (cross-file query field tracking)
4. Image transform (`<Image>` → `<picture>`)
5. **`compile()`** — reactive signal + JSX transforms
6. Source map chaining (remaps compile → image → hydration)
7. CSS extraction → sidecar file
8. Fast Refresh wrapping (if `fastRefresh`)
9. HMR accept injection
10. Final output assembly

`compile()` is one step in this pipeline. The CLI should NOT replicate this pipeline — the bun plugin already encapsulates it.

---

## Proposed Contract

### The CLI should invoke `createVertzBunPlugin`, not `compile()` directly

The thinnest correct contract is the one the production build already uses:

```ts
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const { plugin, fileExtractions } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
});
```

**Why not call `compile()` directly?**

- `compile()` is one step in a 10-step pipeline. Calling it alone skips hydration, field selection, image transforms, CSS extraction, source map chaining, and output assembly.
- The bun plugin handles manifest generation (`generateAllManifests()`) at construction time. Calling `compile()` without manifests means no cross-file reactivity analysis — signal transforms will miss imported reactive APIs.
- CSS extraction is a separate step that produces sidecar files. The CLI would need to replicate that logic.
- Source maps from `compile()` need chaining with upstream transforms. The plugin handles this.

### Responsibility boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ @vertz/cli                                                  │
│                                                             │
│  Responsibilities:                                          │
│  • Detect app type (API-only / UI / full-stack)             │
│  • Resolve entry points (client + server)                   │
│  • Call createVertzBunPlugin() with correct options          │
│  • Pass plugin to Bun.build() with bundler config           │
│  • Collect fileExtractions for CSS output                   │
│  • Generate HTML shell                                      │
│  • Copy public/ assets                                      │
│  • Report stage success/failure + diagnostics               │
│  • Orchestrate client build + server build sequentially     │
│                                                             │
│  Does NOT own:                                              │
│  • Compilation transforms (signal, JSX, mutation, etc.)     │
│  • Manifest generation or cross-file analysis               │
│  • CSS extraction logic                                     │
│  • Source map chaining                                      │
│  • Image optimization                                       │
│  • Fast Refresh / HMR wiring                                │
└─────────────────────────────────────────────────────────────┘
         │
         │ createVertzBunPlugin({ hmr: false, fastRefresh: false })
         ▼
┌─────────────────────────────────────────────────────────────┐
│ @vertz/ui-server (bun-plugin)                               │
│                                                             │
│  Responsibilities:                                          │
│  • Plugin construction + manifest pre-pass                  │
│  • Per-file transform pipeline (8 stages)                   │
│  • CSS sidecar file management                              │
│  • Source map chaining                                       │
│  • Expose fileExtractions + cssSidecarMap                   │
│                                                             │
│  Does NOT own:                                              │
│  • Bundler configuration (entry points, splitting, minify)  │
│  • Output directory structure                               │
│  • HTML generation                                          │
│  • Server build                                             │
└─────────────────────────────────────────────────────────────┘
         │
         │ compile(source, { filename, target, manifests })
         ▼
┌─────────────────────────────────────────────────────────────┐
│ @vertz/ui-compiler                                          │
│                                                             │
│  Responsibilities:                                          │
│  • Single-file reactive transforms                          │
│  • Signal / computed / JSX / mutation / prop transforms     │
│  • Diagnostics (errors, warnings)                           │
│  • Source map generation (v3)                                │
│  • Manifest generation (generateAllManifests)               │
│                                                             │
│  Does NOT own:                                              │
│  • File I/O                                                 │
│  • CSS extraction (separate CSSExtractor)                   │
│  • Hydration IDs, stable IDs, field selection               │
│  • Bundling                                                 │
└─────────────────────────────────────────────────────────────┘
```

### What remains delegated to Bun/app bundling

| Concern | Owner |
|---------|-------|
| Module resolution | Bun's bundler |
| Code splitting | Bun's `splitting: true` option |
| Minification | Bun's `minify` option |
| Tree shaking | Bun's bundler + `sideEffects` metadata |
| Asset hashing | Bun's `naming: '[name]-[hash].[ext]'` |
| Target selection (browser/bun) | CLI passes to `Bun.build({ target })` |
| External modules | CLI decides via `Bun.build({ external })` |

---

## What the `build-ui` stage should do

### For the dev pipeline (`vertz dev`)

The `build-ui` stage in `PipelineOrchestrator` should **validate that the compiler contract is available** — not perform a full production build. The dev server handles per-file compilation via the bun plugin. The stage should:

1. Import `createVertzBunPlugin` from `@vertz/ui-server/bun-plugin`
2. Call it with `{ hmr: false, fastRefresh: false }` to validate construction succeeds (manifest generation, framework manifest loading)
3. Report success with manifest stats, or failure with the error

This is a **smoke check**, not a build. The actual compilation happens on-demand in the dev server's `onLoad` hook.

### For the production pipeline (`vertz build`)

The existing `buildUI()` in `packages/cli/src/production-build/ui-build-pipeline.ts` already does the right thing. The `build-ui` stage in the orchestrator should delegate to this function.

---

## Success and Failure Signals

### Success path example

```ts
// CLI calls:
const { plugin, fileExtractions } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
  projectRoot: '/app',
  srcDir: '/app/src',
});

const result = await Bun.build({
  entrypoints: ['/app/src/entry-client.ts'],
  plugins: [plugin],
  target: 'browser',
  outdir: '/app/dist/client/assets',
  splitting: true,
  minify: true,
});

// Success signals:
assert(result.success === true);
assert(result.outputs.length > 0);
assert(result.outputs.some(o => o.kind === 'entry-point'));

// CSS extraction available:
assert(fileExtractions.size > 0); // at least one .tsx file was transformed

// Stage result:
return {
  stage: 'build-ui',
  success: true,
  durationMs: elapsed,
  output: `Built ${result.outputs.length} assets, extracted CSS from ${fileExtractions.size} files`,
};
```

### Failure path example: plugin construction fails

```ts
// Scenario: framework manifest is missing or corrupt
try {
  const { plugin } = createVertzBunPlugin({
    hmr: false,
    fastRefresh: false,
    projectRoot: '/app',
  });
} catch (error) {
  // Failure signal: plugin construction threw
  // This means manifest generation or framework manifest loading failed
  return {
    stage: 'build-ui',
    success: false,
    durationMs: elapsed,
    error: new Error(`UI compiler initialization failed: ${error.message}`),
  };
}
```

### Failure path example: compilation fails

```ts
const result = await Bun.build({
  entrypoints: ['/app/src/entry-client.ts'],
  plugins: [plugin],
  target: 'browser',
  outdir: '/app/dist/client/assets',
});

if (!result.success) {
  // Failure signal: Bun.build reports failure
  // result.logs contains error messages from the bundler AND the plugin
  const errors = result.logs
    .filter(l => l.level === 'error')
    .map(l => l.message)
    .join('\n');

  return {
    stage: 'build-ui',
    success: false,
    durationMs: elapsed,
    error: new Error(`UI build failed:\n${errors}`),
  };
}
```

### Failure path example: compiler diagnostics

The plugin does NOT currently surface `CompilerDiagnostic[]` to the caller. Diagnostics from `compile()` are:
- **Errors**: thrown, which makes Bun's `onLoad` fail → `result.success = false`
- **Warnings**: logged to `console.warn` (or via `logger` if provided)

For the implementation, the CLI should pass a `DiagnosticsCollector` to capture warnings and display them after the build, even on success.

---

## Minimal Files/Interfaces the Implementation Should Change

### Files to modify

| File | Change |
|------|--------|
| `packages/cli/src/pipeline/orchestrator.ts` | Replace `runBuildUI()` placeholder with real plugin validation (dev) or `buildUI()` delegation (prod) |
| `packages/cli/src/pipeline/__tests__/orchestrator.test.ts` | Add tests for build-ui success/failure paths |

### Files that should NOT change

| File | Why |
|------|-----|
| `packages/ui-compiler/src/*` | Compiler API is already correct — `compile()` and `generateAllManifests()` are stable |
| `packages/ui-server/src/bun-plugin/plugin.ts` | Plugin contract is already correct — `createVertzBunPlugin()` returns the right shape |
| `packages/cli/src/production-build/ui-build-pipeline.ts` | Already implements the correct production build path |

### Interfaces that already exist and are sufficient

| Interface | Package | Purpose |
|-----------|---------|---------|
| `VertzBunPluginOptions` | `@vertz/ui-server` | Plugin construction options |
| `VertzBunPluginResult` | `@vertz/ui-server` | Plugin + fileExtractions + cssSidecarMap |
| `CompileOptions` | `@vertz/ui-compiler` | Single-file compile options (used internally by plugin) |
| `CompileOutput` | `@vertz/ui-compiler` | Single-file compile result (used internally by plugin) |
| `StageResult` | `@vertz/cli` | Pipeline stage result (already exists) |

### No new interfaces needed

The existing contract is sufficient. The implementation should:
1. Import `createVertzBunPlugin` (already a dependency via `@vertz/ui-server`)
2. Use existing `StageResult` for reporting
3. Optionally pass a `DiagnosticsCollector` for warning collection

---

## Implementation Plan Correction

The implementation plan (`package-runtime-hardening-implementation.md`) Phase 4 references `@vertz/ui-compiler` as the CLI's direct contract:

- "CLI `build-ui` stage should call a real `@vertz/ui-compiler` contract"
- "wire the thinnest real `ui-compiler` contract into the stage"
- Files list includes `packages/ui-compiler/src/*`

**This is incorrect.** The CLI's contract is `createVertzBunPlugin()` from `@vertz/ui-server/bun-plugin`, not `compile()` from `@vertz/ui-compiler`. The implementation plan Phase 4 should be updated before implementation starts:

1. Remove `packages/ui-compiler/src/*` from the files list
2. Update the architecture table to reference `@vertz/ui-server/bun-plugin`
3. Update TDD cycle 3 and 4 descriptions to say "real `@vertz/ui-server/bun-plugin` contract" instead of "real `ui-compiler` contract"

---

## Dev-Mode Smoke Check: Cost Considerations

The proposed dev-mode validation (calling `createVertzBunPlugin()` to validate the contract is available) has a cost: plugin construction calls `generateAllManifests()`, which parses all `.tsx` files with ts-morph. The dev server will call `createVertzBunPlugin()` again shortly after, duplicating this work.

Options for the implementation:
1. **Share the plugin instance** — `runBuildUI()` creates the plugin and passes it to the dev server stage, avoiding the duplicate manifest pass
2. **Lighter validation** — import the module and check that `createVertzBunPlugin` is a function, without calling it
3. **Accept the cost** — the manifest pass is fast for small projects and runs once at startup

Option 1 is the cleanest. The implementing agent should evaluate which approach fits the orchestrator's current architecture.

---

## Key Finding: The Seam Is Already Closed in Production

The production build path (`ui-build-pipeline.ts`) already implements the correct CLI ↔ compiler integration. The gap is only in the **dev pipeline orchestrator**, where `runBuildUI()` is a no-op.

The implementation issue should:
1. Make `runBuildUI()` validate plugin construction in dev mode
2. Update pipeline tests to reject placeholder behavior
3. Optionally surface compiler warnings through the CLI's diagnostic reporting

This is a small, well-scoped change. The compiler contract does not need redesigning.

---

## POC Conclusion

**The thinnest viable contract is `createVertzBunPlugin()` from `@vertz/ui-server/bun-plugin`.** The CLI should never call `compile()` directly — the bun plugin encapsulates the full transform pipeline (10 stages), manifest generation, CSS extraction, and source map chaining. The CLI's job is to configure the plugin, pass it to `Bun.build()`, and report results. This boundary is already proven by the production build path.
