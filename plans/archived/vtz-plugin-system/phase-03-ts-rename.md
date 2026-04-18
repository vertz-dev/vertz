# Phase 3: TS Directory, Factory, and Consumer Renames (Atomic)

## Context

The TS production-build factory `createVertzBunPlugin` in `packages/ui-server/src/bun-plugin/plugin.ts:135` is renamed to `createVertzBuildPlugin`, its directory moves to `packages/ui-server/src/build-plugin/`, and all ~20 consumers (source, tests, package.json subpaths, build config, CLI pipeline, vertz re-export) are updated. The factory's return type still extends `BunPlugin` — documented in doc comments per `DESIGN.md` §4.

**This phase is atomic.** Splitting it across multiple PRs would leave the TS build broken mid-phase. All tasks below run on one branch; quality gates run at the end.

**Full design context:** `plans/vtz-plugin-system/DESIGN.md` §4 (API Surface — TS), §5 (Deletion List — TypeScript), §6 (Rename List).

**Precondition:** Phase 2 complete (Rust rename done; Rust quality gates green).

Quality gates (run after Task 6): `vtz test && vtz run typecheck && vtz run lint` (repo-wide).

---

## Tasks

### Task 1: Move the directory + rename source identifiers

**Files:** (3 edited + a directory move — counts as 4 within the 5-file limit)
- Directory move: `packages/ui-server/src/bun-plugin/` → `packages/ui-server/src/build-plugin/` (this carries `__tests__/sourcemap-offset.test.ts` and `__tests__/route-splitting-plugin.test.ts` with it)
- `packages/ui-server/src/build-plugin/plugin.ts` (edit — rename `createVertzBunPlugin` → `createVertzBuildPlugin`; change plugin `name` string literal from `'vertz-bun-plugin'` to `'vertz-build-plugin'`; change log prefix `[vertz-bun-plugin]` to `[vertz-build-plugin]`; add the doc comments from `DESIGN.md` §4)
- `packages/ui-server/src/build-plugin/types.ts` (edit — rename `VertzBunPluginOptions` → `VertzBuildPluginOptions` and `VertzBunPluginResult` → `VertzBuildPluginResult`; add doc comment on `VertzBuildPluginResult` explaining why it extends `BunPlugin`)
- `packages/ui-server/src/build-plugin/index.ts` (edit — update re-exports to new names)

**What to implement:**
Move the directory as a single filesystem operation (preserves git history via rename detection). Inside, rename identifiers exactly per the mapping in `DESIGN.md` §6. Add the two doc comments from `DESIGN.md` §4 (one on `createVertzBuildPlugin`, one on `VertzBuildPluginResult`) — these explain why "Build" ≠ "Bun" and are important for DX per the review findings.

**Acceptance criteria:**
- [ ] `packages/ui-server/src/bun-plugin/` no longer exists
- [ ] `packages/ui-server/src/build-plugin/plugin.ts` exists and exports `createVertzBuildPlugin`
- [ ] `grep -rn "createVertzBunPlugin\|VertzBunPluginOptions\|VertzBunPluginResult" packages/ui-server/src/build-plugin/` returns nothing
- [ ] `grep -n "vertz-bun-plugin" packages/ui-server/src/build-plugin/plugin.ts` returns nothing
- [ ] The two new doc comments are present (verify via `grep -n "Why \"Build\"" packages/ui-server/src/build-plugin/`)

---

### Task 2: Update `@vertz/ui-server` package manifests

**Files:** (2)
- `packages/ui-server/package.json` (edit)
- `packages/ui-server/build.config.ts` (edit)

**What to implement:**
In `package.json`:
- Rename `exports["./bun-plugin"]` → `exports["./build-plugin"]`
- Retarget `exports["./fast-refresh-runtime"]` from `./dist/bun-plugin/fast-refresh-runtime.js` → `./dist/build-plugin/fast-refresh-runtime.js`
- Retarget `exports["./state-inspector"]` from `./dist/bun-plugin/state-inspector.js` → `./dist/build-plugin/state-inspector.js`
- Update `scripts["test:integration"]` path from `src/bun-plugin/__tests__/image-processor.local.ts` → `src/build-plugin/__tests__/image-processor.local.ts`

In `build.config.ts` (`packages/ui-server/build.config.ts:17-22`):
- Change entry paths from `src/bun-plugin/*` → `src/build-plugin/*`
- Change `outDir` from `'dist/bun-plugin'` → `'dist/build-plugin'`

**Acceptance criteria:**
- [ ] `jq '.exports["./bun-plugin"]' packages/ui-server/package.json` returns `null`
- [ ] `jq '.exports["./build-plugin"]' packages/ui-server/package.json` returns a valid target
- [ ] `grep -n "bun-plugin" packages/ui-server/package.json packages/ui-server/build.config.ts` returns nothing
- [ ] `vtz run build` from `packages/ui-server/` produces `dist/build-plugin/` (no `dist/bun-plugin/`)

---

### Task 3: Rename `@vertz/vertz` re-export

**Files:** (2)
- `packages/vertz/src/ui-server-bun-plugin.ts` → rename to `packages/vertz/src/ui-server-build-plugin.ts` and update internal import + re-exports
- `packages/vertz/package.json` (edit)

**What to implement:**
Rename the file (git mv). Inside the renamed file, change the import from `@vertz/ui-server/bun-plugin` → `@vertz/ui-server/build-plugin` and update re-exported identifier names to match.

