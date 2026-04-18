# Phase 6: Final Repo-Wide Gates + PR

## Context

All renames, deletions, and doc updates are done. This phase runs the full quality-gate sweep, rebases on latest `main`, pushes, opens the PR, and monitors GitHub CI until green.

**Full design context:** `plans/vtz-plugin-system/DESIGN.md` §12 Phase 6.

**Precondition:** Phases 1–5 complete; all per-phase adversarial reviews signed off.

Follows `.claude/rules/local-phase-workflow.md` and `.claude/rules/workflow.md` for the final-PR flow.

---

## Tasks

### Task 1: Full repo-wide quality gates

**Files:** (0 — verification only)

**What to implement:**
Run the complete suite:

```bash
vtz test && vtz run typecheck && vtz run lint
cd native && cargo test --all && cargo clippy --all-targets -- -D warnings && cargo fmt --all -- --check
```

If any gate fails, diagnose the root cause — do not mark the task complete with a failing gate. Track failures back to the phase that introduced them; re-open that phase if needed.

**Acceptance criteria:**
- [ ] `vtz test` passes repo-wide (0 failures)
- [ ] `vtz run typecheck` passes repo-wide (0 errors)
- [ ] `vtz run lint` passes repo-wide (0 warnings at error severity)
- [ ] `cargo test --all` passes in `native/`
- [ ] `cargo clippy --all-targets -- -D warnings` passes in `native/`
- [ ] `cargo fmt --all -- --check` passes in `native/`

---

### Task 2: Run all E2E acceptance assertions from `DESIGN.md` §11

**Files:** (0 — verification only, but may create a script in `scripts/` if useful)

**What to implement:**
Manually execute (or script) every assertion in `DESIGN.md` §11:
- No file matches `bun-plugin-shim.ts`
- No TS file imports from `@vertz/ui-server/bun-plugin`
- No file references `createVertzBunPlugin`, `VertzBunPluginOptions`, `VertzBunPluginResult`, or the string literal `vertz-bun-plugin`
- `@vertz/ui-server/build-plugin` resolves and exports `createVertzBuildPlugin`
- `packages/ui-server/package.json` publishes `./build-plugin` (and not `./bun-plugin`)
- `vertz build` succeeds in all 6 affected apps
- `vertz dev` boots in all 3 affected examples
- `VtzPlugin` trait exists in `native/vtz/src/plugin/mod.rs`; `FrameworkPlugin` does not
- `native/vtz/src/plugin/react.rs` does not exist
- `PluginChoice::React` does not appear in `config.rs`
- `vtz --plugin react` produces an "unknown argument" error (or the `--plugin` flag is absent entirely)
- `docs/fullstack-app-setup.md` does not exist
- `packages/mint-docs/` does not reference the old subpath

**Acceptance criteria:**
- [ ] Every assertion in `DESIGN.md` §11 passes

---

### Task 3: Rebase, push, open PR, monitor CI

**Files:** (0 — git + GitHub operations only)

**What to implement:**
Per `.claude/rules/workflow.md`:

1. Rebase `feat/vtz-plugin-rename-cleanup` (or the feature branch being used) on latest `main`:
   ```bash
   git fetch origin main && git rebase origin/main
   ```
2. Re-run quality gates from Task 1 after rebase.
3. Push the feature branch to origin.
4. Open a PR to `main` with:
   - Title: `chore(vtz): rename plugin system, delete ReactPlugin + orphan shims`
   - Body including:
     - Public API Changes summary (per `.claude/rules/workflow.md`) — enumerate breaking changes from `DESIGN.md` §2
     - Summary of all 6 phases with links to the phase files
     - Consolidated review findings and resolutions from `reviews/vtz-plugin-rename-cleanup/phase-NN-*.md`
     - E2E acceptance test status (all assertions from §11)
5. Monitor GitHub CI: `gh pr checks <pr-number> --watch`.
6. If CI fails: diagnose locally, fix, push, monitor again. Do not bypass hooks.
7. If `main` advances while PR is open: rebase, re-run gates, force-push (with care), monitor.
8. **Stop only when GitHub CI is green** — notify the user the PR is ready for their review and manual merge.

**Acceptance criteria:**
- [ ] Feature branch is rebased on latest `main`
- [ ] Quality gates pass after rebase
- [ ] PR opened against `main` with the required body sections
- [ ] GitHub CI is green on the latest commit
- [ ] User notified that the PR is ready for review + merge
