# Phase 1: Create @vertz/build Package

## Context

This is the first phase of replacing bunup (#2498). We create `@vertz/build` — a thin wrapper around esbuild (JS bundling) + tsc (DTS generation) that reads `build.config.ts` files and produces ESM + .d.ts output identical to what bunup produces today.

Design doc: `plans/2498-replace-bunup.md`

## Tasks

### Task 1: Package scaffolding and `defineConfig` types

**Files:**
- `packages/build/package.json` (new)
- `packages/build/tsconfig.json` (new)
- `packages/build/src/types.ts` (new)
- `packages/build/src/index.ts` (new)
- `packages/build/src/__tests__/types.test.ts` (new)

**What to implement:**

Create the `@vertz/build` package with the config type definitions and `defineConfig` identity function.

```typescript
// types.ts
import type { Plugin } from 'esbuild';

export interface BuildConfig {
  entry: string[];
  dts?: boolean;
  outDir?: string;
  format?: ('esm' | 'cjs')[];
  external?: string[];
  plugins?: Plugin[];
  onSuccess?: PostBuildHook | PostBuildHook[] | (() => void | Promise<void>);
  clean?: boolean;
  target?: 'browser' | 'node' | 'neutral';
  banner?: string | { js?: string; css?: string };
}

export interface PostBuildHook {
  name: string;
  handler: (ctx: PostBuildContext) => void | Promise<void>;
}

export interface PostBuildContext {
  outputFiles: OutputFileInfo[];
  outDir: string;
  packageJson: Record<string, unknown>;
}

export interface OutputFileInfo {
  path: string;
  relativePath: string;
  entrypoint: string | undefined;
  kind: 'entry-point' | 'chunk';
  size: number;
}

// index.ts
export function defineConfig(config: BuildConfig): BuildConfig;
export function defineConfig(config: BuildConfig[]): BuildConfig[];
export function defineConfig(config: BuildConfig | BuildConfig[]): BuildConfig | BuildConfig[] {
  return config;
}
```

**Acceptance criteria:**
- [ ] `defineConfig` accepts a single `BuildConfig` and returns it
- [ ] `defineConfig` accepts a `BuildConfig[]` and returns it
- [ ] All type fields are exported and importable
- [ ] `@ts-expect-error` on invalid config shapes

---

### Task 2: Auto-external detection from package.json

**Files:**
- `packages/build/src/externals.ts` (new)
- `packages/build/src/__tests__/externals.test.ts` (new)

**What to implement:**

A function that reads `package.json` and auto-detects external dependencies (all `dependencies` + `peerDependencies`). The `external` config field adds additional externals on top. Also handle subpath patterns — if `@vertz/ui` is a dependency, both `@vertz/ui` and `@vertz/ui/internals` should be external.

```typescript
export function resolveExternals(
  packageJson: Record<string, unknown>,
  configExternals?: string[],
): string[];
```

**Acceptance criteria:**
- [ ] All `dependencies` keys are included as external
- [ ] All `peerDependencies` keys are included as external
- [ ] `devDependencies` are NOT included as external
- [ ] Config `external` entries are merged in (additive)
- [ ] Duplicate entries are deduplicated
- [ ] Subpath imports of externals are also external (e.g. `@vertz/ui/internals` when `@vertz/ui` is a dep)

---

### Task 3: esbuild bundling core

**Files:**
- `packages/build/src/bundle.ts` (new)
- `packages/build/src/__tests__/bundle.test.ts` (new)
- `packages/build/src/__tests__/fixtures/simple-pkg/` (new — test fixture)

**What to implement:**

The core esbuild bundling function. Takes a resolved `BuildConfig` and runs esbuild to produce ESM output.

```typescript
export interface BundleResult {
  outputFiles: OutputFileInfo[];
  outDir: string;
}

export async function bundle(config: BuildConfig, cwd: string): Promise<BundleResult>;
```

Behavior:
- Calls `esbuild.build()` with `format: 'esm'`, `bundle: true`, `splitting: true`
- Sets `outdir` from config (default: `'dist'`)
- Sets `external` from `resolveExternals()`
- Applies `plugins` from config
- If `clean: true`, removes `outDir` before building
- If `banner` is set, applies it (normalize string to `{ js: string }`)
- `target` maps: `'browser'` → `'es2020'`, `'node'` → `'node18'`, `'neutral'` → `'esnext'` (default)
- Returns list of output files with metadata

Test fixture: a minimal package with `src/index.ts` exporting a function and a `package.json` with one dependency.

**Acceptance criteria:**
- [ ] Produces `.js` files in the output directory
- [ ] Dependencies from package.json are external (not bundled)
- [ ] Config `external` entries are respected
- [ ] `clean: true` removes output dir before building
- [ ] `banner` string is prepended to JS output
- [ ] Multi-entry produces separate output files
- [ ] Plugins are passed to esbuild

---

### Task 4: DTS generation via tsc

**Files:**
- `packages/build/src/dts.ts` (new)
- `packages/build/src/__tests__/dts.test.ts` (new)

**What to implement:**

DTS generation using `tsc --emitDeclarationOnly`. Runs tsc as a child process.

```typescript
export async function generateDts(config: BuildConfig, cwd: string): Promise<void>;
```

Behavior:
- If `dts` is falsy, skip
- Runs `tsc --emitDeclarationOnly --outDir <outDir>` using the package's `tsconfig.json`
- Throws on tsc errors with the error output

**Acceptance criteria:**
- [ ] Produces `.d.ts` files in the output directory
- [ ] Skips when `dts: false`
- [ ] Uses the package's tsconfig.json
- [ ] Throws with tsc error output on failure
- [ ] Works with `isolatedDeclarations: true` tsconfig

---

### Task 5: Post-build hooks and `onSuccess` handling

**Files:**
- `packages/build/src/hooks.ts` (new)
- `packages/build/src/__tests__/hooks.test.ts` (new)

**What to implement:**

Normalize and execute post-build hooks. Supports three forms:
- Plain function: `() => void`
- Single hook: `{ name, handler }`
- Array: `[{ name, handler }, ...]`

```typescript
export function normalizeHooks(
  onSuccess: BuildConfig['onSuccess'],
): PostBuildHook[];

export async function runHooks(
  hooks: PostBuildHook[],
  ctx: PostBuildContext,
): Promise<void>;
```

**Acceptance criteria:**
- [ ] Plain function is normalized to `{ name: 'custom', handler: fn }`
- [ ] Single hook object is wrapped in array
- [ ] Array is passed through
- [ ] `undefined` returns empty array
- [ ] Hooks run sequentially in order
- [ ] Hook context includes outputFiles, outDir, packageJson
- [ ] Hook errors propagate

---

### Task 6: CLI entry point and `build` orchestrator

**Files:**
- `packages/build/src/cli.ts` (new)
- `packages/build/src/build.ts` (new)
- `packages/build/src/__tests__/build.test.ts` (new)

**What to implement:**

The main `build()` function that orchestrates: load config → bundle → run hooks → generate DTS. And a CLI entry that reads `build.config.ts` from cwd and calls `build()`.

```typescript
// build.ts
export async function build(configs: BuildConfig | BuildConfig[], cwd: string): Promise<void>;
```

Behavior:
- If array config, run each config sequentially
- For each config: bundle → run onSuccess hooks → generate DTS
- Logs progress (entry count, output files, timing)

```typescript
// cli.ts — bin entry
// 1. Load build.config.ts from cwd using jiti (already in repo)
// 2. Call build() with the loaded config
// 3. Exit 0 on success, 1 on error
```

`package.json` bin entry: `"vertz-build": "dist/cli.js"`

**Acceptance criteria:**
- [ ] Single config builds correctly (bundle + hooks + DTS)
- [ ] Array config builds each config sequentially
- [ ] CLI loads `build.config.ts` from cwd
- [ ] CLI exits with code 1 on build error
- [ ] Progress is logged to stderr