In `packages/vertz/package.json` (line ~90): rename subpath `./ui-server/bun-plugin` → `./ui-server/build-plugin`; update target filename from `./dist/ui-server-bun-plugin.{js,d.ts}` → `./dist/ui-server-build-plugin.{js,d.ts}`.

**Acceptance criteria:**
- [ ] `packages/vertz/src/ui-server-bun-plugin.ts` does not exist
- [ ] `packages/vertz/src/ui-server-build-plugin.ts` exists and re-exports `createVertzBuildPlugin`, `VertzBuildPluginOptions`, `VertzBuildPluginResult`
- [ ] `jq '.exports["./ui-server/bun-plugin"]' packages/vertz/package.json` returns `null`
- [ ] `jq '.exports["./ui-server/build-plugin"]' packages/vertz/package.json` returns a valid target
- [ ] `vtz run build` from `packages/vertz/` produces `dist/ui-server-build-plugin.{js,d.ts}`

---

### Task 4: Update CLI pipeline consumers

**Files:** (4)
- `packages/cli/src/pipeline/orchestrator.ts` (edit — line 15 type import + line 378 dynamic import)
- `packages/cli/src/pipeline/__tests__/orchestrator.test.ts` (edit — all `createVertzBunPlugin` / `VertzBunPlugin*` / `@vertz/ui-server/bun-plugin` references)
- `packages/cli/src/production-build/ui-build-pipeline.ts` (edit — lines 163, 168, 375 + any other references)
- `packages/cli/src/production-build/__tests__/ui-build-pipeline.test.ts` (edit)

**What to implement:**
In each file, replace:
- `createVertzBunPlugin` → `createVertzBuildPlugin`
- `VertzBunPluginOptions` → `VertzBuildPluginOptions`
- `VertzBunPluginResult` → `VertzBuildPluginResult`
- `'@vertz/ui-server/bun-plugin'` → `'@vertz/ui-server/build-plugin'`
- `'vertz-bun-plugin'` (if referenced as a plugin-name string literal) → `'vertz-build-plugin'`

**Acceptance criteria:**
- [ ] `grep -rn "createVertzBunPlugin\|VertzBunPlugin\|@vertz/ui-server/bun-plugin\|vertz-bun-plugin" packages/cli/` returns nothing

---

### Task 5: Update `@vertz/ui-server` test files

**Files:** (5)
- `packages/ui-server/src/__tests__/bun-plugin-onload.test.ts` → rename file to `build-plugin-onload.test.ts` + update imports/identifiers
- `packages/ui-server/src/__tests__/bun-plugin-manifest-hmr.test.ts` → rename file to `build-plugin-manifest-hmr.test.ts` + update imports/identifiers
- `packages/ui-server/src/__tests__/native-compiler-plugin-integration.test.ts` (edit — update imports/identifiers)
- `packages/ui-server/src/__tests__/fast-refresh-dom-state.test.ts` (edit — update any `../bun-plugin/` relative paths)
- `packages/ui-server/src/__tests__/fast-refresh-runtime.test.ts` (edit — update any `../bun-plugin/` relative paths)

**What to implement:**
File renames (2) and identifier/path updates across all 5. Same replacement set as Task 4. Inside the renamed `*-onload` and `*-manifest-hmr` test files, also update `describe(...)` titles if they mention "bun-plugin" — search for the string literal.

**Acceptance criteria:**
- [ ] `packages/ui-server/src/__tests__/bun-plugin-onload.test.ts` does not exist
- [ ] `packages/ui-server/src/__tests__/bun-plugin-manifest-hmr.test.ts` does not exist
- [ ] `packages/ui-server/src/__tests__/build-plugin-onload.test.ts` exists
- [ ] `packages/ui-server/src/__tests__/build-plugin-manifest-hmr.test.ts` exists
- [ ] `grep -rn "createVertzBunPlugin\|VertzBunPlugin\|@vertz/ui-server/bun-plugin\|vertz-bun-plugin" packages/ui-server/src/__tests__/` returns nothing
- [ ] `grep -rn "\\.\\./bun-plugin/" packages/ui-server/src/__tests__/` returns nothing

---

### Task 6: Update remaining `state-inspector` test + run full quality gates

**Files:** (1)
- `packages/ui-server/src/__tests__/state-inspector.test.ts` (edit — any lingering `bun-plugin` path or identifier)

**What to implement:**
Final file in the test sweep. Apply the same replacement set. Then run full repo-wide quality gates.

**Acceptance criteria:**
- [ ] `grep -rn "createVertzBunPlugin\|VertzBunPlugin\|@vertz/ui-server/bun-plugin\|vertz-bun-plugin" packages/` returns nothing (excluding `CHANGELOG.md` files which preserve history)
- [ ] `grep -rn "createVertzBunPlugin\|VertzBunPlugin\|@vertz/ui-server/bun-plugin\|vertz-bun-plugin" benchmarks/ examples/` returns only shim files (those are deleted in Phase 4)
- [ ] `vtz test` passes repo-wide
- [ ] `vtz run typecheck` passes repo-wide
- [ ] `vtz run lint` passes repo-wide
- [ ] `vtz run build` succeeds in `packages/ui-server/` and `packages/vertz/` (produces the renamed `dist/build-plugin/` and `dist/ui-server-build-plugin.{js,d.ts}`)
