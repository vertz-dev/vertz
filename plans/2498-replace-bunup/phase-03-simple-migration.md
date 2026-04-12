# Phase 3: Migrate Simple Packages

## Context

This is Phase 3 of replacing bunup (#2498). We migrate ~16 packages with simple configs (no plugins, no multi-config, no post-build hooks) from `bunup.config.ts` to `build.config.ts`. These packages use straightforward `defineConfig({ entry, dts, format, external, clean })`.

Design doc: `plans/2498-replace-bunup.md`

## Tasks

### Task 1: Migrate batch 1 — core utility packages

**Files:**
- `packages/core/build.config.ts` (new, replaces bunup.config.ts)
- `packages/schema/build.config.ts` (new, replaces bunup.config.ts)
- `packages/errors/build.config.ts` (new, replaces bunup.config.ts)
- `packages/fetch/build.config.ts` (new, replaces bunup.config.ts)

**What to implement:**

For each package:
1. Create `build.config.ts` importing `defineConfig` from `@vertz/build`
2. Copy entry points, format, external, clean settings
3. Change `dts: { inferTypes: true }` → `dts: true`
4. Update `package.json`: change build script from `vtzx bunup`/`bunup` to `vtzx vertz-build`
5. Add `@vertz/build` to devDependencies
6. Delete `bunup.config.ts`

Example migration (`@vertz/core`):
```typescript
// Before (bunup.config.ts)
import { defineConfig } from 'bunup';
export default defineConfig({
  entry: ['src/index.ts', 'src/internals.ts'],
  dts: { inferTypes: true },
});

// After (build.config.ts)
import { defineConfig } from '@vertz/build';
export default defineConfig({
  entry: ['src/index.ts', 'src/internals.ts'],
  dts: true,
});
```

**Acceptance criteria:**
- [ ] All 4 packages build successfully with `@vertz/build`
- [ ] `vtz run build` produces dist/ with ESM + .d.ts
- [ ] `vtz run typecheck` passes for these packages and their dependents
- [ ] No `bunup.config.ts` remains in these packages

---

### Task 2: Migrate batch 2 — testing and CI packages

**Files:**
- `packages/test/build.config.ts` (new)
- `packages/ci/build.config.ts` (new)
- `packages/testing/build.config.ts` (new)
- `packages/compiler/build.config.ts` (new)
- `packages/codegen/build.config.ts` (new)

**What to implement:**

Same migration pattern as Task 1. These packages may have `external` entries like `bun:test` that need preserving.

**Acceptance criteria:**
- [ ] All 5 packages build successfully with `@vertz/build`
- [ ] External entries (e.g. `bun:test`) are preserved
- [ ] `vtz run typecheck` passes
- [ ] No `bunup.config.ts` remains

---

### Task 3: Migrate batch 3 — remaining simple packages

**Files:**
- `packages/agents/build.config.ts` (new)
- `packages/cli-runtime/build.config.ts` (new)
- `packages/desktop/build.config.ts` (new)
- `packages/icons/build.config.ts` (new)
- `packages/og/build.config.ts` (new)

**What to implement:**

Same migration pattern. Read each package's `bunup.config.ts` and translate.

**Acceptance criteria:**
- [ ] All 5 packages build successfully with `@vertz/build`
- [ ] `vtz run typecheck` passes
- [ ] No `bunup.config.ts` remains

---

### Task 4: Migrate batch 4 — last simple packages + default configs

**Files:**
- `packages/openapi/build.config.ts` (new)
- `packages/tui/build.config.ts` (new)
- `packages/server/build.config.ts` (new — currently has no bunup.config.ts)
- `packages/ui-canvas/build.config.ts` (new — currently has no bunup.config.ts)

**What to implement:**

Same migration pattern. For `@vertz/server` and `@vertz/ui-canvas` (which have no existing `bunup.config.ts`), create a `build.config.ts` with sensible defaults based on their `package.json` structure (entry: `['src/index.ts']`, dts: true).

**Acceptance criteria:**
- [ ] All 4 packages build successfully with `@vertz/build`
- [ ] Packages that had no bunup.config.ts now have explicit build.config.ts
- [ ] `vtz run typecheck` passes
- [ ] No `bunup.config.ts` remains in any simple package

---

### Task 5: Full validation of simple package migration

**Files:**
- (no new files — validation only)

**What to implement:**

Run the full quality gates across all migrated packages:
1. `vtz run build` — all 16+ packages build
2. `vtz run typecheck` — all type checks pass
3. `vtz test` — all tests pass
4. Verify no regressions in packages that depend on the migrated ones

**Acceptance criteria:**
- [ ] `vtz run build` succeeds for all migrated packages
- [ ] `vtz run typecheck` passes across the monorepo
- [ ] `vtz test` passes across the monorepo
- [ ] No bunup.config.ts remains in any Phase 3 package
