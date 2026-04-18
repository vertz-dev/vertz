# Phase 4: Delete Orphaned `bun-plugin-shim.ts` Files

## Context

Six `bun-plugin-shim.ts` files exist across examples, benchmarks, and first-party packages. Their own docstrings claim they bridge to `bunfig.toml`, but no `bunfig.toml` exists anywhere in the repo (verified via glob). They are orphans loaded by nothing; dead code from the pre-vtz era. This phase deletes them and verifies each app still boots cleanly on vtz dev and builds via `vertz build`.

**Full design context:** `plans/vtz-plugin-system/DESIGN.md` §5 (Deletion List — TypeScript, shim deletion subsection) and §12 Phase 4.

**Precondition:** Phase 3 complete (TS rename done; quality gates green).

**Acceptance gate for this phase:** every affected app must boot on `vtz dev` and succeed on `vertz build` before the phase is considered done.

---

## Tasks

### Task 1: Delete example shims

**Files:** (3 deletes)
- `examples/task-manager/bun-plugin-shim.ts` (delete)
- `examples/linear/bun-plugin-shim.ts` (delete)
- `examples/entity-todo/bun-plugin-shim.ts` (delete)

**What to implement:**
Delete the three files. Grep each example directory afterward for any lingering reference to `bun-plugin-shim` — expected: none. If any `package.json` script, config, or doc inside each example references the shim, remove that reference too (unlikely, but check).

**Acceptance criteria:**
- [ ] None of the three files exist
- [ ] `grep -rn "bun-plugin-shim" examples/` returns nothing
- [ ] For each example, `vtz dev` boots successfully (manual smoke test: visit the homepage, confirm reactive UI works — signals increment on click, no `[object Object]` text)
- [ ] For each example, `vertz build` succeeds (exit 0)

---

### Task 2: Delete benchmark + first-party package shims

**Files:** (3 deletes)
- `benchmarks/vertz/bun-plugin-shim.ts` (delete)
- `packages/landing/bun-plugin-shim.ts` (delete)
- `packages/component-docs/bun-plugin-shim.ts` (delete)

**What to implement:**
Delete the three files. Grep each containing directory for references. For `packages/landing` and `packages/component-docs` specifically — these are deployed packages, so pay attention to any build/deploy script that might reference the shim.

**Acceptance criteria:**
- [ ] None of the three files exist
- [ ] `grep -rn "bun-plugin-shim" benchmarks/ packages/landing/ packages/component-docs/` returns nothing
- [ ] `vtz dev` boots successfully in each of the three directories (manual smoke test)
- [ ] `vertz build` succeeds in each of the three directories

---

### Task 3: Full repo-wide verification sweep

**Files:** (0 — this task is verification only, no file edits)

**What to implement:**
Run the repo-wide grep assertions from `DESIGN.md` §11 (E2E acceptance tests). If any grep returns a hit, chase it down in the current task; do not mark the phase complete with lingering references.

**Acceptance criteria:**
- [ ] `find . -name "bun-plugin-shim.ts" -not -path "*/node_modules/*"` returns nothing
- [ ] `grep -rn "createVertzBunPlugin" --include="*.ts" --include="*.tsx" --include="*.mdx" --include="*.md" --exclude-dir=node_modules --exclude="CHANGELOG.md" .` returns nothing
- [ ] `grep -rn "VertzBunPluginOptions\|VertzBunPluginResult" --include="*.ts" --exclude-dir=node_modules --exclude="CHANGELOG.md" .` returns nothing
- [ ] `grep -rn "@vertz/ui-server/bun-plugin" --exclude-dir=node_modules --exclude="CHANGELOG.md" .` returns nothing
- [ ] `grep -rn "vertz-bun-plugin" --exclude-dir=node_modules --exclude="CHANGELOG.md" .` returns nothing
- [ ] `vtz test && vtz run typecheck && vtz run lint` passes repo-wide
