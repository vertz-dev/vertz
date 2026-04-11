# Phase 3: bun-types Cleanup

## Context

Issue #2497 — replace Bun-specific APIs with vtz-native equivalents. This phase removes `bun-types` from tsconfig.json in packages that no longer use any Bun-specific APIs after the Phase 2 migration, and adds vtz runtime type declarations.

Design doc: `plans/2497-replace-bun-apis.md`
Depends on: Phase 2 (all Bun API calls migrated)

## Tasks

### Task 1: Identify packages for bun-types removal

**Files:** (1)
- Analysis task — no file changes, produce a list

**What to implement:**

For each of the 18 packages with `"types": ["bun-types"]` in their tsconfig.json, check whether the package still has any `Bun.*` API calls in source files (not test files). Categorize into:
- **Remove bun-types** — no remaining Bun API usage in source
- **Keep bun-types** — still uses Bun APIs (e.g., Bun adapter, Bun plugins)

**Acceptance criteria:**
- [ ] Complete list of packages and their bun-types disposition
- [ ] Each "keep" decision has a documented reason

---

### Task 2: Remove bun-types from migrated packages

**Files:** (up to 5 tsconfig.json files per batch)
- Various `packages/*/tsconfig.json` (modified)

**What to implement:**

For each package identified in Task 1 as "remove":
- Remove `"bun-types"` from the `"types"` array in `tsconfig.json`
- If the `"types"` array becomes empty, remove the entire `"types"` field
- Run `vtz run typecheck` to verify no type errors

If any typecheck failures occur, they indicate remaining Bun API usage that wasn't caught in Phase 2. Fix the usage or keep bun-types for that package.

**Acceptance criteria:**
- [ ] `bun-types` removed from all packages that no longer use Bun APIs
- [ ] `vtz run typecheck` passes across all packages
- [ ] No new type errors introduced

---

### Task 3: Add vtz runtime type declarations

**Files:** (2)
- `packages/core/src/types/vtz-runtime.d.ts` (new)
- `packages/core/tsconfig.json` (modified if needed)

**What to implement:**

Add type declarations for vtz runtime globals used by the adapter:

```ts
declare global {
  var __vtz_runtime: boolean | undefined;
  var __vtz_http: {
    serve(
      port: number,
      hostname: string,
      handler: (request: Request) => Promise<Response>,
    ): Promise<{ id: number; port: number; hostname: string; close(): Promise<void> }>;
  } | undefined;
}
```

These types ensure TypeScript doesn't complain about accessing `globalThis.__vtz_runtime` and `globalThis.__vtz_http` in the adapter code.

**Acceptance criteria:**
- [ ] No `@ts-expect-error` or `as any` needed for vtz runtime globals
- [ ] Type declarations are minimal — only what's actually used
- [ ] `vtz run typecheck` passes

---

### Task 4: Final quality gates

**Files:** (0 — validation only)

**What to implement:**

Run full quality gates across the entire monorepo:
```bash
vtz test && vtz run typecheck && vtz run lint
```

Verify no regressions from the full migration.

**Acceptance criteria:**
- [ ] All tests pass
- [ ] Typecheck clean
- [ ] Lint clean
- [ ] No `Bun.*` calls in migrated source files (grep verification)
