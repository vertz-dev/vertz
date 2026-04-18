# Retrospective: Vtz Plugin Rename & Cleanup

- **Feature:** Plugin-system rename + dead-code deletion
- **PR:** [#2773](https://github.com/vertz-dev/vertz/pull/2773)
- **Merge commit:** `303e119c1`
- **Merged:** 2026-04-18
- **Design doc:** `plans/vtz-plugin-system/DESIGN.md`
- **Phases:** 6

## What shipped

Rename + delete, no new behavior:

- Rust trait `FrameworkPlugin` → `VtzPlugin`. Deleted `ReactPlugin` end-to-end (config enum, `.vertzrc` handling, package.json auto-detect, `--plugin` CLI flag, embedded React fast-refresh assets).
- TS factory `createVertzBunPlugin` → `createVertzBuildPlugin`. Subpath `@vertz/ui-server/bun-plugin` → `@vertz/ui-server/build-plugin`.
- Deleted 6 orphan `bun-plugin-shim.ts` files across examples, benchmarks, and first-party packages.
- Deleted stale `docs/fullstack-app-setup.md`.
- Changeset at `.changeset/vtz-plugin-rename-cleanup.md`.

## What went well

- **Design doc first, reviews done offline.** Three adversarial agents (DX, product/scope, technical) found real issues before implementation started. No redesigns mid-phase.
- **Phase files kept the work boxed.** Each phase loaded ≤5 files of actual surface. Agents could resume from a cold context without re-reading the design doc.
- **Local reviews caught real nits.** Phase 3 review flagged stale identifiers in CLI mocks and the benchmarks HTML that a typecheck pass missed (they were in `vitest.fn()` mocks that don't type-resolve). Phase 5 review caught a test-preload comment that still referenced `bunfig.toml`. Both fixed before push.
- **Pre-push gates held.** Even with a stale worktree (missing `vertz-build` binary, broken `@vertz/ci` dist), the hook forced the fix — it surfaced two pre-existing environment problems that would have blocked the next feature anyway.

## What went wrong

- **Worktree build state was silently broken.** `node_modules/.bin/vertz-build` was absent and `packages/ci/dist/index.js` was stale (missing `pipe` export). `vtz install` didn't fix either until I re-ran it fresh. Lost ~15 min diagnosing during Phase 6 before realizing `vtz install` needed to run once to symlink `@vertz/build` and that the ci dist had to be rebuilt from source after install (it was getting overwritten by install with whatever was in cache).
- **Rebase conflict on `module_loader.rs`.** Main's `#2737` consolidated constructors into `VertzModuleLoaderBuilder` while my Phase 2 branch renamed `FrameworkPlugin` in the old signatures. Not a dangerous conflict, but `git checkout --ours` + `perl -pi -e 's/FrameworkPlugin/VtzPlugin/g'` is a pattern the design doc didn't anticipate.
- **Post-rebase compile error only surfaced at rust-test.** Main's `#2768` added `native/vtz/tests/parity/hmr.rs` importing `FrameworkPlugin`, introduced after my Phase 2 rename commit was written. Caught by the pre-push hook (rust-test), not by local cargo-test (which had already passed before the rebase). Required a fixup commit on top of the rebased trait-rename commit.
- **Reviews were not committed.** Per the local-phase-workflow rule, `reviews/vtz-plugin-rename-cleanup/` stays out of main. Fine — but the PR body had to transcribe review findings inline, which duplicated content. A lightweight "reviews moved to wiki" step post-merge would close this loop cleanly.

## How to avoid next time

- **Add a worktree-bootstrap check** to the phase-01 task template. Before writing any code, run `vtz install && ls node_modules/.bin/vertz-build && (cd packages/ci && /path/to/vertz-build)` and assert all three succeed. Ten seconds up front, fifteen minutes saved at push time.
- **Run the rust test suite after every rebase**, not just `cargo check`. Main moves fast enough that a file touching the renamed symbol can appear between the fetch and the rebase.
- **When a rename touches a core Rust trait**, grep `native/vtz/tests/**` specifically for old-name imports after every rebase. The test tree has looser PR-review scrutiny than `src/` and picks up imports from new test files quietly.
- **Add a phase 7 "wiki archival" task** to the next multi-phase plan, or wire it into `post-merge` automation. Manually remembering to move `plans/<feature>/` and `reviews/<feature>/` to the wiki after merge is unreliable.

## Process changes adopted

- **Pre-flight worktree check** — new line in the phase-implementation template: "Before starting Phase 1, verify `vertz-build` is on PATH and `packages/ci/dist/index.js` exports `pipe`."
- **Post-rebase rust-test** — `cargo test --all` is mandatory after any rebase, not just before initial push.
- **Rename-specific grep discipline** — `rg <OldName>` across `native/vtz/tests/` and `native/vtz/src/` after every rebase on trait-rename branches.

## Metrics

- **6 phases**, 8 commits (1 per phase + 2 review fixups + 1 post-rebase fixup).
- **0 CI failures on PR** — 5/5 green on first push.
- **36s total pre-push gate time** locally (7 jobs).
- **~5 days** from design doc approval to merge.
- **0 rollbacks**, **0 follow-up fix PRs** required.
