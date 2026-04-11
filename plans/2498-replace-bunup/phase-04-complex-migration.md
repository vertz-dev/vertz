# Phase 4: Migrate Complex Packages

## Context

This is Phase 4 of replacing bunup (#2498). We migrate the remaining ~11 packages that use plugins, multi-config arrays, post-build hooks, or other complex configurations. These depend on Phase 2 (plugin migration) being complete.

Design doc: `plans/2498-replace-bunup.md`

## Tasks

### Task 1: Migrate plugin-dependent packages (ui-auth, docs, mdx, theme-shadcn)

**Files:**
- `packages/ui-auth/build.config.ts` (new)
- `packages/docs/build.config.ts` (new)
- `packages/mdx/build.config.ts` (new)
- `packages/theme-shadcn/build.config.ts` (new)

**What to implement:**

These packages use `createVertzLibraryPlugin()` (migrated in Phase 2). Create `build.config.ts` files with:
- `plugins: [createVertzLibraryPlugin()]` — now returns esbuild Plugin
- Same entry points, dts, external settings as current bunup configs
- Import `defineConfig` from `@vertz/build`

Update `package.json` for each: change build script, add `@vertz/build` dep, remove `bunup` dep.

**Acceptance criteria:**
- [ ] All 4 packages build successfully with `@vertz/build`
- [ ] `.tsx` files are compiled via the Vertz library plugin
- [ ] DTS files are generated correctly
- [ ] `vtz run typecheck` passes
- [ ] Delete `bunup.config.ts` from each package

---

### Task 2: Migrate ui-primitives (most complex config)

**Files:**
- `packages/ui-primitives/build.config.ts` (new)
- `packages/ui-primitives/bunup.config.ts` (deleted)
- `packages/ui-primitives/package.json` (modified)

**What to implement:**

The most complex config. Current bunup.config.ts:
- Dynamic entry discovery (reads `src/` directories)
- `createVertzLibraryPlugin()` for JSX compilation
- `fixBarrelReExports()` — converted to PostBuildHook in Phase 2
- `stripBareChunkImports()` — converted to PostBuildHook in Phase 2

Migrate to `build.config.ts`:
```typescript
import { defineConfig } from '@vertz/build';
import { createVertzLibraryPlugin } from '@vertz/ui-server';
import { fixBarrelReExports, stripBareChunkImports } from './src/build-hooks';

// Same dynamic entry discovery logic
const componentEntries = ...;
const composedEntries = ...;

export default defineConfig({
  entry: ['src/index.ts', 'src/utils.ts', 'src/composed/with-styles.ts',
          'src/dialog/dialog-stack-parts.tsx', ...componentEntries, ...composedEntries],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  onSuccess: [fixBarrelReExports(), stripBareChunkImports()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
```

**Critical validation:** After building, verify:
1. esbuild handles barrel re-exports correctly — if so, `fixBarrelReExports` can be simplified or removed
2. esbuild doesn't produce bare chunk imports — if so, `stripBareChunkImports` can be removed
3. Component files are compiled with the Vertz library plugin

**Acceptance criteria:**
- [ ] Package builds successfully with `@vertz/build`
- [ ] All component entries are discovered and built
- [ ] Post-build hooks run correctly (or are removed if unnecessary)
- [ ] DTS files are generated
- [ ] `vtz run typecheck` passes

---

### Task 3: Migrate ui-server (multi-config array)

**Files:**
- `packages/ui-server/build.config.ts` (new)
- `packages/ui-server/bunup.config.ts` (deleted)
- `packages/ui-server/package.json` (modified)

**What to implement:**

Multi-config array build. Current config:
```typescript
defineConfig([
  { entry: [...], dts: true },                          // main build
  { entry: [...], outDir: 'dist/bun-plugin', target: 'bun', dts: true, clean: false },  // bun-plugin
])
```

Migration:
- First config: straightforward, `target: 'node'` or `'neutral'`
- Second config: `target: 'bun'` → change to `target: 'node'` (esbuild supports `--target=bun` for resolution, but since we're removing Bun dep, use `'node'`). The bun-plugin code genuinely uses Bun APIs but it's built as a library consumed at dev time.

```typescript
export default defineConfig([
  {
    entry: ['src/index.ts', 'src/ssr/index.ts', 'src/dom-shim/index.ts',
            'src/jsx-runtime/index.ts', 'src/fetch-scope.ts', 'src/node-handler.ts'],
    dts: true,
  },
  {
    entry: ['src/bun-plugin/index.ts', 'src/bun-plugin/fast-refresh-runtime.ts',
            'src/bun-plugin/fast-refresh-dom-state.ts', 'src/bun-plugin/state-inspector.ts'],
    outDir: 'dist/bun-plugin',
    dts: true,
    target: 'node',
    clean: false,
  },
]);
```

**Acceptance criteria:**
- [ ] Both configs build successfully
- [ ] Main build output in `dist/`
- [ ] Bun-plugin build output in `dist/bun-plugin/`
- [ ] DTS files generated for both configs
- [ ] `vtz run typecheck` passes

---

### Task 4: Migrate db (post-build hook) and ui (many entries)

**Files:**
- `packages/db/build.config.ts` (new)
- `packages/ui/build.config.ts` (new)
- `packages/db/bunup.config.ts` (deleted)
- `packages/ui/bunup.config.ts` (deleted)

**What to implement:**

**db package:** Has `onSuccess: stripDeadRequireImports` (plain function). Migrate to:
```typescript
import { defineConfig } from '@vertz/build';
import { stripDeadRequireImports } from './src/build-hooks';

export default defineConfig({
  entry: ['src/index.ts', 'src/sql/index.ts', 'src/internals.ts',
          'src/plugin/index.ts', 'src/diagnostic/index.ts',
          'src/schema-derive/index.ts', 'src/postgres/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['better-sqlite3'],
  onSuccess: stripDeadRequireImports(),  // now returns PostBuildHook
});
```

**Validate:** Check if esbuild ESM output even generates `__require` patterns. If not, the hook can be a no-op or removed entirely.

**ui package:** Many entry points, no special config. Straightforward migration.

**Acceptance criteria:**
- [ ] db package builds with post-build hook executing correctly
- [ ] ui package builds with all 10 entry points
- [ ] DTS files generated for both
- [ ] `vtz run typecheck` passes

---

### Task 5: Migrate cli (banner + multi-config) and server/ui-canvas

**Files:**
- `packages/cli/build.config.ts` (new)
- `packages/cli/bunup.config.ts` (deleted)
- `packages/cli/package.json` (modified)

**What to implement:**

**cli package:** Multi-config with banner:
```typescript
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    external: ['@vertz/compiler', '@vertz/tui', 'bun:sqlite', 'commander', 'esbuild', 'jiti', 'postgres'],
  },
  {
    entry: ['bin/vertz.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
    external: ['@vertz/compiler', '@vertz/tui', 'bun:sqlite', 'commander', 'esbuild', 'jiti', 'postgres'],
    banner: '#!/usr/bin/env node',  // Changed from 'bun' to 'node'
  },
]);
```

Note: Banner changes from `#!/usr/bin/env bun` to `#!/usr/bin/env node`. The `chmod +x` in the build script stays.

**Acceptance criteria:**
- [ ] cli package builds with both configs
- [ ] Library config produces DTS
- [ ] Bin config has shebang in output
- [ ] `chmod +x` step still works in build script
- [ ] `vtz run typecheck` passes

---

### Task 6: Full validation of all complex packages

**Files:**
- (no new files — validation only)

**What to implement:**

Run full quality gates:
1. `vtz run build` — all packages (simple + complex) build
2. `vtz run typecheck` — all type checks pass
3. `vtz test` — all tests pass
4. Verify no bunup.config.ts remains in any package

**Acceptance criteria:**
- [ ] `vtz run build` succeeds for all packages
- [ ] `vtz run typecheck` passes across the monorepo
- [ ] `vtz test` passes across the monorepo
- [ ] No `bunup.config.ts` remains anywhere
