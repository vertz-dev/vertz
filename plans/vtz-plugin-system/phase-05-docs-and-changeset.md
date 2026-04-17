# Phase 5: Docs Update + Changeset

## Context

Update all public-facing docs that reference `@vertz/ui-server/bun-plugin`, `createVertzBunPlugin`, or the removed `bunfig.toml` + shim setup. Delete `docs/fullstack-app-setup.md` entirely (decision §13.3 — documents a setup that no longer exists). Add a changeset flagging the breaking changes (subpath removal, identifier renames, `--plugin` CLI flag removal).

**Full design context:** `plans/vtz-plugin-system/DESIGN.md` §2 (Breaking Changes), §5 (Deletion List — Docs), §13 decision 3.

**Precondition:** Phase 4 complete (shims deleted; repo-wide grep clean).

Quality gates: `vtz test && vtz run typecheck && vtz run lint` (repo-wide).

---

## Tasks

### Task 1: Delete the orphaned setup doc + update the UI README

**Files:** (2)
- `docs/fullstack-app-setup.md` (delete — per §13.3, describes a setup that no longer works)
- `packages/ui/README.md` (edit — line 30 references `@vertz/ui-server/bun-plugin`; update to `@vertz/ui-server/build-plugin` and `createVertzBuildPlugin`)

**What to implement:**
Delete `docs/fullstack-app-setup.md`. In `packages/ui/README.md`, replace `@vertz/ui-server/bun-plugin` with `@vertz/ui-server/build-plugin` and any `createVertzBunPlugin` references with `createVertzBuildPlugin`.

**Acceptance criteria:**
- [ ] `docs/fullstack-app-setup.md` does not exist
- [ ] `grep -n "bun-plugin\|createVertzBunPlugin" packages/ui/README.md` returns nothing
- [ ] `grep -n "@vertz/ui-server/build-plugin" packages/ui/README.md` returns at least one hit

---

### Task 2: Update site and mint-docs references

**Files:** (up to 5 — scope depends on grep result)
- `packages/site/pages/guides/deploy/static-sites.mdx` (edit — replace old subpath with new)
- Any `packages/mint-docs/` files that reference `@vertz/ui-server/bun-plugin` or `createVertzBunPlugin` (grep `packages/mint-docs/` at task start to enumerate; expected ≤ 3 files)
- Any other `.mdx` or `.md` file under `packages/` that matches (grep to enumerate)

**What to implement:**
Grep first: `grep -rln "@vertz/ui-server/bun-plugin\|createVertzBunPlugin\|VertzBunPlugin\|bunfig\.toml" packages/ docs/ --exclude="CHANGELOG.md"` — this identifies every doc that still needs updating. For each:
- Replace `@vertz/ui-server/bun-plugin` → `@vertz/ui-server/build-plugin`
- Replace `createVertzBunPlugin` → `createVertzBuildPlugin`
- Replace `VertzBunPluginOptions` → `VertzBuildPluginOptions`
- Replace `VertzBunPluginResult` → `VertzBuildPluginResult`
- Remove any `bunfig.toml` + shim setup instructions (they documented a dead setup)

If the grep returns more than 5 files, split into a sub-task: first 5 files in this task, remainder in a follow-up. The max-5-file rule applies.

**Acceptance criteria:**
- [ ] `grep -rn "@vertz/ui-server/bun-plugin\|createVertzBunPlugin\|VertzBunPlugin\|bunfig\.toml" packages/ docs/ --exclude="CHANGELOG.md"` returns nothing (excluding CHANGELOGs which preserve history)

---

### Task 3: Add a changeset flagging breaking changes

**Files:** (1)
- `.changeset/vtz-plugin-rename-cleanup.md` (new)

**What to implement:**
Create a changeset file documenting the breaking changes per `DESIGN.md` §2 (Breaking Changes). Per `.claude/rules/policies.md`, use `patch` bump for all affected packages.

Use this content:

```markdown
---
'@vertz/ui-server': patch
'@vertz/vertz': patch
'vtz': patch
---

Rename vtz plugin system for honesty. Dev is vtz; production build uses a Bun-shaped
factory whose purpose (not runtime) drives its name.

**Breaking changes:**

- `@vertz/ui-server/bun-plugin` subpath removed. Use `@vertz/ui-server/build-plugin`.
- `@vertz/vertz/ui-server/bun-plugin` subpath removed. Use `@vertz/vertz/ui-server/build-plugin`.
- `createVertzBunPlugin` → `createVertzBuildPlugin`.
- `VertzBunPluginOptions` → `VertzBuildPluginOptions`.
- `VertzBunPluginResult` → `VertzBuildPluginResult`.
- `vtz --plugin` CLI flag removed (only Vertz is supported now).
- `ReactPlugin` removed from Rust (including `PluginChoice::React` config, `.vertzrc` handling,
  `package.json` auto-detect, and embedded React fast-refresh assets).

**Dead-code cleanup:**

- All six `bun-plugin-shim.ts` files deleted from examples, benchmarks, and first-party packages.
  These were orphans — no `bunfig.toml` referenced them.
- `docs/fullstack-app-setup.md` deleted (documented a setup that no longer worked).
```

**Acceptance criteria:**
- [ ] `.changeset/vtz-plugin-rename-cleanup.md` exists with the content above
- [ ] All three affected packages are listed with `patch` bumps
- [ ] `vtz test && vtz run typecheck && vtz run lint` passes repo-wide
