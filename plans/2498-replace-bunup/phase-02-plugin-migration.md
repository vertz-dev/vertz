# Phase 2: Adapt createVertzLibraryPlugin to esbuild

## Context

This is Phase 2 of replacing bunup (#2498). We migrate `createVertzLibraryPlugin` in `@vertz/ui-server` from returning a `BunPlugin` to returning an esbuild `Plugin`. We also convert `fixBarrelReExports` and `stripBareChunkImports` from `BunupPlugin` hooks to `@vertz/build` `PostBuildHook` objects.

Design doc: `plans/2498-replace-bunup.md`

## Tasks

### Task 1: Migrate createVertzLibraryPlugin to esbuild Plugin

**Files:**
- `packages/ui-server/src/compiler/library-plugin.ts` (modified)
- `packages/ui-server/src/compiler/__tests__/library-plugin.test.ts` (modified or new)
- `packages/ui-server/package.json` (modified — add esbuild dependency)

**What to implement:**

Change `createVertzLibraryPlugin` to return an esbuild `Plugin` instead of `BunPlugin`:

1. Change import from `import type { BunPlugin } from 'bun'` to `import type { Plugin } from 'esbuild'`
2. Change return type to `Plugin`
3. **Replace `Bun.Transpiler` in exclude path** with `esbuild.transform()`:
   ```typescript
   import { transform } from 'esbuild';

   if (options?.exclude?.test(args.path)) {
     const { code } = await transform(source, {
       loader: 'tsx',
       jsx: 'automatic',
       jsxImportSource: '@vertz/ui',
     });
     return { contents: code, loader: 'js' };
   }
   ```
4. **Change return `loader: 'tsx'` to `loader: 'js'`** in the main path — the native compiler already transforms JSX and strips TypeScript, so the output is plain JS.
5. Source map inlining stays the same (base64 data URL).

**Acceptance criteria:**
- [ ] `createVertzLibraryPlugin()` returns an esbuild `Plugin` (has `name` + `setup(build)`)
- [ ] Main path: `.tsx` files are compiled via native compiler, returned with `loader: 'js'`
- [ ] Exclude path: `.tsx` files are transformed via `esbuild.transform()` with JSX automatic mode
- [ ] Source maps are inlined as base64
- [ ] No `Bun.Transpiler` or `BunPlugin` imports remain
- [ ] Existing tests still pass

---

### Task 2: Convert fixBarrelReExports to PostBuildHook

**Files:**
- `packages/ui-primitives/src/build-hooks.ts` (new — extract from bunup.config.ts)
- `packages/ui-primitives/src/__tests__/build-hooks.test.ts` (new)

**What to implement:**

Extract `fixBarrelReExports` from `bunup.config.ts` into a reusable module that returns a `PostBuildHook` (from `@vertz/build`).

The current implementation:
- Reads the source barrel (`src/index.ts`) to find re-export patterns
- Rewrites the built barrel with proper `export * from` statements
- Receives files via `onBuildDone({ files })`

The new implementation:
- Returns `{ name: 'fix-barrel-re-exports', handler: (ctx) => { ... } }`
- Uses `ctx.outputFiles` instead of `files` parameter
- Matches files using `ctx.outputFiles` and `ctx.outDir`

**Note:** This hook may not be needed with esbuild at all — esbuild may handle barrel re-exports correctly. Add a test that detects whether the fix is actually needed and skip it if not. This will be validated during Phase 4 integration.

**Acceptance criteria:**
- [ ] Returns a `PostBuildHook` with `name` and `handler`
- [ ] Reads source barrel and rewrites built barrel with proper re-exports
- [ ] Uses `PostBuildContext` API (not bunup's `BuildOutputFile`)

---

### Task 3: Convert stripBareChunkImports to PostBuildHook

**Files:**
- `packages/ui-primitives/src/build-hooks.ts` (modified — add second hook)
- `packages/ui-primitives/src/__tests__/build-hooks.test.ts` (modified)

**What to implement:**

Convert `stripBareChunkImports` to a `PostBuildHook`. The current implementation strips `import "chunk-*.js"` bare imports from entry-point files. The new version uses `PostBuildContext`.

**Note:** Same as above — this may not be needed with esbuild. Add detection logic.

**Acceptance criteria:**
- [ ] Returns a `PostBuildHook` with `name` and `handler`
- [ ] Strips bare chunk imports from entry-point files
- [ ] Skips the barrel file (handled by fixBarrelReExports)
- [ ] Uses `PostBuildContext` API

---

### Task 4: Convert stripDeadRequireImports to PostBuildHook

**Files:**
- `packages/db/src/build-hooks.ts` (new — extract from bunup.config.ts)
- `packages/db/src/__tests__/build-hooks.test.ts` (new)

**What to implement:**

Convert the db package's `stripDeadRequireImports` from a plain async function to a `PostBuildHook`. The current implementation:
- Hardcodes file paths relative to `dist/`
- Strips `import "chunk..."` and `import { __require }` from entries that don't use CJS require

The new version should use `PostBuildContext.outDir` for paths and `PostBuildContext.outputFiles` for file discovery where possible.

**Note:** This hook may be unnecessary with esbuild if ESM output doesn't generate `__require` patterns. Add detection logic to skip if no `__require` patterns exist.

**Acceptance criteria:**
- [ ] Returns a `PostBuildHook` with `name` and `handler`
- [ ] Strips dead `__require` imports from dialect-agnostic entries
- [ ] Leaves entries that genuinely use `__require` untouched
- [ ] Uses `PostBuildContext` API
